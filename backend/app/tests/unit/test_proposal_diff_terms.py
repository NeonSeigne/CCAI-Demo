"""Proposal diff for the proposed-change card (home-colors alignment Phase 3,
R10): a credit row per affected term, the prerequisite check, a usable lead
move row; literal_differs and unknowns stay."""

import unittest

from app.planner import checker, edits
from app.planner.facts import PrereqNode
from app.tests.unit.planner_fakes import TERM, Program, course, plan

FALL = "Fall 2027"
LIMITS = {"min": 12, "max": 18}


class DiffTermsTests(unittest.TestCase):
    def setUp(self):
        self.facts = {
            "ECON 2010": course("ECON 2010"),
            "ECON 3010": course("ECON 3010", prereq_tree=PrereqNode("course", course="ECON 2010")),
            "ECON 3300": course("ECON 3300", prereq_known=False),
            "ECON 4010": course("ECON 4010", credits=(4.0, 4.0)),
        }
        self.programs = [Program("econ", "Econ")]

    def report(self, p, term):
        return checker.check(dict(p, term=term), self.facts, self.programs, credit_limits=LIMITS)

    def diff(self, before_plan, ops, shown=TERM, asked=None):
        after_plan = edits.apply_ops(before_plan, ops)
        checked = edits.prereq_terms(before_plan, after_plan)
        reports = {t: (self.report(before_plan, t), self.report(after_plan, t)) for t in set(checked) | {shown}}
        before, after = reports[shown]
        return edits.diff(before, after, ops, asked=asked, term_reports=reports,
                          terms=edits.affected_terms(before_plan, after_plan))

    def test_move_gives_a_credit_row_for_both_terms_and_a_lead_row(self):
        before_plan = plan(["ECON 2010", "ECON 4010"])
        result = self.diff(before_plan, [{"op": "move", "course": "ECON 4010", "to_term": FALL}])
        self.assertEqual(result["terms"], [
            {"term": TERM, "before": {"min": 7.0, "max": 7.0, "status": "short"},
             "after": {"min": 3.0, "max": 3.0, "status": "short"}, "limits": LIMITS},
            {"term": FALL, "before": {"min": 0, "max": 0, "status": "short"},
             "after": {"min": 4.0, "max": 4.0, "status": "short"}, "limits": LIMITS},
        ])
        self.assertEqual(result["courses"]["moved"], [
            {"id": "ECON 4010", "from": TERM, "to": FALL, "title": "ECON 4010 title", "credits": [4.0, 4.0]}])
        self.assertEqual(result["prereqs"]["status"], "met")

    def test_moving_a_prerequisite_later_is_not_met_for_the_course_it_breaks(self):
        before_plan = plan([("ECON 2010", TERM), ("ECON 3010", FALL)])
        result = self.diff(before_plan, [{"op": "move", "course": "ECON 2010", "to_term": "Spring 2028"}])
        self.assertEqual(result["prereqs"]["status"], "not_met")
        broken = next(r for r in result["prereqs"]["courses"] if r["id"] == "ECON 3010")
        self.assertEqual((broken["term"], broken["status"], broken["reason"]), (FALL, "not_met", "Needs ECON 2010"))
        # Fall's courses didn't change, so it has no credit row.
        self.assertEqual([t["term"] for t in result["terms"]], [TERM, "Spring 2028"])

    def test_added_course_without_published_prerequisites_is_unknown(self):
        result = self.diff(plan(["ECON 2010"]), [{"op": "add", "course": "ECON 3300"}])
        self.assertEqual(result["prereqs"], {"status": "unknown", "courses": [
            {"id": "ECON 3300", "term": TERM, "status": "unknown", "reason": "Prerequisites not published"}]})
        # The unknown still reaches the unknowns list (R10 "?" rows).
        self.assertTrue(any("ECON 3300" in u for u in result["unknowns"]))

    def test_added_course_with_met_prerequisites(self):
        result = self.diff(plan(completed=["ECON 2010"]), [{"op": "add", "course": "ECON 3010"}])
        self.assertEqual(result["prereqs"]["status"], "met")
        self.assertEqual([r["id"] for r in result["prereqs"]["courses"]], ["ECON 3010"])

    def test_removal_with_nothing_to_check_reads_met(self):
        result = self.diff(plan(["ECON 4010"]), [{"op": "remove", "course": "ECON 4010"}])
        self.assertEqual(result["prereqs"], {"status": "met", "courses": []})
        self.assertEqual([t["term"] for t in result["terms"]], [TERM])

    def test_literal_differs_is_kept(self):
        before_plan = plan(["ECON 2010", "ECON 4010"])
        result = self.diff(before_plan, [{"op": "move", "course": "ECON 4010", "to_term": FALL}], asked="drop")
        self.assertEqual(result["literal_differs"], "You said drop; I moved ECON 4010 to Fall 2027")

    def test_without_term_reports_the_shown_term_is_used(self):
        before_plan = plan(completed=["ECON 2010"])
        ops = [{"op": "add", "course": "ECON 3010"}]
        result = edits.diff(self.report(before_plan, TERM), self.report(edits.apply_ops(before_plan, ops), TERM), ops)
        self.assertEqual([t["term"] for t in result["terms"]], [TERM])
        self.assertEqual(result["prereqs"]["status"], "met")

    def test_affected_and_prereq_terms(self):
        before_plan = plan([("ECON 2010", TERM), ("ECON 3010", FALL), ("ECON 4010", "Spring 2028")])
        after_plan = edits.apply_ops(before_plan, [{"op": "pick_section", "course": "ECON 3010", "sections": ["001"]}])
        self.assertEqual(edits.affected_terms(before_plan, after_plan), [FALL])
        self.assertEqual(edits.prereq_terms(before_plan, after_plan), [FALL, "Spring 2028"])
        self.assertEqual(edits.prereq_terms(before_plan, before_plan), [])


if __name__ == "__main__":
    unittest.main()
