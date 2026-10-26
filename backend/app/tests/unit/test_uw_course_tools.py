"""Unit tests for UW-Madison Course Map–backed course tools."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.visuals import build_visuals
from app.tools import list_registered_tools
from app.tools import (
    _uw_source,
    uw_course_grades,
    uw_course_sections,
    uw_next_courses,
    uw_prerequisites,
    uw_search_courses,
)

COURSE_PAYLOAD = {
    "course_reference": {"subjects": ["COMPSCI"], "course_number": 300},
    "course_title": "PROGRAMMING II",
    "description": "Object-oriented programming and data structures.",
    "prerequisites": {
        "abstract_syntax_tree": {
            "type": "AND",
            "children": [
                {"subjects": ["COMPSCI"], "course_number": 200},
            ],
        }
    },
    "satisfies": [
        {"subjects": ["COMPSCI"], "course_number": 400},
        {"subjects": ["COMPSCI"], "course_number": 407},
    ],
    "cumulative_grade_data": {
        "a": 40,
        "ab": 20,
        "b": 20,
        "bc": 10,
        "c": 5,
        "d": 3,
        "f": 2,
        "total": 100,
        "instructors": None,
    },
    "term_data": {
        "1254": {
            "grade_data": {
                "a": 10,
                "ab": 5,
                "b": 5,
                "bc": 2,
                "c": 1,
                "d": 0,
                "f": 0,
                "total": 23,
                "instructors": ["Ada Lovelace"],
            },
            "enrollment_data": {
                "instructors": {"Ada Lovelace": "ada@wisc.edu"},
            },
        }
    },
}

MEETINGS = [
    {
        "name": "LEC 001",
        "type": "CLASS",
        "instructors": ["Ada Lovelace"],
        "current_enrollment": 120,
        "location": {"capacity": 150},
        "start_time": 1769196000000,
        "end_time": 1769199000000,
    }
]


class TestUWSearchCourses(unittest.IsolatedAsyncioTestCase):
    async def test_search_by_subject_and_number_uses_direct_resolve(self):
        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 20}
        with patch.object(uw_search_courses, "get_settings", return_value=fake_settings), patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(return_value=COURSE_PAYLOAD),
        ):
            result = await uw_search_courses.execute(
                subject="COMP SCI", course_number="300"
            )

        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["identifier"], "COMPSCI 300")
        self.assertIn("Object-oriented", result["courses"][0]["description"])

    async def test_search_by_keyword_uses_search_api(self):
        search_payload = {
            "courses": [
                {
                    "course_id": "COMPSCI_300",
                    "course_number": 300,
                    "course_title": "PROGRAMMING II",
                    "subjects": ["COMPSCI"],
                }
            ]
        }
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = search_payload
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.post.return_value = mock_response

        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 20}
        with patch.object(uw_search_courses, "get_settings", return_value=fake_settings), patch(
            "app.tools._uw_source.httpx.AsyncClient", return_value=mock_client
        ), patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(return_value=COURSE_PAYLOAD),
        ):
            result = await uw_search_courses.execute(keyword="programming")

        self.assertEqual(result["courses"][0]["identifier"], "COMPSCI 300")
        mock_client.post.assert_awaited()
        self.assertEqual(
            mock_client.post.await_args.kwargs["json"], {"query": "programming"}
        )

    async def test_search_requires_a_filter(self):
        result = await uw_search_courses.execute()
        self.assertEqual(result["courses"], [])
        self.assertIn("error", result)


class TestUWCourseGrades(unittest.IsolatedAsyncioTestCase):
    async def test_computes_average_gpa_and_visuals(self):
        with patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(return_value=COURSE_PAYLOAD),
        ):
            result = await uw_course_grades.execute(course_identifier="COMP SCI 300")

        self.assertAlmostEqual(result["cumulative"]["average_gpa"], 3.28, places=2)
        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        visuals = build_visuals([{"name": "uw_course_grades", "result": result}])
        types = {v["type"] for v in visuals}
        self.assertIn("course_gpa", types)
        self.assertIn("course_grade_distribution", types)

    async def test_missing_course_returns_error(self):
        with patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(side_effect=FileNotFoundError("missing")),
        ):
            result = await uw_course_grades.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["grades"])
        self.assertIn("error", result)


class TestUWPrerequisites(unittest.IsolatedAsyncioTestCase):
    async def test_returns_prereq_text_and_edges(self):
        with patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(return_value=COURSE_PAYLOAD),
        ):
            result = await uw_prerequisites.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_prerequisites"])
        edge_ids = {p["identifier"] for p in result["prerequisites"]}
        self.assertIn("COMPSCI 200", edge_ids)

    async def test_unknown_course_returns_error(self):
        with patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(side_effect=FileNotFoundError("missing")),
        ):
            result = await uw_prerequisites.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWNextCourses(unittest.IsolatedAsyncioTestCase):
    async def test_returns_satisfies_as_next_courses(self):
        async def fake_fetch(path, optional=False):
            if path.endswith("COMPSCI_300.json"):
                return COURSE_PAYLOAD
            if path.endswith("COMPSCI_400.json"):
                return {
                    "course_reference": {"subjects": ["COMPSCI"], "course_number": 400},
                    "course_title": "PROGRAMMING III",
                }
            if path.endswith("COMPSCI_407.json"):
                return {
                    "course_reference": {"subjects": ["COMPSCI"], "course_number": 407},
                    "course_title": "FOUNDATIONS OF MOBILE SYSTEMS",
                }
            if optional:
                return None
            raise FileNotFoundError(path)

        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 40}
        with patch.object(uw_next_courses, "get_settings", return_value=fake_settings), patch.object(
            _uw_source, "_fetch_static_json", side_effect=fake_fetch
        ):
            result = await uw_next_courses.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_next_courses"])
        self.assertFalse(result["truncated"])
        self.assertIn("additional", result["note"].lower())
        ids = {c["identifier"] for c in result["next_courses"]}
        self.assertEqual(ids, {"COMPSCI 400", "COMPSCI 407"})
        titles = {c["identifier"]: c["title"] for c in result["next_courses"]}
        self.assertEqual(titles["COMPSCI 400"], "PROGRAMMING III")

        visuals = build_visuals([{"name": "uw_next_courses", "result": result}])
        self.assertEqual(visuals[0]["type"], "next_courses_tree")
        self.assertEqual(len(visuals[0]["next_courses"]), 2)

    async def test_empty_satisfies_returns_no_next(self):
        payload = {**COURSE_PAYLOAD, "satisfies": []}
        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 40}
        with patch.object(uw_next_courses, "get_settings", return_value=fake_settings), patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(return_value=payload),
        ):
            result = await uw_next_courses.execute(course_identifier="COMP SCI 300")
        self.assertFalse(result["has_next_courses"])
        self.assertEqual(result["next_courses"], [])
        self.assertEqual(build_visuals([{"name": "uw_next_courses", "result": result}]), [])

    async def test_unknown_course_returns_error(self):
        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 40}
        with patch.object(uw_next_courses, "get_settings", return_value=fake_settings), patch.object(
            _uw_source,
            "_fetch_static_json",
            new=AsyncMock(side_effect=FileNotFoundError("missing")),
        ):
            result = await uw_next_courses.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWCourseSections(unittest.IsolatedAsyncioTestCase):
    async def test_returns_sections_from_meetings(self):
        async def fake_fetch(path, optional=False):
            if path == "/terms.json":
                return {"1254": "Fall 2025"}
            if path.endswith("/meetings.json"):
                return MEETINGS
            if path.startswith("/course/"):
                return COURSE_PAYLOAD
            return None

        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 25}
        with patch.object(uw_course_sections, "get_settings", return_value=fake_settings), patch.object(
            _uw_source, "_fetch_static_json", side_effect=fake_fetch
        ):
            result = await uw_course_sections.execute(course_identifier="COMP SCI 300")

        self.assertEqual(len(result["sections"]), 1)
        sec = result["sections"][0]
        self.assertEqual(sec["section"], "LEC 001")
        self.assertEqual(sec["seats_available"], 30)
        self.assertTrue(sec["is_open"])

    async def test_term_filter_miss_returns_error(self):
        async def fake_fetch(path, optional=False):
            if path == "/terms.json":
                return {"1254": "Fall 2025"}
            if path.endswith("/meetings.json"):
                return MEETINGS
            if path.startswith("/course/"):
                return COURSE_PAYLOAD
            return None

        fake_settings = MagicMock()
        fake_settings.tools.get_tool_config.return_value = {"max_results": 25}
        with patch.object(uw_course_sections, "get_settings", return_value=fake_settings), patch.object(
            _uw_source, "_fetch_static_json", side_effect=fake_fetch
        ):
            result = await uw_course_sections.execute(
                course_identifier="COMP SCI 300", term="Spring 2099"
            )
        self.assertEqual(result["sections"], [])
        self.assertIn("error", result)


class TestUWToolsRegistered(unittest.TestCase):
    def test_uw_tools_discovered(self):
        registered = set(list_registered_tools())
        for name in (
            "uw_search_courses",
            "uw_course_grades",
            "uw_prerequisites",
            "uw_next_courses",
            "uw_course_sections",
        ):
            self.assertIn(name, registered, f"Tool '{name}' was not discovered")


if __name__ == "__main__":
    unittest.main()
