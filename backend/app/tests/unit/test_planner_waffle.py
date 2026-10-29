"""What the degree waffle may claim (eng review R14)."""

import dataclasses
import unittest

from app.planner import degree
from app.tests.unit.planner_fakes import Program, Rule, course, plan

FALL = "Fall 2027"
FACTS = {c: course(c) for c in ("ECON 2010", "ECON 2020", "ECON 3010", "ECON 3020", "MATH 1310", "ENGL 1010")}
FACTS["MATH 1310"] = course("MATH 1310", credits=(4.0, 4.0))
PROGRAM = Program("econ-ba", "Economics B.A.", total_credits=30, rules=(
    Rule("intro", "Introductory economics", "all_of", courses=("ECON 2010", "ECON 2020")),
    Rule("math", "Math credits", "credits_from", courses=("MATH 1310",), credits=4),
    Rule("upper", "Upper-level electives", "level", subjects=("ECON",), min_level=3000, n=2),
))


def waffle(p, program=PROGRAM):
    return degree.board(p, {p["term"]: FACTS, FALL: FACTS}, [program])["waffle"]


class WaffleTests(unittest.TestCase):
    def test_groups_are_the_encoded_rules_plus_other_credit(self):
        result = waffle(plan(courses=["ECON 3010"], completed=[("ECON 2010", "A"), ("ENGL 1010", None)]))
        groups = {g["title"]: g for g in result["groups"]}
        self.assertEqual(list(groups), ["Introductory economics", "Math credits", "Upper-level electives", "Other credit"])
        self.assertEqual({k: groups["Introductory economics"][k] for k in ("size", "earned", "planned", "open")},
                         {"size": 6.0, "earned": 3.0, "planned": 0.0, "open": 3.0})
        self.assertEqual(groups["Math credits"]["size"], 4.0)  # sized by the rule's credits
        self.assertEqual((groups["Upper-level electives"]["planned"], groups["Upper-level electives"]["open"]), (3.0, 3.0))
        other = groups["Other credit"]
        self.assertEqual((other["earned"], other["unknown_grade"], other["rule_id"]), (3.0, 1, None))
        self.assertNotIn("Gen-ed areas", groups)

    def test_other_credit_plus_groups_equals_total_credits(self):
        result = waffle(plan(courses=["ECON 3010", "MATH 1310"], completed=["ECON 2010"]))
        self.assertEqual(result["total_credits"], 30)
        self.assertEqual(sum(g["size"] for g in result["groups"]), 30)
        for group in result["groups"]:
            self.assertEqual(group["earned"] + group["planned"] + group["open"], group["size"])

    def test_unknown_grade_count_per_group(self):
        result = waffle(plan(completed=[("ECON 2010", None), ("ECON 2020", "B")]))
        self.assertEqual(result["groups"][0]["unknown_grade"], 1)

    def test_unknown_grade_credits_per_group(self):
        result = waffle(plan(completed=[("ECON 2010", None), ("MATH 1310", None), ("ECON 2020", "B")]))
        intro, math = result["groups"][:2]
        self.assertEqual((intro["unknown_grade"], intro["unknown_grade_credits"]), (1, 3.0))
        self.assertEqual((math["unknown_grade"], math["unknown_grade_credits"]), (1, 4.0))

    def test_ungraded_courses_counted_elsewhere_are_not_hatched_again(self):
        program = Program("econ-ba", "Economics B.A.", total_credits=18, rules=(
            Rule("intro", "Introductory economics", "all_of", courses=("ECON 3010", "ECON 3020")),
            Rule("upper", "Upper-level electives", "level", subjects=("ECON",), min_level=3000, n=2,
                 double_count=True),
        ))
        result = waffle(plan(completed=[("ECON 3010", None), ("ECON 3020", "A")]), program)
        intro, upper, other = result["groups"]
        self.assertEqual((intro["unknown_grade"], intro["unknown_grade_credits"]), (1, 3.0))
        self.assertIn("ECON 3010", upper["counted_elsewhere"])
        self.assertEqual((upper["unknown_grade"], upper["unknown_grade_credits"]), (0, 0))
        self.assertEqual((other["unknown_grade"], other["unknown_grade_credits"]), (0, 0))

    def test_no_total_credits_means_no_other_credit_group(self):
        result = waffle(plan(courses=["ECON 3010"]), dataclasses.replace(PROGRAM, total_credits=None))
        self.assertEqual([g["title"] for g in result["groups"]][-1], "Upper-level electives")
        self.assertIsNone(result["total_credits"])

    def test_double_counted_courses_add_credits_once(self):
        program = Program("econ-ba", "Economics B.A.", total_credits=18, complete=True, rules=(
            Rule("intro", "Introductory economics", "all_of", courses=("ECON 3010", "ECON 3020")),
            Rule("upper", "Upper-level electives", "level", subjects=("ECON",), min_level=3000, n=2,
                 double_count=True),
        ))
        short = plan(courses=["ECON 3010", "ECON 3020"], completed=["HIST 1001", "HIST 1002", "HIST 1003"])
        result = waffle(short, program)
        intro, upper, other = result["groups"]
        self.assertEqual((upper["courses"], upper["counted_elsewhere"]), (["ECON 3010", "ECON 3020"],
                                                                          ["ECON 3010", "ECON 3020"]))
        self.assertEqual((upper["size"], upper["planned"], upper["status"]), (0.0, 0.0, "met"))
        self.assertEqual(sum(g["size"] for g in result["groups"]), 18)
        self.assertEqual(sum(g["earned"] for g in result["groups"]), 9.0)  # three distinct 3-credit courses
        self.assertEqual(sum(g["planned"] for g in result["groups"]), 6.0)
        self.assertEqual(other["open"], 3.0)  # 15 distinct credits of 18
        self.assertIsNone(result["finish"])
        # One more distinct course closes the gap.
        short["profile"]["completed"].append({"id": "HIST 1004", "grade": "A", "term": None})
        self.assertEqual(waffle(short, program)["finish"], "Spring 2027")

    def test_finish_only_when_complete_and_everything_planned(self):
        full = plan(courses=[("ECON 3010", "Spring 2027"), ("ECON 3020", FALL), ("MATH 1310", FALL)],
                    completed=["ECON 2010", "ECON 2020"])
        full["profile"]["completed"] += [{"id": f"HIST {i}", "grade": "A", "term": None} for i in range(1000, 1005)]
        self.assertIsNone(waffle(full)["finish"])  # complete defaults to false
        self.assertFalse(waffle(full)["complete"])
        done = dataclasses.replace(PROGRAM, complete=True)
        self.assertEqual(waffle(full, done)["finish"], FALL)
        self.assertTrue(all(g["open"] == 0 for g in waffle(full, done)["groups"]))
        # Something still open: no Finish even for a complete program.
        self.assertIsNone(waffle(plan(courses=["ECON 3010"], completed=["ECON 2010"]), done)["finish"])


if __name__ == "__main__":
    unittest.main()
