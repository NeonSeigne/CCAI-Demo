import unittest

from app.planner import checker
from app.planner.facts import CourseFacts, PrereqNode
from app.tests.unit.planner_fakes import TERM, Program, Rule, course, plan, section

LIMITS = {"min": 12, "max": 18}


def leaf(cid, **kw):
    return PrereqNode(kind="course", course=cid, **kw)


def rule_entry(report, rule_id):
    return next(r for r in report["rules"] if r["rule_id"] == rule_id)


def row(report, cid):
    return next(c for c in report["courses"] if c["id"] == cid)


class RuleKindTests(unittest.TestCase):
    """Each rule kind, table-driven: (rule, plan, facts) -> status and counts."""

    def test_rule_kinds(self):
        facts = {c: course(c) for c in ("ECON 2010", "ECON 2020", "ECON 3010", "ECON 3020", "ECON 3300",
                                        "ECON 4010", "ECON 4500", "MATH 1310")}
        facts["ECON 4500"] = course("ECON 4500", credits=(4.0, 4.0))
        cases = [
            # (name, rule, completed, planned, status, completed_n, planned_n, needed)
            ("all_of met", Rule("intro", "Intro", "all_of", courses=("ECON 2010", "ECON 2020")),
             ["ECON 2010"], ["ECON 2020"], "met", 1, 1, 2),
            ("all_of short", Rule("intro", "Intro", "all_of", courses=("ECON 2010", "ECON 2020")),
             ["ECON 2010"], [], "short", 1, 0, 2),
            ("n_of met", Rule("core", "Core", "n_of", courses=("ECON 3010", "ECON 3020", "ECON 3300"), n=2),
             [], ["ECON 3010", "ECON 3300"], "met", 0, 2, 2),
            ("n_of short", Rule("core", "Core", "n_of", courses=("ECON 3010", "ECON 3020", "ECON 3300"), n=2),
             [], ["ECON 3020"], "short", 0, 1, 2),
            ("level met, exclusions skipped",
             Rule("el", "Electives", "level", subjects=("ECON",), min_level=3000, n=2, exclude=("ECON 3010",)),
             [], ["ECON 3010", "ECON 3300", "ECON 4010"], "met", 0, 2, 2),
            ("level ignores other subjects and lower levels",
             Rule("el", "Electives", "level", subjects=("ECON",), min_level=3000, n=2),
             ["ECON 2010"], ["MATH 1310", "ECON 4010"], "short", 0, 1, 2),
            ("level max_level", Rule("el", "3000s", "level", subjects=("ECON",), min_level=3000, max_level=3000, n=2),
             [], ["ECON 3010", "ECON 4010"], "short", 0, 1, 2),
            ("credits_from met", Rule("cr", "Credits", "credits_from", courses=("ECON 3010", "ECON 4500"), credits=7),
             ["ECON 3010"], ["ECON 4500"], "met", 3.0, 4.0, 7.0),
            ("credits_from short", Rule("cr", "Credits", "credits_from", courses=("ECON 3010", "ECON 4500"), credits=9),
             ["ECON 3010"], ["ECON 4500"], "short", 3.0, 4.0, 9.0),
        ]
        for name, rule, done, planned, status, n_done, n_planned, needed in cases:
            with self.subTest(name):
                report = checker.check(plan(planned, done, ["econ"]), facts, [Program("econ", "Econ", rules=(rule,))])
                entry = rule_entry(report, rule.id)
                self.assertEqual(entry["status"], status)
                self.assertEqual((entry["completed"], entry["planned"], entry["needed"]), (n_done, n_planned, needed))
                self.assertEqual(entry["unit"], "credits" if rule.kind == "credits_from" else "courses")

    def test_credit_range_makes_a_credits_rule_unknown(self):
        facts = {"ECON 4980": course("ECON 4980", credits=(1.0, 6.0))}
        rule = Rule("cr", "Research credits", "credits_from", courses=("ECON 4980",), credits=3)
        report = checker.check(plan(["ECON 4980"], programs=["econ"]), facts, [Program("econ", "Econ", rules=(rule,))])
        entry = rule_entry(report, "cr")
        self.assertEqual(entry["status"], "unknown")
        self.assertIn("credit range", entry["reason"])

    def test_unknown_credits_make_a_credits_rule_unknown(self):
        facts = {"ECON 4980": course("ECON 4980", credits=None)}
        rule = Rule("cr", "Research credits", "credits_from", courses=("ECON 4980",), credits=3)
        report = checker.check(plan(["ECON 4980"], programs=["econ"]), facts, [Program("econ", "Econ", rules=(rule,))])
        self.assertEqual(rule_entry(report, "cr")["status"], "unknown")

    def test_double_count_policy(self):
        facts = {c: course(c) for c in ("ECON 3010", "ECON 3300")}
        core = Rule("core", "Core theory", "n_of", courses=("ECON 3010",), n=1)
        electives = Rule("el", "Electives", "level", subjects=("ECON",), min_level=3000, n=2)
        writing = Rule("w", "Writing", "n_of", courses=("ECON 3010",), n=1, double_count=True)
        report = checker.check(plan(["ECON 3010", "ECON 3300"], programs=["econ"]), facts,
                               [Program("econ", "Econ", rules=(core, electives, writing))])
        # ECON 3010 is used up by Core, so Electives only gets ECON 3300...
        self.assertEqual(rule_entry(report, "el")["planned_courses"], ["ECON 3300"])
        self.assertEqual(rule_entry(report, "el")["status"], "short")
        # ...but a double-count rule may still take it.
        self.assertEqual(rule_entry(report, "w")["status"], "met")
        self.assertEqual(row(report, "ECON 3010")["fills"][:2], ["Fills: Core theory", "Fills: Writing"])

    def test_min_grade(self):
        rule = Rule("intro", "Intro", "all_of", courses=("ECON 2010",), min_grade="C")
        programs = [Program("econ", "Econ", rules=(rule,))]
        for grade, status in ((None, "unknown"), ("B", "met"), ("C-", "short"), ("P", "unknown")):
            with self.subTest(grade=grade):
                report = checker.check(plan(completed=[("ECON 2010", grade)], programs=["econ"]), {}, programs)
                self.assertEqual(rule_entry(report, "intro")["status"], status)
        report = checker.check(plan(completed=[("ECON 2010", None)], programs=["econ"]), {}, programs)
        self.assertIn("Grade needed", rule_entry(report, "intro")["reason"])


class PrereqTests(unittest.TestCase):
    def status(self, tree, planned, completed=(), known=True, timing_course="ECON 3010"):
        facts = {timing_course: course(timing_course, prereq_tree=tree, prereq_known=known)}
        report = checker.check(plan(planned, completed), facts, [])
        return row(report, timing_course)["prereqs"]

    def test_tree_cases(self):
        all_of = PrereqNode("all", (leaf("ECON 2010"), leaf("MATH 1310")))
        any_of = PrereqNode("any", (leaf("ECON 2010"), leaf("ECON 2020")))
        concurrent = PrereqNode("all", (leaf("MATH 1320", timing="concurrent"),))
        graded = PrereqNode("all", (leaf("ECON 2010", minimum_grade="C"),))
        cases = [
            ("all met", all_of, ["ECON 3010"], ["ECON 2010", "MATH 1310"], "met"),
            ("all short", all_of, ["ECON 3010"], ["ECON 2010"], "short"),
            ("any met by one", any_of, ["ECON 3010"], ["ECON 2020"], "met"),
            ("any short", any_of, ["ECON 3010"], [], "short"),
            ("planned in an earlier term counts", any_of, ["ECON 3010", ("ECON 2010", "Fall 2026")], [], "met"),
            ("planned the same term does not", any_of, ["ECON 3010", "ECON 2010"], [], "short"),
            ("concurrent allows the same term", concurrent, ["ECON 3010", "MATH 1320"], [], "met"),
            ("concurrent later term fails", concurrent, ["ECON 3010", ("MATH 1320", "Fall 2027")], [], "short"),
            ("minimum grade without a grade", graded, ["ECON 3010"], [("ECON 2010", None)], "unknown"),
            ("minimum grade met", graded, ["ECON 3010"], [("ECON 2010", "B")], "met"),
            ("minimum grade on a planned course", graded, ["ECON 3010", ("ECON 2010", "Fall 2026")], [], "unknown"),
            ("no prerequisites", None, ["ECON 3010"], [], "met"),
        ]
        for name, tree, planned, completed, status in cases:
            with self.subTest(name):
                self.assertEqual(self.status(tree, planned, completed)["status"], status)

    def test_short_names_the_missing_course(self):
        tree = PrereqNode("all", (leaf("ECON 2010"),))
        self.assertEqual(self.status(tree, ["ECON 3010"])["reason"], "Needs ECON 2010")

    def test_unpublished_prerequisites_are_unknown(self):
        result = self.status(None, ["ECON 3010"], known=False)
        self.assertEqual(result, {"status": "unknown", "reason": "Prerequisites not published"})

    def test_unavailable_course_is_unknown_with_reason(self):
        facts = {"ECON 3010": CourseFacts("ECON 3010", known="unavailable", unavailable_reason="Course Map didn't answer")}
        report = checker.check(plan(["ECON 3010"]), facts, [])
        self.assertEqual(row(report, "ECON 3010")["prereqs"], {"status": "unknown", "reason": "Course Map didn't answer"})


class CreditTests(unittest.TestCase):
    def test_credit_ranges(self):
        cases = [
            ("fixed within", [(3, 3)] * 4, "met"),
            ("fixed short", [(3, 3)] * 3, "short"),
            ("fixed over", [(4, 4)] * 5, "over"),
            ("range within", [(3, 4)] * 4, "met"),
            ("range straddles max", [(3, 5)] * 4, "unknown"),
            ("range straddles min", [(2, 4)] * 4, "unknown"),
        ]
        for name, credits, status in cases:
            with self.subTest(name):
                ids = [f"ECON {3000 + i}" for i in range(len(credits))]
                facts = {cid: course(cid, credits=(float(a), float(b))) for cid, (a, b) in zip(ids, credits)}
                report = checker.check(plan(ids), facts, [], credit_limits=LIMITS)
                self.assertEqual(report["credits"]["status"], status)
                self.assertEqual(report["credits"]["min"], sum(a for a, _ in credits))

    def test_unknown_credits_make_the_total_unknown(self):
        facts = {"ECON 3010": course("ECON 3010"), "ECON 3020": course("ECON 3020", credits=None)}
        report = checker.check(plan(["ECON 3010", "ECON 3020"]), facts, [], credit_limits=LIMITS)
        self.assertEqual(report["credits"]["status"], "unknown")
        self.assertIsNone(report["credits"]["min"])
        self.assertIn("ECON 3020", report["credits"]["reason"])

    def test_no_limits_reads_unknown(self):
        report = checker.check(plan(["ECON 3010"]), {"ECON 3010": course("ECON 3010")}, [])
        self.assertEqual(report["credits"]["status"], "unknown")
        self.assertEqual(report["credits"]["min"], 3.0)

    def test_difficulty_label(self):
        for harder, label in ((0, "Light"), (1, "Light"), (2, "Balanced"), (3, "Heavy")):
            with self.subTest(harder=harder):
                ids = [f"ECON {3000 + i}" for i in range(4)]
                facts = {cid: course(cid, harder=i < harder) for i, cid in enumerate(ids)}
                self.assertEqual(checker.check(plan(ids), facts, [])["difficulty"]["label"], label)
        facts = {"ECON 3010": course("ECON 3010", harder=None)}
        self.assertEqual(checker.check(plan(["ECON 3010"]), facts, [])["difficulty"],
                         {"label": None, "harder": 0, "graded": 0, "total": 1})


class ClashTests(unittest.TestCase):
    def clashes(self, facts, courses):
        return checker.check(plan(courses), facts, [])["clashes"]

    def test_none_when_everything_checked(self):
        facts = {
            "ECON 3010": course("ECON 3010", sections=[section("001", meetings=[("Mo", "09:00", "09:50")])], bundles_known=True),
            "ECON 3020": course("ECON 3020", sections=[section("001", meetings=[("Mo", "10:00", "10:50")])], bundles_known=True),
        }
        self.assertEqual(self.clashes(facts, ["ECON 3010", "ECON 3020"]), {"status": "none", "pairs": [], "reason": None})

    def test_found_on_a_discussion_in_the_bundle(self):
        facts = {
            "ECON 3010": course("ECON 3010", bundles_known=True, sections=[
                section("001", meetings=[("Tu", "09:00", "10:15")], requires=["discussion"]),
                section("101", "discussion", meetings=[("Fr", "11:00", "11:50")]),
                section("102", "discussion", meetings=[("Fr", "13:00", "13:50")]),
            ]),
            "ECON 3020": course("ECON 3020", bundles_known=True, sections=[section("001", meetings=[("Fr", "11:30", "12:20")])]),
        }
        courses = [("ECON 3010", TERM, ["001", "101"]), "ECON 3020"]
        self.assertEqual(self.clashes(facts, courses)["pairs"], [["ECON 3010", "ECON 3020"]])
        self.assertEqual(self.clashes(facts, courses)["status"], "found")
        # The other discussion doesn't clash.
        courses = [("ECON 3010", TERM, ["001", "102"]), "ECON 3020"]
        self.assertEqual(self.clashes(facts, courses)["status"], "none")

    def test_unknown_reasons(self):
        lecture = section("001", meetings=[("Mo", "09:00", "09:50")], requires=["lab"])
        cases = [
            ("times not published", course("X 1010", sections=[section("001", meetings=None)], bundles_known=True),
             None, "class times not published"),
            ("no section data", course("X 1010", sections=None), None, "class times not published"),
            ("required lab not chosen", course("X 1010", bundles_known=True, sections=[
                lecture, section("L1", "lab", meetings=[("We", "14:00", "16:00")]),
                section("L2", "lab", meetings=[("Th", "14:00", "16:00")])]), ["001"], "labs/discussions not checked"),
            ("bundles unknown (CU lecture-only data)", course("X 1010", bundles_known=False,
                                                             sections=[section("001")]), None, "labs/discussions not checked"),
            ("several lectures, none chosen", course("X 1010", bundles_known=True,
                                                     sections=[section("001"), section("002")]), None, "sections not chosen"),
            # Regression (live UW run): several sections, none with times, must read "not published".
            ("several sections, no times (UW)", course("X 1010", sections=[
                section("001", meetings=None), section("002", meetings=None)]), None, "class times not published"),
        ]
        for name, fact, chosen, reason in cases:
            with self.subTest(name):
                result = self.clashes({"X 1010": fact}, [("X 1010", TERM, chosen)])
                self.assertEqual((result["status"], result["reason"]), ("unknown", reason))

    def test_schedule_blocks_and_published_flag(self):
        facts = {"ECON 3010": course("ECON 3010", sections=[section("001", meetings=[("Mo", "09:00", "09:50")])], bundles_known=True)}
        schedule = checker.check(plan(["ECON 3010"]), facts, [])["schedule"]
        self.assertTrue(schedule["published"])
        self.assertEqual(schedule["blocks"], [{"course": "ECON 3010", "section": "001", "kind": "lecture",
                                               "day": "Mo", "start": "09:00", "end": "09:50"}])
        self.assertIsNone(schedule["reason"])

    def test_empty_week_says_why(self):
        uw = {"ECON 301": course("ECON 301", sections=[section("001", meetings=None), section("002", meetings=None)])}
        schedule = checker.check(plan(["ECON 301"]), uw, [])["schedule"]
        self.assertEqual((schedule["published"], schedule["reason"], schedule["blocks"]),
                         (False, "class times not published", []))
        uva = {"ECON 3010": course("ECON 3010", bundles_known=True, sections=[section("001"), section("002")])}
        schedule = checker.check(plan(["ECON 3010"]), uva, [])["schedule"]
        self.assertEqual((schedule["published"], schedule["reason"]), (True, "sections not chosen"))


class LabelTests(unittest.TestCase):
    def test_fills_labels(self):
        rule = Rule("intro", "Introductory economics", "all_of", courses=("ECON 2010",))
        facts = {"ECON 2010": course("ECON 2010", gen_ed=["Social Science"]),
                 "ENVS 2800": course("ENVS 2800", gen_ed=None)}
        cases = [
            ("rule match + gen-ed tag", [Program("econ", "Econ", rules=(rule,))], "ECON 2010",
             ["Fills: Introductory economics", "Gen-ed: Social Science"]),
            ("general elective", [Program("econ", "Econ", rules=(rule,))], "ENVS 2800",
             ["General elective credit", "Gen-ed: unknown"]),
            ("no total-credit rule", [Program("econ", "Econ", total_credits=None, rules=(rule,))], "ENVS 2800",
             ["Fills no listed requirement", "Gen-ed: unknown"]),
            ("no program files", [], "ECON 2010", ["Requirements: unknown", "Gen-ed: Social Science"]),
        ]
        for name, programs, cid, labels in cases:
            with self.subTest(name):
                report = checker.check(plan(["ECON 2010", "ENVS 2800"], programs=[p.id for p in programs]), facts, programs)
                self.assertEqual(row(report, cid)["fills"], labels)

    def test_report_shape(self):
        report = checker.check(plan(["ECON 3010", ("ECON 4010", "Fall 2027")]), {"ECON 3010": course("ECON 3010", as_of="2026-10-01")}, [])
        self.assertEqual(set(report), {"term", "data_as_of", "credits", "difficulty", "clashes", "rules", "courses", "later", "schedule"})
        self.assertEqual(report["later"], [{"id": "ECON 4010", "term": "Fall 2027"}])
        self.assertEqual(report["data_as_of"], "2026-10-01")
        self.assertEqual(set(report["courses"][0]), {"id", "title", "term", "credits", "harder", "gen_ed", "offered", "prereqs", "fills"})


if __name__ == "__main__":
    unittest.main()
