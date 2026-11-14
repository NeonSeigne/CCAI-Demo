"""Panel review on a change (panel-answers phase 7)."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

import app.config
from app.api.routes import chat
from app.config import AppSettings
from app.core import panel_review
from app.core.panel_review import parse_review, review_instructions, review_proposal
from app.llm.llm_client import ToolCallResult

PROPOSAL = {
    "id": "p1", "status": "pending", "summary": "Move ECON 4010 to Spring 2027",
    "diff": {
        "heading": "Move ECON 4010 to Spring 2027",
        "courses": {"added": [], "removed": [], "moved": [
            {"id": "ECON 4010", "from": "Fall 2027", "to": "Spring 2027", "title": "Game Theory", "credits": [3, 3]}]},
        "prereqs": {"status": "met", "courses": []},
        "schedule": {"blocks": ["long week grid"]},
    },
}
PLAN = {"term": "Spring 2027", "courses": [{"code": "ECON 3720", "title": "Econometrics", "credits": "3"}],
        "total_credits": "3"}

REPLIES = {
    "academic_planner": '{"verdict": "fine", "line": "Prerequisites are met and it keeps your major on track."}',
    "career_coach": '```json\n{"verdict": "Concern", "line": "  Two heavy courses the term you job hunt. "}\n```',
}


def proposal_answer():
    return ToolCallResult(
        text="I can move ECON 4010 to spring.", used_tool=True, tool_name="plan_edit",
        tool_outputs=[{"name": "plan_edit", "result": {"proposal": PROPOSAL}}],
    )


class ParseReviewTest(unittest.TestCase):
    def test_good_reply(self):
        self.assertEqual(parse_review(REPLIES["academic_planner"]),
                         {"verdict": "fine", "line": "Prerequisites are met and it keeps your major on track."})

    def test_fenced_reply_with_case_and_spaces(self):
        self.assertEqual(parse_review(REPLIES["career_coach"]),
                         {"verdict": "concern", "line": "Two heavy courses the term you job hunt."})

    def test_bad_replies_are_none(self):
        for raw in (None, "", "Looks fine to me.", '{"verdict": "fine"', '{"verdict": "maybe", "line": "x"}',
                    '{"verdict": "fine", "line": ""}', '{"verdict": "fine", "line": 3}', '["fine"]'):
            self.assertIsNone(parse_review(raw), raw)

    def test_long_line_is_cut(self):
        parsed = parse_review(json.dumps({"verdict": "fine", "line": "word " * 100}))
        self.assertLessEqual(len(parsed["line"]), panel_review.MAX_LINE_CHARS)

    def test_instructions_read_the_change_and_plan_not_the_schedule(self):
        text = review_instructions(PROPOSAL, PLAN)
        self.assertIn("Move ECON 4010 to Spring 2027", text)
        self.assertIn("Game Theory", text)
        self.assertIn("ECON 3720 Econometrics (3 credits)", text)
        self.assertNotIn("long week grid", text)
        self.assertIn('"verdict": "fine" | "concern"', text)

    def test_reviewer_count_is_two_or_three(self):
        self.assertEqual([panel_review.reviewer_count(n) for n in (0, 1, 2, 3, 5, None)], [2, 2, 2, 3, 3, 2])


def fake_orchestrator(replies, calls=None):
    orch = MagicMock()
    orch.get_persona = lambda pid: SimpleNamespace(id=pid, name=pid.replace("_", " ").title())

    async def respond(session, persona, response_length, llm_client=None, extra_instructions=None):
        if calls is not None:
            calls.append((persona.id, extra_instructions))
        reply = replies[persona.id]
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, dict):
            return reply
        return {"persona_id": persona.id, "persona_name": persona.name, "response": reply}

    orch.generate_single_persona_response = respond
    return orch


class ReviewProposalTest(unittest.IsolatedAsyncioTestCase):
    async def test_rows_in_order_and_failures_dropped(self):
        replies = {
            **REPLIES,
            "study_strategist": RuntimeError("model down"),
            "money_advisor": {"persona_id": "money_advisor", "response": "error", "failed": True},
        }
        calls = []
        review = await review_proposal(
            fake_orchestrator(replies, calls), MagicMock(),
            ["career_coach", "study_strategist", "academic_planner", "money_advisor"], PROPOSAL, PLAN,
        )
        self.assertEqual(review, [
            {"persona_id": "career_coach", "verdict": "concern", "line": "Two heavy courses the term you job hunt."},
            {"persona_id": "academic_planner", "verdict": "fine",
             "line": "Prerequisites are met and it keeps your major on track."},
        ])
        # At most three advisors are asked.
        self.assertEqual([pid for pid, _ in calls], ["career_coach", "study_strategist", "academic_planner"])

    async def test_bad_json_is_dropped(self):
        review = await review_proposal(
            fake_orchestrator({"academic_planner": "It looks fine."}), MagicMock(), ["academic_planner"], PROPOSAL, None,
        )
        self.assertEqual(review, [])


async def _lines(response):
    out = []
    async for chunk in response.body_iterator:
        out.extend(json.loads(line) for line in chunk.splitlines() if line.strip())
    return out


class ReviewInStreamTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.addCleanup(setattr, app.config, "_settings", app.config._settings)
        app.config._settings = AppSettings()

    def orchestrator(self, result, replies):
        orch = fake_orchestrator(replies)
        orch.needs_clarification_improved = AsyncMock(return_value=False)
        orch.get_tool_response = AsyncMock(return_value=result)
        orch.list_personas.return_value = list(replies)
        orch.get_top_personas = AsyncMock(return_value=list(replies))
        orch.compare_takes = AsyncMock(return_value=[])
        return orch

    async def stream(self, orch, show_panel=True):
        session = MagicMock(messages=[])
        session.append_message = lambda role, content: session.messages.append({"role": role, "content": content})
        persist = AsyncMock(side_effect=lambda sid, m: m.id)
        update = AsyncMock()
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[], show_panel=show_panel)
        msg = chat.ChatMessage(user_input="Move ECON 4010 to spring", chat_session_id=str(ObjectId()),
                               response_mode="aggregated")
        with patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}), \
             patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{msg.chat_session_id}": session},
                                                            get_session=MagicMock(return_value=session))), \
             patch.object(chat, "chat_orchestrator", orch), \
             patch.object(chat, "tool_context_for", return_value=None), \
             patch.object(chat, "persist_message", persist), \
             patch.object(chat, "update_message", update):
            lines = await _lines(await chat.chat_stream(msg, MagicMock(), current_user=user))
        self.update = update
        return lines

    async def test_review_is_streamed_and_saved_on_the_visual(self):
        # Takes and reviews come from the same advisors; a take reply is prose,
        # a review reply JSON, so route by the instructions.
        orch = self.orchestrator(proposal_answer(), REPLIES)
        take = orch.generate_single_persona_response

        async def respond(session, persona, response_length, llm_client=None, extra_instructions=None):
            if "Review the change" in (extra_instructions or ""):
                return await take(session, persona, response_length, llm_client, extra_instructions)
            return {"persona_id": persona.id, "persona_name": persona.name, "response": "Weigh it."}

        orch.generate_single_persona_response = respond
        lines = await self.stream(orch)

        answer = next(l["data"] for l in lines if l["type"] == "advisor" and l["data"]["persona_id"] == "orchestrator")
        self.assertNotIn("review", answer["visuals"][-1])  # the answer never waits for the review
        review_line = next(l["data"] for l in lines if l["type"] == "review")
        expected = [
            {"persona_id": "academic_planner", "verdict": "fine",
             "line": "Prerequisites are met and it keeps your major on track."},
            {"persona_id": "career_coach", "verdict": "concern", "line": "Two heavy courses the term you job hunt."},
        ]
        self.assertEqual(review_line, {
            "message_id": answer["message_id"], "response_group_id": answer["response_group_id"],
            "proposal_id": "p1", "review": expected,
        })
        self.assertEqual(lines[-1], {"type": "progress", "data": {"phase": "complete"}})
        # One advisor choice serves the takes and the review.
        orch.get_top_personas.assert_awaited_once()

        saved = [c.args[2] for c in self.update.await_args_list if "visuals" in c.args[2]]
        self.assertEqual(len(saved), 1)
        visual = saved[0]["visuals"][-1]
        self.assertEqual(visual["type"], "proposed_change")
        self.assertEqual(visual["review"], expected)
        # Apply is unchanged: the proposal itself is what the tool returned.
        self.assertEqual(visual["proposal"]["id"], "p1")
        self.assertEqual(visual["proposal"]["diff"], PROPOSAL["diff"])

    async def test_failed_review_sends_nothing(self):
        orch = self.orchestrator(proposal_answer(), {"academic_planner": "Not JSON.", "career_coach": "Nope."})
        lines = await self.stream(orch)
        self.assertFalse(any(l["type"] == "review" for l in lines))
        self.assertFalse(any("visuals" in c.args[2] for c in self.update.await_args_list))

    async def test_no_review_when_the_panel_is_off(self):
        orch = self.orchestrator(proposal_answer(), REPLIES)
        lines = await self.stream(orch, show_panel=False)
        self.assertFalse(any(l["type"] == "review" for l in lines))
        orch.get_top_personas.assert_not_awaited()

    async def test_no_review_without_a_proposal(self):
        result = ToolCallResult(text="ECON 3720 is fine.", used_tool=True, tool_name="course_grades",
                                tool_outputs=[{"name": "course_grades", "result": {}}])
        orch = self.orchestrator(result, REPLIES)
        lines = await self.stream(orch)
        self.assertFalse(any(l["type"] == "review" for l in lines))
