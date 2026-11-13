import asyncio
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from pydantic import ValidationError


# ------------------------------------------------------------------
# ChatMessage – response_mode field
# ------------------------------------------------------------------


class TestChatMessageResponseMode(unittest.TestCase):

    def test_defaults_to_panel(self):
        from app.api.routes.chat import ChatMessage
        msg = ChatMessage(user_input="hello")
        self.assertEqual(msg.response_mode, "panel")

    def test_accepts_panel(self):
        from app.api.routes.chat import ChatMessage
        msg = ChatMessage(user_input="hello", response_mode="panel")
        self.assertEqual(msg.response_mode, "panel")

    def test_accepts_aggregated(self):
        from app.api.routes.chat import ChatMessage
        msg = ChatMessage(user_input="hello", response_mode="aggregated")
        self.assertEqual(msg.response_mode, "aggregated")

    def test_rejects_invalid_value(self):
        from app.api.routes.chat import ChatMessage
        with self.assertRaises(ValidationError):
            ChatMessage(user_input="hello", response_mode="bogus")


# ------------------------------------------------------------------
# synthesize_aggregated_response
# ------------------------------------------------------------------


SAMPLE_PANEL_RESULTS = [
    {
        "persona_id": "mentor",
        "persona_name": "Socratic Mentor",
        "response": "Consider the philosophical implications.",
        "used_documents": False,
        "document_chunks_used": 0,
        "response_length": "medium",
        "context_quality": "conversation_only",
    },
    {
        "persona_id": "methodologist",
        "persona_name": "Methodologist",
        "response": "Use a mixed-methods approach.",
        "used_documents": True,
        "document_chunks_used": 3,
        "response_length": "medium",
        "context_quality": "high",
    },
]


def _run(coro):
    """Run an async coroutine synchronously for testing."""
    return asyncio.run(coro)


class TestSynthesizeAggregatedResponse(unittest.TestCase):

    def _make_orchestrator(self, llm_response="Synthesized answer."):
        mock_llm = AsyncMock()
        mock_llm.generate = AsyncMock(return_value=llm_response)

        from app.core.improved_orchestrator import ImprovedChatOrchestrator
        orch = ImprovedChatOrchestrator.__new__(ImprovedChatOrchestrator)
        orch.personas = {}
        orch.llm_client = mock_llm
        orch.session_manager = MagicMock()
        orch.context_manager = MagicMock()
        return orch, mock_llm

    def test_returns_expected_shape(self):
        orch, _ = self._make_orchestrator("A unified answer.")
        result = _run(orch.synthesize_aggregated_response(
            user_input="What should I do?",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertIsNotNone(result)
        self.assertEqual(result["persona_id"], "aggregated")
        self.assertTrue(result["is_aggregated"])
        self.assertEqual(result["source_personas"], ["mentor", "methodologist"])
        self.assertEqual(result["response"], "A unified answer.")
        self.assertEqual(result["context_quality"], "synthesized")

    def test_aggregates_document_usage(self):
        orch, _ = self._make_orchestrator("Answer.")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertTrue(result["used_documents"])
        self.assertEqual(result["document_chunks_used"], 3)

    def test_empty_panel_results_returns_none(self):
        orch, _ = self._make_orchestrator()
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=[],
        ))
        self.assertIsNone(result)

    def test_llm_empty_response_returns_none(self):
        orch, _ = self._make_orchestrator("")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertIsNone(result)

    def test_llm_whitespace_response_returns_none(self):
        orch, _ = self._make_orchestrator("   \n  ")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertIsNone(result)

    def test_llm_exception_returns_none(self):
        orch, mock_llm = self._make_orchestrator()
        mock_llm.generate = AsyncMock(side_effect=RuntimeError("API timeout"))
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertIsNone(result)

    def test_uses_provided_llm_client(self):
        orch, default_llm = self._make_orchestrator()
        override_llm = AsyncMock()
        override_llm.generate = AsyncMock(return_value="Override answer.")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
            llm_client=override_llm,
        ))
        override_llm.generate.assert_called_once()
        default_llm.generate.assert_not_called()
        self.assertEqual(result["response"], "Override answer.")

    def test_respects_response_length(self):
        orch, mock_llm = self._make_orchestrator("Short.")
        _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
            response_length="short",
        ))
        call_kwargs = mock_llm.generate.call_args.kwargs
        # 800 for a short answer, plus room for the JSON and the differences.
        self.assertEqual(call_kwargs["max_tokens"], 1200)

    def test_rich_markdown_passes_through(self):
        rich = (
            "Comparing the two options:\n\n"
            "| Path | Cost |\n| --- | --- |\n| A | $O(n)$ |\n\n"
            "$$\\sum_{i=1}^{n} x_i$$\n\n"
            "```python\n# • not a bullet\nprint(1)\n```"
        )
        orch, _ = self._make_orchestrator(rich)
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertEqual(result["response"], rich)

    def test_persona_name_is_set(self):
        orch, _ = self._make_orchestrator("Answer.")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question",
            panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertIn("persona_name", result)
        self.assertTrue(len(result["persona_name"]) > 0)


    def test_plain_text_reply_has_no_differences(self):
        orch, _ = self._make_orchestrator("Plain answer.")
        result = _run(orch.synthesize_aggregated_response(
            user_input="question", panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertEqual(result["response"], "Plain answer.")
        self.assertEqual(result["differences"], [])

    def test_json_reply_with_differences(self):
        reply = json.dumps({
            "answer": "Start with the methods course.",
            "differences": [{"topic": "Where to start", "positions": [
                {"persona_id": "mentor", "stance": "Read philosophy first."},
                {"persona_id": "methodologist", "stance": "Start with methods."},
            ]}],
        })
        orch, _ = self._make_orchestrator(reply)
        result = _run(orch.synthesize_aggregated_response(
            user_input="question", panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertEqual(result["response"], "Start with the methods course.")
        self.assertEqual([d["topic"] for d in result["differences"]], ["Where to start"])
        self.assertEqual(result["differences"][0]["positions"][1],
                         {"persona_id": "methodologist", "stance": "Start with methods."})

    def test_json_reply_without_differences(self):
        orch, _ = self._make_orchestrator('```json\n{"answer": "They agree.", "differences": []}\n```')
        result = _run(orch.synthesize_aggregated_response(
            user_input="question", panel_results=SAMPLE_PANEL_RESULTS,
        ))
        self.assertEqual(result["response"], "They agree.")
        self.assertEqual(result["differences"], [])

    def test_prompt_forbids_invented_figures_and_allows_no_differences(self):
        orch, mock_llm = self._make_orchestrator("Answer.")
        _run(orch.synthesize_aggregated_response(user_input="q", panel_results=SAMPLE_PANEL_RESULTS))
        prompt = mock_llm.generate.call_args.kwargs["system_prompt"]
        self.assertIn("Never add numbers, prices, dollar amounts or statistics", prompt)
        self.assertIn('"differences" is an empty list', prompt)


# ------------------------------------------------------------------
# parse_synthesis / compare_takes
# ------------------------------------------------------------------


class TestParseSynthesis(unittest.TestCase):
    IDS = ["mentor", "methodologist"]

    def test_bad_json_falls_back_to_plain_text(self):
        from app.core.improved_orchestrator import parse_synthesis
        self.assertEqual(parse_synthesis("Not JSON at all.", self.IDS), ("Not JSON at all.", []))
        self.assertEqual(parse_synthesis('{"answer": 3}', self.IDS), ('{"answer": 3}', []))

    def test_cut_off_json_keeps_the_answer_so_far(self):
        from app.core.improved_orchestrator import parse_synthesis
        raw = '{"answer": "Start early.\\nThen review", "differences": [{"topic": "x"'
        self.assertEqual(parse_synthesis(raw, self.IDS), ("Start early.\nThen review", []))

    def test_differences_need_two_known_advisors(self):
        from app.core.improved_orchestrator import parse_synthesis
        raw = json.dumps({"answer": "A.", "differences": [
            {"topic": "One voice", "positions": [{"persona_id": "mentor", "stance": "Yes."}]},
            {"topic": "Unknown", "positions": [
                {"persona_id": "mentor", "stance": "Yes."}, {"persona_id": "ghost", "stance": "No."}]},
            {"topic": "Real", "positions": [
                {"persona_id": "mentor", "stance": "Yes."}, {"persona_id": "methodologist", "stance": "No."}]},
            "junk",
        ]})
        answer, differences = parse_synthesis(raw, self.IDS)
        self.assertEqual(answer, "A.")
        self.assertEqual([d["topic"] for d in differences], ["Real"])


class TestCompareTakes(unittest.TestCase):
    TAKES = [
        {"persona_id": "mentor", "persona_name": "Mentor", "response": "Wait a term."},
        {"persona_id": "methodologist", "persona_name": "Methodologist", "response": "Take it now."},
    ]

    def _orch(self, reply):
        from app.core.improved_orchestrator import ImprovedChatOrchestrator
        orch = ImprovedChatOrchestrator.__new__(ImprovedChatOrchestrator)
        orch.llm_client = MagicMock()
        orch.llm_client.generate = AsyncMock(return_value=reply)
        return orch

    def test_fewer_than_two_takes_skips_the_call(self):
        orch = self._orch("{}")
        self.assertEqual(_run(orch.compare_takes("q", self.TAKES[:1])), [])
        orch.llm_client.generate.assert_not_called()

    def test_returns_differences(self):
        reply = json.dumps({"differences": [{"topic": "Timing", "positions": [
            {"persona_id": "mentor", "stance": "Wait."}, {"persona_id": "methodologist", "stance": "Now."}]}]})
        self.assertEqual(_run(self._orch(reply).compare_takes("q", self.TAKES))[0]["topic"], "Timing")

    def test_bad_reply_or_failure_gives_none(self):
        self.assertEqual(_run(self._orch("no json").compare_takes("q", self.TAKES)), [])
        orch = self._orch("")
        orch.llm_client.generate = AsyncMock(side_effect=RuntimeError("down"))
        self.assertEqual(_run(orch.compare_takes("q", self.TAKES)), [])


# ------------------------------------------------------------------
# RequestAggregatedResponse – request model validation
# ------------------------------------------------------------------


VALID_SYNTHESIZE_PAYLOAD = {
    "user_input": "What should I do?",
    "panel_results": [
        {"persona_id": "mentor", "persona_name": "Mentor", "response": "Think deeply."},
        {"persona_id": "methodologist", "persona_name": "Methodologist", "response": "Use mixed methods."},
    ],
    "chat_session_id": "abc123",
    "response_group_id": "grp_456",
}


class TestRequestAggregatedResponse(unittest.TestCase):

    def test_valid_request(self):
        from app.api.routes.chat import RequestAggregatedResponse
        req = RequestAggregatedResponse(**VALID_SYNTHESIZE_PAYLOAD)
        self.assertEqual(req.user_input, "What should I do?")
        self.assertEqual(len(req.panel_results), 2)
        self.assertEqual(req.response_length, "medium")

    def test_empty_panel_results_rejected(self):
        from app.api.routes.chat import RequestAggregatedResponse
        payload = {**VALID_SYNTHESIZE_PAYLOAD, "panel_results": []}
        with self.assertRaises(ValidationError):
            RequestAggregatedResponse(**payload)

    def test_missing_chat_session_id_rejected(self):
        from app.api.routes.chat import RequestAggregatedResponse
        payload = {k: v for k, v in VALID_SYNTHESIZE_PAYLOAD.items() if k != "chat_session_id"}
        with self.assertRaises(ValidationError):
            RequestAggregatedResponse(**payload)

    def test_missing_response_group_id_rejected(self):
        from app.api.routes.chat import RequestAggregatedResponse
        payload = {k: v for k, v in VALID_SYNTHESIZE_PAYLOAD.items() if k != "response_group_id"}
        with self.assertRaises(ValidationError):
            RequestAggregatedResponse(**payload)

    def test_invalid_response_length_rejected(self):
        from app.api.routes.chat import RequestAggregatedResponse
        payload = {**VALID_SYNTHESIZE_PAYLOAD, "response_length": "huge"}
        with self.assertRaises(ValidationError):
            RequestAggregatedResponse(**payload)

    def test_response_length_defaults_to_medium(self):
        from app.api.routes.chat import RequestAggregatedResponse
        req = RequestAggregatedResponse(**VALID_SYNTHESIZE_PAYLOAD)
        self.assertEqual(req.response_length, "medium")
