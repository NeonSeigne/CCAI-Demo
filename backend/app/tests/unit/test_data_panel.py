"""The advisor panel on data answers (panel-answers phases 2 and 3)."""

import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId

import app.config
from app.api.routes import chat
from app.config import AppSettings
from app.core.context_manager import get_context_manager
from app.core.improved_orchestrator import ImprovedChatOrchestrator
from app.llm.llm_client import LLMErrorText, ToolCallResult
from app.models.persona import Persona
from app.models.user import PersistMessage

DIFFS = [{"topic": "When to take it", "positions": [
    {"persona_id": "academic_planner", "stance": "Next term."},
    {"persona_id": "career_coach", "stance": "After the internship."},
]}]


async def _lines(response):
    out = []
    async for chunk in response.body_iterator:
        out.extend(json.loads(line) for line in chunk.splitlines() if line.strip())
    return out


def tool_answer(*names):
    return ToolCallResult(
        text="ECON 3720 is a solid next step.", used_tool=True, tool_name=names[0],
        tool_outputs=[{"name": name, "result": {}} for name in names],
    )


class DataPanelTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.addCleanup(setattr, app.config, "_settings", app.config._settings)
        app.config._settings = AppSettings()

    def orchestrator(self, result, top=("academic_planner", "career_coach")):
        orch = MagicMock()
        orch.needs_clarification_improved = AsyncMock(return_value=False)
        orch.get_tool_response = AsyncMock(return_value=result)
        orch.list_personas.return_value = ["academic_planner", "career_coach", "study_strategist"]
        orch.get_top_personas = AsyncMock(return_value=list(top))
        orch.get_persona = lambda pid: SimpleNamespace(id=pid, name=pid.replace("_", " ").title())

        async def take(session, persona, response_length, llm_client=None, extra_instructions=None):
            self.instructions.append(extra_instructions)
            return {"persona_id": persona.id, "persona_name": persona.name,
                    "response": f"{persona.name} says weigh your workload."}

        orch.generate_single_persona_response = take
        orch.compare_takes = AsyncMock(return_value=DIFFS)
        return orch

    async def stream(self, orch, user=None, **message):
        self.instructions = []
        session = MagicMock(messages=[])
        session.append_message = lambda role, content: session.messages.append({"role": role, "content": content})
        persist = AsyncMock(side_effect=lambda sid, m: m.id)
        update = AsyncMock()
        user = user or SimpleNamespace(id=ObjectId(), disabled_advisors=[], show_panel=True)
        msg = chat.ChatMessage(
            user_input="Should I take ECON 3720?", chat_session_id=str(ObjectId()),
            response_mode="aggregated", **message,
        )
        with patch.object(chat, "resolve_llm_clients", return_value={"orchestrator": MagicMock(), "personas": {}}), \
             patch.object(chat, "session_manager", MagicMock(sessions={f"chat_{msg.chat_session_id}": session},
                                                            get_session=MagicMock(return_value=session))), \
             patch.object(chat, "chat_orchestrator", orch), \
             patch.object(chat, "tool_context_for", return_value=None), \
             patch.object(chat, "persist_message", persist), \
             patch.object(chat, "update_message", update):
            response = await chat.chat_stream(msg, MagicMock(), current_user=user)
            lines = await _lines(response)
        self.persisted = [c.args[1] for c in persist.await_args_list]
        self.update = update
        return lines


class TestPanelOnCourseAnswers(DataPanelTestCase):
    async def test_takes_follow_the_data_answer_with_its_group_id(self):
        orch = self.orchestrator(tool_answer("course_grades"))
        lines = await self.stream(orch)

        kinds = [(l["type"], l["data"].get("phase") or l["data"].get("persona_id")) for l in lines]
        self.assertEqual(kinds[:3], [("progress", "received"), ("advisor", "orchestrator"), ("progress", "panel")])
        self.assertEqual(lines[2]["data"]["advisors"], ["academic_planner", "career_coach"])
        answer = lines[1]["data"]
        group = answer["response_group_id"]
        takes = [l["data"] for l in lines if l["type"] == "advisor" and l["data"]["persona_id"] != "orchestrator"]
        self.assertEqual(sorted(t["persona_id"] for t in takes), ["academic_planner", "career_coach"])
        self.assertTrue(all(t["response_group_id"] == group for t in takes))

        update = next(l["data"] for l in lines if l["type"] == "answer_update")
        self.assertEqual(update, {"message_id": answer["message_id"], "response_group_id": group,
                                  "source_personas": ["academic_planner", "career_coach"], "differences": DIFFS})
        self.assertEqual(lines[-1], {"type": "progress", "data": {"phase": "complete"}})

        # Saved: the user message, the data answer first, then the takes in its group.
        self.assertTrue(all(isinstance(m, PersistMessage) for m in self.persisted))
        self.assertEqual(self.persisted[1].persona_id, "orchestrator")
        self.assertEqual(self.persisted[1].response_group_id, group)
        self.assertEqual({m.response_group_id for m in self.persisted[2:]}, {group})
        self.update.assert_awaited_once()
        sid, message_id, fields = self.update.await_args.args
        self.assertEqual(message_id, answer["message_id"])
        self.assertEqual(fields, {"source_personas": ["academic_planner", "career_coach"], "differences": DIFFS})

        # Each take reads the data and is told not to restate its numbers.
        self.assertIn("ECON 3720 is a solid next step.", self.instructions[0])
        self.assertIn("Do not restate the data", self.instructions[0])
        orch.get_top_personas.assert_awaited_once()
        self.assertEqual(orch.get_top_personas.await_args.kwargs["k"], 2)

    async def test_planning_answers_get_the_panel(self):
        lines = await self.stream(self.orchestrator(tool_answer("plan_suggest")))
        self.assertTrue(any(l["type"] == "answer_update" for l in lines))

    async def test_chosen_advisors_are_used_exactly(self):
        orch = self.orchestrator(tool_answer("course_grades"))
        lines = await self.stream(orch, active_advisors=["study_strategist"])
        orch.get_top_personas.assert_not_awaited()
        panel = next(l for l in lines if l["data"].get("phase") == "panel")
        self.assertEqual(panel["data"]["advisors"], ["study_strategist"])

    async def test_failed_takes_are_left_out(self):
        orch = self.orchestrator(tool_answer("course_grades"))

        async def failing(session, persona, *args, **kwargs):
            raise RuntimeError("model down")

        orch.generate_single_persona_response = failing
        lines = await self.stream(orch)
        self.assertEqual([l["data"]["persona_id"] for l in lines if l["type"] == "advisor"], ["orchestrator"])
        self.assertFalse(any(l["type"] == "answer_update" for l in lines))
        self.update.assert_not_awaited()


class FakeLLM:
    """Records each generate call; replies with *reply*."""

    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def generate(self, system_prompt, context, temperature, max_tokens, response_mime_type=None):
        self.calls.append({"system_prompt": system_prompt, "context": context})
        return self.reply


def real_orchestrator(llms):
    orch = ImprovedChatOrchestrator()
    for pid, llm in llms.items():
        orch.register_persona(Persona(pid, pid.replace("_", " ").title(), f"You are {pid}.", llm))
    orch._retrieve_relevant_documents = AsyncMock(return_value="")
    return orch


class TestTakeRequest(unittest.IsolatedAsyncioTestCase):
    async def test_take_ends_on_the_users_turn_after_the_tool_answer(self):
        # The session as the data path leaves it: the question, the tool's
        # answer (an assistant turn), and a take that finished first.
        llm = FakeLLM("Weigh your workload.")
        orch = real_orchestrator({"academic_planner": llm})
        session = SimpleNamespace(
            session_id="s1", uploaded_files=[],
            messages=[
                {"role": "user", "content": "Should I take COMP SCI 300 next spring?"},
                {"role": "orchestrator", "content": "COMP SCI 300 fits your spring plan."},
                {"role": "peer_mentor", "content": "Talk to people who took it."},
            ],
        )
        session.get_latest_user_message = lambda: session.messages[0]["content"]
        instructions = chat.data_take_instructions("COMP SCI 300 fits your spring plan.", [])

        result = await orch.generate_single_persona_response(
            session, orch.get_persona("academic_planner"), "short", extra_instructions=instructions,
        )

        self.assertFalse(result.get("failed"))
        call = llm.calls[0]
        sent = get_context_manager().prepare_context_for_llm(
            messages=call["context"], system_prompt=call["system_prompt"], llm_provider="vllm",
        ).messages
        self.assertEqual(sent[-1]["role"], "user")
        self.assertIn("Should I take COMP SCI 300 next spring?", sent[-1]["content"])
        self.assertIn("COMP SCI 300 fits your spring plan.", sent[-1]["content"])
        self.assertNotIn("Talk to people who took it.", json.dumps(sent))

    async def test_open_question_take_ends_on_the_users_turn(self):
        # Parallel advisors: one may append its reply before another builds its request.
        llm = FakeLLM("Plan breaks.")
        orch = real_orchestrator({"study_strategist": llm})
        session = SimpleNamespace(
            session_id="s1", uploaded_files=[],
            messages=[{"role": "user", "content": "How do I plan my week?"},
                      {"role": "career_coach", "content": "Block time for job hunting."}],
        )
        session.get_latest_user_message = lambda: session.messages[0]["content"]
        await orch.generate_single_persona_response(session, orch.get_persona("study_strategist"), "short")
        self.assertEqual(llm.calls[0]["context"][-1], {"role": "user", "content": "How do I plan my week?"})


class TestFailedTakes(DataPanelTestCase):
    async def test_a_client_error_result_is_dropped(self):
        real = real_orchestrator({
            "academic_planner": FakeLLM(LLMErrorText("The AI service encountered an error. Please try again.")),
            "career_coach": FakeLLM("Weigh your workload."),
        })
        orch = self.orchestrator(tool_answer("plan_suggest"))
        orch.get_persona = real.get_persona
        orch.generate_single_persona_response = real.generate_single_persona_response
        lines = await self.stream(orch)

        takes = [l["data"] for l in lines if l["type"] == "advisor" and l["data"]["persona_id"] != "orchestrator"]
        self.assertEqual([t["persona_id"] for t in takes], ["career_coach"])
        self.assertNotIn("encountered an error", json.dumps(lines))
        self.assertEqual([m.persona_id for m in self.persisted[2:]], ["career_coach"])
        update = next(l["data"] for l in lines if l["type"] == "answer_update")
        self.assertEqual(update["source_personas"], ["career_coach"])
        compared = orch.compare_takes.await_args.args[1]
        self.assertEqual([t["persona_id"] for t in compared], ["career_coach"])

    async def test_orchestrator_marks_a_client_error_as_failed(self):
        orch = real_orchestrator({"academic_planner": FakeLLM(LLMErrorText("I encountered an unexpected error."))})
        session = SimpleNamespace(session_id="s1", uploaded_files=[], messages=[{"role": "user", "content": "Hi"}])
        session.get_latest_user_message = lambda: "Hi"
        result = await orch.generate_single_persona_response(session, orch.get_persona("academic_planner"))
        self.assertTrue(result["failed"])


class TestNoPanel(DataPanelTestCase):
    def assert_no_panel(self, lines, orch):
        self.assertEqual([l["type"] for l in lines], ["progress", "advisor", "progress"])
        self.assertEqual(lines[-1]["data"], {"phase": "complete"})
        orch.get_top_personas.assert_not_awaited()
        self.update.assert_not_awaited()

    async def test_places_only_answer(self):
        orch = self.orchestrator(tool_answer("find_place"))
        self.assert_no_panel(await self.stream(orch), orch)

    async def test_events_only_answer(self):
        orch = self.orchestrator(tool_answer("events_search"))
        self.assert_no_panel(await self.stream(orch), orch)

    async def test_student_turned_the_panel_off(self):
        orch = self.orchestrator(tool_answer("course_grades"))
        user = SimpleNamespace(id=ObjectId(), disabled_advisors=[], show_panel=False)
        self.assert_no_panel(await self.stream(orch, user=user), orch)

    async def test_school_setting_turns_it_off(self):
        app.config._settings = AppSettings(chat={"panel_on_data_answers": False})
        orch = self.orchestrator(tool_answer("course_grades"))
        self.assert_no_panel(await self.stream(orch), orch)


class TestPanelEventOnOpenQuestions(DataPanelTestCase):
    async def test_panel_event_names_the_chosen_advisors(self):
        orch = self.orchestrator(ToolCallResult(text="", used_tool=False))

        async def respond(session, persona, response_length, llm_client=None):
            return {"persona_id": persona.id, "persona_name": persona.name, "response": "Take breaks."}

        orch.generate_single_persona_response = respond
        orch.synthesize_aggregated_response = AsyncMock(return_value={
            "persona_name": "Orchestrator", "response": "Plan breaks.",
            "source_personas": ["academic_planner", "career_coach"], "differences": DIFFS,
        })
        lines = await self.stream(orch)
        panel = [l["data"] for l in lines if l["data"].get("phase") == "panel"]
        self.assertEqual(panel, [{"phase": "panel", "advisors": ["academic_planner", "career_coach"]}])
        merged = next(l["data"] for l in lines if l["data"].get("is_aggregated"))
        self.assertEqual(merged["differences"], DIFFS)
        self.assertEqual(self.persisted[-1].differences[0].topic, "When to take it")


class TestSettingsAndHelpers(unittest.TestCase):
    def test_defaults_on_and_two(self):
        settings = AppSettings()
        self.assertTrue(settings.chat.panel_on_data_answers)
        self.assertEqual(settings.chat.panel_size_on_data, 2)

    def test_data_answer_may_list_its_panel(self):
        message = PersistMessage(type="advisor", persona_id="orchestrator", advisorName="Orchestrator",
                                 content="x", source_personas=["career_coach"], differences=DIFFS)
        self.assertEqual(message.differences[0].positions[1].persona_id, "career_coach")
        with self.assertRaises(ValueError):
            PersistMessage(type="advisor", persona_id="career_coach", advisorName="C", content="x",
                           source_personas=["career_coach"])

    def test_take_instructions_summarize_the_cards(self):
        text = chat.data_take_instructions("Hard course.", [
            {"type": "course_gpa", "course": "ECON 3720"},
            {"type": "course_grade_distribution", "course": "ECON 3720"},
            {"type": "course_shortlist", "items": [{"id": "MATH 2400", "title": "Linear Algebra"}]},
        ])
        self.assertIn("- ECON 3720: grades", text)
        self.assertIn("MATH 2400 Linear Algebra", text)
        self.assertIn("Never add numbers", text)


if __name__ == "__main__":
    unittest.main()
