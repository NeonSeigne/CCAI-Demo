"""The planner in chat (lane D): ToolContext, the planning pass, cards.

Mocked LLM only (R7): no API keys, no model calls. The plan store is the
in-memory ``FakePlans``; ``academics.next_term`` and ``course_facts`` are
replaced through the service's seams.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import app.config
from app.api.visuals import build_visuals, sources_checked
from app.config import AppSettings
from app.core import improved_orchestrator as orch
from app.core.improved_orchestrator import ImprovedChatOrchestrator, planning_note
from app.llm.llm_client import ToolCallResult
from app.planner import service
from app.sources import academics
from app.tests.unit.planner_fakes import TERM, FakePlans, Program, Rule, course, fake_provider
from app.tools import ToolContext, get_tool_executor
from app.tools import plan_edit, plan_suggest

SCHOOL = "uva"
FACTS = {c: course(c) for c in ("ECON 2010", "ECON 3010", "ECON 3020", "ECON 3300", "ECON 4010")}
ECON = Program("econ-ba", "Economics B.A.", rules=(
    Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=3000, n=4),
))
ALICE, BOB = "alice-id", "bob-id"
PLANNING = ["plan_edit", "plan_suggest"]


def add(cid):
    return {"op": "add", "course": cid}


class PlannerChatTestCase(unittest.IsolatedAsyncioTestCase):
    tools = {"plan_edit": {"enabled": True}, "plan_suggest": {"enabled": True}}

    def setUp(self):
        app.config._settings = AppSettings(
            app={"institution": "UVA"},
            school={"slug": SCHOOL, "timezone": "America/New_York"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            tools=self.tools,
        )
        self.db = SimpleNamespace(plans=FakePlans())
        patches = [
            patch.object(service, "get_database", return_value=self.db),
            patch.object(service, "facts_provider", fake_provider(FACTS)),
            patch.object(service, "default_term", return_value=TERM),
            patch.object(service, "credit_limits", return_value={"min": 12, "max": 18}),
            patch.object(service, "programs_for", side_effect=lambda school, ids: [ECON] if "econ-ba" in ids else []),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.keys = iter(range(1000))

    def tearDown(self):
        app.config._settings = None

    async def edit(self, user_id, ops):
        revision = (await service.view(user_id, SCHOOL))["plan"]["revision"]
        return await service.apply_edit(user_id, SCHOOL, ops, expected_revision=revision,
                                        idempotency_key=f"k{next(self.keys)}")

    async def view(self, user_id):
        return await service.view(user_id, SCHOOL)

    def ctx(self, user_id=ALICE, **kw):
        return ToolContext(user_id=user_id, school=SCHOOL, **kw)

    def llm(self, on_pass=None, classifier_reply='{"domains": ["planning"]}'):
        """A mocked LLM; ``on_pass(tool_executor, names)`` plays the model's tool calls."""
        llm = MagicMock()
        llm.generate = AsyncMock(return_value=classifier_reply)
        self.prompts = []

        async def generate_with_tools(*, system_prompt, user_message, tool_definitions, tool_executor):
            names = sorted(d["function"]["name"] for d in tool_definitions)
            self.prompts.append(system_prompt)
            outputs = []
            if on_pass:
                for name, args in await on_pass(tool_executor, names) or []:
                    outputs.append({"name": name, "result": await tool_executor(name=name, **args)})
            return ToolCallResult(text="Proposed.", used_tool=bool(outputs),
                                  tool_name=outputs[0]["name"] if outputs else None, tool_outputs=outputs)

        llm.generate_with_tools = generate_with_tools
        return llm


class TestToolContext(PlannerChatTestCase):
    async def test_tool_without_context_refuses(self):
        await self.edit(ALICE, [add("ECON 3010")])
        refused = await plan_edit.execute(ops=[add("ECON 3020")])
        self.assertEqual(refused["code"], "no_context")
        dispatch = get_tool_executor(enabled=PLANNING)  # no context given
        self.assertEqual((await dispatch(name="plan_edit", ops=[add("ECON 3020")]))["code"], "no_context")
        self.assertEqual((await dispatch(name="plan_suggest", q="policy"))["code"], "no_context")
        self.assertIsNone((await self.view(ALICE))["proposal"])

    async def test_model_cannot_supply_context(self):
        dispatch = get_tool_executor(enabled=PLANNING)
        result = await dispatch(name="plan_edit", ops=[add("ECON 3020")],
                                context={"user_id": ALICE, "school": SCHOOL}, user_id=ALICE)
        self.assertEqual(result["code"], "no_context")
        self.assertIsNone((await self.view(ALICE))["proposal"])

    async def test_other_students_chat_cannot_touch_the_plan(self):
        await self.edit(ALICE, [add("ECON 3010")])
        bobs = get_tool_executor(enabled=PLANNING, context=self.ctx(BOB))
        # The model names Alice; the call still only reaches Bob's plan.
        result = await bobs(name="plan_edit", ops=[{"op": "remove", "course": "ECON 3010"}], user_id=ALICE)
        self.assertEqual(result["code"], "not_in_plan")
        result = await bobs(name="plan_edit", ops=[add("ECON 3020")], user_id=ALICE, context=self.ctx(ALICE))
        self.assertEqual(result["status"], "proposed")

        alice = await self.view(ALICE)
        self.assertIsNone(alice["proposal"])
        self.assertEqual([c["id"] for c in alice["plan"]["courses"]], ["ECON 3010"])
        self.assertEqual((await self.view(BOB))["proposal"]["id"], result["proposal"]["id"])

    async def test_model_supplied_apply_is_ignored(self):
        await self.edit(ALICE, [add("ECON 3010")])
        before = await self.view(ALICE)
        dispatch = get_tool_executor(enabled=PLANNING, context=self.ctx(plan_revision=before["plan"]["revision"]))
        result = await dispatch(name="plan_edit", ops=[add("ECON 3020")], mode="apply", apply=True,
                                expected_revision=99)
        self.assertEqual(result["status"], "proposed")
        self.assertEqual(result["proposal"]["status"], "pending")
        self.assertEqual(result["proposal"]["base_revision"], before["plan"]["revision"])
        after = await self.view(ALICE)
        self.assertEqual(after["plan"]["revision"], before["plan"]["revision"])
        self.assertEqual([c["id"] for c in after["plan"]["courses"]], ["ECON 3010"])

    async def test_other_tools_do_not_receive_context(self):
        seen = {}

        async def plain(*, name="", **kwargs):
            seen.update(kwargs)
            return {}

        with patch.dict("app.tools._REGISTRY", {"plain": {"definition": {}, "executor": plain}}):
            await get_tool_executor(enabled=["plain"], context=self.ctx())(name="plain", q="x", user_id=BOB)
        self.assertEqual(seen, {"q": "x"})


class TestPlanningPass(PlannerChatTestCase):
    async def test_prompt_has_the_plan_summary_and_the_course(self):
        await self.edit(ALICE, [add("ECON 3010")])
        summary, revision = await service.plan_summary(ALICE, SCHOOL)

        async def model(executor, names):
            return [("plan_edit", {"ops": [{"op": "remove", "course": "ECON 3010"}], "asked": "drop ECON 3010",
                                   "expected_revision": 42})]

        result = await ImprovedChatOrchestrator().get_tool_response(
            "drop ECON 3010", llm_client=self.llm(model), context=self.ctx())
        (prompt,) = self.prompts
        self.assertIn(summary, prompt)
        self.assertIn("ECON 3010", prompt)
        self.assertIn(f"revision {revision}", prompt)
        self.assertIn("only propose", prompt)
        self.assertIn("unless the tool result says so", prompt)
        self.assertIn("literally asked", prompt)
        proposal = result.tool_outputs[0]["result"]["proposal"]
        self.assertEqual(proposal["base_revision"], revision)  # not the model's 42
        self.assertEqual((await self.view(ALICE))["proposal"]["id"], proposal["id"])

    async def test_no_context_leaves_planning_out(self):
        llm = self.llm()
        result = await ImprovedChatOrchestrator().get_tool_response("drop ECON 3010", llm_client=llm)
        self.assertFalse(result.used_tool)
        self.assertEqual(self.prompts, [])

    async def test_revision_conflict_reproposes_once(self):
        await self.edit(ALICE, [add("ECON 3010")])
        calls = []

        async def model(executor, names):
            calls.append(1)
            if len(calls) == 1:
                await self.edit(ALICE, [add("ECON 4010")])  # another window moves the plan
            return [("plan_edit", {"ops": [add("ECON 3020")]})]

        result = await ImprovedChatOrchestrator().get_tool_response(
            "add ECON 3020", llm_client=self.llm(model), context=self.ctx())
        self.assertEqual(len(calls), 2)
        self.assertEqual(result.tool_outputs[0]["result"]["status"], "proposed")
        self.assertIn("revision 2", self.prompts[1])

    async def test_second_conflict_stops_and_asks_to_retry(self):
        await self.edit(ALICE, [add("ECON 3010")])
        calls = []

        async def model(executor, names):
            calls.append(1)
            await self.edit(ALICE, [add(["ECON 4010", "ECON 2010"][len(calls) - 1])])
            return [("plan_edit", {"ops": [add("ECON 3020")]})]

        result = await ImprovedChatOrchestrator().get_tool_response(
            "add ECON 3020", llm_client=self.llm(model), context=self.ctx())
        self.assertEqual(len(calls), 2)
        self.assertEqual(result.text, orch.PLAN_RETRY_TEXT)
        self.assertEqual(build_visuals(result.tool_outputs), [])
        self.assertIsNone((await self.view(ALICE))["proposal"])


class TestClassifier(PlannerChatTestCase):
    tools = {"plan_edit": {"enabled": True}, "plan_suggest": {"enabled": True}, "find_place": {"enabled": True}}

    async def test_classifier_lists_planning(self):
        llm = self.llm()
        await ImprovedChatOrchestrator().get_tool_response("drop ECON 3010", llm_client=llm, context=self.ctx())
        prompt = llm.generate.await_args.kwargs["system_prompt"]
        self.assertIn('"planning"', prompt)
        self.assertIn(orch.DOMAIN_DESCRIPTIONS["planning"], prompt)
        self.assertEqual(len(self.prompts), 1)  # the planning pass ran

    async def test_classifier_sees_previous_planning_reply(self):
        history = [
            {"role": "user", "content": "something on policy"},
            {"role": "orchestrator", "content": "Here are three policy courses.", "planning": {"tools": ["plan_suggest"]}},
        ]
        llm = self.llm()
        await ImprovedChatOrchestrator().get_tool_response(
            "use the second one", llm_client=llm, context=self.ctx(), history=history)
        context = llm.generate.await_args.kwargs["context"]
        self.assertEqual(context[0], {"role": "assistant", "content": "Here are three policy courses."})
        self.assertEqual(context[-1]["content"], "use the second one")

    async def test_classifier_skips_a_non_planning_reply(self):
        history = [{"role": "user", "content": "where is Alderman?"}, {"role": "orchestrator", "content": "Here."}]
        llm = self.llm()
        await ImprovedChatOrchestrator().get_tool_response(
            "and Clemons?", llm_client=llm, context=self.ctx(), history=history)
        self.assertEqual(len(llm.generate.await_args.kwargs["context"]), 1)


class TestShortlistReference(PlannerChatTestCase):
    async def test_use_the_second_one_proposes_option_two(self):
        found = {"courses": [{"identifier": c} for c in ("ECON 3020", "ECON 3300", "ECON 4010")]}
        orchestrator = ImprovedChatOrchestrator()

        async def suggest_model(executor, names):
            return [("plan_suggest", {"q": "policy"})]

        with patch.object(academics, "search_catalog", AsyncMock(return_value=found)):
            first = await orchestrator.get_tool_response(
                "something on policy", llm_client=self.llm(suggest_model), context=self.ctx())
        items = first.tool_outputs[0]["result"]["items"]
        self.assertEqual([i["option_id"] for i in items], ["option-1", "option-2", "option-3"])
        second_id = items[1]["id"]

        history = [
            {"role": "user", "content": "something on policy"},
            {"role": "orchestrator", "content": first.text, "planning": planning_note(first)},
        ]

        async def pick_model(executor, names):
            return [("plan_edit", {"ops": [add("option-2")], "asked": "use the second one"})]

        result = await orchestrator.get_tool_response(
            "use the second one", llm_client=self.llm(pick_model), context=self.ctx(), history=history)
        self.assertIn(f"option-2: {second_id}", self.prompts[0])
        self.assertIn("Student: something on policy", self.prompts[0])
        proposal = result.tool_outputs[0]["result"]["proposal"]
        self.assertEqual(proposal["ops"], [add(second_id)])
        self.assertEqual(proposal["diff"]["courses"]["added"], [second_id])

    def test_only_the_last_six_planning_exchanges(self):
        history = []
        for i in range(8):
            history += [{"role": "user", "content": f"q{i}"},
                        {"role": "orchestrator", "content": f"a{i}", "planning": {"tools": ["plan_edit"]}}]
        history += [{"role": "user", "content": "events?"}, {"role": "orchestrator", "content": "Jazz."}]
        pairs = orch.planning_exchanges(history)
        self.assertEqual([p["student"] for p in pairs], [f"q{i}" for i in range(2, 8)])


class TestPlannerVisuals(unittest.TestCase):
    def test_proposed_change_card(self):
        proposal = {"id": "p1", "status": "pending", "summary": "Add ECON 3020", "base_revision": 3,
                    "ops": [add("ECON 3020")], "diff": {"heading": "Add ECON 3020", "courses": {"added": ["ECON 3020"]}},
                    "created_at": "2026-10-28T00:00:00", "expires_at": "2026-10-29T00:00:00"}
        (spec,) = build_visuals([{"name": "plan_edit", "result": {"status": "proposed", "proposal": proposal}}])
        self.assertEqual(spec["type"], "proposed_change")
        self.assertEqual(spec["proposal"]["id"], "p1")
        self.assertEqual(spec["proposal"]["status"], "pending")
        self.assertEqual(spec["proposal"]["diff"]["heading"], "Add ECON 3020")

    def test_course_shortlist_card(self):
        items = [{"option_id": f"option-{i}", "id": cid, "title": f"{cid} title", "why": "Fills: electives",
                  "labels": ["Fills: electives"], "prereqs": {"status": "met", "reason": None}, "credits": [3, 3]}
                 for i, cid in enumerate(("ECON 3020", "ECON 3300"), start=1)]
        (spec,) = build_visuals([{"name": "plan_suggest", "result": {"query": "policy", "items": items}}])
        self.assertEqual(spec["type"], "course_shortlist")
        self.assertEqual([(i["option_id"], i["id"]) for i in spec["items"]],
                         [("option-1", "ECON 3020"), ("option-2", "ECON 3300")])

    def test_errors_and_empty_shortlists_make_no_card(self):
        outputs = [
            {"name": "plan_edit", "result": {"error": "ECON 3999 isn't a course at this school", "code": "unknown_course"}},
            {"name": "plan_edit", "result": {"error": "Couldn't verify ECON 5000", "code": "couldnt_verify_course"}},
            {"name": "plan_edit", "result": {"error": "Plan changed", "code": "revision_conflict", "revision": 4}},
            {"name": "plan_suggest", "result": {"items": [], "reason": "Tell me what you're interested in"}},
        ]
        self.assertEqual(build_visuals(outputs), [])

    def test_sources_checked_names_the_plan(self):
        checked = sources_checked([{"name": "plan_edit", "result": {}}])
        self.assertEqual(checked["domains"], [{"id": "planning", "label": "Your plan"}])


if __name__ == "__main__":
    unittest.main()
