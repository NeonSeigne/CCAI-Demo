"""Unit tests for UW-Madison Course Map–backed course tools."""

import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from app.api.visuals import build_visuals
from app.tools import list_registered_tools
from app.tools import (
    _uw_source,
    course_grades,
    course_sections,
    course_next,
    course_prerequisites,
    course_search,
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
        with patch.object(course_search, "get_settings", return_value=tool_settings(20)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ) as fetch:
            result = await course_search.execute(subject="COMP SCI", course_number="300")

        self.assertEqual(len(result["courses"]), 1)
        self.assertEqual(result["courses"][0]["identifier"], "COMPSCI 300")
        self.assertEqual(result["courses"][0]["title"], "Programming Ii")
        # Live requirement text uses non-breaking spaces ("COMP\xa0SCI\xa0200").
        self.assertIn("COMP SCI 200", result["courses"][0]["prereq_text"].replace("\xa0", " "))
        self.assertEqual(fetch.await_args_list[0].args[0], "/courses/COMPSCI_300.json")

    async def test_search_by_keyword_uses_search_api(self):
        with patch.object(course_search, "get_settings", return_value=tool_settings(20)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ) as fetch:
            result = await course_search.execute(keyword="programming")

        ids = [c["identifier"] for c in result["courses"]]
        self.assertEqual(ids, ["COMPSCI 300", "COMPSCI 400"])
        self.assertEqual(result["courses"][0]["average_gpa"], 3.12)
        search_call = fetch.await_args_list[0]
        self.assertEqual(search_call.args[0], "/search.json")
        self.assertEqual(search_call.kwargs["params"], {"q": "programming"})

    async def test_search_requires_a_filter(self):
        result = await course_search.execute()
        self.assertEqual(result["courses"], [])
        self.assertIn("error", result)


class TestUWCourseGrades(unittest.IsolatedAsyncioTestCase):
    async def test_computes_average_gpa_and_visuals(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await course_grades.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertIsNotNone(result["cumulative"]["average_gpa"])
        self.assertGreater(result["cumulative"]["total"], 0)
        visuals = build_visuals([{"name": "course_grades", "result": result}])
        types = {v["type"] for v in visuals}
        self.assertIn("course_gpa", types)
        self.assertIn("course_grade_distribution", types)

    async def test_missing_course_returns_error(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=missing_coursemap()):
            result = await course_grades.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["grades"])
        self.assertIn("error", result)

    async def test_grade_card_terms_are_numeric_codes(self):
        # The course detail API only accepts numeric term codes (?term=1254).
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await course_grades.execute(course_identifier="COMP SCI 300")
        specs = build_visuals([{"name": "course_grades", "result": result}])
        terms = {v["term"] for v in specs if "term" in v}
        self.assertTrue(terms)
        self.assertTrue(all(t.isdigit() for t in terms), terms)
        self.assertTrue(all(t.get("term") for t in result["terms"]))


class TestCourseResolution(unittest.IsolatedAsyncioTestCase):
    async def test_search_fallback_never_returns_another_subject(self):
        math_page = {"data": {"course": {"course_id": "MATH 300", "subjects": ["MATH"], "course_number": 300}}}
        search = {"data": {"results": {"items": [{"course_id": "MATH 300", "title": "MATH THING"}]}}}

        async def fetch(path, *, params=None, optional=False):
            if path == "/search.json":
                return search
            if path == "/courses/MATH_300.json":
                return math_page
            return None

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            with self.assertRaises(FileNotFoundError):
                await _uw_source._get_course("ZOOLOGY 300")

    async def test_search_fallback_resolves_subject_shorthand(self):
        # "CS 400" has no direct page (CS_400.json); search maps it to COMP SCI 400.
        page = {"data": {"course": {"course_id": "COMPSCI 400", "subjects": ["COMPSCI"], "course_number": 400}}}
        search = {"data": {"results": {"items": [
            {"course_id": "MATH 400"},
            {"course_id": "COMPSCI 400"},
        ]}}}
        fetched = []

        async def fetch(path, *, params=None, optional=False):
            fetched.append(path)
            if path == "/search.json":
                return search
            if path == "/courses/COMPSCI_400.json":
                return page
            if path == "/courses/MATH_400.json":
                return {"data": {"course": {"course_id": "MATH 400"}}}
            return None

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            data = await _uw_source._get_course("CS 400")
        self.assertEqual(data["course"]["course_id"], "COMPSCI 400")
        self.assertIn("/search.json", fetched)
        self.assertNotIn("/courses/MATH_400.json", fetched)

    async def test_ambiguous_shorthand_is_not_guessed(self):
        # "CS" fits COMPSCI and CONS SCI; with both at 300, don't pick one.
        search = {"data": {"results": {"items": [{"course_id": "CONS SCI 300"}, {"course_id": "COMP SCI 300"}]}}}

        async def fetch(path, *, params=None, optional=False):
            if path == "/search.json":
                return search
            if path in ("/courses/CONSSCI_300.json", "/courses/COMPSCI_300.json"):
                return {"data": {"course": {"course_id": path}}}
            return None

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            with self.assertRaises(FileNotFoundError):
                await _uw_source._get_course("CS 300")

    async def test_identifier_without_number_is_not_resolved_by_search(self):
        search = {"data": {"results": {"items": [{"course_id": "MATH 221"}]}}}

        async def fetch(path, *, params=None, optional=False):
            if path == "/search.json":
                return search
            return {"data": {"course": {"course_id": "MATH 221"}}}

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            with self.assertRaises(FileNotFoundError):
                await _uw_source._get_course("MATH")


class TestOutageSemantics(unittest.IsolatedAsyncioTestCase):
    """R11: an upstream failure is never reported as a missing course."""

    async def test_5xx_on_direct_page_raises_runtime_error(self):
        async def fetch(path, *, params=None, optional=False):
            if path.startswith("/courses/"):
                raise RuntimeError("Course Map error 502")
            return {"data": {"results": {"items": []}}}

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            with self.assertRaises(RuntimeError):
                await _uw_source._get_course("COMP SCI 300")

    async def test_search_outage_raises_runtime_error(self):
        async def fetch(path, *, params=None, optional=False):
            if path == "/search.json":
                raise RuntimeError("Course Map unavailable")
            return None

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            with self.assertRaises(RuntimeError):
                await _uw_source._get_course("E C E 252")

    async def test_real_404_stays_not_found(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=missing_coursemap()):
            with self.assertRaises(FileNotFoundError):
                await _uw_source._get_course("BOGUS 999")

    async def test_match_wins_over_an_earlier_failure(self):
        # A cross-listed subject fails but the other resolves: no error.
        async def fetch(path, *, params=None, optional=False):
            if path == "/courses/ECE_252.json":
                raise RuntimeError("Course Map error 500")
            if path == "/courses/COMPSCI_252.json":
                return {"data": {"course": {"course_id": "COMPSCI/ECE 252"}}}
            return None

        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            data = await _uw_source._get_course("ECE/COMP SCI 252")
        self.assertEqual(data["course"]["course_id"], "COMPSCI/ECE 252")

    async def test_fetch_json_optional_still_raises_on_5xx(self):
        response = MagicMock(status_code=503, is_error=True)
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.get = AsyncMock(return_value=response)
        _uw_source._cache.clear()
        with patch.object(_uw_source.httpx, "AsyncClient", return_value=client):
            with self.assertRaises(RuntimeError):
                await _uw_source._fetch_json("/courses/X_1.json", optional=True)

    async def test_fetch_json_optional_returns_none_on_404(self):
        response = MagicMock(status_code=404, is_error=True)
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.get = AsyncMock(return_value=response)
        _uw_source._cache.clear()
        with patch.object(_uw_source.httpx, "AsyncClient", return_value=client):
            self.assertIsNone(await _uw_source._fetch_json("/courses/X_2.json", optional=True))

    async def test_tool_reports_outage_as_error(self):
        with patch.object(_uw_source, "_fetch_json", new=AsyncMock(side_effect=RuntimeError("down"))):
            result = await course_grades.execute(course_identifier="COMP SCI 300")
        self.assertIsNone(result["grades"])
        self.assertIn("unavailable", result["error"])


class TestUWPrerequisites(unittest.IsolatedAsyncioTestCase):
    async def test_returns_prereq_text_and_edges(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await course_prerequisites.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_prerequisites"])
        edge_ids = {p["identifier"] for p in result["prerequisites"]}
        self.assertIn("COMPSCI 200", edge_ids)
        self.assertIn("COMPSCI/ECE 252", edge_ids)

    async def test_unknown_course_returns_error(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=missing_coursemap()):
            result = await course_prerequisites.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWSectionInstructors(unittest.IsolatedAsyncioTestCase):
    async def test_sections_list_course_instructors_once_not_per_section(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            result = await course_sections.execute(course_identifier="COMP SCI 300")
        self.assertTrue(result["sections"])
        self.assertTrue(all(s["instructors"] == "" for s in result["sections"]))
        self.assertIn("Jim Williams", result["course_instructors"])
        self.assertIn("section", result["instructors_note"])


class TestUWNextCourses(unittest.IsolatedAsyncioTestCase):
    async def test_returns_following_as_next_courses(self):
        with patch.object(course_next, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await course_next.execute(course_identifier="COMP SCI 300")

        self.assertEqual(result["course_identifier"], "COMPSCI 300")
        self.assertTrue(result["has_next_courses"])
        self.assertFalse(result["truncated"])
        self.assertIn("additional", result["note"].lower())
        ids = {c["identifier"] for c in result["next_courses"]}
        self.assertEqual(ids, {"BSE 405", "COMPSCI 320", "COMPSCI 400"})

        visuals = build_visuals([{"name": "course_next", "result": result}])
        self.assertEqual(visuals[0]["type"], "next_courses_tree")
        self.assertEqual(len(visuals[0]["next_courses"]), 3)

    async def test_truncates_to_max_results(self):
        with patch.object(course_next, "get_settings", return_value=tool_settings(2)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await course_next.execute(course_identifier="COMP SCI 300")
        self.assertTrue(result["truncated"])
        self.assertEqual(len(result["next_courses"]), 2)

    async def test_empty_following_returns_no_next(self):
        page = {"data": {**COURSE_PAGE["data"], "following": []}}
        with patch.object(course_next, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap({"/courses/COMPSCI_300.json": page})
        ):
            result = await course_next.execute(course_identifier="COMP SCI 300")
        self.assertFalse(result["has_next_courses"])
        self.assertEqual(result["next_courses"], [])
        self.assertEqual(build_visuals([{"name": "course_next", "result": result}]), [])

    async def test_unknown_course_returns_error(self):
        with patch.object(course_next, "get_settings", return_value=tool_settings(40)), patch.object(
            _uw_source, "_fetch_json", side_effect=missing_coursemap()
        ):
            result = await course_next.execute(course_identifier="BOGUS 999")
        self.assertIsNone(result["course"])
        self.assertIn("error", result)


class TestUWCourseSections(unittest.IsolatedAsyncioTestCase):
    async def test_returns_sections_with_seat_counts(self):
        with patch.object(course_sections, "get_settings", return_value=tool_settings(25)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await course_sections.execute(course_identifier="COMP SCI 300")

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
        with patch.object(course_sections, "get_settings", return_value=tool_settings(25)), patch.object(
            _uw_source, "_fetch_json", side_effect=fake_coursemap()
        ):
            result = await course_sections.execute(
                course_identifier="COMP SCI 300", term="Spring 2099"
            )
        self.assertEqual(result["sections"], [])
        self.assertIn("error", result)


class TestUWToolsRegistered(unittest.TestCase):
    def test_uw_tools_discovered(self):
        registered = set(list_registered_tools())
        for name in (
            "course_search",
            "course_grades",
            "course_prerequisites",
            "course_next",
            "course_sections",
        ):
            self.assertIn(name, registered, f"Tool '{name}' was not discovered")


if __name__ == "__main__":
    unittest.main()
