"""Planner course facts from each academics provider (no network)."""

import json
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import AsyncMock, patch

import yaml

import app.config
from app.config import load_settings
from app.planner.facts import Meeting, PrereqNode
from app.sources import academics, cache, csv_snapshot
from app.tools import _uw_source, search_courses

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "uw_coursemap"
# Trimmed from the live https://uwcourses.com/courses/ECON_310.json payload
# (October 2026): requirements "(ECON 101, 102, or 111) and (MATH 211, 217,
# or 221)", with MATH 217 sent as a bare-number condition.
ECON_310 = json.loads((FIXTURES / "ECON_310.json").read_text())


class SchoolTestCase(unittest.IsolatedAsyncioTestCase):
    """Loads a throwaway school pack; subclasses say what's in it."""

    academics_config: dict = {}
    planner_config: dict = {}
    tools_config: dict = {}

    def setUp(self):
        app.config._settings = None
        self.tmp = tempfile.TemporaryDirectory()
        cfg = Path(self.tmp.name) / "school.yaml"
        cfg.write_text(yaml.safe_dump({
            "school": {"slug": "test", "timezone": "America/New_York"},
            "mongodb": {"database_name": "test_advisor"},
            "rag": {"chroma_collection": "test_docs"},
            "academics": self.academics_config,
            "planner": self.planner_config,
            "tools": self.tools_config,
        }))
        load_settings(str(cfg))
        _uw_source._cache.clear()
        search_courses._planner_cache.clear()
        for table in (csv_snapshot._tables, csv_snapshot._indexes, csv_snapshot._grade_stats):
            table.clear()

    def tearDown(self):
        self.tmp.cleanup()
        app.config._settings = None
        for table in (csv_snapshot._tables, csv_snapshot._indexes, csv_snapshot._grade_stats):
            table.clear()


# ---------------------------------------------------------------------------
# UW (Course Map)
# ---------------------------------------------------------------------------

def coursemap(pages):
    async def fetch(path, *, params=None, optional=False):
        if path in pages:
            return pages[path]
        if optional:
            return None
        raise FileNotFoundError(path)

    return fetch


class TestUWFacts(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    planner_config = {"harder_below_gpa": 3.4, "terms": ["Fall 2026", "Spring 2027", "Summer 2027"]}

    async def facts(self, *ids, term="Spring 2027", fetch=None):
        fetch = fetch or coursemap({"/courses/ECON_310.json": ECON_310})
        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            return await academics.course_facts(list(ids), term)

    async def test_prerequisite_tree_is_all_of_two_any_of_groups(self):
        facts = (await self.facts("ECON 310"))["ECON 310"]
        self.assertTrue(facts.prereq_known)
        tree = facts.prereq_tree
        self.assertEqual(tree.kind, "all")
        self.assertEqual([g.kind for g in tree.children], ["any", "any"])
        self.assertEqual(
            [[c.course for c in g.children] for g in tree.children],
            [["ECON 101", "ECON 102", "ECON 111"], ["MATH 211", "MATH 217", "MATH 221"]],
        )
        self.assertEqual({c.timing for g in tree.children for c in g.children}, {"prior"})

    async def test_credits_gen_ed_grades_and_sections(self):
        facts = (await self.facts("econ 310"))["econ 310"]  # keyed as passed
        self.assertEqual(facts.known, "yes")
        self.assertEqual(facts.identifier, "ECON 310")
        self.assertEqual(facts.title, "Statistics: Measurement in Economics")
        self.assertEqual(facts.credits, (4.0, 4.0))
        self.assertEqual(facts.gen_ed, [
            "Core GenEd - Mathematics & Quantitative Reasoning",
            "Comm QR - Quantitative Reasoning B",
        ])
        self.assertEqual(facts.avg_gpa, 3.1)
        self.assertTrue(facts.harder)
        self.assertEqual(facts.offered, "yes")
        self.assertEqual([(s.id, s.kind) for s in facts.sections], [("001", "lecture"), ("306", "lab"), ("301", "lab")])
        self.assertEqual({s.meetings for s in facts.sections}, {None})
        self.assertEqual(facts.sections[0].seats_open, 144)
        self.assertFalse(facts.bundles_known)
        self.assertEqual(facts.as_of, "2026-10-14")

    async def test_offered_no_in_a_covered_term_unknown_beyond(self):
        facts = await self.facts("ECON 310", term="summer 2027")
        self.assertEqual(facts["ECON 310"].offered, "no")
        self.assertEqual(facts["ECON 310"].sections, [])
        facts = await self.facts("ECON 310", term="Fall 2027")
        self.assertEqual(facts["ECON 310"].offered, "unknown")
        self.assertIsNone(facts["ECON 310"].sections)

    async def test_unlocks_come_from_course_map_following(self):
        self.assertEqual((await self.facts("ECON 310"))["ECON 310"].unlocks, ())  # listed, none
        page = {"data": dict(ECON_310["data"], following=[
            {"code": "ECON  410", "title": "INTERMEDIATE ECONOMETRICS"}, {"title": "no code"}])}
        facts = (await self.facts("ECON 310", fetch=coursemap({"/courses/ECON_310.json": page})))["ECON 310"]
        self.assertEqual([(u.course, u.title) for u in facts.unlocks], [("ECON 410", "Intermediate Econometrics")])

    async def test_outage_reads_unavailable(self):
        async def down(path, *, params=None, optional=False):
            raise RuntimeError("Course Map unavailable: timeout")

        facts = (await self.facts("ECON 310", fetch=down))["ECON 310"]
        self.assertEqual(facts.known, "unavailable")
        self.assertEqual(facts.unavailable_reason, "Course Map didn't answer")

    async def test_missing_course_reads_no(self):
        facts = await self.facts("ECON 310", "ECON 999")
        self.assertEqual(facts["ECON 999"].known, "no")
        self.assertEqual(facts["ECON 310"].known, "yes")

    async def test_flat_prerequisites_are_unchanged(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=coursemap({"/courses/ECON_310.json": ECON_310})):
            result = await _uw_source.prerequisites(course_identifier="ECON 310")
        # MATH 217 is a condition upstream, so the flat list (R5) leaves it out.
        self.assertEqual(
            [p["identifier"] for p in result["prerequisites"]],
            ["ECON 101", "ECON 102", "ECON 111", "MATH 211", "MATH 221"],
        )
        self.assertNotIn("prerequisite_tree", result)


class TestPrerequisiteTree(unittest.TestCase):
    def test_exclusions_and_unreadable_conditions_become_notes(self):
        requirements = {"root": "r", "nodes": [
            {"id": "r", "kind": "all", "children": ["any", "not"]},
            {"id": "any", "kind": "any", "children": ["cs", "standing"]},
            {"id": "cs", "kind": "course", "course": {
                "subjects": ["COMPSCI"], "course_number": 300, "minimum_grade": "C", "timing": "concurrent_allowed"}},
            {"id": "standing", "kind": "condition", "condition": "graduate/professional standing"},
            {"id": "not", "kind": "not", "children": ["chem"]},
            {"id": "chem", "kind": "course", "course": {"subjects": ["CHEM"], "course_number": 109}},
        ]}
        tree, notes = _uw_source.prerequisite_tree(requirements)
        self.assertEqual(tree, PrereqNode(kind="course", course="COMPSCI 300", minimum_grade="C", timing="concurrent"))
        self.assertEqual(notes, [
            "Not checked: graduate/professional standing",
            "Not open to students with credit for CHEM 109",
        ])

    def test_no_nodes_no_tree(self):
        self.assertEqual(_uw_source.prerequisite_tree({}), (None, []))


# ---------------------------------------------------------------------------
# UVA (theCourseForum snapshot)
# ---------------------------------------------------------------------------

BASE = "https://raw.githubusercontent.com/org/repo/HEAD"
FALL_URL = f"{BASE}/semester_data/2026_fall.csv"
SPRING_URL = f"{BASE}/semester_data/2027_spring.csv"
GRADES_URL = f"{BASE}/grade_data/2026_spring.csv"

SECTIONS_HEADER = (
    "ClassNumber,Mnemonic,Number,Section,Type,Units,Instructor1,Days1,Room1,MeetingDates1,"
    "Instructor2,Days2,Room2,MeetingDates2,Instructor3,Days3,Room3,MeetingDates3,"
    "Instructor4,Days4,Room4,MeetingDates4,Title,Topic,Status,Enrollment,EnrollmentLimit,"
    "Waitlist,WaitlistLimit,Description,Disciplines,Cost\n"
)


def section(number, course, sec, kind, units, days, title, disciplines="", days2=""):
    subject, num = course.split()
    return (
        f"{number},{subject},{num},{sec},{kind},{units},Prof,{days},Room,01/20/2027 - 05/04/2027,"
        f",{days2},,,,,,,,,,,\"{title}\",,Open,10,30,0,0,Desc,\"{disciplines}\",\n"
    )


FALL_CSV = SECTIONS_HEADER + (
    section(1, "ECON 2010", "001", "Lecture", "3", "mowe 9:00am - 9:50am", "Microeconomics (fall)")
    + section(2, "CS 4774", "001", "Lecture", "3", "tuth 3:30pm - 4:45pm", "Machine Learning")
)
SPRING_CSV = SECTIONS_HEADER + (
    section(10773, "ECON 2010", "001", "Lecture", "3", "mowe 9:00am - 9:50am", "Microeconomics",
            "Social & Economic Systems$Chemical, Mathematical, and Physical Universe")
    + section(10927, "ECON 2010", "101", "Discussion", "0", "th 7:00pm - 7:50pm", "Microeconomics",
              "Social & Economic Systems")
    + section(10928, "ECON 2010", "102", "Discussion", "0", "tba", "Microeconomics")
    + section(20001, "ECON 4995", "001", "IND", "1 - 12", "tba", "Independent Study")
    + section(20002, "CS 2100", "001", "Lecture", "4", "tuth 12:30pm - 1:45pm", "DSA 1",
              days2="fr 2:00pm - 3:15pm")
)
GRADES_CSV = (
    "Term Desc,Subject,Catalog Number,Class Title,Course ID,Primary Instructor Name,"
    "Class Section,Class Num,Class Academic Group,Course GPA,# of Students,"
    "A+,A,A-,B+,B,B-,C+,C,C-,DFW\n"
    "2026 Spring,ECON,2010,Micro,,P,001,1,A,2.9,100,0,0,0,0,0,0,0,0,0,0\n"
    "2026 Spring,CS,2100,DSA 1,,P,001,2,E,3.3,100,0,0,0,0,0,0,0,0,0,0\n"
    "2026 Spring,CS,4774,ML,,P,001,3,E,3.7,100,0,0,0,0,0,0,0,0,0,0\n"
    "2026 Spring,HIST,1501,Old History,,P,001,4,A,3.9,20,0,0,0,0,0,0,0,0,0,0\n"
)
FILES = {FALL_URL: FALL_CSV, SPRING_URL: SPRING_CSV, GRADES_URL: GRADES_CSV}


def fake_download(url, with_commit_date=False):
    if url in FILES:
        return FILES[url], "2026-10-11" if url == SPRING_URL else "2026-09-01"
    raise RuntimeError(f"unexpected url {url}")


class SnapshotFactsCase(SchoolTestCase):
    academics_config = {
        "provider": "csv_snapshot",
        "snapshot": {
            "source_name": "theCourseForum",
            "sections_url": FALL_URL,
            "sections_by_term": {"Spring 2027": SPRING_URL},
            "grades_urls": [GRADES_URL],
        },
    }
    tools_config = {name: {"enabled": True} for name in ("course_search", "course_grades", "course_sections")}

    def setUp(self):
        super().setUp()
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
        super().tearDown()


class TestUVAFacts(SnapshotFactsCase):
    async def test_terms_include_sections_url(self):
        self.assertEqual(academics.planner_terms(), ["Fall 2026", "Spring 2027"])
        self.assertEqual(academics.next_term(today=date(2026, 10, 28)), "Spring 2027")
        self.assertEqual(academics.next_term(today=date(2026, 3, 1)), "Fall 2026")

    async def test_spring_lookup_uses_the_spring_file(self):
        facts = (await academics.course_facts(["ECON 2010"], "Spring 2027"))["ECON 2010"]
        self.assertEqual(facts.title, "Microeconomics")
        self.assertEqual(facts.as_of, "2026-10-11")
        self.assertEqual([s.id for s in facts.sections], ["10773", "10927", "10928"])
        fall = (await academics.course_facts(["ECON 2010"], "Fall 2026"))["ECON 2010"]
        self.assertEqual(fall.title, "Microeconomics (fall)")

    async def test_lecture_and_discussion_bundle(self):
        facts = (await academics.course_facts(["ECON 2010"], "Spring 2027"))["ECON 2010"]
        self.assertTrue(facts.bundles_known)
        lecture, discussion, tba = facts.sections
        self.assertEqual((lecture.kind, lecture.requires), ("lecture", ("discussion",)))
        self.assertEqual((discussion.kind, discussion.requires), ("discussion", ("lecture",)))
        self.assertEqual(discussion.meetings, (Meeting("Th", "19:00", "19:50"),))
        self.assertIsNone(tba.meetings)  # "tba": times not published
        self.assertEqual(lecture.seats_open, 20)
        # Zero-unit discussions don't change the course's credits.
        self.assertEqual(facts.credits, (3.0, 3.0))

    async def test_disciplines_split_on_dollar(self):
        facts = (await academics.course_facts(["ECON 2010"], "Spring 2027"))["ECON 2010"]
        self.assertEqual(facts.gen_ed, ["Social & Economic Systems", "Chemical, Mathematical, and Physical Universe"])
        cs = (await academics.course_facts(["CS 2100"], "Spring 2027"))["CS 2100"]
        self.assertIsNone(cs.gen_ed)  # no Disciplines: unknown, not "none"

    async def test_range_units_and_several_meetings(self):
        facts = await academics.course_facts(["ECON 4995", "CS 2100"], "Spring 2027")
        self.assertEqual(facts["ECON 4995"].credits, (1.0, 12.0))
        self.assertEqual(facts["ECON 4995"].sections[0].kind, "other")
        self.assertEqual(facts["CS 2100"].sections[0].meetings, (
            Meeting("Tu", "12:30", "13:45"), Meeting("Th", "12:30", "13:45"), Meeting("Fr", "14:00", "15:15"),
        ))
        self.assertEqual(facts["CS 2100"].sections[0].requires, ())

    async def test_missing_from_term_reads_not_offered(self):
        facts = await academics.course_facts(["CS 4774", "HIST 1501", "ZZZ 1000"], "Spring 2027")
        self.assertEqual((facts["CS 4774"].known, facts["CS 4774"].offered), ("yes", "no"))
        self.assertEqual(facts["CS 4774"].sections, [])
        self.assertEqual(facts["CS 4774"].title, "Machine Learning")
        # Known from the grades file alone.
        self.assertEqual((facts["HIST 1501"].known, facts["HIST 1501"].offered), ("yes", "no"))
        self.assertEqual(facts["HIST 1501"].title, "Old History")
        self.assertEqual(facts["ZZZ 1000"].known, "no")
        self.assertFalse(facts["CS 4774"].prereq_known)
        self.assertIsNone(facts["CS 4774"].prereq_tree)

    async def test_harder_is_the_snapshot_hardest_third(self):
        facts = await academics.course_facts(["ECON 2010", "CS 2100", "CS 4774"], "Spring 2027")
        self.assertEqual(facts["ECON 2010"].avg_gpa, 2.9)
        self.assertEqual(
            [facts[c].harder for c in ("ECON 2010", "CS 2100", "CS 4774")], [True, False, False]
        )

    async def test_term_without_a_file_is_unknown(self):
        facts = (await academics.course_facts(["ECON 2010"], "Fall 2027"))["ECON 2010"]
        self.assertEqual((facts.known, facts.offered), ("yes", "unknown"))
        self.assertIsNone(facts.sections)

    async def test_failed_file_never_reads_missing(self):
        def spring_down(url, with_commit_date=False):
            if url == SPRING_URL:
                raise RuntimeError("503")
            return fake_download(url, with_commit_date)

        self.download.side_effect = spring_down
        facts = await academics.course_facts(["ECON 2010", "ZZZ 1000"], "Spring 2027")
        self.assertEqual((facts["ECON 2010"].known, facts["ECON 2010"].offered), ("yes", "unknown"))
        self.assertEqual(facts["ZZZ 1000"].known, "unavailable")


class TestUVAConfiguredCutoff(SnapshotFactsCase):
    planner_config = {"harder_below_gpa": 3.5}

    async def test_configured_cutoff_wins(self):
        facts = await academics.course_facts(["CS 2100", "CS 4774"], "Spring 2027")
        self.assertEqual([facts["CS 2100"].harder, facts["CS 4774"].harder], [True, False])


class TestSnapshotParsing(unittest.TestCase):
    def test_meetings(self):
        self.assertEqual(csv_snapshot.parse_meetings("tuth 12:30pm - 1:45pm"), [
            Meeting("Tu", "12:30", "13:45"), Meeting("Th", "12:30", "13:45"),
        ])
        self.assertEqual(csv_snapshot.parse_meetings("mowefr 12:00pm - 12:50pm")[2], Meeting("Fr", "12:00", "12:50"))
        self.assertEqual(csv_snapshot.parse_meetings("mo 8:45am - 10:15am"), [Meeting("Mo", "08:45", "10:15")])
        self.assertEqual(csv_snapshot.parse_meetings("tba"), [])
        self.assertEqual(csv_snapshot.parse_meetings(""), [])

    def test_units(self):
        self.assertEqual(csv_snapshot.parse_units("3"), (3.0, 3.0))
        self.assertEqual(csv_snapshot.parse_units("1 - 12"), (1.0, 12.0))
        self.assertEqual(csv_snapshot.parse_units("1.5 - 3"), (1.5, 3.0))
        self.assertIsNone(csv_snapshot.parse_units(""))


# ---------------------------------------------------------------------------
# CU (FOSE)
# ---------------------------------------------------------------------------

def fose_row(code, crn, schd, meetings, hours="3", title="Data Structures"):
    return {
        "code": code, "title": title, "crn": crn, "no": "100", "schd": schd,
        "meetingTimes": json.dumps([
            {"meet_day": str(day), "start_time": start, "end_time": end} for day, start, end in meetings
        ]),
        "cart_opts": json.dumps({"credit_hrs": {"options": [{"label": hours}]}}),
    }


SPRING_ROWS = [
    fose_row("CSCI 2270", "31482", "LEC", [(0, "1325", "1415"), (2, "1325", "1415")], hours="4"),
    fose_row("CSCI 2270", "31483", "REC", [(3, "930", "1045")], hours="0"),
]
FALL_ROWS = SPRING_ROWS + [fose_row("CSCI 3104", "40000", "LEC", [(1, "1100", "1215")], title="Algorithms")]


class TestCUFacts(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    tools_config = {"search_courses": {"enabled": True}}
    planner_config = {"terms": ["Fall 2026", "Spring 2027"]}

    async def facts(self, ids, term="Spring 2027", rows=None):
        rows = rows or {"Spring 2027": SPRING_ROWS, "Fall 2026": FALL_ROWS}

        async def sections(subject, semester):
            value = rows.get(semester, [])
            if isinstance(value, Exception):
                raise value
            return [r for r in value if r["code"].startswith(subject)]

        with patch.object(search_courses, "fose_sections", new=AsyncMock(side_effect=sections)) as mock:
            self.fose = mock
            return await academics.course_facts(ids, term)

    async def test_all_rows_with_meetings_and_bundles(self):
        facts = (await self.facts(["csci 2270"]))["csci 2270"]
        self.assertEqual((facts.known, facts.offered, facts.identifier), ("yes", "yes", "CSCI 2270"))
        self.assertEqual(facts.credits, (4.0, 4.0))
        lecture, recitation = facts.sections
        self.assertEqual(lecture.meetings, (Meeting("Mo", "13:25", "14:15"), Meeting("We", "13:25", "14:15")))
        self.assertEqual((recitation.kind, recitation.meetings), ("discussion", (Meeting("Th", "09:30", "10:45"),)))
        self.assertEqual(lecture.requires, ("discussion",))
        self.assertTrue(facts.bundles_known)
        self.assertIsNone(facts.gen_ed)
        self.assertIsNone(facts.avg_gpa)
        self.assertFalse(facts.prereq_known)

    async def test_section_instructor_from_fose(self):
        rows = [dict(SPRING_ROWS[0], instr="A. Prof"), dict(SPRING_ROWS[1], instr="Staff")]
        facts = (await self.facts(["CSCI 2270"], rows={"Spring 2027": rows, "Fall 2026": FALL_ROWS}))["CSCI 2270"]
        self.assertEqual([s.instructor for s in facts.sections], ["A. Prof", None])
        self.assertIsNone(facts.unlocks)  # FOSE publishes no prerequisites

    async def test_missing_from_term_reads_not_offered(self):
        facts = await self.facts(["CSCI 3104", "CSCI 9999"])
        self.assertEqual((facts["CSCI 3104"].known, facts["CSCI 3104"].offered), ("yes", "no"))
        self.assertEqual(facts["CSCI 3104"].title, "Algorithms")
        self.assertEqual(facts["CSCI 3104"].sections, [])
        # Listed in no covered term: identity unconfirmed, still not "not found".
        self.assertEqual((facts["CSCI 9999"].known, facts["CSCI 9999"].offered), ("unavailable", "no"))
        self.assertIn("doesn't list CSCI 9999", facts["CSCI 9999"].unavailable_reason)

    async def test_one_request_per_subject_and_term(self):
        await self.facts(["CSCI 2270", "CSCI 1300", "CSCI 3104"])
        self.assertEqual(
            sorted(call.args for call in self.fose.await_args_list),
            [("CSCI", "Fall 2026"), ("CSCI", "Spring 2027")],
        )

    async def test_unpublished_term_is_unknown_and_outage_unavailable(self):
        facts = await self.facts(["CSCI 3104"], rows={"Spring 2027": [], "Fall 2026": FALL_ROWS})
        self.assertEqual(facts["CSCI 3104"].offered, "unknown")
        facts = await self.facts(["CSCI 2270"], rows={"Spring 2027": RuntimeError("CU class search error 503")})
        self.assertEqual(facts["CSCI 2270"].known, "unavailable")
        self.assertEqual(facts["CSCI 2270"].unavailable_reason, "CU Class Search didn't answer")


class TestNextTerm(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}

    def test_by_date_without_terms(self):
        self.assertEqual(academics.planner_terms(), [])
        self.assertEqual(academics.next_term(today=date(2026, 10, 28)), "Spring 2027")
        self.assertEqual(academics.next_term(today=date(2026, 4, 1)), "Fall 2026")


class TestConfiguredNextTerm(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    planner_config = {"terms": ["Spring 2027", "Fall 2026"], "next_term": "fall 2026"}

    def test_configured_wins_and_terms_sort(self):
        self.assertEqual(academics.planner_terms(), ["Fall 2026", "Spring 2027"])
        self.assertEqual(academics.next_term(), "Fall 2026")
