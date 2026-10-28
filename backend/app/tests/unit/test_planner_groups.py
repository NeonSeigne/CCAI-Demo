"""``one_of_groups`` rules: loading, checking, and the shipped program files."""

import tempfile
import unittest
from pathlib import Path

from app.planner import checker, programs
from app.tests.unit.planner_fakes import Program, Rule, course, plan

MATH = Rule("math", "Mathematics", "one_of_groups",
            groups=(("MATH 221",), ("MATH 211", "MATH 213"), ("MATH 211", "ECON 205")))

GROUPS_FILE = """
id: g-ba
name: Groups B.A.
type: major
catalog_year: 2026
source_url: https://example.edu/g
checked_on: 2026-10-28
rules:
  - id: math
    title: Mathematics
    kind: one_of_groups
    groups:
      - [math 221]
      - [MATH 211, MATH 213]
"""


def entry(report, rule_id):
    return next(r for r in report["rules"] if r["rule_id"] == rule_id)


class GroupLoadTests(unittest.TestCase):
    def write(self, text):
        folder = Path(tempfile.mkdtemp())
        path = folder / "g-ba.yaml"
        path.write_text(text)
        return path

    def test_groups_parse_and_normalise(self):
        rule = programs.read_file(self.write(GROUPS_FILE)).rules[0]
        self.assertEqual(rule.groups, (("MATH 221",), ("MATH 211", "MATH 213")))
        self.assertEqual(rule.courses, ())

    def test_bad_groups_name_the_field(self):
        cases = [
            (GROUPS_FILE.replace("      - [MATH 211, MATH 213]\n", ""), "rules[math]: groups"),
            (GROUPS_FILE.replace("[MATH 211, MATH 213]", "[]"), "rules[math]: groups[1]"),
            (GROUPS_FILE.replace("    groups:", "    courses: [MATH 221]\n    groups:"), "rules[math]: courses"),
        ]
        for text, field in cases:
            with self.subTest(field=field), self.assertRaises(ValueError) as caught:
                programs.read_file(self.write(text))
            self.assertIn(field, str(caught.exception))

    def test_groups_only_on_their_kind(self):
        text = GROUPS_FILE.replace("kind: one_of_groups", "kind: all_of\n    courses: [MATH 221]")
        with self.assertRaises(ValueError) as caught:
            programs.read_file(self.write(text))
        self.assertIn("rules[math]: groups", str(caught.exception))


class GroupCheckTests(unittest.TestCase):
    def check(self, rule, completed=(), planned=()):
        facts = {c: course(c) for c in ("MATH 221", "MATH 211", "MATH 213", "ECON 205", "MATH 1191", "MATH 1192")}
        prog = Program("p", "P", rules=(rule,))
        return entry(checker.check(plan(courses=planned, completed=completed, programs=["p"]), facts, [prog]), rule.id)

    def test_single_course_group_met(self):
        result = self.check(MATH, completed=["MATH 221"])
        self.assertEqual((result["status"], result["completed"], result["needed"]), ("met", 1, 1))

    def test_pair_met_by_completed_and_planned(self):
        result = self.check(MATH, completed=["MATH 211"], planned=["MATH 213"])
        self.assertEqual((result["status"], result["completed"], result["planned"], result["needed"]), ("met", 1, 1, 2))

    def test_short_names_the_closest_group(self):
        result = self.check(MATH, completed=["MATH 211"])
        self.assertEqual(result["status"], "short")
        self.assertIn("MATH 213", result["reason"])

    def test_nothing_done_suggests_the_shortest_group(self):
        result = self.check(MATH)
        self.assertEqual((result["status"], result["reason"]), ("short", "Still needs MATH 221"))

    def test_min_grade(self):
        rule = Rule("calc", "Calculus I", "one_of_groups", groups=(("MATH 1210",), ("MATH 1191", "MATH 1192")),
                    min_grade="C+")
        self.assertEqual(self.check(rule, completed=[("MATH 1191", "B"), ("MATH 1192", "C+")])["status"], "met")
        self.assertEqual(self.check(rule, completed=[("MATH 1191", "B"), ("MATH 1192", "C")])["status"], "short")
        unknown = self.check(rule, completed=[("MATH 1191", "B"), ("MATH 1192", None)])
        self.assertEqual(unknown["status"], "unknown")
        self.assertIn("MATH 1192", unknown["reason"])


class ShippedProgramTests(unittest.TestCase):
    """The checker runs over the real hand-checked files, not only the fakes."""

    def test_uw_econ_principles_and_math(self):
        prog = programs.get_program("uw-madison", "econ-ba")
        ids = ["ECON 111", "MATH 211", "MATH 213", "ECON 301", "ECON 302", "ECON 310"]
        report = checker.check(plan(completed=ids, programs=["econ-ba"]), {c: course(c) for c in ids}, [prog])
        self.assertEqual(entry(report, "principles")["status"], "met")
        self.assertEqual(entry(report, "mathematics")["status"], "met")
        self.assertEqual(entry(report, "micro-theory")["status"], "met")
        self.assertEqual(entry(report, "core")["status"], "short")

    def test_uva_econ_calculus_pair(self):
        prog = programs.get_program("uva", "econ-ba")
        done = [("ECON 2010", "A"), ("ECON 2020", "A"), ("MATH 1191", "B"), ("MATH 1192", "B+")]
        report = checker.check(plan(completed=done, programs=["econ-ba"]), {c: course(c) for c, _ in done}, [prog])
        self.assertEqual(entry(report, "intro")["status"], "met")
        self.assertEqual(entry(report, "calculus")["status"], "met")


if __name__ == "__main__":
    unittest.main()
