"""Tests for the course catalog API (/api/catalog) and its shared search."""

import asyncio
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.config
from app.api.routes import catalog
from app.api.routes import router as api_router
from app.config import AppSettings
from app.core.auth import get_current_active_user
from app.sources import academics, cache, csv_snapshot
from app.tools import _uw_source, course_search, search_courses
from app.tests.unit.test_csv_snapshot import GRADES, GRADES_AS_OF, GRADES_URLS, SECTIONS_URL

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "uw_coursemap"
COURSE_PAGE = json.loads((FIXTURES / "COMPSCI_300.json").read_text())
ECON_PAGE = json.loads((FIXTURES / "ECON_310.json").read_text())

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
    "planner": {"terms": ["Fall 2026", "Spring 2027"], "next_term": "Spring 2027"},
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
    """R1: catalog routes live under their own prefix."""

    def test_search_and_summary_reach_their_handlers(self):
        with patch.object(academics, "search_catalog", new=AsyncMock(return_value={
            "courses": [], "truncated": False, "capabilities": {}, "source": {}, "as_of": None,
        })) as search, patch.object(academics, "course_summary", new=AsyncMock(return_value={"ok": 1})) as summary:
            self.assertEqual(self.client.get("/api/catalog/search?q=comp sci").status_code, 200)
            self.assertEqual(self.client.get("/api/catalog/COMP SCI 300").json(), {"ok": 1})
        self.assertEqual(search.await_args.args[0], "comp sci")
        summary.assert_awaited_once_with("COMP SCI 300")

    def test_old_course_detail_route_is_gone(self):
        # eng R6: the course pop-up reads /api/catalog/{id} at every school.
        self.assertEqual(self.client.get("/api/courses/COMP SCI 300").status_code, 404)


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

    def test_grade_buckets_in_school_order(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/COMP SCI 300").json()
        for figure in (body["grades"], body["cumulative"]):
            self.assertEqual([b["label"] for b in figure["buckets"]], ["A", "AB", "B", "BC", "C", "D", "F"])
            self.assertEqual([b["key"] for b in figure["buckets"]], list(figure["distribution"]))

    def test_grade_history_oldest_first(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/COMP SCI 300").json()
        history = body["grade_history"]
        self.assertEqual([h["term"] for h in history], ["Spring 2025", "Fall 2025", "Spring 2026"])
        self.assertEqual(set(history[0]), {"term", "gpa", "students", "pct_a", "pct_df"})
        self.assertEqual(history[0]["students"], 596)
        self.assertEqual(history[-1]["gpa"], body["grades"]["gpa"])

    def test_credits_gen_ed_and_prereq_tree_from_course_facts(self):
        pages = {"/courses/ECON_310.json": ECON_PAGE}
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap(course_pages=pages)):
            body = self.client.get("/api/catalog/ECON 310").json()
        self.assertEqual(body["credits"], {"min": 4.0, "max": 4.0})
        self.assertEqual(body["gen_ed"], ["Core GenEd - Mathematics & Quantitative Reasoning",
                                          "Comm QR - Quantitative Reasoning B"])
        tree = body["prereq_tree"]
        self.assertEqual(tree["kind"], "all")
        self.assertEqual([c["kind"] for c in tree["children"]], ["any", "any"])
        self.assertIn({"kind": "course", "course": "ECON 101", "timing": "prior"}, tree["children"][0]["children"])

    def test_missing_credits_and_gen_ed_are_left_out(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            body = self.client.get("/api/catalog/COMP SCI 300").json()
        self.assertNotIn("credits", body)
        self.assertNotIn("gen_ed", body)
        self.assertNotIn("instructor_grades", body)

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


def fose_item(code, no, instr, bldg="", schd="LEC", hours="3", title="Data Structures"):
    """A raw FOSE search row (what ``fose_sections`` returns)."""
    return {
        "code": code, "title": title, "no": no, "crn": f"3{no}", "schd": schd, "instr": instr,
        "meets": "MWF 9:05-9:55a", "bldg": bldg,
        "cart_opts": json.dumps({"credit_hrs": {"options": [{"label": hours}]}}),
    }


REAL_FOSE_RESULTS = search_courses._fose_results
SPRING_2027 = [
    fose_item("CSCI 2270", "100", "K. Nielsen", "ECCR 265", hours="4"),
    fose_item("CSCI 2270", "200", "H. Hu", hours="4"),
    fose_item("CSCI 2270", "210", "", "ECCR 131", schd="REC", hours="0"),
]
FALL_2026 = [fose_item("CSCI 3104", "100", "A. Prof", "MATH 100", title="Algorithms")]


class TestCU(CatalogTestCase):
    settings = CU

    def setUp(self):
        super().setUp()
        search_courses._planner_cache.clear()
        self.terms = {"Spring 2027": SPRING_2027, "Fall 2026": FALL_2026}

        async def sections(subject, semester):
            return [r for r in self.terms.get(semester, []) if r["code"].startswith(subject)]

        # No test reaches FOSE itself.
        self.patches = [
            patch.object(search_courses, "fose_sections", new=AsyncMock(side_effect=sections)),
            patch.object(search_courses, "_fose_results", new=AsyncMock(side_effect=AssertionError("live FOSE"))),
        ]
        self.fose_sections = self.patches[0].start()
        self.patches[1].start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        search_courses._planner_cache.clear()
        super().tearDown()

    def test_keyword_only_query_returns_hint(self):
        response = self.client.get("/api/catalog/search", params={"q": "calculus"})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Search CU courses by subject code, e.g. CSCI")

    def test_subject_search_groups_sections_and_filters_level(self):
        with patch.object(search_courses, "fose_search", new=AsyncMock(return_value=fose_rows())) as fose:
            body = self.client.get("/api/catalog/search", params={"q": "csci", "level": 2000}).json()
        fose.assert_awaited_once_with("CSCI", "Spring 2027")
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CSCI 2270"])
        self.assertEqual(body["courses"][0]["sections"], 2)
        self.assertFalse(body["capabilities"]["seat_filter"])
        self.assertFalse(body["capabilities"]["keyword_search"])

    def test_open_only_is_refused(self):
        response = self.client.get("/api/catalog/search", params={"q": "CSCI", "open_only": True})
        self.assertEqual(response.status_code, 400)

    def test_summary_has_sections_without_seats_and_no_grades(self):
        body = self.client.get("/api/catalog/CSCI 2270").json()
        self.assertEqual(body["sections"]["term"], "Spring 2027")
        self.assertFalse(body["sections"]["seats_published"])
        self.assertIsNone(body["sections"]["seats_open"])
        self.assertEqual(body["instructors"], ["K. Nielsen", "H. Hu"])
        self.assertIsNone(body["difficulty"])  # no grade data at CU
        for missing in ("grades", "prerequisites", "next_courses"):
            self.assertNotIn(missing, body)
            self.assertFalse(body["capabilities"][missing])

    def test_summary_keeps_bldg_and_credits(self):
        body = self.client.get("/api/catalog/CSCI 2270").json()
        rows = body["sections"]["rows"]
        self.assertEqual([r.get("bldg") for r in rows], ["ECCR 265", None])  # lectures only
        self.assertEqual([r["instructors"] for r in rows], ["K. Nielsen", "H. Hu"])
        self.assertEqual(body["credits"], {"min": 4.0, "max": 4.0})
        for missing in ("gen_ed", "prereq_tree", "grade_history", "instructor_grades"):
            self.assertNotIn(missing, body)
        # The summary and the facts read share one cached FOSE read.
        self.assertEqual({c.args for c in self.fose_sections.await_args_list}, {("CSCI", "Spring 2027")})

    def test_section_rows_carry_parsed_times_and_no_waitlist(self):
        times = [{"meet_day": "1", "start_time": "930", "end_time": "1045"},
                 {"meet_day": "3", "start_time": "930", "end_time": "1045"}]
        self.terms = {"Spring 2027": [{**fose_item("CSCI 2270", "100", "K. Nielsen"),
                                       "meetingTimes": json.dumps(times)}]}
        row = self.client.get("/api/catalog/CSCI 2270").json()["sections"]["rows"][0]
        self.assertEqual(row["meeting_times"], [
            {"day": "Tu", "start": "09:30", "end": "10:45"}, {"day": "Th", "start": "09:30", "end": "10:45"},
        ])
        self.assertEqual(row["instructors"], "K. Nielsen")
        self.assertNotIn("waitlist", row)  # FOSE publishes no waitlists

    def test_summary_term_comes_from_the_planner_not_a_constant(self):
        use_settings({**CU, "planner": {"terms": ["Fall 2026"]}})
        self.terms = {"Fall 2026": SPRING_2027}
        body = self.client.get("/api/catalog/CSCI 2270").json()
        self.assertEqual(body["sections"]["term"], "Fall 2026")

    def test_course_not_offered_next_term_shows_its_latest_term(self):
        body = self.client.get("/api/catalog/CSCI 3104").json()
        self.assertEqual(body["sections"]["term"], "Fall 2026")
        self.assertEqual(body["sections"]["rows"][0]["bldg"], "MATH 100")

    def test_search_reads_the_next_term(self):
        with patch.object(search_courses, "_fose_results", new=AsyncMock(return_value=SPRING_2027)) as raw:
            body = self.client.get("/api/catalog/search", params={"q": "CSCI"}).json()
        self.assertEqual(raw.await_args.args, ("CSCI", "Spring 2027"))
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CSCI 2270"])

    def fose_by_term(self, terms):
        async def raw(subject, semester):
            return [r for r in terms.get(semester, []) if r["code"].startswith(subject)]

        return patch.object(search_courses, "_fose_results", new=AsyncMock(side_effect=raw))

    def test_search_falls_back_when_the_next_term_is_empty(self):
        with self.fose_by_term({"Fall 2026": FALL_2026}) as raw:
            body = self.client.get("/api/catalog/search", params={"q": "CSCI"}).json()
        self.assertEqual([c.args for c in raw.await_args_list], [("CSCI", "Spring 2027"), ("CSCI", "Fall 2026")])
        self.assertEqual([c["identifier"] for c in body["courses"]], ["CSCI 3104"])
        self.assertEqual(body["courses"][0].get("level"), 3000)

    def test_chat_tool_falls_back_only_without_a_semester(self):
        with self.fose_by_term({"Fall 2026": FALL_2026}) as raw:
            result = asyncio.run(search_courses.execute(subject="csci"))
        self.assertEqual([c["course_code"] for c in result["courses"]], ["CSCI 3104"])
        self.assertEqual(result["query"]["semester"], "Fall 2026")
        self.assertEqual(raw.await_count, 2)
        with self.fose_by_term({"Fall 2026": FALL_2026}) as raw:
            result = asyncio.run(search_courses.execute(subject="csci", semester="Spring 2027"))
        self.assertEqual(result["courses"], [])
        self.assertEqual(raw.await_count, 1)

    def test_co_taught_sections_list_each_instructor(self):
        self.terms = {"Spring 2027": [fose_item("CSCI 2270", "100", "A. One, B. Two"),
                                      fose_item("CSCI 2270", "200", "B. Two")]}
        body = self.client.get("/api/catalog/CSCI 2270").json()
        self.assertEqual(body["instructors"], ["A. One", "B. Two"])
        rows = [search_courses.row_to_course(item, "Spring 2027") for item in self.terms["Spring 2027"]]
        self.assertEqual(academics._fose_courses(rows, "2270", "")[0]["instructors"], ["A. One", "B. Two"])

    def test_unknown_course_is_404(self):
        self.assertEqual(self.client.get("/api/catalog/CSCI 9999").status_code, 404)

    def test_fose_outage_is_502(self):
        response = MagicMock(status_code=503)
        client = MagicMock()
        client.__aenter__ = AsyncMock(return_value=client)
        client.__aexit__ = AsyncMock(return_value=False)
        client.post = AsyncMock(return_value=response)
        with patch.object(search_courses.httpx, "AsyncClient", return_value=client), \
                patch.object(search_courses, "_fose_results", new=REAL_FOSE_RESULTS):
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
        # Prerequisites come from the description; CS 2100's names none.
        self.assertEqual(body["prerequisites"], {"text": "", "courses": []})
        self.assertNotIn("prereq_chain", body)
        self.assertNotIn("next_courses", body)

    def test_per_instructor_grades_and_history(self):
        body = self.client.get("/api/catalog/CS 2100").json()
        self.assertEqual(body["instructor_grades"], [{"name": "Briana Morrison", "gpa": 3.25, "students": 200}])
        self.assertEqual([h["term"] for h in body["grade_history"]], ["Fall 2025", "Spring 2026"])
        self.assertEqual(body["grade_history"][1]["pct_df"], 10.0)
        self.assertEqual(body["credits"], {"min": 4.0, "max": 4.0})
        self.assertEqual(body["sections"]["rows"][0]["instructors"], "Briana Morrison")
        self.assertNotIn("prereq_tree", body)
        self.assertNotIn("bldg", body["sections"]["rows"][0])

    def test_grade_buckets_keep_uva_scale(self):
        body = self.client.get("/api/catalog/CS 2100").json()
        labels = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "DFW"]
        for figure in (body["grades"], body["cumulative"]):
            self.assertEqual([b["label"] for b in figure["buckets"]], labels)
            self.assertEqual([b["key"] for b in figure["buckets"]], labels)
            self.assertEqual(list(figure["distribution"]), labels)

    def test_section_rows_carry_times_instructor_and_waitlist(self):
        body = self.client.get("/api/catalog/CS 2100").json()
        lecture, lab = body["sections"]["rows"]
        self.assertEqual(lecture["meeting_times"], [
            {"day": "Mo", "start": "10:00", "end": "10:50"},
            {"day": "We", "start": "10:00", "end": "10:50"},
            {"day": "Fr", "start": "10:00", "end": "10:50"},
        ])
        self.assertEqual((lecture["instructors"], lecture["waitlist"]), ("Briana Morrison", 0))
        self.assertEqual((lab["instructors"], lab["waitlist"]), ("Ana Lab", 5))
        # Snapshot rows stay dated (R8).
        self.assertEqual((body["as_of"], body["sections"]["as_of"]), ("2026-09-03", "2026-09-03"))

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


class TestSectionIds(unittest.TestCase):
    """Catalog section rows carry the id the planner's pick_section op expects."""

    def test_uva_rows_use_the_class_number(self):
        from app.sources.academics import _section_row
        row = _section_row({"id": "12345", "section": "001", "type": "Lecture"})
        self.assertEqual(row["id"], "12345")
        self.assertEqual(row["section"], "001")

    def test_cu_rows_use_the_crn(self):
        from app.sources.academics import _section_row
        self.assertEqual(_section_row({"crn": "40123", "section": "010"})["id"], "40123")

    def test_uw_rows_fall_back_to_the_section_number(self):
        from app.sources.academics import _section_row
        self.assertEqual(_section_row({"section": "001"})["id"], "001")
