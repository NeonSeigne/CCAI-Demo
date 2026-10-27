"""Tests for the course catalog API (/api/catalog) and its shared search."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.config
from app.api.routes import catalog, courses
from app.api.routes import router as api_router
from app.config import AppSettings
from app.core.auth import get_current_active_user
from app.sources import academics, cache, csv_snapshot
from app.tools import _uw_source, course_search, search_courses
from app.tests.unit.test_csv_snapshot import GRADES, GRADES_AS_OF, GRADES_URLS, SECTIONS_URL

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "uw_coursemap"
COURSE_PAGE = json.loads((FIXTURES / "COMPSCI_300.json").read_text())

UW = {
    "tools": {"course_search": {"enabled": True, "max_results": 20}},
    "homepage": {"starters": [
        {"domain": "academics", "title": "Academics",
         "prompts": ["How hard is COMP SCI 300?", "What can I take after COMP SCI 300?"]},
        {"domain": "campus", "title": "Getting around", "prompts": ["Where is MATH 101 Hall?"]},
    ]},
}
CU = {
    "tools": {"search_courses": {"enabled": True, "max_results": 20}},
    "homepage": {"starters": [
        {"domain": "academics", "title": "Academics",
         "prompts": ["What sections of CSCI 2270 are offered?", "How do students rate CSCI professors?"]},
    ]},
}

# One full course (CS 3100) beside the open ones, so the seat filter has work.
SECTIONS_CSV = (
    "ClassNumber,Mnemonic,Number,Section,Type,Units,Instructor1,Days1,Room1,MeetingDates1,"
    "Title,Topic,Status,Enrollment,EnrollmentLimit,Waitlist,WaitlistLimit,Description\n"
    "1,CS,2100,001,Lecture,4,Briana Morrison,MoWeFr 10:00am - 10:50am,***,08/25/2026 - 12/08/2026,"
    "Data Structures and Algorithms 1,,Open,180,200,0,50,Introduces data structures.\n"
    "2,CS,2100,101,Laboratory,0,Ana Lab,Tu 2:00pm - 3:15pm,***,08/25/2026 - 12/08/2026,"
    "Data Structures and Algorithms 1,,Wait List,40,40,5,10,Introduces data structures.\n"
    "3,CS,3100,001,Lecture,3,Alan Turing,TuTh 9:30am - 10:45am,***,08/25/2026 - 12/08/2026,"
    "Data Structures and Algorithms 2,,Closed,120,120,9,20,More data structures.\n"
    "4,CS,4774,001,Lecture,3,Ada Lovelace,TuTh 3:30pm - 4:45pm,***,08/25/2026 - 12/08/2026,"
    "Machine Learning,,Open,90,120,0,20,Supervised learning.\n"
)


def use_settings(raw):
    app.config._settings = AppSettings(**raw)


def search_items(ids):
    return [{"course_id": cid, "title": f"COURSE {cid}", "gpa": 3.0} for cid in ids]


def fake_coursemap(pages_of_items=None, course_pages=None):
    """``_fetch_json`` stand-in: search pages by number, course pages by path."""
    pages_of_items = pages_of_items or [search_items(["COMPSCI 300", "COMPSCI 400"])]
    course_pages = {"/courses/COMPSCI_300.json": COURSE_PAGE, **(course_pages or {})}
    total = sum(len(p) for p in pages_of_items)

    async def fetch(path, *, params=None, optional=False):
        if path == "/search.json":
            page = (params or {}).get("page", 1)
            items = pages_of_items[page - 1] if page <= len(pages_of_items) else []
            return {"data": {"results": {"items": items, "total": total}}}
        if path in course_pages:
            return course_pages[path]
        if optional:
            return None
        raise FileNotFoundError(path)

    return fetch


def fose_rows():
    return [
        {"course_code": "CSCI 2270", "title": "Data Structures", "section": "100",
         "instructor": "K. Nielsen", "schedule": {"raw": "MWF 9:05-9:55a"}, "semester": "Spring 2026"},
        {"course_code": "CSCI 2270", "title": "Data Structures", "section": "200",
         "instructor": "H. Hu", "schedule": {"raw": "TTh 11-12:15p"}, "semester": "Spring 2026"},
        {"course_code": "CSCI 3104", "title": "Algorithms", "section": "100",
         "instructor": "A. Prof", "schedule": {"raw": ""}, "semester": "Spring 2026"},
    ]


class CatalogTestCase(unittest.TestCase):
    settings = UW

    def setUp(self):
        _uw_source._cache.clear()
        use_settings(self.settings)
        api = FastAPI()
        api.include_router(api_router)
        api.dependency_overrides[get_current_active_user] = lambda: object()
        self.client = TestClient(api)

    def tearDown(self):
        app.config._settings = None
        _uw_source._cache.clear()


class TestRouteOrder(CatalogTestCase):
    """R1: catalog routes live under their own prefix, clear of the detail catch-all."""

    def test_search_and_summary_reach_their_handlers(self):
        with patch.object(academics, "search_catalog", new=AsyncMock(return_value={
            "courses": [], "truncated": False, "capabilities": {}, "source": {}, "as_of": None,
        })) as search, patch.object(academics, "course_summary", new=AsyncMock(return_value={"ok": 1})) as summary:
            self.assertEqual(self.client.get("/api/catalog/search?q=comp sci").status_code, 200)
            self.assertEqual(self.client.get("/api/catalog/COMP SCI 300").json(), {"ok": 1})
        self.assertEqual(search.await_args.args[0], "comp sci")
        summary.assert_awaited_once_with("COMP SCI 300")

    def test_course_detail_route_still_reaches_detail_handler(self):
        with patch.object(courses, "_build_course_payload", new=AsyncMock(return_value={"detail": 1})) as build:
            response = self.client.get("/api/courses/COMP SCI 300")
        self.assertEqual(response.json(), {"detail": 1})
        build.assert_awaited_once_with("COMPSCI_300", None)


class TestUWSearch(CatalogTestCase):
    def test_level_filter(self):
        items = search_items(["COMPSCI 200", "COMPSCI 300", "COMPSCI 354", "COMPSCI 400"])
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap([items])):
            body = self.client.get("/api/catalog/search", params={"q": "computer", "level": 300}).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 300", "COMPSCI 354"])
        self.assertTrue(all(c["level"] == 300 for c in body["courses"]))
        self.assertEqual(body["courses"][0]["gpa"], 3.0)
        self.assertNotIn("seats_open", body["courses"][0])

    def test_limit_applies_after_filtering(self):
        # The 500-level matches sit on the second search page, past the limit.
        first = search_items([f"COMPSCI {n}" for n in range(200, 230)])
        second = search_items(["COMPSCI 532", "COMPSCI 537", "COMPSCI 540", "COMPSCI 300"])
        fetch = fake_coursemap([first, second])
        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            body = self.client.get(
                "/api/catalog/search", params={"q": "computer", "level": 500, "limit": 2}
            ).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 532", "COMPSCI 537"])
        self.assertTrue(body["truncated"])

    def test_subject_listing_runs_in_course_order(self):
        # Course Map ranks graduate research first; a subject listing reads lowest number first.
        first = search_items(["COMPSCI 990", "COMPSCI 900", "COMPSCI 799", "COMPSCI 300"]
                             + [f"COMPSCI {n}" for n in range(800, 826)])  # a full page
        second = search_items(["COMPSCI 200", "COMPSCI 1000"])
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap([first, second])):
            body = self.client.get("/api/catalog/search", params={"q": "comp sci", "limit": 3}).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 200", "COMPSCI 300", "COMPSCI 799"])
        self.assertTrue(body["truncated"])

    def test_keyword_search_keeps_relevance_order(self):
        items = search_items(["COMPSCI 400", "COMPSCI 300"])
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap([items])):
            body = self.client.get("/api/catalog/search", params={"q": "programming practice"}).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 400", "COMPSCI 300"])

    def test_capital_titles_read_as_title_case(self):
        cases = {
            "MASTER'S RESEARCH OR THESIS": "Master's Research or Thesis",
            "PROGRAMMING II": "Programming II",
            "DIRECTED STUDY IN COMPUTER SCIENCE": "Directed Study in Computer Science",
            "INTRODUCTION TO AI": "Introduction to AI",
            "O'BRIEN, KATE": "O'Brien, Kate",
            "Already Mixed Case": "Already Mixed Case",
        }
        for raw, expected in cases.items():
            self.assertEqual(_uw_source._title_case(raw), expected)

    def test_capabilities_have_no_seat_filter(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/search", params={"q": "COMP SCI 300"}).json()
        self.assertFalse(body["capabilities"]["seat_filter"])
        self.assertTrue(body["capabilities"]["prerequisites"])
        self.assertEqual(body["source"]["name"], "UW Course Map")
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 300"])

    def test_open_only_is_refused(self):
        response = self.client.get("/api/catalog/search", params={"q": "comp sci", "open_only": True})
        self.assertEqual(response.status_code, 400)

    def test_empty_query_is_400(self):
        self.assertEqual(self.client.get("/api/catalog/search").status_code, 400)

    def test_search_outage_is_502(self):
        with patch.object(_uw_source, "_fetch_json", new=AsyncMock(side_effect=RuntimeError("down"))):
            response = self.client.get("/api/catalog/search", params={"q": "programming"})
        self.assertEqual(response.status_code, 502)
        self.assertIn("UW Course Map", response.json()["detail"])


class TestUWSummary(CatalogTestCase):
    def test_summary_shape(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/COMP SCI 300").json()
        self.assertEqual(body["identifier"], "COMPSCI 300")
        self.assertEqual(body["grades"]["term"], "Spring 2026")
        self.assertGreater(body["grades"]["students"], 0)
        self.assertEqual(body["grades"]["labels"], {"a": "A/AB", "df": "D/F"})
        self.assertIsNotNone(body["grades"]["pct_a"])
        self.assertIsNotNone(body["cumulative"]["gpa"])
        sections = body["sections"]
        self.assertEqual(sections["term"], "Fall 2026")
        self.assertFalse(sections["historical"])
        self.assertTrue(all(r["seats_open"] is not None for r in sections["rows"]))
        self.assertIn("Jim Williams", body["instructors"])
        self.assertIn("COMPSCI 200", {c["identifier"] for c in body["prerequisites"]["courses"]})
        self.assertIn("COMPSCI 400", {c["identifier"] for c in body["next_courses"]})

    def test_unknown_course_is_404(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap([[]])):
            self.assertEqual(self.client.get("/api/catalog/BOGUS 999").status_code, 404)

    def test_outage_is_502_not_404(self):
        with patch.object(_uw_source, "_fetch_json", new=AsyncMock(side_effect=RuntimeError("503"))):
            self.assertEqual(self.client.get("/api/catalog/COMP SCI 300").status_code, 502)

    def test_bad_identifier_is_400(self):
        self.assertEqual(self.client.get("/api/catalog/COMP SCI 300;drop").status_code, 400)


class TestUWStarters(CatalogTestCase):
    def test_starters_resolve_through_search(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/starters").json()
        # Named twice in the academics prompts, listed once; campus prompts are ignored.
        self.assertEqual([c["identifier"] for c in body["courses"]], ["COMPSCI 300"])
        self.assertIn("capabilities", body)

    def test_no_starters_is_empty(self):
        use_settings({"tools": UW["tools"]})
        self.assertEqual(self.client.get("/api/catalog/starters").json()["courses"], [])


class TestCU(CatalogTestCase):
    settings = CU

    def test_keyword_only_query_returns_hint(self):
        response = self.client.get("/api/catalog/search", params={"q": "calculus"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Search CU courses by subject code, e.g. CSCI")

    def test_subject_search_groups_sections_and_filters_level(self):
        with patch.object(search_courses, "fose_search", new=AsyncMock(return_value=fose_rows())) as fose:
            body = self.client.get("/api/catalog/search", params={"q": "csci", "level": 2000}).json()
        fose.assert_awaited_once_with("CSCI")
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CSCI 2270"])
        self.assertEqual(body["courses"][0]["sections"], 2)
        self.assertFalse(body["capabilities"]["seat_filter"])
        self.assertFalse(body["capabilities"]["keyword_search"])

    def test_open_only_is_refused(self):
        response = self.client.get("/api/catalog/search", params={"q": "CSCI", "open_only": True})
        self.assertEqual(response.status_code, 400)

    def test_summary_has_sections_without_seats_and_no_grades(self):
        with patch.object(search_courses, "fose_search", new=AsyncMock(return_value=fose_rows())):
            body = self.client.get("/api/catalog/CSCI 2270").json()
        self.assertEqual(body["sections"]["term"], "Spring 2026")
        self.assertFalse(body["sections"]["seats_published"])
        self.assertIsNone(body["sections"]["seats_open"])
        self.assertEqual(body["instructors"], ["K. Nielsen", "H. Hu"])
        for missing in ("grades", "prerequisites", "next_courses"):
            self.assertNotIn(missing, body)
            self.assertFalse(body["capabilities"][missing])

    def test_unknown_course_is_404(self):
        with patch.object(search_courses, "fose_search", new=AsyncMock(return_value=fose_rows())):
            self.assertEqual(self.client.get("/api/catalog/CSCI 9999").status_code, 404)

    def test_fose_outage_is_502(self):
        response = MagicMock(status_code=503)
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.post = AsyncMock(return_value=response)
        with patch.object(search_courses.httpx, "AsyncClient", return_value=client):
            self.assertEqual(self.client.get("/api/catalog/search", params={"q": "CSCI"}).status_code, 502)

    def test_starters(self):
        with patch.object(search_courses, "fose_search", new=AsyncMock(return_value=fose_rows())):
            body = self.client.get("/api/catalog/starters").json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CSCI 2270"])


def fake_download(url, with_commit_date=False):
    if url == SECTIONS_URL:
        return SECTIONS_CSV, "2026-09-03"
    if url in GRADES:
        return GRADES[url], GRADES_AS_OF[url]
    raise RuntimeError(f"unexpected url {url}")


class TestUVA(CatalogTestCase):
    settings = {
        "tools": {"course_search": {"enabled": True}, "course_sections": {"enabled": True}},
        "academics": {"provider": "csv_snapshot", "snapshot": {
            "source_name": "theCourseForum", "source_url": "https://thecourseforum.com",
            "sections_url": SECTIONS_URL, "grades_urls": GRADES_URLS,
        }},
    }

    def setUp(self):
        super().setUp()
        csv_snapshot._tables.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.patches = [
            patch.object(cache, "CACHE_DIR", Path(self.tmp.name) / "cache"),
            patch.object(cache, "_download", side_effect=fake_download),
            patch.dict(os.environ, {"SOURCES_OFFLINE": ""}),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        csv_snapshot._tables.clear()
        super().tearDown()

    def test_open_only_keeps_courses_that_had_seats(self):
        body = self.client.get("/api/catalog/search", params={"q": "data structures", "open_only": True}).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CS 2100"])
        self.assertTrue(body["capabilities"]["seat_filter"])
        self.assertEqual(body["as_of"], "2026-09-03")
        everything = self.client.get("/api/catalog/search", params={"q": "data structures"}).json()
        self.assertEqual([c["seats_open"] for c in everything["courses"]], [20, 0])

    def test_subject_word_searches_the_subject(self):
        body = self.client.get("/api/catalog/search", params={"q": "cs", "level": 4000}).json()
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CS 4774"])

    def test_summary_marks_seats_historical(self):
        body = self.client.get("/api/catalog/CS 2100").json()
        self.assertEqual(body["sections"]["term"], "Fall 2026")
        self.assertTrue(body["sections"]["historical"])
        self.assertEqual(body["sections"]["as_of"], "2026-09-03")
        self.assertEqual(body["sections"]["seats_open"], 20)  # lectures only
        self.assertEqual(body["grades"]["term"], "Spring 2026")
        self.assertEqual(body["grades"]["labels"]["df"], "DFW")
        self.assertEqual(body["grades"]["pct_df"], 10.0)
        self.assertIn("Briana Morrison", body["instructors"])
        self.assertNotIn("prerequisites", body)
        self.assertNotIn("next_courses", body)

    def test_unknown_course_is_404(self):
        self.assertEqual(self.client.get("/api/catalog/CS 9999").status_code, 404)

    def test_unreadable_snapshot_is_502(self):
        with patch.object(cache, "_download", side_effect=RuntimeError("offline")):
            self.assertEqual(self.client.get("/api/catalog/CS 2100").status_code, 502)


class TestSharedSearch(unittest.IsolatedAsyncioTestCase):
    """R12: the chat tool and the page share one search."""

    def setUp(self):
        use_settings(UW)

    def tearDown(self):
        app.config._settings = None

    async def test_chat_tool_calls_search_catalog(self):
        result = {"courses": [{"identifier": "COMPSCI 300"}], "total_results": 1, "truncated": False}
        with patch.object(academics, "search_catalog", new=AsyncMock(return_value=result)) as search:
            out = await course_search.execute(subject="COMP SCI", course_number="300")
        search.assert_awaited_once_with(subject="COMP SCI", course_number="300", keyword="", limit=20)
        self.assertEqual(out["courses"], result["courses"])

    async def test_chat_tool_reports_outage_as_error(self):
        with patch.object(_uw_source, "_fetch_json", new=AsyncMock(side_effect=RuntimeError("down"))):
            out = await course_search.execute(keyword="programming")
        self.assertEqual(out["courses"], [])
        self.assertIn("error", out)

    def test_parse_query(self):
        self.assertEqual(academics.parse_query(" comp sci  300 "), ("COMP SCI", "300", ""))
        self.assertEqual(academics.parse_query("CS2100"), ("CS", "2100", ""))
        self.assertEqual(academics.parse_query("machine learning"), ("", "", "machine learning"))

    def test_course_level(self):
        self.assertEqual(academics.course_level("354"), 300)
        self.assertEqual(academics.course_level("2100"), 2000)
        self.assertEqual(academics.course_level("576A"), 500)
        self.assertIsNone(academics.course_level("x"))


if __name__ == "__main__":
    unittest.main()
