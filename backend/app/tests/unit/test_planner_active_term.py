"""The term open in the semester view reaches chat (CEO review O1, eng re-review N2).

Mocked LLM only: no API keys, no model calls.
"""

import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from app.api.routes import chat
from app.api.visuals import build_visuals
from app.core.improved_orchestrator import ImprovedChatOrchestrator
from app.llm.llm_client import ToolCallResult
from app.planner import service, store
from app.sources import academics
from app.tests.unit.planner_fakes import TERM
from app.tests.unit.test_planner_chat import ALICE, PLANNING, SCHOOL, PlannerChatTestCase, add
from app.tools import get_tool_executor

FALL = "Fall 2027"
TERMS = ["Spring 2027", FALL]
FOUND = {"courses": [{"identifier": "ECON 3020"}, {"identifier": "ECON 4010"}]}


class ActiveTermTestCase(PlannerChatTestCase):
    def setUp(self):
        super().setUp()
        terms = patch.object(academics, "planner_terms", return_value=TERMS)
        terms.start()
        self.addCleanup(terms.stop)
        self.user = SimpleNamespace(id=ALICE)

    def context(self, active_term):
        return chat.tool_context_for(self.user, active_term)


class TestToolContextTerm(ActiveTermTestCase):
    def test_known_term_is_kept_in_the_schools_spelling(self):
        self.assertEqual(self.context("fall  2027").active_term, FALL)

    def test_unknown_or_missing_term_is_dropped(self):
        for term in ("Fall 2031", "", None, "drop table"):
            with self.subTest(term=term):
                self.assertIsNone(self.context(term).active_term)
        self.assertIsNone(chat.ChatMessage(user_input="hi").active_term)

    async def test_chat_stream_passes_the_open_term_to_the_tools(self):
        session = MagicMock()
        orchestrator = MagicMock()
        orchestrator.needs_clarification_improved = AsyncMock(return_value=False)
        orchestrator.get_tool_response = AsyncMock(return_value=ToolCallResult(text="", used_tool=False))
        orchestrator.list_personas.return_value = []
        message = chat.ChatMessage(user_input="what should I take", chat_session_id=str(ObjectId()),
                                   active_term=FALL)
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[])
        with patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}), \
             patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{message.chat_session_id}": session},
                                                            get_session=MagicMock(return_value=session))), \
             patch.object(chat, "chat_orchestrator", orchestrator), \
             patch.object(chat, "persist_message", AsyncMock()):
            response = await chat.chat_stream(message, MagicMock(), current_user=user)
            async for _ in response.body_iterator:
                pass
        context = orchestrator.get_tool_response.await_args.kwargs["context"]
        self.assertEqual((context.user_id, context.active_term), (str(user.id), FALL))


class TestActiveTermInTools(ActiveTermTestCase):
    async def suggest(self, active_term):
        dispatch = get_tool_executor(enabled=PLANNING, context=self.context(active_term))
        with patch.object(academics, "search_catalog", AsyncMock(return_value=FOUND)):
            return await dispatch(name="plan_suggest", q="macro")

    async def test_suggestions_use_the_open_term_and_the_card_carries_it(self):
        result = await self.suggest(FALL)
        self.assertEqual(result["term"], FALL)
        self.assertIn("Offered Fall 2027", result["items"][0]["labels"])
        (spec,) = build_visuals([{"name": "plan_suggest", "result": result}])
        self.assertEqual(spec["term"], FALL)

    async def test_an_add_lands_in_the_open_term(self):
        dispatch = get_tool_executor(enabled=PLANNING, context=self.context(FALL))
        result = await dispatch(name="plan_edit", ops=[add("ECON 3020")])
        self.assertEqual(result["proposal"]["ops"], [{"op": "add", "course": "ECON 3020", "term": FALL}])
        # Accepted later, from anywhere, it still lands in Fall 2027.
        accepted = await service.accept(ALICE, SCHOOL, result["proposal"]["id"])
        self.assertEqual(accepted["plan"]["courses"], [{"id": "ECON 3020", "term": FALL, "sections": None}])

    async def test_the_card_diff_is_drawn_for_the_open_term(self):
        await self.edit(ALICE, [add("ECON 3010")])
        dispatch = get_tool_executor(enabled=PLANNING, context=self.context(FALL))
        proposal = (await dispatch(name="plan_edit", ops=[add("ECON 3020")]))["proposal"]
        diff = proposal["diff"]
        self.assertEqual(proposal["term"], FALL)
        self.assertEqual([(c["id"], c["term"]) for c in diff["added_courses"]], [("ECON 3020", FALL)])
        self.assertEqual(diff["credits"], {"before": [0, 0], "after": [3.0, 3.0]})  # fall's, not spring's
        (spec,) = build_visuals([{"name": "plan_edit", "result": {"status": "proposed", "proposal": proposal}}])
        self.assertEqual(spec["proposal"]["term"], FALL)

        # The plan moves on; the recheck at accept still draws Fall 2027.
        await self.edit(ALICE, [add("ECON 4010")])
        with self.assertRaises(store.NeedsReview) as review:
            await service.accept(ALICE, SCHOOL, proposal["id"])
        self.assertEqual([c["id"] for c in review.exception.proposal["diff"]["added_courses"]], ["ECON 3020"])
        accepted = await service.accept(ALICE, SCHOOL, proposal["id"])
        self.assertIn({"id": "ECON 3020", "term": FALL, "sections": None}, accepted["plan"]["courses"])

    async def test_an_add_naming_its_term_keeps_it(self):
        dispatch = get_tool_executor(enabled=PLANNING, context=self.context(FALL))
        result = await dispatch(name="plan_edit", ops=[dict(add("ECON 3020"), term=TERM)])
        self.assertEqual(result["proposal"]["ops"][0]["term"], TERM)

    async def test_unknown_term_falls_back_to_the_plan_term(self):
        result = await self.suggest("Fall 2031")
        self.assertEqual(result["term"], TERM)
        self.assertIn("Offered Spring 2027", result["items"][0]["labels"])
        dispatch = get_tool_executor(enabled=PLANNING, context=self.context("Fall 2031"))
        proposal = (await dispatch(name="plan_edit", ops=[add("ECON 3020")]))["proposal"]
        self.assertEqual(proposal["ops"], [add("ECON 3020")])
        self.assertEqual(proposal["diff"]["courses"]["added"], ["ECON 3020"])

    async def test_summary_labels_the_open_term_as_planned(self):
        await self.edit(ALICE, [add("ECON 3010"), dict(add("ECON 3020"), term=FALL)])
        text, _ = await service.plan_summary(ALICE, SCHOOL, active_term=FALL)
        self.assertIn("planning Fall 2027.", text)
        self.assertIn("Planned for Fall 2027: ECON 3020", text)
        self.assertIn("Other terms: ECON 3010 (Spring 2027)", text)

    async def test_planning_pass_prompt_uses_the_open_term(self):
        await self.edit(ALICE, [add("ECON 3010")])

        async def model(executor, names):
            return []

        await ImprovedChatOrchestrator().get_tool_response(
            "what should I take", llm_client=self.llm(model), context=self.context(FALL))
        self.assertIn("planning Fall 2027.", self.prompts[0])


if __name__ == "__main__":
    unittest.main()
