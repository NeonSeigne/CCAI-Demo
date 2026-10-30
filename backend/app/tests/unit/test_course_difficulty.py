"""Course ``difficulty`` on ``/api/catalog/{id}`` from the school's own rule (eng review R5)."""

import unittest
from unittest.mock import patch

from app.planner.facts import CourseFacts, difficulty_of
from app.sources import academics
from app.tests.unit.test_course_facts import ECON_310, SchoolTestCase, SnapshotFactsCase, coursemap
from app.tools import _uw_source


def facts(gpa, harder, known="yes"):
    return CourseFacts(identifier="X 1", known=known, avg_gpa=gpa, harder=harder)


class TestRule(unittest.TestCase):
    def test_harder_flag_wins(self):
        self.assertEqual(difficulty_of(facts(3.9, True)), "harder")

    def test_easier_from_default_cutoff(self):
        self.assertEqual(difficulty_of(facts(3.4, False)), "easier")
        self.assertEqual(difficulty_of(facts(3.39, False)), "typical")

    def test_school_cutoff(self):
        self.assertEqual(difficulty_of(facts(3.5, False), easier_from_gpa=3.6), "typical")
        self.assertEqual(difficulty_of(facts(3.6, False), easier_from_gpa=3.6), "easier")

    def test_unknown_is_none(self):
        self.assertIsNone(difficulty_of(None))
        self.assertIsNone(difficulty_of(facts(None, None)))
        self.assertIsNone(difficulty_of(facts(3.2, None)))  # no "harder" cutoff
        self.assertIsNone(difficulty_of(facts(3.2, False, known="unavailable")))


class TestUVASummary(SnapshotFactsCase):
    """Hardest third of the snapshot (ECON 2010 2.9, CS 2100 3.3, CS 4774 3.7)."""

    async def test_each_label(self):
        found = {}
        for course in ("ECON 2010", "CS 2100", "CS 4774"):
            found[course] = (await academics.course_summary(course))["difficulty"]
        self.assertEqual(found, {"ECON 2010": "harder", "CS 2100": "typical", "CS 4774": "easier"})

    async def test_school_easier_cutoff(self):
        with patch.object(academics, "easier_from_gpa", return_value=3.8):
            self.assertEqual((await academics.course_summary("CS 4774"))["difficulty"], "typical")


class TestUVAConfiguredHarder(SnapshotFactsCase):
    planner_config = {"harder_below_gpa": 3.5}

    async def test_configured_harder_cutoff(self):
        self.assertEqual((await academics.course_summary("CS 2100"))["difficulty"], "harder")


class UWCase(SchoolTestCase):
    academics_config = {"provider": "uw_coursemap"}
    tools_config = {"course_search": {"enabled": True}}

    async def summary(self):
        fetch = coursemap({"/courses/ECON_310.json": ECON_310})
        with patch.object(_uw_source, "_fetch_json", side_effect=fetch):
            return await academics.course_summary("ECON 310")


class TestUWSummary(UWCase):
    async def test_no_cutoff_is_none(self):
        self.assertIsNone((await self.summary())["difficulty"])


class TestUWConfigured(UWCase):
    planner_config = {"harder_below_gpa": 3.4, "terms": ["Fall 2026", "Spring 2027"]}

    async def test_harder_below_school_cutoff(self):
        self.assertEqual((await self.summary())["difficulty"], "harder")  # GPA 3.1


if __name__ == "__main__":
    unittest.main()
