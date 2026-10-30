"""``difficulty`` on the plan report, degree board and catalog search rows (eng review R5)."""

import unittest
from unittest.mock import patch

from app.api.routes import catalog
from app.api.routes import planner as routes
from app.planner import checker, degree, service
from app.tests.unit.planner_fakes import course, plan
from app.tests.unit.test_course_facts import SchoolTestCase
from app.tests.unit.test_planner_terms import FALL, FALL_FACTS, FACTS, PlannerTestCase, add

GRADED = {
    "ECON 3010": course("ECON 3010", avg_gpa=2.8, harder=True),
    "ECON 3020": course("ECON 3020", avg_gpa=3.5, harder=False),
    "ECON 4010": course("ECON 4010", avg_gpa=3.2, harder=False),
    "ECON 3300": course("ECON 3300", avg_gpa=None, harder=None),
}


def labels(rows):
    return {r["id"]: r["difficulty"] for r in rows}


class CheckerRowTests(unittest.TestCase):
    PLAN = plan(["ECON 3010", "ECON 3020", "ECON 4010", "ECON 3300", "NOPE 1000"])

    def test_each_label_from_the_course_facts(self):
        report = checker.check(self.PLAN, GRADED, [])
        self.assertEqual(labels(report["courses"]), {
            "ECON 3010": "harder", "ECON 3020": "easier", "ECON 4010": "typical",
            "ECON 3300": None, "NOPE 1000": None,
        })

    def test_school_easier_cutoff(self):
        report = checker.check(self.PLAN, GRADED, [], easier_from_gpa=3.6)
        self.assertEqual(labels(report["courses"])["ECON 3020"], "typical")

    def test_degree_board_rows_follow_the_same_rule(self):
        body = degree.board(self.PLAN, {self.PLAN["term"]: GRADED}, [], easier_from_gpa=3.1)
        (term,) = body["terms"]
        self.assertEqual(labels(term["courses"]), {
            "ECON 3010": "harder", "ECON 3020": "easier", "ECON 4010": "easier",
            "ECON 3300": None, "NOPE 1000": None,
        })


class ServiceCutoffTests(PlannerTestCase):
    """The plan and degree routes pass the school's ``easier_from_gpa``."""

    async def test_plan_and_degree_use_the_school_cutoff(self):
        await self.edit([add("ECON 3020"), add("ECON 4010", FALL)])
        graded = {"ECON 3020": course("ECON 3020", avg_gpa=3.5, harder=False),
                  "ECON 4010": course("ECON 4010", avg_gpa=3.5, harder=False)}
        with patch.dict(FACTS, graded), patch.dict(FALL_FACTS, graded):
            self.assertEqual(labels((await routes.get_plan(self.user))["report"]["courses"]), {"ECON 3020": "easier"})
            with patch.object(service, "easier_from_gpa", return_value=3.6):
                self.assertEqual(labels((await routes.get_plan(self.user))["report"]["courses"]),
                                 {"ECON 3020": "typical"})
                board = await routes.get_degree(self.user)
        self.assertEqual([labels(t["courses"]) for t in board["terms"]],
                         [{"ECON 3020": "typical"}, {"ECON 4010": "typical"}])


class SearchRowNoCutoff(SchoolTestCase):
    def test_no_fixed_harder_cutoff_is_none(self):
        self.assertIsNone(catalog._page_row({"identifier": "X 1", "average_gpa": 2.0})["difficulty"])


class SearchRowConfigured(SchoolTestCase):
    planner_config = {"harder_below_gpa": 3.0}

    def test_each_label_from_the_row_gpa(self):
        rows = {gpa: catalog._page_row({"identifier": "X 1", "average_gpa": gpa})["difficulty"]
                for gpa in (2.9, 3.0, 3.39, 3.4)}
        self.assertEqual(rows, {2.9: "harder", 3.0: "typical", 3.39: "typical", 3.4: "easier"})

    def test_no_gpa_is_none_and_always_present(self):
        self.assertIsNone(catalog._page_row({"identifier": "X 1", "average_gpa": None})["difficulty"])
        self.assertIn("difficulty", catalog._page_row({"identifier": "X 1"}))
        self.assertIsNone(catalog._page_row({"identifier": "X 1"})["difficulty"])


class SearchRowEasierCutoff(SchoolTestCase):
    planner_config = {"harder_below_gpa": 3.0, "easier_from_gpa": 3.6}

    def test_school_easier_cutoff(self):
        self.assertEqual(catalog._page_row({"identifier": "X 1", "average_gpa": 3.5})["difficulty"], "typical")
        self.assertEqual(catalog._page_row({"identifier": "X 1", "average_gpa": 3.6})["difficulty"], "easier")


if __name__ == "__main__":
    unittest.main()
