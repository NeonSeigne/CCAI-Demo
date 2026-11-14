"""Choosing the panel and talking to one advisor (panel-answers phases 4 and 5)."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.api.routes import chat
from app.core.context_manager import get_context_manager
from app.llm.llm_client import LLMErrorText, ToolCallResult
from app.models.user import PersistMessage
from app.tests.unit.test_data_panel import FakeLLM, real_orchestrator


async def _lines(response):
    out = []
    async for chunk in response.body_iterator:
        out.extend(json.loads(line) for line in chunk.splitlines() if line.strip())
    return out


def _session(messages=None):
    session = MagicMock(messages=list(messages or []), session_id="s1", uploaded_files=[])
    session.append_message = lambda role, content: session.messages.append({"role": role, "content": content})
    session.get_latest_user_message = lambda: next(
        (m["content"] for m in reversed(session.messages) if m["role"] == "user"), "",
    )
    return session


def _patches(session, orch, persist, chat_session_id):
    return (
        patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}),
        patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{chat_session_id}": session},
                                                        get_session=MagicMock(return_value=session))),
        patch.object(chat, "chat_orchestrator", orch),
        patch.object(chat, "tool_context_for", return_value=None),
        patch.object(chat, "persist_message", persist),
    )


class TestOpenQuestionFailedAdvisors(unittest.IsolatedAsyncioTestCase):
    async def stream(self, llms, mode="aggregated"):
        real = real_orchestrator(llms)
        orch = MagicMock()
        orch.needs_clarification_improved = AsyncMock(return_value=False)
        orch.get_tool_response = AsyncMock(return_value=ToolCallResult(text="", used_tool=False))
        orch.list_personas.return_value = list(llms)
        orch.get_top_personas = AsyncMock(return_value=list(llms))
        orch.get_persona = real.get_persona
        orch.generate_single_persona_response = real.generate_single_persona_response
        orch.synthesize_aggregated_response = AsyncMock(side_effect=lambda **kw: {
            "persona_name": "Panel", "response": "Merged.", "differences": [],
            "source_personas": [r["persona_id"] for r in kw["panel_results"]],
        })
        self.orch = orch
        session = _session()
        persist = AsyncMock(side_effect=lambda sid, m: m.id)
        msg = chat.ChatMessage(user_input="How do I plan my week?", chat_session_id=str(ObjectId()),
                               response_mode=mode)
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[], show_panel=True)
        p = _patches(session, orch, persist, msg.chat_session_id)
        with p[0], p[1], p[2], p[3], p[4]:
            lines = await _lines(await chat.chat_stream(msg, MagicMock(), current_user=user))
        self.persisted = [c.args[1] for c in persist.await_args_list]
        self.session = session
        return lines

    async def test_a_failed_advisor_is_not_streamed_saved_named_or_merged(self):
        lines = await self.stream({
            "academic_planner": FakeLLM(LLMErrorText("The AI service encountered an error. Please try again.")),
            "study_strategist": FakeLLM("Block your shifts first, then study time."),
        })
        advisors = [l["data"] for l in lines if l["type"] == "advisor"]
        self.assertEqual([a["persona_id"] for a in advisors], ["study_strategist", "aggregated"])
        self.assertNotIn("encountered an error", json.dumps(lines))
        self.assertEqual(advisors[-1]["source_personas"], ["study_strategist"])
        merged = self.orch.synthesize_aggregated_response.await_args.kwargs["panel_results"]
        self.assertEqual([r["persona_id"] for r in merged], ["study_strategist"])
        saved = [m.persona_id for m in self.persisted if m.type == "advisor"]
        self.assertEqual(saved, ["study_strategist", "aggregated"])
        self.assertNotIn("academic_planner", [m["role"] for m in self.session.messages])
        # The take carries its stored id, for "Reply to {name}".
        self.assertEqual(advisors[0]["message_id"], self.persisted[1].id)

    async def test_every_advisor_failing_is_an_error_without_a_merge(self):
        lines = await self.stream({"academic_planner": FakeLLM(LLMErrorText("I encountered an unexpected error."))})
        self.assertEqual([l["type"] for l in lines], ["progress", "progress", "progress", "error", "progress"])
        self.assertEqual(lines[-2]["data"]["code"], "NO_ADVISOR_ANSWERED")
        self.orch.synthesize_aggregated_response.assert_not_awaited()
        self.assertEqual([m.type for m in self.persisted], ["user"])

    async def test_panel_mode_drops_the_failed_advisor_too(self):
        lines = await self.stream({
            "academic_planner": FakeLLM(LLMErrorText("The AI service encountered an error. Please try again.")),
            "study_strategist": FakeLLM("Block your shifts first, then study time."),
        }, mode="panel")
        self.assertEqual([l["data"]["persona_id"] for l in lines if l["type"] == "advisor"], ["study_strategist"])


class TestReplyToAdvisor(unittest.IsolatedAsyncioTestCase):
    async def reply(self, llm, history=None, **body):
        orch = real_orchestrator({"career_coach": llm})
        session = _session(history)
        persist = AsyncMock(side_effect=lambda sid, m: m.id)
        reply = chat.ReplyToAdvisor(
            user_input="What if I only work weekends?", advisor_id="career_coach",
            original_message_id="take-1", chat_session_id=str(ObjectId()), **body,
        )
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[], show_panel=True)
        p = _patches(session, orch, persist, reply.chat_session_id)
        with p[0], p[1], p[2], p[3], p[4]:
            lines = await _lines(await chat.reply_to_advisor(reply, MagicMock(), current_user=user))
        self.persisted = [c.args[1] for c in persist.await_args_list]
        self.session = session
        return lines

    async def test_streams_one_advisor_line_and_saves_both_turns_as_replies(self):
        llm = FakeLLM("Weekends work if you keep Friday free.")
        lines = await self.reply(llm, history=[
            {"role": "user", "content": "I'm balancing a job and classes."},
            {"role": "career_coach", "content": "Keep the job under 15 hours."},
            {"role": "aggregated", "content": "Merged answer."},
        ])

        self.assertEqual([(l["type"], l["data"].get("phase")) for l in lines], [
            ("progress", "received"), ("progress", "panel"), ("advisor", None), ("progress", "complete"),
        ])
        self.assertEqual(lines[1]["data"]["advisors"], ["career_coach"])
        answer = lines[2]["data"]
        self.assertEqual(answer["persona_id"], "career_coach")
        self.assertEqual(answer["persona_name"], "Career Coach")
        self.assertEqual(answer["content"], "Weekends work if you keep Friday free.")
        self.assertTrue(answer["is_reply"])
        self.assertEqual(answer["reply_to"], {"advisorId": "career_coach", "advisorName": "Career Coach",
                                              "messageId": "take-1"})

        self.assertTrue(all(isinstance(m, PersistMessage) for m in self.persisted))
        user_msg, advisor_msg = self.persisted
        self.assertEqual((user_msg.type, user_msg.isReply), ("user", True))
        self.assertEqual((advisor_msg.type, advisor_msg.persona_id, advisor_msg.isReply),
                         ("advisor", "career_coach", True))
        self.assertEqual(user_msg.replyTo.advisorId, "career_coach")
        self.assertEqual(advisor_msg.replyTo.messageId, "take-1")
        self.assertEqual(user_msg.response_group_id, advisor_msg.response_group_id)
        self.assertEqual(answer["message_id"], advisor_msg.id)

        # The request ends on the student's turn, with the earlier take as context.
        call = llm.calls[0]
        sent = get_context_manager().prepare_context_for_llm(
            messages=call["context"], system_prompt=call["system_prompt"], llm_provider="vllm",
        ).messages
        self.assertEqual(sent[-1]["role"], "user")
        self.assertIn("What if I only work weekends?", sent[-1]["content"])
        self.assertIn("Keep the job under 15 hours.", sent[-1]["content"])
        self.assertEqual(self.session.messages[-1], {"role": "career_coach",
                                                     "content": "Weekends work if you keep Friday free."})

    async def test_a_failed_reply_is_an_error_and_not_saved(self):
        lines = await self.reply(FakeLLM(LLMErrorText("The AI service encountered an error. Please try again.")))
        self.assertEqual([l["type"] for l in lines], ["progress", "progress", "error", "progress"])
        self.assertNotIn("encountered an error", json.dumps(lines))
        self.assertEqual([m.type for m in self.persisted], ["user"])

    async def test_unknown_advisor_is_404(self):
        orch = real_orchestrator({"career_coach": FakeLLM("Hi.")})
        reply = chat.ReplyToAdvisor(user_input="Hi", advisor_id="nobody")
        with patch.object(chat, "chat_orchestrator", orch):
            with self.assertRaises(HTTPException) as caught:
                await chat.reply_to_advisor(reply, MagicMock(), current_user=SimpleNamespace(id=ObjectId()))
        self.assertEqual(caught.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
