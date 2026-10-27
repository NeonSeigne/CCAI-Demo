"""Tests for per-domain tool routing in the orchestrator."""

import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import app.config
from app.config import AppSettings
from app.core import improved_orchestrator as orch
from app.core.improved_orchestrator import ImprovedChatOrchestrator
from app.llm.llm_client import ToolCallResult

TOOLS = {
    "course_search": {"enabled": True},
    "events_search": {"enabled": True},
    "find_place": {"enabled": True},
}


def tool_result(text, name, result=None):
    return ToolCallResult(
        text=text, used_tool=True, tool_name=name,
        tool_outputs=[{"name": name, "result": result or {}}],
    )


class RoutingTestCase(unittest.IsolatedAsyncioTestCase):
    tools = TOOLS

    def setUp(self):
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            tools=self.tools,
        )
        self.calls = []

    def tearDown(self):
        app.config._settings = None

    def llm(self, classifier_reply='{"domains": []}', classifier_error=None, pass_behavior=None):
        llm = MagicMock()
        if classifier_error:
            llm.generate = AsyncMock(side_effect=classifier_error)
        else:
            llm.generate = AsyncMock(return_value=classifier_reply)

        async def generate_with_tools(*, system_prompt, user_message, tool_definitions, tool_executor):
            names = sorted(d["function"]["name"] for d in tool_definitions)
            self.calls.append((names, user_message))
            if pass_behavior:
                return await pass_behavior(names, user_message)
            if names == ["events_search"]:
                return tool_result("Jazz tonight at Macky.", "events_search",
                                   {"events": [{"title": "Jazz", "location": "Macky Auditorium"}]})
            if names == ["find_place"]:
                return tool_result("Macky is 3 min away.", "find_place", {"places": [{"name": "Macky"}]})
            return tool_result("CSCI 1300 is intro CS.", "course_search", {"courses": []})

        llm.generate_with_tools = generate_with_tools
        return llm

    async def respond(self, llm, message="hi"):
        return await ImprovedChatOrchestrator().get_tool_response(message, llm_client=llm)

    def passes(self):
        return [names for names, _ in self.calls]


class TestSingleDomain(RoutingTestCase):
    tools = {"course_search": {"enabled": True}, "rate_my_professor": {"enabled": True, "school_id": "x"}}

    async def test_one_domain_skips_classifier(self):
        llm = self.llm()
        await self.respond(llm)
        llm.generate.assert_not_awaited()
        self.assertEqual(self.passes(), [["course_search", "rate_my_professor"]])


class TestClassifier(RoutingTestCase):
    async def test_picked_domain_gets_only_its_tools(self):
        llm = self.llm('{"domains": ["campus"]}')
        result = await self.respond(llm, "where is Norlin?")
        self.assertEqual(self.passes(), [["find_place"]])
        self.assertEqual(result.text, "Macky is 3 min away.")

    async def test_reply_wrapped_in_prose_still_parses(self):
        llm = self.llm('Sure: {"domains": ["academics"]}')
        await self.respond(llm)
        self.assertEqual(self.passes(), [["course_search"]])

    async def test_error_falls_back_to_all_domains(self):
        llm = self.llm(classifier_error=RuntimeError("api down"))
        await self.respond(llm)
        self.assertEqual(sorted(map(tuple, self.passes())),
                         [("course_search",), ("events_search",), ("find_place",)])

    async def test_explicit_empty_pick_runs_no_tool_pass(self):
        # "pick none if no domain fits" is an answer, not a failure.
        result = await self.respond(self.llm('{"domains": []}'))
        self.assertEqual(self.passes(), [])
        self.assertFalse(result.used_tool)

    async def test_unknown_or_unparseable_pick_falls_back_to_all_domains(self):
        for reply in ('{"domains": ["dining"]}', "not json", '{"other": 1}'):
            self.calls.clear()
            await self.respond(self.llm(reply))
            self.assertEqual(len(self.passes()), 3, reply)

    async def test_timeout_falls_back_to_all_domains(self):
        llm = self.llm()

        async def slow(**kwargs):
            await asyncio.sleep(1)
            return '{"domains": ["campus"]}'

        llm.generate = slow
        with patch.object(orch, "CLASSIFIER_TIMEOUT_S", 0.01):
            await self.respond(llm)
        self.assertEqual(len(self.passes()), 3)


class TestEventsThenCampus(RoutingTestCase):
    async def test_campus_runs_after_events_with_their_venues(self):
        llm = self.llm('{"domains": ["student_life", "campus"]}')
        result = await self.respond(llm, "what's on tonight and how do I get there?")
        self.assertEqual(self.passes(), [["events_search"], ["find_place"]])
        campus_message = self.calls[1][1]
        self.assertIn("Macky Auditorium", campus_message)
        self.assertEqual(result.text, "Jazz tonight at Macky.\n\nMacky is 3 min away.")
        self.assertEqual([o["name"] for o in result.tool_outputs], ["events_search", "find_place"])

    async def test_events_kept_when_campus_pass_fails(self):
        async def behavior(names, message):
            if names == ["find_place"]:
                raise RuntimeError("map down")
            return tool_result("Jazz tonight at Macky.", "events_search",
                               {"events": [{"title": "Jazz", "location": "Macky Auditorium"}]})

        llm = self.llm('{"domains": ["student_life", "campus"]}', pass_behavior=behavior)
        result = await self.respond(llm)
        self.assertTrue(result.used_tool)
        self.assertEqual(result.text, "Jazz tonight at Macky.")

    async def test_events_kept_when_campus_pass_times_out(self):
        async def behavior(names, message):
            if names == ["find_place"]:
                await asyncio.Event().wait()
            return tool_result("Jazz tonight at Macky.", "events_search",
                               {"events": [{"title": "Jazz", "location": "Macky Auditorium"}]})

        llm = self.llm('{"domains": ["student_life", "campus"]}', pass_behavior=behavior)
        with patch.object(orch, "TOOL_PASS_TIMEOUT_S", 0.2):
            result = await self.respond(llm)
        self.assertEqual(result.text, "Jazz tonight at Macky.")

    async def test_no_venues_passes_message_unchanged(self):
        async def behavior(names, message):
            return tool_result("Nothing tonight.", names[0], {"events": []})

        llm = self.llm('{"domains": ["student_life", "campus"]}', pass_behavior=behavior)
        await self.respond(llm, "tonight?")
        self.assertEqual(self.calls[1][1], "tonight?")


class TestPassFailures(RoutingTestCase):
    async def test_timed_out_pass_is_dropped_others_kept(self):
        async def behavior(names, message):
            if names == ["course_search"]:
                await asyncio.sleep(1)
            return tool_result(f"{names[0]} answer", names[0])

        llm = self.llm('{"domains": ["academics", "campus"]}', pass_behavior=behavior)
        with patch.object(orch, "TOOL_PASS_TIMEOUT_S", 0.05):
            result = await self.respond(llm)
        self.assertEqual(result.text, "find_place answer")

    async def test_failed_pass_is_dropped_others_kept(self):
        async def behavior(names, message):
            if names == ["course_search"]:
                raise RuntimeError("boom")
            return tool_result(f"{names[0]} answer", names[0])

        llm = self.llm('{"domains": ["academics", "campus"]}', pass_behavior=behavior)
        result = await self.respond(llm)
        self.assertTrue(result.used_tool)
        self.assertEqual(result.text, "find_place answer")

    async def test_passes_run_concurrently(self):
        async def behavior(names, message):
            await asyncio.sleep(0.2)
            return tool_result(names[0], names[0])

        llm = self.llm('{"domains": ["academics", "campus"]}', pass_behavior=behavior)
        loop = asyncio.get_running_loop()
        started = loop.time()
        await self.respond(llm)
        self.assertLess(loop.time() - started, 0.35)

    async def test_no_pass_used_a_tool(self):
        async def behavior(names, message):
            return ToolCallResult(text="", used_tool=False)

        llm = self.llm('{"domains": ["academics"]}', pass_behavior=behavior)
        result = await self.respond(llm)
        self.assertFalse(result.used_tool)


class TestHelpers(unittest.TestCase):
    def test_unmapped_tools_go_to_general(self):
        grouped = orch.tools_by_domain(["course_search", "find_place", "mystery_tool"])
        self.assertEqual(grouped, {"academics": ["course_search"], "campus": ["find_place"],
                                   "general": ["mystery_tool"]})

    def test_classifier_prompt_lists_only_enabled_domains(self):
        prompts = []

        async def capture(**kwargs):
            prompts.append(kwargs["system_prompt"])
            return json.dumps({"domains": ["campus"]})

        llm = MagicMock()
        llm.generate = capture
        picked = asyncio.run(ImprovedChatOrchestrator()._classify_domains(llm, "hi", ["campus", "academics"]))
        self.assertEqual(picked, ["campus"])
        self.assertIn("campus", prompts[0])
        self.assertNotIn("student_life", prompts[0])


if __name__ == "__main__":
    unittest.main()
