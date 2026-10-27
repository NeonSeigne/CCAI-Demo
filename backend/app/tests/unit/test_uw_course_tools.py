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

import json
from pathlib import Path

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "uw_coursemap"
# Trimmed from the live https://uwcourses.com/courses/COMPSCI_300.json payload.
COURSE_PAGE = json.loads((FIXTURES / "COMPSCI_300.json").read_text())

SEARCH_PAGE = {
    "data": {
        "results": {
            "items": [
                {"course_id": "COMPSCI 300", "title": "PROGRAMMING II", "gpa": 3.123},
                {"course_id": "COMPSCI 400", "title": "PROGRAMMING III", "gpa": 3.2},
            ]
        }
    }
}


def fake_coursemap(pages=None):
    """Route ``_fetch_json`` paths to fixture payloads, like the live API."""
    pages = {"/courses/COMPSCI_300.json": COURSE_PAGE, **(pages or {})}

    async def fetch(path, *, params=None, optional=False):
        if path == "/search.json":
            return SEARCH_PAGE
        if path in pages:
            return pages[path]
        if optional:
            return None
        raise FileNotFoundError(path)

    return fetch


def missing_coursemap():
    async def fetch(path, *, params=None, optional=False):
        if optional:
            return None
        raise FileNotFoundError(path)

    return fetch


def tool_settings(max_results):
    fake = MagicMock()
    fake.tools.get_tool_config.return_value = {"max_results": max_results}
    return fake


class TestUWSearchCourses(unittest.IsolatedAsyncioTestCase):
    async def test_search_by_subject_and_number_uses_direct_resolve(self):
        with patch.object(uw_search_courses, "get_settings", return_value=tool_settings(20)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ) as fetch:
            result = await uw_search_courses.execute(subject="COMP SCI", course_number="300")

        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["identifier"], "COMPSCI 300")
        self.assertEqual(result["courses"][0]["title"], "Programming Ii")
        # Live requirement text uses non-breaking spaces ("COMP\xa0SCI\xa0200").
        self.assertIn("COMP SCI 200", result["courses"][0]["prereq_text"].replace("\xa0", " "))
        self.assertEqual(fetch.await_args_list[0].args[0], "/courses/COMPSCI_300.json")

    async def test_search_by_keyword_uses_search_api(self):
        with patch.object(uw_search_courses, "get_settings", return_value=tool_settings(20)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ) as fetch:
            result = await uw_search_courses.execute(keyword="programming")

        ids = [c["identifier"] for c in result["courses"]]
        self.assertEqual(ids, ["COMPSCI 300", "COMPSCI 400"])
        self.assertEqual(result["courses"][0]["average_gpa"], 3.12)
        search_call = fetch.await_args_list[0]
        self.assertEqual(search_call.args[0], "/search.json")
        self.assertEqual(search_call.kwargs["params"], {"q": "programming"})

    async def test_search_requires_a_filter(self):
        result = await uw_search_courses.execute()
        self.assertEqual(result["courses"], [])
        self.assertIn("error", result)


class TestUWCourseGrades(unittest.IsolatedAsyncioTestCase):
    async def test_computes_average_gpa_and_visuals(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await uw_course_grades.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertIsNotNone(result["cumulative"]["average_gpa"])
        self.assertGreater(result["cumulative"]["total"], 0)
        visuals = build_visuals([{"name": "uw_course_grades", "result": result}])
        types = {v["type"] for v in visuals}
        self.assertIn("course_gpa", types)
        self.assertIn("course_grade_distribution", types)

    async def test_missing_course_returns_error(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=missing_coursemap()):
            result = await uw_course_grades.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["grades"])
        self.assertIn("error", result)


class TestUWPrerequisites(unittest.IsolatedAsyncioTestCase):
    async def test_returns_prereq_text_and_edges(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await uw_prerequisites.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_prerequisites"])
        edge_ids = {p["identifier"] for p in result["prerequisites"]}
        self.assertIn("COMPSCI 200", edge_ids)
        self.assertIn("COMPSCI/ECE 252", edge_ids)

    async def test_unknown_course_returns_error(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=missing_coursemap()):
            result = await uw_prerequisites.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWNextCourses(unittest.IsolatedAsyncioTestCase):
    async def test_returns_following_as_next_courses(self):
        with patch.object(uw_next_courses, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await uw_next_courses.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_next_courses"])
        self.assertFalse(result["truncated"])
        self.assertIn("additional", result["note"].lower())
        ids = {c["identifier"] for c in result["next_courses"]}
        self.assertEqual(ids, {"BSE 405", "COMPSCI 320", "COMPSCI 400"})

        visuals = build_visuals([{"name": "uw_next_courses", "result": result}])
        self.assertEqual(visuals[0]["type"], "next_courses_tree")
        self.assertEqual(len(visuals[0]["next_courses"]), 3)

    async def test_truncates_to_max_results(self):
        with patch.object(uw_next_courses, "get_settings", return_value=tool_settings(2)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await uw_next_courses.execute(course_identifier="COMP SCI 300")
        self.assertTrue(result["truncated"])
        self.assertEqual(len(result["next_courses"]), 2)

    async def test_empty_following_returns_no_next(self):
        page = {"data": {**COURSE_PAGE["data"], "following": []}}
        with patch.object(uw_next_courses, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap({"/courses/COMPSCI_300.json": page})
        ):
            result = await uw_next_courses.execute(course_identifier="COMP SCI 300")
        self.assertFalse(result["has_next_courses"])
        self.assertEqual(result["next_courses"], [])
        self.assertEqual(build_visuals([{"name": "uw_next_courses", "result": result}]), [])

    async def test_unknown_course_returns_error(self):
        with patch.object(uw_next_courses, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=missing_coursemap()
        ):
            result = await uw_next_courses.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWCourseSections(unittest.IsolatedAsyncioTestCase):
    async def test_returns_sections_with_seat_counts(self):
        with patch.object(uw_course_sections, "get_settings", return_value=tool_settings(25)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await uw_course_sections.execute(course_identifier="COMP SCI 300")

        self.assertEqual(len(result["sections"]), 3)
        first = result["sections"][0]
        self.assertEqual(first["section"], "001")
        self.assertEqual(first["term"], "Fall 2026")
        self.assertEqual(first["seats_available"], 4)
        self.assertTrue(first["is_open"])
        overfull = result["sections"][2]
        self.assertEqual(overfull["seats_available"], 0)
        self.assertFalse(overfull["is_open"])

    async def test_term_filter_miss_returns_error(self):
        with patch.object(uw_course_sections, "get_settings", return_value=tool_settings(25)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
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
