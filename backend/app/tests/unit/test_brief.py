"""Brief for my advisor (panel-answers phase 6)."""

import unittest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

from app.api.routes import chat_brief
from app.core import brief as briefs
from app.llm.llm_client import LLMErrorText
from app.models.user import User

USER_ID = ObjectId()
SESSION_ID = str(ObjectId())

DIFFS = [{"topic": "When to take it", "positions": [
    {"persona_id": "academic_planner", "stance": "Take it next term."},
    {"persona_id": "career_coach", "stance": "Wait until after the internship."},
]}]

MESSAGES = [
    {"id": "u0", "type": "user", "content": "Hi", "response_group_id": "g0"},
    {"id": "a0", "type": "advisor", "persona_id": "orchestrator", "advisorName": "Orchestrator",
     "content": "Hello.", "response_group_id": "g0"},
    {"id": "u1", "type": "user", "content": "Should I take ECON 3720 next spring?", "response_group_id": "g1"},
    {"id": "a1", "type": "advisor", "persona_id": "orchestrator", "advisorName": "Orchestrator",
     "content": "ECON 3720 fits your spring plan.", "response_group_id": "g1",
     "source_personas": ["academic_planner", "career_coach"], "differences": DIFFS},
    {"id": "t1", "type": "advisor", "persona_id": "academic_planner", "advisorName": "Academic Planner",
     "content": "Take it next term.", "response_group_id": "g1"},
    {"id": "t2", "type": "advisor", "persona_id": "career_coach", "advisorName": "Career Coach",
     "content": "Wait a term.", "response_group_id": "g1"},
]

# A checker report for Spring 2027, as the planner store's plan produces it.
REPORT = {
    "term": "Spring 2027",
    "credits": {"min": 7, "max": 8, "status": "met"},
    "courses": [
        {"id": "ECON 3720", "title": "Econometrics", "term": "Spring 2027", "credits": [3, 3]},
        {"id": "MATH 3100", "title": "Probability", "term": "Spring 2027", "credits": [4, 5]},
        {"id": "ECON 9999", "title": "", "term": "Spring 2027", "credits": None},
    ],
}


def _user():
    return User(_id=USER_ID, firstName="T", lastName="U", email="t@example.com",
                hashed_password="x", is_active=True, created_at=datetime(2025, 1, 1))


def _db(doc):
    db = MagicMock()
    db.chat_sessions.find_one = AsyncMock(return_value=doc)
    return db


def _session(messages=MESSAGES):
    return {"_id": ObjectId(SESSION_ID), "user_id": USER_ID, "is_active": True, "messages": messages}


class FakeLLM:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def generate(self, system_prompt, context, temperature, max_tokens, response_mime_type=None):
        self.calls.append({"system_prompt": system_prompt, "context": context})
        if isinstance(self.reply, Exception):
            raise self.reply
        return self.reply


QUESTIONS = '{"questions": ["Can I take ECON 3720 before the internship?", "Does it count toward my major?"]}'


class BriefEndpointTest(unittest.IsolatedAsyncioTestCase):
    async def run_brief(self, doc, llm=None, plan=None):
        llm = llm or FakeLLM(QUESTIONS)
        db = _db(doc)
        with patch.object(chat_brief, "get_database", return_value=db), \
             patch.object(chat_brief, "_questions_llm", return_value=llm), \
             patch.object(chat_brief, "_advisor_names", return_value={"academic_planner": "Academic Planner"}), \
             patch.object(briefs, "term_plan", AsyncMock(return_value=plan)):
            result = await chat_brief.build_brief(SESSION_ID, current_user=_user())
        return result, db, llm

    async def test_brief_shape(self):
        plan = {"term": "Spring 2027", "courses": [{"code": "ECON 3720", "title": "Econometrics", "credits": "3"}],
                "total_credits": "3"}
        result, _, _ = await self.run_brief(_session(), plan=plan)
        self.assertEqual(set(result), {"question", "summary", "differences", "plan", "questions"})
        self.assertEqual(result["question"], "Should I take ECON 3720 next spring?")
        self.assertEqual(result["summary"], "ECON 3720 fits your spring plan.")
        self.assertEqual(result["differences"], [{"topic": "When to take it", "positions": [
            {"persona_id": "academic_planner", "name": "Academic Planner", "stance": "Take it next term."},
            # Not in the registry: the saved reply's advisorName.
            {"persona_id": "career_coach", "name": "Career Coach", "stance": "Wait until after the internship."},
        ]}])
        self.assertEqual(result["plan"], plan)
        self.assertEqual(result["questions"], [
            "Can I take ECON 3720 before the internship?", "Does it count toward my major?",
        ])

    async def test_other_students_chat_is_not_found(self):
        with self.assertRaises(HTTPException) as caught:
            await self.run_brief(None)
        self.assertEqual(caught.exception.status_code, 404)

    async def test_lookup_is_owner_scoped(self):
        _, db, _ = await self.run_brief(_session())
        query = db.chat_sessions.find_one.await_args.args[0]
        self.assertEqual(query, {"_id": ObjectId(SESSION_ID), "user_id": USER_ID, "is_active": True})

    async def test_bad_id_is_not_found(self):
        with self.assertRaises(HTTPException) as caught:
            await chat_brief.build_brief("not-an-id", current_user=_user())
        self.assertEqual(caught.exception.status_code, 404)

    async def test_empty_chat_is_a_clear_400(self):
        for messages in ([], [{"id": "u", "type": "user", "content": "Hi"}]):
            llm = FakeLLM(QUESTIONS)
            with self.assertRaises(HTTPException) as caught:
                await self.run_brief(_session(messages), llm=llm)
            self.assertEqual(caught.exception.status_code, 400)
            self.assertEqual(caught.exception.detail, chat_brief.EMPTY_CHAT)
            self.assertEqual(llm.calls, [])

    async def test_question_call_ends_on_the_users_turn(self):
        _, _, llm = await self.run_brief(_session())
        context = llm.calls[0]["context"]
        self.assertEqual([m["role"] for m in context], ["user"])
        self.assertIn("Should I take ECON 3720 next spring?", context[0]["content"])
        self.assertIn("ECON 3720 fits your spring plan.", context[0]["content"])
        self.assertIn("Career Coach: Wait until after the internship.", context[0]["content"])
        self.assertIn("never add numbers", llm.calls[0]["system_prompt"])

    async def test_failed_question_call_gives_no_questions(self):
        for reply in (RuntimeError("down"), LLMErrorText("Model unavailable"), "not json and no questions"):
            result, _, _ = await self.run_brief(_session(), llm=FakeLLM(reply))
            self.assertEqual(result["questions"], [])
            self.assertEqual(result["summary"], "ECON 3720 fits your spring plan.")


class TermPlanTest(unittest.IsolatedAsyncioTestCase):
    async def test_plan_matches_the_planner_exactly(self):
        from app.planner import service, store

        plan_doc = {"user_id": str(USER_ID), "school": "uva", "term": "Spring 2027", "courses": []}
        with patch.object(store, "load", AsyncMock(return_value=plan_doc)) as load, \
             patch.object(service, "report_for", AsyncMock(return_value=REPORT)) as report_for, \
             patch("app.core.database.get_database", return_value=MagicMock()):
            plan = await briefs.term_plan(str(USER_ID), "uva")
        self.assertEqual(load.await_args.args[1:], (str(USER_ID), "uva"))
        self.assertEqual(report_for.await_args.args, (plan_doc, "uva", None))
        self.assertEqual(plan, {
            "term": "Spring 2027",
            "courses": [
                {"code": "ECON 3720", "title": "Econometrics", "credits": "3"},
                {"code": "MATH 3100", "title": "Probability", "credits": "4–5"},
                {"code": "ECON 9999", "title": "", "credits": None},
            ],
            "total_credits": "7–8",
        })
        self.assertEqual([c["code"] for c in plan["courses"]], [c["id"] for c in REPORT["courses"]])

    async def test_no_plan_is_none_and_creates_nothing(self):
        from app.planner import store

        db = MagicMock()
        db.plans.find_one = AsyncMock(return_value=None)
        with patch("app.core.database.get_database", return_value=db):
            self.assertIsNone(await briefs.term_plan(str(USER_ID), "uva"))
        db.plans.insert_one.assert_not_called()
        self.assertIsNone(await briefs.term_plan(str(USER_ID), None))


class BriefPdfTest(unittest.IsolatedAsyncioTestCase):
    BRIEF = {
        "question": "Should I take ECON 3720 & MATH 3100 <together>?",
        "summary": "It fits.\n\nTalk to your advisor.",
        "differences": [{"topic": "When", "positions": [{"persona_id": "a", "name": "Academic Planner", "stance": "Now."}]}],
        "plan": {"term": "Spring 2027", "courses": [{"code": "ECON 3720", "title": "Econometrics", "credits": "3"}],
                 "total_credits": "3"},
        "questions": ["Edited question?"],
    }

    async def test_pdf_builds(self):
        body = chat_brief.Brief(**self.BRIEF)
        with patch.object(chat_brief, "get_database", return_value=_db(_session())):
            response = await chat_brief.brief_pdf(SESSION_ID, body, current_user=_user())
        chunks = [chunk async for chunk in response.body_iterator]
        data = b"".join(c if isinstance(c, bytes) else c.encode() for c in chunks)
        self.assertTrue(data.startswith(b"%PDF"))
        self.assertEqual(response.media_type, "application/pdf")
        self.assertIn("attachment", response.headers["content-disposition"])

    async def test_pdf_is_owner_scoped(self):
        with patch.object(chat_brief, "get_database", return_value=_db(None)):
            with self.assertRaises(HTTPException) as caught:
                await chat_brief.brief_pdf(SESSION_ID, chat_brief.Brief(**self.BRIEF), current_user=_user())
        self.assertEqual(caught.exception.status_code, 404)

    def test_text_has_every_section_in_order(self):
        text = briefs.brief_text(self.BRIEF)
        titles = ["Brief for my advisor", "My question", "What the panel said", "Where they differed",
                  "My plan for Spring 2027", "Questions for you"]
        positions = [text.index(t) for t in titles]
        self.assertEqual(positions, sorted(positions))
        self.assertIn("- ECON 3720 Econometrics, 3 credits", text)
        self.assertIn("- Edited question?", text)

    def test_pdf_blocks_escape_markup(self):
        blocks = briefs.brief_pdf_blocks(self.BRIEF)
        question = next(b for b in blocks if b["type"] == "paragraph" and "ECON 3720 &amp;" in b["text"])
        self.assertIn("&lt;together&gt;", question["text"])


class ParseQuestionsTest(unittest.TestCase):
    def test_json_lines_and_junk(self):
        self.assertEqual(briefs.parse_questions('```json\n{"questions": ["A?", "A?", "", 3, "B?"]}\n```'), ["A?", "B?"])
        self.assertEqual(briefs.parse_questions("1. First?\n2. Second?\nNot a question"), ["First?", "Second?"])
        self.assertEqual(briefs.parse_questions(None), [])
