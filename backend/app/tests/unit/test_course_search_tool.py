import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.tools import search_courses
from app.tools.search_courses import TOOL_DEFINITION, execute


def fose_client(status_code, body=None):
    response = MagicMock(status_code=status_code)
    response.json.return_value = body or {}
    client = MagicMock()
    client.__aenter__ = AsyncMock(return_value=client)
    client.__aexit__ = AsyncMock(return_value=False)
    client.post = AsyncMock(return_value=response)
    return client


def fose_settings():
    fake = MagicMock()
    fake.tools.get_tool_config.return_value = {"max_results": 20}
    return fake


class TestSearchCoursesContract(unittest.TestCase):
    """The search_courses tool module must export a valid OpenAI
    tool definition and an async executor."""

    def test_tool_definition_has_required_fields(self):
        self.assertEqual(TOOL_DEFINITION["type"], "function")
        self.assertIn("function", TOOL_DEFINITION)
        fn = TOOL_DEFINITION["function"]
        self.assertIn("name", fn)
        self.assertIn("description", fn)
        self.assertIn("parameters", fn)

    def test_tool_definition_name(self):
        self.assertEqual(TOOL_DEFINITION["function"]["name"], "search_courses")

    def test_tool_definition_has_nonempty_description(self):
        self.assertIsInstance(TOOL_DEFINITION["function"]["description"], str)
        self.assertGreater(len(TOOL_DEFINITION["function"]["description"]), 0)

    def test_tool_definition_parameters_is_valid_schema(self):
        params = TOOL_DEFINITION["function"]["parameters"]
        self.assertEqual(params["type"], "object")
        self.assertIn("properties", params)
        self.assertIn("subject", params["properties"])

    def test_execute_is_async_callable(self):
        self.assertTrue(asyncio.iscoroutinefunction(execute))


class TestFoseOutage(unittest.IsolatedAsyncioTestCase):
    """R11: a FOSE non-200 is an error, not an empty subject."""

    async def test_503_returns_error(self):
        with patch.object(search_courses, "get_settings", return_value=fose_settings()), patch.object(
            search_courses.httpx, "AsyncClient", return_value=fose_client(503)
        ):
            result = await execute(subject="CSCI")
        self.assertEqual(result["courses"], [])
        self.assertIn("503", result["error"])

    async def test_200_lists_lectures(self):
        body = {"results": [
            {"code": "CSCI 2270", "title": "Data Structures", "no": "100", "schd": "LEC", "instr": "A. Prof"},
            {"code": "CSCI 2270", "title": "Data Structures", "no": "101", "schd": "REC"},
        ]}
        with patch.object(search_courses, "get_settings", return_value=fose_settings()), patch.object(
            search_courses.httpx, "AsyncClient", return_value=fose_client(200, body)
        ):
            result = await execute(subject="csci", course_number="2270")
        self.assertNotIn("error", result)
        self.assertEqual([c["section"] for c in result["courses"]], ["100"])
