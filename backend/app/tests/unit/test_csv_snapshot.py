"""Tests for the csv_snapshot academics provider (UVA via theCourseForum)."""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

import app.config
from app.api.visuals import build_visuals
from app.config import load_settings
from app.core.improved_orchestrator import _tool_guidance_prompt
from app.sources import cache, csv_snapshot
from app.tools import course_grades, course_next, course_prerequisites, course_search, course_sections

SECTIONS_URL = "https://raw.githubusercontent.com/org/repo/HEAD/semester_data/2026_fall.csv"
GRADES_URLS = [
    "https://raw.githubusercontent.com/org/repo/HEAD/grade_data/2026_spring.csv",
    "https://raw.githubusercontent.com/org/repo/HEAD/grade_data/2025_fall.csv",
]

SECTIONS_CSV = (
    "ClassNumber,Mnemonic,Number,Section,Type,Units,Instructor1,Days1,Room1,MeetingDates1,"
    "Instructor2,Days2,Room2,MeetingDates2,Instructor3,Days3,Room3,MeetingDates3,"
    "Instructor4,Days4,Room4,MeetingDates4,Title,Topic,Status,Enrollment,EnrollmentLimit,"
    "Waitlist,WaitlistLimit,Description,Disciplines,Cost\n"
    "1,CS,2100,001,Lecture,4,Briana Morrison,mowefr 10:00am - 10:50am,***,08/25/2026 - 12/08/2026,"
    ",,,,,,,,,,,,Data Structures and Algorithms 1,,Open,180,200,0,50,"
    "\"Introduces fundamental data structures.\",,\n"
    "2,CS,2100,101,Laboratory,0,Ana Lab,tu 2:00pm - 3:15pm,***,08/25/2026 - 12/08/2026,"
    ",,,,,,,,,,,,Data Structures and Algorithms 1,,Wait List,40,40,5,10,"
    "\"Introduces fundamental data structures.\",,\n"
    "3,CS,4774,001,Lecture,3,Ada Lovelace,tuth 3:30pm - 4:45pm,***,08/25/2026 - 12/08/2026,"
    ",,,,,,,,,,,,Machine Learning,,Open,90,120,0,20,\"Supervised and unsupervised learning.\",,\n"
)

GRADES_HEADER = (
    "Term Desc,Subject,Catalog Number,Class Title,Course ID,Primary Instructor Name,"
    "Class Section,Class Num,Class Academic Group,Course GPA,# of Students,"
    "A+,A,A-,B+,B,B-,C+,C,C-,DFW\n"
)
GRADES = {
    GRADES_URLS[0]: GRADES_HEADER
    + "2026 Spring,CS,2100,DSA 1,,\"Morrison,Briana\",001,1,Eng,3.0,100,10,20,10,20,20,10,0,0,0,10\n",
    GRADES_URLS[1]: GRADES_HEADER
    + "2025 Fall,CS,2100,DSA 1,,\"Morrison,Briana\",001,2,Eng,3.5,100,20,40,10,10,10,0,0,0,0,10\n",
}


GRADES_AS_OF = {GRADES_URLS[0]: "2026-07-02", GRADES_URLS[1]: "2026-02-15"}


def fake_download(url, with_commit_date=False):
    if url == SECTIONS_URL:
        return SECTIONS_CSV, "2026-09-03"
    if url in GRADES:
        return GRADES[url], GRADES_AS_OF[url]
    raise RuntimeError(f"unexpected url {url}")


class SnapshotTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = None
        csv_snapshot._tables.clear()
        self.tmp = tempfile.TemporaryDirectory()
        cfg = Path(self.tmp.name) / "school.yaml"
        cfg.write_text(yaml.safe_dump({
            "school": {"slug": "uva", "timezone": "America/New_York"},
            "mongodb": {"database_name": "uva_advisor"},
            "rag": {"chroma_collection": "uva_docs"},
            "academics": {
                "provider": "csv_snapshot",
                "snapshot": {
                    "source_name": "theCourseForum",
                    "sections_url": SECTIONS_URL,
                    "grades_urls": GRADES_URLS,
                },
            },
            "tools": {name: {"enabled": True} for name in ("course_search", "course_grades", "course_sections")},
        }))
        load_settings(str(cfg))
        self.patches = [
            patch.object(cache, "CACHE_DIR", Path(self.tmp.name) / "cache"),
            patch.object(cache, "_download", side_effect=fake_download),
            patch.dict(os.environ, {"SOURCES_OFFLINE": ""}),
        ]
        self.download = self.patches[1].start()
        for p in (self.patches[0], self.patches[2]):
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        csv_snapshot._tables.clear()
        app.config._settings = None


class TestSearch(SnapshotTestCase):
    async def test_subject_and_number(self):
        result = await course_search.execute(subject="cs", course_number="2100")
        self.assertEqual([c["identifier"] for c in result["courses"]], ["CS 2100"])
        course = result["courses"][0]
        self.assertEqual(course["title"], "Data Structures and Algorithms 1")
        self.assertEqual(course["data_as_of"], "2026-09-03")
        self.assertIn("historical", course["data_note"])

    async def test_keyword_matches_title_and_description(self):
        result = await course_search.execute(keyword="machine learning")
        self.assertEqual([c["identifier"] for c in result["courses"]], ["CS 4774"])
        result = await course_search.execute(keyword="unsupervised")
        self.assertEqual([c["identifier"] for c in result["courses"]], ["CS 4774"])


class TestGrades(SnapshotTestCase):
    async def test_aggregates_terms_weighted_by_students(self):
        result = await course_grades.execute(course_identifier="CS 2100")
        self.assertEqual(result["course_identifier"], "CS 2100")
        self.assertEqual(result["cumulative"]["total"], 200)
        self.assertEqual(result["cumulative"]["average_gpa"], 3.25)
        self.assertEqual(result["cumulative"]["dfw_rate"], 0.1)
        self.assertEqual([t["term_code"] for t in result["terms"]], ["2026 Spring", "2025 Fall"])
        # Dated by the newest grades file read, not by the sections file.
        self.assertEqual(result["data_as_of"], "2026-07-02")

    async def test_one_missing_grades_file_keeps_the_others(self):
        def flaky(url, with_commit_date=False):
            if url == GRADES_URLS[0]:
                raise RuntimeError("404")
            return fake_download(url, with_commit_date)

        self.download.side_effect = flaky
        result = await course_grades.execute(course_identifier="CS 2100")
        self.assertEqual([t["term_code"] for t in result["terms"]], ["2025 Fall"])
        self.assertEqual(result["data_as_of"], "2026-02-15")
        self.assertEqual(len(result["partial_failure"]), 1)

    async def test_grades_do_not_need_the_sections_file(self):
        def no_sections(url, with_commit_date=False):
            if url == SECTIONS_URL:
                raise RuntimeError("sections down")
            return fake_download(url, with_commit_date)

        self.download.side_effect = no_sections
        result = await course_grades.execute(course_identifier="CS 2100")
        self.assertEqual(result["cumulative"]["total"], 200)

    async def test_unknown_course(self):
        result = await course_grades.execute(course_identifier="CS 9999")
        self.assertIsNone(result["grades"])
        self.assertIn("error", result)

    def test_terms_sort_chronologically(self):
        labels = ["2025 Spring", "2025 Fall", "2026 January", "2024 Fall"]
        self.assertEqual(
            sorted(labels, key=csv_snapshot._term_order),
            ["2024 Fall", "2025 Spring", "2025 Fall", "2026 January"],
        )


class TestSections(SnapshotTestCase):
    async def test_counts_are_labeled_as_snapshot(self):
        result = await course_sections.execute(course_identifier="CS 2100")
        self.assertEqual(len(result["sections"]), 2)
        lab = result["sections"][1]
        self.assertEqual(lab["type"], "Laboratory")
        self.assertEqual(lab["status_at_snapshot"], "Wait List")
        self.assertEqual(lab["waitlist_at_snapshot"], 5)
        self.assertNotIn("is_open", lab)
        self.assertEqual(result["data_as_of"], "2026-09-03")


class TestUnsupported(SnapshotTestCase):
    async def test_prerequisites_and_next_say_not_available(self):
        prereq = await course_prerequisites.execute(course_identifier="CS 2100")
        nxt = await course_next.execute(course_identifier="CS 2100")
        self.assertIn("does not include", prereq["error"])
        self.assertIn("does not include", nxt["error"])


class TestCaching(SnapshotTestCase):
    async def test_failed_refresh_serves_last_good_copy(self):
        await course_search.execute(subject="CS", course_number="2100")
        csv_snapshot._tables.clear()
        self.download.side_effect = RuntimeError("github down")
        with patch.object(app.config.get_settings().academics.snapshot, "refresh_hours", 0):
            result = await course_search.execute(subject="CS", course_number="2100")
        self.assertEqual(result["courses"][0]["data_as_of"], "2026-09-03")

    async def test_offline_without_cache_reports_error(self):
        with patch.dict(os.environ, {"SOURCES_OFFLINE": "1"}):
            result = await course_search.execute(subject="CS", course_number="2100")
        self.assertEqual(result["courses"], [])
        self.assertIn("SOURCES_OFFLINE", result["error"])


class TestNoUWCardsOrLinks(SnapshotTestCase):
    async def test_snapshot_results_produce_no_course_cards(self):
        result = await course_grades.execute(course_identifier="CS 2100")
        self.assertEqual(build_visuals([{"name": "course_grades", "result": result}]), [])

    def test_prompt_has_age_guidance_and_no_course_links(self):
        prompt = _tool_guidance_prompt(["course_grades"], "University of Virginia", link_courses=False)
        self.assertNotIn("course:", prompt)
        self.assertIn("how old the data is", prompt)


if __name__ == "__main__":
    unittest.main()
