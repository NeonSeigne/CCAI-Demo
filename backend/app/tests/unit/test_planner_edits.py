import unittest

from app.planner import checker, edits
from app.planner.edits import EditError
from app.planner.facts import CourseFacts
from app.tests.unit.planner_fakes import Program, Rule, course, plan, section


class ValidationTests(unittest.TestCase):
    def test_invented_course_is_unknown_course(self):
        facts = {"ECON 9999": CourseFacts("ECON 9999", known="no")}
        with self.assertRaises(EditError) as ctx:
            edits.validate_ops(plan(), [{"op": "add", "course": "ECON 9999"}], facts)
        self.assertEqual(ctx.exception.code, "unknown_course")

    def test_identity_lookup_timeout_is_couldnt_verify(self):
        facts = {"ECON 3010": CourseFacts("ECON 3010", known="unavailable", unavailable_reason="Took too long to check")}
        for ops in ([{"op": "add", "course": "ECON 3010"}], [{"op": "swap", "out": "ECON 2010", "in": "ECON 3010"}]):
            with self.subTest(op=ops[0]["op"]):
                with self.assertRaises(EditError) as ctx:
                    edits.validate_ops(plan(["ECON 2010"]), ops, facts)
                self.assertEqual(ctx.exception.code, "couldnt_verify_course")
                self.assertIn("Took too long", ctx.exception.message)

    def test_known_course_with_unknown_prereqs_is_fine(self):
        facts = {"ECON 3010": course("ECON 3010", prereq_known=False)}
        self.assertEqual(edits.validate_ops(plan(), [{"op": "add", "course": "econ  3010"}], facts), [])

    def test_unverified_completed_course_is_kept_with_a_note(self):
        facts = {"ECON 1990": CourseFacts("ECON 1990", known="no")}
        ops = [{"op": "set_profile", "completed": [{"id": "ECON 1990", "grade": "A", "term": "Fall 2024"}]}]
        notes = edits.validate_ops(plan(), ops, facts)
        self.assertEqual(notes, ["Couldn't verify ECON 1990; kept as you entered it"])
        after = edits.apply_ops(plan(), ops)
        self.assertEqual(after["profile"]["completed"][0]["id"], "ECON 1990")

    def test_plan_shape_errors(self):
        cases = [
            ([{"op": "remove", "course": "ECON 3010"}], "not_in_plan"),
            ([{"op": "add", "course": "ECON 2010"}], "already_in_plan"),
            ([{"op": "move", "course": "ECON 2010"}], "bad_op"),
            ([{"op": "fly", "course": "ECON 2010"}], "bad_op"),
            ([{"op": "pick_section", "course": "ECON 2010", "sections": ["999"]}], "unknown_section"),
        ]
        facts = {"ECON 2010": course("ECON 2010", sections=[section("001")])}
        for ops, code in cases:
            with self.subTest(code=code, op=ops[0]["op"]):
                with self.assertRaises(EditError) as ctx:
                    edits.validate_ops(plan(["ECON 2010"]), ops, facts)
                self.assertEqual(ctx.exception.code, code)

    def test_ops_are_checked_in_sequence(self):
        facts = {"ECON 2010": course("ECON 2010")}
        ops = [{"op": "remove", "course": "ECON 2010"}, {"op": "add", "course": "ECON 2010"}]
        self.assertEqual(edits.validate_ops(plan(["ECON 2010"]), ops, facts), [])


class ApplyAndInverseTests(unittest.TestCase):
    def test_apply_does_not_mutate(self):
        before = plan(["ECON 2010"])
        edits.apply_ops(before, [{"op": "remove", "course": "ECON 2010"}])
        self.assertEqual(len(before["courses"]), 1)

    def test_inverse_restores_the_plan(self):
        start = plan([("ECON 2010", "Spring 2027", ["001"]), "ECON 3010"], completed=[("MATH 1310", "B")])
        cases = [
            [{"op": "add", "course": "ECON 3300"}],
            [{"op": "remove", "course": "ECON 2010"}],
            [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}],
            [{"op": "swap", "out": "ECON 2010", "in": "ECON 2020"}],
            [{"op": "pick_section", "course": "ECON 3010", "sections": ["002"]}],
            [{"op": "set_profile", "program_ids": ["econ-ba"], "completed": []}],
            [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}, {"op": "add", "course": "ECON 3300"}],
        ]
        for ops in cases:
            with self.subTest(ops=ops):
                after = edits.apply_ops(start, ops)
                back = edits.apply_ops(after, edits.inverse_ops(start, ops))
                key = lambda p: sorted((c["id"], c["term"], tuple(c["sections"] or ())) for c in p["courses"])  # noqa: E731
                self.assertEqual(key(back), key(start))
                self.assertEqual(back["profile"], start["profile"])

    def test_labels(self):
        self.assertEqual(edits.undo_label([{"op": "remove", "course": "ECON 3010"}]), "Undo: removed ECON 3010")
        self.assertEqual(
            edits.heading([{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}, {"op": "add", "course": "ECON 3300"}]),
            "Move ECON 3010 to Fall 2027, add ECON 3300",
        )
        self.assertEqual(edits.heading([{"op": "swap", "out": "ECON 3010", "in": "ECON 3020"}]), "Swap ECON 3010 for ECON 3020")


class SetTermTests(unittest.TestCase):
    """set_term (setup-dialog R1): sets the plan's term; undo restores the old one."""

    def test_apply_and_inverse(self):
        start = plan(["ECON 2010"])
        ops = [{"op": "set_term", "term": "Fall 2027"}]
        edits.check_applies(start, ops)
        after = edits.apply_ops(start, ops)
        self.assertEqual((after["term"], start["term"]), ("Fall 2027", "Spring 2027"))
        self.assertEqual(after["courses"], start["courses"])
        self.assertEqual(edits.inverse_ops(start, ops), [{"op": "set_term", "term": "Spring 2027"}])
        self.assertEqual(edits.apply_ops(after, edits.inverse_ops(start, ops))["term"], "Spring 2027")
        self.assertEqual(edits.undo_label(ops), "Undo: set your term to Fall 2027")

    def test_later_adds_land_in_the_new_term(self):
        ops = [{"op": "set_term", "term": "Fall 2027"}, {"op": "add", "course": "ECON 3010"}]
        self.assertEqual(edits.apply_ops(plan(), ops)["courses"][0]["term"], "Fall 2027")
        self.assertEqual(edits.destination_terms(plan(), ops), ["Spring 2027", "Fall 2027"])

    def test_shape(self):
        for op in ({"op": "set_term"}, {"op": "set_term", "term": ""}, {"op": "set_term", "term": 2027}):
            with self.subTest(op=op):
                with self.assertRaises(EditError) as ctx:
                    edits.check_applies(plan(), [op])
                self.assertEqual(ctx.exception.code, "bad_op")

    def test_unknown_term_is_refused(self):
        from unittest.mock import patch

        from app.planner import service

        with patch.object(service, "covered_terms", return_value=["Spring 2027", "Fall 2027"]):
            self.assertEqual(service.known_term_ops(plan(), [{"op": "set_term", "term": "fall  2027"}]),
                             [{"op": "set_term", "term": "Fall 2027"}])
            with self.assertRaises(EditError) as ctx:
                service.known_term_ops(plan(), [{"op": "set_term", "term": "Fall 2031"}])
        self.assertEqual(ctx.exception.code, "unknown_term")


class CompletedCreditsTests(unittest.TestCase):
    """A completed entry may carry transcript credits, 0 to 12 (setup-dialog R10)."""

    def op(self, credits):
        return [{"op": "set_profile", "completed": [{"id": "ECON 2010", "grade": "A", "term": None, "credits": credits}]}]

    def test_credits_in_range_are_kept(self):
        for credits in (0, 3, 4.5, 12, None):
            with self.subTest(credits=credits):
                edits.check_applies(plan(), self.op(credits))
                self.assertEqual(edits.apply_ops(plan(), self.op(credits))["profile"]["completed"][0]["credits"], credits)

    def test_credits_out_of_range_are_bad_op(self):
        for credits in (-1, 12.5, "3", True):
            with self.subTest(credits=credits):
                with self.assertRaises(EditError) as ctx:
                    edits.check_applies(plan(), self.op(credits))
                self.assertEqual(ctx.exception.code, "bad_op")

    def test_entries_without_credits_are_unchanged(self):
        ops = [{"op": "set_profile", "completed": [{"id": "ECON 2010", "grade": "A", "term": None}]}]
        edits.check_applies(plan(), ops)
        self.assertNotIn("credits", edits.apply_ops(plan(), ops)["profile"]["completed"][0])


class DiffTests(unittest.TestCase):
    def setUp(self):
        self.ids = ["ECON 3010", "ECON 3020", "ECON 3300", "ECON 4010", "ECON 4020"]
        self.facts = {c: course(c) for c in self.ids}
        rule = Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=3000, n=6)
        self.programs = [Program("econ", "Econ", rules=(rule,))]

    def report(self, p):
        return checker.check(p, self.facts, self.programs, credit_limits={"min": 12, "max": 18})

    def test_rule_counts_change_with_the_same_status(self):
        # R16: 4/6 -> 3/6, still short, is still in the diff.
        before_plan = plan(self.ids[:4], programs=["econ"])
        ops = [{"op": "remove", "course": "ECON 4010"}]
        result = edits.diff(self.report(before_plan), self.report(edits.apply_ops(before_plan, ops)), ops)
        self.assertEqual(result["rules"], [{
            "program_id": "econ", "rule_id": "el", "title": "Economics electives",
            "before": {"status": "short", "completed": 0, "planned": 4, "needed": 6},
            "after": {"status": "short", "completed": 0, "planned": 3, "needed": 6},
        }])
        self.assertEqual(result["courses"], {"added": [], "removed": ["ECON 4010"], "moved": []})
        self.assertEqual(result["credits"], {"before": [12.0, 12.0], "after": [9.0, 9.0]})
        self.assertEqual(result["heading"], "Remove ECON 4010")

    def test_unchanged_rules_are_left_out(self):
        rule = Rule("intro", "Intro", "all_of", courses=("ECON 2010",))
        programs = [Program("econ", "Econ", rules=(rule,))]
        before_plan = plan(["ECON 3010"], completed=["ECON 2010"], programs=["econ"])
        ops = [{"op": "add", "course": "ECON 3020"}]
        before = checker.check(before_plan, self.facts, programs)
        after = checker.check(edits.apply_ops(before_plan, ops), self.facts, programs)
        self.assertEqual(edits.diff(before, after, ops)["rules"], [])

    def test_moved_and_unknowns(self):
        self.facts["ECON 3300"] = course("ECON 3300", prereq_known=False)
        self.facts["ECON 3010"] = course("ECON 3010", prereq_known=False)
        before_plan = plan(["ECON 3010", "ECON 3300"])
        ops = [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}]
        result = edits.diff(self.report(before_plan), self.report(edits.apply_ops(before_plan, ops)), ops,
                            notes=["Couldn't verify ECON 1990; kept as you entered it"])
        self.assertEqual(result["courses"]["moved"], [{"id": "ECON 3010", "from": "Spring 2027", "to": "Fall 2027"}])
        # Unknowns about courses the edit doesn't touch stay off the card (found in the browser).
        self.assertNotIn("Prerequisites not published for ECON 3300", result["unknowns"])
        # An added course's own unknowns do show.
        self.facts["ECON 3820"] = course("ECON 3820", prereq_known=False)
        add = [{"op": "add", "course": "ECON 3820"}]
        added = edits.diff(self.report(before_plan), self.report(edits.apply_ops(before_plan, add)), add)
        self.assertIn("Prerequisites not published for ECON 3820", added["unknowns"])
        self.assertNotIn("Prerequisites not published for ECON 3300", added["unknowns"])
        self.assertEqual(result["unknowns"][0], "Couldn't verify ECON 1990; kept as you entered it")
        self.assertEqual(set(result), {"heading", "courses", "rules", "credits", "difficulty", "clashes", "unknowns", "literal_differs",
                                       "added_courses", "schedule"})

    def test_literal_differs(self):
        before_plan = plan(["ECON 3010"])
        move = [{"op": "move", "course": "ECON 3010", "to_term": "Fall 2027"}]
        before, after = self.report(before_plan), self.report(edits.apply_ops(before_plan, move))
        self.assertEqual(edits.diff(before, after, move, asked="drop")["literal_differs"],
                         "You said drop; I moved ECON 3010 to Fall 2027")
        self.assertIsNone(edits.diff(before, after, move, asked="move")["literal_differs"])
        self.assertIsNone(edits.diff(before, after, move)["literal_differs"])


if __name__ == "__main__":
    unittest.main()
