"""Stream-level tests for /chat-stream error paths."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

from app.api.routes import chat
from app.llm.llm_client import ToolCallResult
from app.models.user import PersistMessage


async def _lines(response):
    out = []
    async for chunk in response.body_iterator:
        out.extend(json.loads(line) for line in chunk.splitlines() if line.strip())
    return out


class TestUnavailableAdvisors(unittest.IsolatedAsyncioTestCase):
    async def test_only_unknown_advisors_streams_error_and_persists_it(self):
        session = MagicMock()
        orchestrator = MagicMock()
        orchestrator.needs_clarification_improved = AsyncMock(return_value=False)
        orchestrator.get_tool_response = AsyncMock(return_value=ToolCallResult(text="", used_tool=False))
        orchestrator.list_personas.return_value = ["academic_planner"]
        persist = AsyncMock()
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[])
        message = chat.ChatMessage(
            user_input="hi", chat_session_id=str(ObjectId()), active_advisors=["no_such_advisor"],
        )

        with patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}), \
             patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{message.chat_session_id}": session},
                                                            get_session=MagicMock(return_value=session))), \
             patch.object(chat, "chat_orchestrator", orchestrator), \
             patch.object(chat, "persist_message", persist):
            response = await chat.chat_stream(message, MagicMock(), current_user=user)
            lines = await _lines(response)

        errors = [line for line in lines if line["type"] == "error"]
        self.assertEqual(errors[0]["data"]["code"], "NO_ADVISORS_AVAILABLE")
        persisted = [call.args[1] for call in persist.await_args_list]
        self.assertTrue(all(isinstance(m, PersistMessage) for m in persisted), persisted)
        self.assertEqual(persisted[-1].type, "error")


if __name__ == "__main__":
    unittest.main()
