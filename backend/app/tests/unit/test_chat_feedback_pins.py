"""Answer feedback, pinned chats, rename and whole titles (home-colors
alignment Phase 3: chat action row, the ⋯ menu and the rail's Recent)."""

import asyncio
import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.routes import chat
from app.api.routes.chat_sessions import (
    CreateChatSessionRequest,
    MessageFeedbackRequest,
    UpdateChatSessionRequest,
    get_chat_session,
    get_user_chat_sessions,
    persist_message,
    set_message_feedback,
    update_chat_session,
)
from app.llm.llm_client import ToolCallResult
from app.models.user import PersistMessage, User

USER_ID = ObjectId()
SESSION_ID = ObjectId()
ANSWER_ID = str(ObjectId())
QUESTION_ID = str(ObjectId())
LONG_TITLE = "What can I take after COMP SCI 300 if I want to do machine learning next fall?"


def _user():
    return User(_id=USER_ID, firstName="T", lastName="U", email="t@example.com",
                hashed_password="x", is_active=True, created_at=datetime(2025, 1, 1))


def _session(**overrides):
    doc = {
        "_id": SESSION_ID, "user_id": USER_ID, "title": LONG_TITLE, "is_active": True,
        "created_at": datetime(2026, 10, 1), "updated_at": datetime(2026, 10, 2),
        "messages": [
            {"id": QUESTION_ID, "type": "user", "content": "hi"},
            {"id": ANSWER_ID, "type": "advisor", "persona_id": "orchestrator", "advisorName": "O", "content": "Yes"},
        ],
    }
    doc.update(overrides)
    return doc


def _db(doc):
    db = MagicMock()
    db.chat_sessions.find_one = AsyncMock(return_value=doc)
    db.chat_sessions.update_one = AsyncMock()
    return db


def run(coro):
    return asyncio.run(coro)


class TestFeedback(unittest.TestCase):
    def feedback(self, db, value, message_id=ANSWER_ID, session_id=None):
        with patch("app.api.routes.chat_sessions.get_database", return_value=db):
            return run(set_message_feedback(
                session_id=session_id or str(SESSION_ID), message_id=message_id,
                request=MessageFeedbackRequest(feedback=value), current_user=_user(),
            ))

    def test_thumbs_up_is_stored_on_the_message(self):
        db = _db(_session())
        result = self.feedback(db, "up")
        self.assertEqual(result, {"message_id": ANSWER_ID, "feedback": "up"})
        query, change = db.chat_sessions.update_one.call_args[0]
        self.assertEqual(query, {"_id": SESSION_ID, "user_id": USER_ID, "messages.id": ANSWER_ID})
        self.assertEqual(change, {"$set": {"messages.$.feedback": "up"}})

    def test_null_clears_it(self):
        db = _db(_session())
        self.assertIsNone(self.feedback(db, None)["feedback"])
        self.assertEqual(db.chat_sessions.update_one.call_args[0][1], {"$unset": {"messages.$.feedback": ""}})

    def test_feedback_does_not_move_the_chat_in_recent(self):
        db = _db(_session())
        self.feedback(db, "down")
        self.assertNotIn("updated_at", json.dumps(db.chat_sessions.update_one.call_args[0][1]))

    def test_only_answers_take_feedback(self):
        db = _db(_session())
        with self.assertRaises(HTTPException) as ctx:
            self.feedback(db, "up", message_id=QUESTION_ID)
        self.assertEqual(ctx.exception.status_code, 422)
        db.chat_sessions.update_one.assert_not_awaited()

    def test_unknown_message_session_or_bad_id_is_404(self):
        with self.assertRaises(HTTPException) as ctx:
            self.feedback(_db(_session()), "up", message_id="nope")
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            self.feedback(_db(None), "up")
        self.assertEqual(ctx.exception.status_code, 404)
        with self.assertRaises(HTTPException) as ctx:
            self.feedback(_db(_session()), "up", session_id="not-an-id")
        self.assertEqual(ctx.exception.status_code, 404)

    def test_only_up_down_or_null(self):
        with self.assertRaises(ValidationError):
            MessageFeedbackRequest(feedback="meh")

    def test_persisted_message_keeps_feedback(self):
        msg = PersistMessage(type="advisor", persona_id="orchestrator", advisorName="O", content="x", feedback="up")
        self.assertEqual(msg.model_dump(exclude_none=True)["feedback"], "up")


class TestPersistReturnsId(unittest.TestCase):
    def test_returns_the_stored_id(self):
        db = _db(None)
        msg = PersistMessage(type="advisor", persona_id="orchestrator", advisorName="O", content="x")
        with patch("app.api.routes.chat_sessions.get_database", return_value=db):
            stored = run(persist_message(str(SESSION_ID), msg))
        self.assertEqual(stored, msg.id)
        self.assertEqual(db.chat_sessions.update_one.call_args[0][1]["$push"]["messages"]["id"], msg.id)


class TestPinAndRename(unittest.TestCase):
    def update(self, db, **body):
        with patch("app.api.routes.chat_sessions.get_database", return_value=db):
            return run(update_chat_session(
                session_id=str(SESSION_ID), request=UpdateChatSessionRequest(**body), current_user=_user(),
            ))

    def test_pin_sets_the_flag_without_moving_the_chat(self):
        db = _db(_session())
        self.update(db, pinned=True)
        self.assertEqual(db.chat_sessions.update_one.call_args[0][1], {"$set": {"pinned": True}})

    def test_rename_keeps_the_whole_title_and_tidies_spaces(self):
        db = _db(_session())
        self.update(db, title=f"  {LONG_TITLE}  ")
        self.assertEqual(db.chat_sessions.update_one.call_args[0][1], {"$set": {"title": LONG_TITLE}})

    def test_new_messages_still_move_the_chat(self):
        db = _db(_session())
        self.update(db, messages=[])
        self.assertIn("updated_at", db.chat_sessions.update_one.call_args[0][1]["$set"])

    def test_empty_body_writes_nothing(self):
        db = _db(_session())
        self.update(db)
        db.chat_sessions.update_one.assert_not_awaited()

    def test_blank_or_overlong_titles_are_refused(self):
        for title in ("   ", "x" * 201):
            with self.subTest(title=title[:5]):
                with self.assertRaises(ValidationError):
                    UpdateChatSessionRequest(title=title)
                with self.assertRaises(ValidationError):
                    CreateChatSessionRequest(title=title)
        self.assertEqual(CreateChatSessionRequest(title="x" * 200).title, "x" * 200)


class TestListAndDetail(unittest.TestCase):
    def test_list_puts_pinned_first_and_sends_whole_titles(self):
        db = MagicMock()
        cursor = MagicMock()
        cursor.sort.return_value = cursor
        cursor.skip.return_value = cursor
        cursor.limit.return_value = cursor
        cursor.__aiter__ = lambda self: self
        cursor.__anext__ = AsyncMock(side_effect=[_session(pinned=True), _session(_id=ObjectId()), StopAsyncIteration])
        db.chat_sessions.find.return_value = cursor
        with patch("app.api.routes.chat_sessions.get_database", return_value=db):
            rows = run(get_user_chat_sessions(current_user=_user(), limit=50, skip=0))
        cursor.sort.assert_called_once_with([("pinned", -1), ("updated_at", -1)])
        self.assertEqual([r.pinned for r in rows], [True, False])
        self.assertEqual(rows[0].title, LONG_TITLE)

    def test_detail_sends_pinned_and_message_feedback(self):
        doc = _session(pinned=True)
        doc["messages"][1]["feedback"] = "down"
        with patch("app.api.routes.chat_sessions.get_database", return_value=_db(doc)):
            body = run(get_chat_session(session_id=str(SESSION_ID), current_user=_user()))
        self.assertTrue(body["pinned"])
        self.assertEqual(body["messages"][1]["feedback"], "down")


async def _lines(response):
    out = []
    async for chunk in response.body_iterator:
        out.extend(json.loads(line) for line in chunk.splitlines() if line.strip())
    return out


class TestStreamSendsMessageId(unittest.IsolatedAsyncioTestCase):
    async def test_tool_answer_line_carries_the_stored_id(self):
        session = MagicMock(messages=[])
        orchestrator = MagicMock()
        orchestrator.needs_clarification_improved = AsyncMock(return_value=False)
        orchestrator.get_tool_response = AsyncMock(
            return_value=ToolCallResult(text="Here you go", used_tool=True, tool_outputs=[]))
        persist = AsyncMock(return_value="abc123")
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[])
        message = chat.ChatMessage(user_input="events tonight", chat_session_id=str(ObjectId()))
        with patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}), \
             patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{message.chat_session_id}": session},
                                                            get_session=MagicMock(return_value=session))), \
             patch.object(chat, "chat_orchestrator", orchestrator), \
             patch.object(chat, "persist_message", persist):
            lines = await _lines(await chat.chat_stream(message, MagicMock(), current_user=user))
        answer = next(line for line in lines if line["type"] == "advisor")
        self.assertEqual(answer["data"]["message_id"], "abc123")


if __name__ == "__main__":
    unittest.main()
