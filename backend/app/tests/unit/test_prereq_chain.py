"""Prerequisite chains (prerequisites of prerequisites) per school."""

import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from app.sources import academics, cache, csv_snapshot
from app.tests.unit.test_course_facts import SECTIONS_HEADER, SchoolTestCase
from app.tools import _uw_source, course_prerequisites

SPRING_URL = "https://example.test/semester_data/2027_spring.csv"
GRADES_URL = "https://example.test/grade_data/2026_spring.csv"


def row(number, course, title, description):
    subject, num = course.split()
    return (
        f"{number},{subject},{num},001,Lecture,3,Prof,mowe 9:00am - 9:50am,Room,01/20/2027 - 05/04/2027,"
        f",,,,,,,,,,,,\"{title}\",,Open,10,30,0,0,\"{description}\",,\n"
    )


SPRING_CSV = SECTIONS_HEADER + (
    row(1, "CS 4774", "Machine Learning", "Learning. Prerequisites: CS 3100 & CS 2120. Background in R helps.")
    + row(2, "CS 3100", "DSA 2", "Algorithms. Prerequisite: CS 2100 with a grade of C- or better.")
    + row(3, "CS 2100", "DSA 1", "Data structures.")
    + row(4, "CS 2120", "Discrete Math", "Proofs.")
    + row(5, "ECON 4880", "Policy Seminar", "Prerequisite: ECON 3010 or 3110, and ECON 9999.")
    + row(6, "ECON 3010", "Micro", "Prerequisite: ECON 4880.")  # a cycle in the data
    + row(7, "ECON 3110", "Math Micro", "Theory.")
    + row(8, "MAE 2020", "Dynamics",
          "Pre-requisite: PHYS 1425. Co-requisite: APMA 2120 or MATH 2310")
    + row(9, "PHYS 1425", "Physics 1", "Mechanics.")
    + row(10, "APMA 2120", "Multivariable", "Calculus.")
    + row(11, "PERS 3020", "Persian", "Prerequisites: Persian 3010 or instructor's permission.")
)
GRADES_CSV = (
    "Term Desc,Subject,Catalog Number,Class Title,Course ID,Primary Instructor Name,"
    "Class Section,Class Num,Class Academic Group,Course GPA,# of Students,"
    "A+,A,A-,B+,B,B-,C+,C,C-,DFW\n"
    "2026 Spring,MATH,2310,Calculus III,,P,001,1,A,3.0,100,0,0,0,0,0,0,0,0,0,0\n"
)
FILES = {SPRING_URL: SPRING_CSV, GRADES_URL: GRADES_CSV}


def fake_download(url, with_commit_date=False):
    if url in FILES:
        return FILES[url], "2026-10-11"
    raise RuntimeError(f"unexpected url {url}")


class TestRequisiteText(unittest.TestCase):
    def test_segments_stop_at_the_sentence(self):
        self.assertEqual(
            csv_snapshot.requisite_segments("Algorithms. Prerequisites: CS 2100 & CS 2120. Background in R."),
            [("prior", "Prerequisites: CS 2100 & CS 2120")],
        )

    def test_co_requisites_are_concurrent(self):
        self.assertEqual(
            csv_snapshot.requisite_segments("Pre-requisite: PHYS 1425. Co-requisite: APMA 2120"),
            [("prior", "Pre-requisite: PHYS 1425"), ("concurrent", "Co-requisite: APMA 2120")],
        )

    def test_a_course_code_after_a_period_keeps_the_sentence(self):
        self.assertEqual(
            csv_snapshot.requisite_segments("Prerequisite: ECON 3010. or ECON 3110"),
            [("prior", "Prerequisite: ECON 3010. or ECON 3110")],
        )

    def test_bare_numbers_take_the_subject_before(self):
        self.assertEqual(
            csv_snapshot.requisite_codes("ECON 3010 or 3110, ECON 3720, and MATH 1310"),
            ["ECON 3010", "ECON 3110", "ECON 3720", "MATH 1310"],
        )
        self.assertEqual(csv_snapshot.requisite_codes("Persian 3010 or permission"), [])


class UVACase(SchoolTestCase):
    academics_config = {
        "provider": "csv_snapshot",
        "snapshot": {"source_name": "theCourseForum", "sections_url": SPRING_URL, "grades_urls": [GRADES_URL]},
    }
    tools_config = {name: {"enabled": True} for name in ("course_search", "course_grades", "course_prerequisites")}

    def setUp(self):
        super().setUp()
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
        super().tearDown()


class TestUVAPrerequisites(UVACase):
    async def test_courses_named_in_the_description(self):
        result = await course_prerequisites.execute(course_identifier="CS 4774")
        self.assertEqual(result["prereq_text"], "Prerequisites: CS 3100 & CS 2120")
        self.assertEqual(result["prerequisites"], [
            {"identifier": "CS 3100", "title": "DSA 2", "timing": "prior"},
            {"identifier": "CS 2120", "title": "Discrete Math", "timing": "prior"},
        ])
        self.assertEqual(result["data_as_of"], "2026-10-11")

    async def test_unknown_codes_are_left_out_and_co_requisites_marked(self):
        econ = await course_prerequisites.execute(course_identifier="ECON 4880")
        self.assertEqual([c["identifier"] for c in econ["prerequisites"]], ["ECON 3010", "ECON 3110"])
        mae = await course_prerequisites.execute(course_identifier="MAE 2020")
        self.assertEqual(
            [(c["identifier"], c["timing"]) for c in mae["prerequisites"]],
            # MATH 2310 is known from the grades file alone.
            [("PHYS 1425", "prior"), ("APMA 2120", "concurrent"), ("MATH 2310", "concurrent")],
        )

    async def test_text_without_course_codes(self):
        result = await course_prerequisites.execute(course_identifier="PERS 3020")
        self.assertEqual(result["prerequisites"], [])
        self.assertIn("instructor's permission", result["prereq_text"])

    async def test_summary_chain_goes_two_levels(self):
        summary = await academics.course_summary("CS 4774")
        self.assertTrue(summary["capabilities"]["prerequisites"])
        self.assertEqual([c["identifier"] for c in summary["prerequisites"]["courses"]], ["CS 3100", "CS 2120"])
        chain = summary["prereq_chain"]
        self.assertEqual(chain["root"], "CS 4774")
        self.assertTrue(chain["complete"])
        self.assertEqual(
            [(c["id"], c["depth"], c["requires"]) for c in chain["courses"]],
            [("CS 4774", 0, ["CS 3100", "CS 2120"]), ("CS 3100", 1, ["CS 2100"]),
             ("CS 2120", 1, []), ("CS 2100", 2, [])],
        )
        # The planner still can't check UVA prerequisites (free text).
        self.assertNotIn("prereq_tree", summary)

    async def test_a_cycle_in_the_data_ends(self):
        chain = await academics.prereq_chain("ECON 4880")
        self.assertEqual([c["id"] for c in chain["courses"]], ["ECON 4880", "ECON 3010", "ECON 3110"])
        self.assertEqual(chain["courses"][1]["requires"], ["ECON 4880"])

    async def test_no_named_courses_is_no_chain(self):
        self.assertIsNone(await academics.prereq_chain("CS 2100"))
        self.assertNotIn("prereq_chain", await academics.course_summary("CS 2100"))


class FakeProvider:
    """``prerequisites`` from a dict; ``slow`` courses never answer in time."""

    def __init__(self, graph, slow=(), broken=()):
        self.graph, self.slow, self.broken = graph, set(slow), set(broken)
        self.asked = []

    async def prerequisites(self, *, course_identifier):
        self.asked.append(course_identifier)
        if course_identifier in self.slow:
            await asyncio.sleep(5)
        if course_identifier in self.broken:
            return {"error": "down"}
        return {
            "title": course_identifier.title(),
            "prerequisites": [{"identifier": c, "title": ""} for c in self.graph.get(course_identifier, [])],
        }


class TestChainLimits(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    tools_config = {"course_search": {"enabled": True}}

    async def chain(self, provider, **kwargs):
        with patch.object(academics, "get_provider", return_value=provider):
            return await academics.prereq_chain("A 1", **kwargs)

    async def test_depth_cut_marks_incomplete(self):
        provider = FakeProvider({"A 1": ["B 1"], "B 1": ["C 1"], "C 1": ["D 1"]})
        chain = await self.chain(provider, depth=2)
        self.assertEqual([c["id"] for c in chain["courses"]], ["A 1", "B 1", "C 1"])
        self.assertEqual(chain["courses"][-1]["requires"], ["D 1"])  # named, not expanded
        self.assertFalse(chain["complete"])

    async def test_size_limit(self):
        provider = FakeProvider({"A 1": ["B 1", "C 1", "D 1"]})
        chain = await self.chain(provider, limit=3)
        self.assertEqual([c["id"] for c in chain["courses"]], ["A 1", "B 1", "C 1"])
        self.assertFalse(chain["complete"])

    async def test_unanswered_courses_read_unknown(self):
        provider = FakeProvider({"A 1": ["B 1", "C 1"]}, slow={"C 1"}, broken={"B 1"})
        chain = await self.chain(provider, budget_s=0.2)
        by_id = {c["id"]: c for c in chain["courses"]}
        self.assertFalse(by_id["B 1"]["known"])
        self.assertFalse(by_id["C 1"]["known"])
        self.assertFalse(chain["complete"])

    async def test_shared_prerequisite_is_listed_once(self):
        provider = FakeProvider({"A 1": ["B 1", "C 1"], "B 1": ["D 1"], "C 1": ["D 1"]})
        chain = await self.chain(provider)
        self.assertEqual([c["id"] for c in chain["courses"]], ["A 1", "B 1", "C 1", "D 1"])
        self.assertEqual(provider.asked.count("D 1"), 1)
        self.assertTrue(chain["complete"])


class TestCUHasNone(SchoolTestCase):
    tools_config = {"search_courses": {"enabled": True}}

    async def test_fose_has_no_prerequisites(self):
        self.assertFalse(academics.catalog_capabilities()["prerequisites"])
        self.assertIsNone(await academics.prereq_chain("CSCI 2270"))


class TestUWChain(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    tools_config = {"course_search": {"enabled": True}}

    async def test_chain_reads_course_map_requirements(self):
        from app.tests.unit.test_catalog_api import fake_coursemap

        _uw_source._cache.clear()
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()):
            summary = await academics.course_summary("COMP SCI 300")
        chain = summary["prereq_chain"]
        self.assertEqual(chain["root"], "COMPSCI 300")
        root = chain["courses"][0]
        self.assertIn("COMPSCI 200", root["requires"])
        # The fixture has no page for COMPSCI 200: listed, unknown.
        self.assertEqual({c["id"]: c["known"] for c in chain["courses"]}["COMPSCI 200"], False)


if __name__ == "__main__":
    unittest.main()
