import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.improved_orchestrator import ImprovedChatOrchestrator

PERSONA_IDS = ["academic", "career", "wellness", "social"]


def _make_orchestrator(reply):
    """Orchestrator whose LLM answers the advisor ranking with *reply*."""
    orch = ImprovedChatOrchestrator.__new__(ImprovedChatOrchestrator)
    orch.llm_client = MagicMock()
    orch.llm_client.generate = AsyncMock(return_value=reply)
    orch.session_manager = MagicMock()
    orch.session_manager.get_session.return_value.get_recent_messages.return_value = [
        {"content": "How do I pick a major?"},
    ]
    orch.personas = {}
    for pid in PERSONA_IDS:
        persona = MagicMock()
        persona.id = pid
        persona.name = pid.title()
        persona.system_prompt = f"{pid} advisor"
        orch.personas[pid] = persona
    return orch


@patch("app.core.improved_orchestrator.get_settings")
class TestGetTopPersonas(unittest.TestCase):

    def _top(self, reply):
        return asyncio.run(_make_orchestrator(reply).get_top_personas("s1"))

    def test_plain_list(self, mock_settings):
        self.assertEqual(self._top('["social", "career", "academic"]'), ["social", "career", "academic"])

    def test_list_wrapped_in_an_object(self, mock_settings):
        reply = json.dumps({"advisor_ids": ["wellness", "career", "social"]})
        self.assertEqual(self._top(reply), ["wellness", "career", "social"])

    def test_list_beside_other_fields(self, mock_settings):
        # qwen2.5:7b replied like this; the count used to be read as the list.
        reply = json.dumps({"count": 3, "advisors": ["career", "social", "wellness"]})
        self.assertEqual(self._top(reply), ["career", "social", "wellness"])

    def test_unusable_reply_falls_back_to_default_order(self, mock_settings):
        self.assertEqual(self._top(json.dumps({"count": 3})), PERSONA_IDS[:3])
        self.assertEqual(self._top("3"), PERSONA_IDS[:3])
