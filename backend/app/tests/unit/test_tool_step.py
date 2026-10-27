"""Characterization tests for the orchestrator's tool step (get_tool_response).

These pin how the shipped CU and UW configs reach the LLM tool call: which tools
are offered and what the tool-guidance prompt says. They run against the real
config files with a mocked LLM.
"""

import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import app.config
from app.config import load_settings
from app.core.improved_orchestrator import ImprovedChatOrchestrator
from app.llm.llm_client import ToolCallResult

REPO_ROOT = Path(__file__).resolve().parents[4]
CU_CONFIG = REPO_ROOT / "undergrad_config.yaml"
UW_CONFIG = REPO_ROOT / "wisconsin_config.yaml"

UW_TOOLS = {
    "course_search",
    "course_grades",
    "course_prerequisites",
    "course_next",
    "course_sections",
}


def mock_llm(result=None):
    llm = MagicMock()
    llm.generate_with_tools = AsyncMock(
        return_value=result or ToolCallResult(text="", used_tool=False)
    )
    return llm


def offered_tool_names(llm):
    defs = llm.generate_with_tools.await_args.kwargs["tool_definitions"]
    return {d["function"]["name"] for d in defs}


def system_prompt(llm):
    return llm.generate_with_tools.await_args.kwargs["system_prompt"]


class ToolStepTestCase(unittest.IsolatedAsyncioTestCase):
    config_path: Path

    def setUp(self):
        app.config._settings = None
        load_settings(str(self.config_path))

    def tearDown(self):
        app.config._settings = None


class TestCUToolStep(ToolStepTestCase):
    config_path = CU_CONFIG

    async def test_offers_only_cu_tools(self):
        llm = mock_llm()
        await ImprovedChatOrchestrator().get_tool_response("CSCI 1300?", llm_client=llm)
        self.assertEqual(offered_tool_names(llm), {"search_courses", "rate_my_professor"})

    async def test_prompt_does_not_mention_uw(self):
        llm = mock_llm()
        await ImprovedChatOrchestrator().get_tool_response("CSCI 1300?", llm_client=llm)
        prompt = system_prompt(llm)
        self.assertNotIn("UW-Madison", prompt)
        for name in UW_TOOLS:
            self.assertNotIn(name, prompt)

    async def test_passes_user_message_through(self):
        llm = mock_llm()
        await ImprovedChatOrchestrator().get_tool_response("Who teaches CSCI 1300?", llm_client=llm)
        self.assertEqual(llm.generate_with_tools.await_args.kwargs["user_message"], "Who teaches CSCI 1300?")


class TestUWToolStep(ToolStepTestCase):
    config_path = UW_CONFIG

    async def test_offers_uw_tools_and_rmp(self):
        llm = mock_llm()
        await ImprovedChatOrchestrator().get_tool_response("COMP SCI 300?", llm_client=llm)
        self.assertEqual(offered_tool_names(llm), UW_TOOLS | {"rate_my_professor"})

    async def test_prompt_keeps_course_link_and_card_guidance(self):
        llm = mock_llm()
        await ImprovedChatOrchestrator().get_tool_response("COMP SCI 300?", llm_client=llm)
        prompt = system_prompt(llm)
        self.assertIn("(course:", prompt)
        self.assertIn("University of Wisconsin–Madison course", prompt)
        for name in UW_TOOLS - {"course_search"}:
            self.assertIn(name, prompt)

    async def test_returns_llm_result_unchanged(self):
        expected = ToolCallResult(text="COMP SCI 300 is Programming II.", used_tool=True, tool_name="course_search")
        llm = mock_llm(expected)
        result = await ImprovedChatOrchestrator().get_tool_response("COMP SCI 300?", llm_client=llm)
        self.assertIs(result, expected)


class TestToolStepGuards(ToolStepTestCase):
    config_path = UW_CONFIG

    async def test_no_llm_skips_tools(self):
        result = await ImprovedChatOrchestrator().get_tool_response("anything", llm_client=None)
        self.assertFalse(result.used_tool)

    async def test_no_enabled_tools_skips_llm(self):
        settings = app.config.get_settings()
        for cfg in settings.tools.__pydantic_extra__.values():
            if isinstance(cfg, dict):
                cfg["enabled"] = False
        llm = mock_llm()
        result = await ImprovedChatOrchestrator().get_tool_response("anything", llm_client=llm)
        self.assertFalse(result.used_tool)
        llm.generate_with_tools.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
