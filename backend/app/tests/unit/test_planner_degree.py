"""The degree board (eng review R12): all planned terms, one bounded batch."""

import asyncio
import time
import unittest
from unittest.mock import patch

from app.api.routes import planner as routes
from app.planner import checker, degree, service
from app.planner.facts import CourseFacts, PrereqNode
from app.planner.programs import Deadline
from app.tests.unit.planner_fakes import TERM, Program, Rule, course, plan
from app.tests.unit.test_planner_terms import FALL, FALL_FACTS, PlannerTestCase, add

SET_ECON = {"op": "set_profile", "program_ids": ["econ-ba"], "completed": [{"id": "ECON 2010", "grade": "B+"}]}


class DegreeBoardTests(PlannerTestCase):
    async def test_board_has_every_planned_term_completed_courses_and_rules(self):
        await self.edit([SET_ECON, add("ECON 3010"), add("ECON 3020", FALL)])
        self.calls.clear()
        with patch.dict(FALL_FACTS, {"ECON 3020": course("ECON 3020", avg_gpa=2.9, harder=True)}):
            body = await routes.get_degree(self.user)
        self.assertEqual(body["revision"], 1)
        self.assertEqual([t["term"] for t in body["terms"]], [TERM, FALL])
        spring, fall = body["terms"]
        self.assertEqual((spring["credits"]["min"], spring["credits"]["limits"]), (3.0, {"min": 12, "max": 18}))
        self.assertEqual(spring["credits"]["status"], "short")
        self.assertEqual(fall["difficulty"]["label"], "Light")
        (row,) = fall["courses"]
        self.assertEqual(row, {"id": "ECON 3020", "title": "ECON 3020 title", "credits": [3.0, 3.0], "avg_gpa": 2.9,
                               "harder": True, "difficulty": "harder", "offered": "yes", "requirements": ["Economics electives"], "gen_ed": [],
                               "sections": [], "opens": [], "opens_complete": False})
        self.assertEqual(body["completed"], [{"id": "ECON 2010", "title": "ECON 2010 title", "credits": [3.0, 3.0],
                                              "grade": "B+", "term": None, "opens": [], "opens_complete": False}])
        (rule,) = body["rules"]
        self.assertEqual((rule["rule_id"], rule["planned"], rule["needed"]), ("el", 2, 4))
        self.assertEqual(body["route"]["lines"], [{"program_id": "econ-ba", "name": "Economics electives", "rule_ids": ["el"]}])
        self.assertEqual(body["route"]["slots"][0]["open"], 2)
        # Each course was looked up in its own term, all in one batch.
        self.assertIn((("ECON 3020",), FALL), self.calls)
        self.assertNotIn((("ECON 3020",), TERM), self.calls)
        self.assertEqual({ids for ids, term in self.calls if term == TERM}, {("ECON 3010",), ("ECON 2010",)})

    async def test_slow_term_misses_the_shared_deadline_without_holding_the_others(self):
        await self.edit([add("ECON 3010"), add("ECON 3020", FALL)])
        fast = service.facts_provider

        async def provider(ids, term):
            if term == FALL:
                await asyncio.sleep(5)
            return await fast(ids, term)

        with patch.object(service, "facts_provider", provider), patch.object(service, "FACTS_BUDGET_S", 0.05):
            started = time.monotonic()
            body = await routes.get_degree(self.user)
            elapsed = time.monotonic() - started
        self.assertLess(elapsed, 1.0)
        spring, fall = body["terms"]
        self.assertEqual(spring["courses"][0]["credits"], [3.0, 3.0])
        self.assertIsNone(fall["courses"][0]["credits"])
        self.assertEqual(fall["credits"]["status"], "unknown")
        self.assertIsNone(fall["difficulty"]["label"])

    async def test_uncovered_term_makes_no_provider_call_and_reads_offered_unknown(self):
        await self.edit([add("ECON 3010"), add("ECON 3020", FALL)])
        self.calls.clear()
        with patch.object(service, "covered_terms", return_value=["Fall 2026", "Spring 2027"]):
            body = await routes.get_degree(self.user)
        self.assertTrue(self.calls)
        self.assertNotIn(FALL, {term for _, term in self.calls})
        spring, fall = body["terms"]
        self.assertEqual((spring["covered"], fall["covered"]), (True, False))
        self.assertEqual(fall["courses"][0]["offered"], "unknown")
        self.assertEqual(fall["courses"][0]["credits"], [3.0, 3.0])  # identity and credits still known

    async def test_saved_credits_beat_catalog_credits(self):
        # Setup-dialog R10: a transcript row's credits are saved with the
        # completed entry; a manual entry without credits keeps the catalog's.
        await self.edit([{"op": "set_profile", "program_ids": ["econ-ba"], "completed": [
            {"id": "ECON 3010", "grade": "A", "credits": 4.5},
            {"id": "ECON 2010", "grade": "B", "credits": 1},
            {"id": "ECON 3020", "grade": "B"},
        ]}])
        body = await routes.get_degree(self.user)
        credits = {row["id"]: row["credits"] for row in body["completed"]}
        self.assertEqual(credits, {"ECON 3010": [4.5, 4.5], "ECON 2010": [1.0, 1.0], "ECON 3020": [3.0, 3.0]})
        electives, other = body["waffle"]["groups"]
        self.assertEqual(electives["earned"], 7.5)  # 4.5 saved + 3 catalog
        self.assertEqual(other["earned"], 1.0)

    async def test_board_route_for_a_new_plan(self):
        body = await routes.get_degree(self.user)
        self.assertEqual([t["term"] for t in body["terms"]], [TERM])
        self.assertEqual((body["terms"][0]["courses"], body["completed"], body["rules"]), ([], [], []))


if __name__ == "__main__":
    unittest.main()


class RouteTests(unittest.TestCase):
    """The route map's data (R2, R9): lines, deadline, open slots, prerequisite links."""

    def setUp(self):
        rules = (
            Rule("intro", "Introductory economics", "all_of", courses=("ECON 2010", "ECON 2020"), line="Foundations"),
            Rule("stats", "Statistics", "all_of", courses=("STAT 2120",), line="Foundations"),
            Rule("micro", "Intermediate micro", "all_of", courses=("ECON 3010",), line="Core theory"),
            Rule("el", "Economics electives", "level", subjects=("ECON",), min_level=4000, n=4),
            Rule("lab", "Lab credits", "credits_from", credits=6.0, courses=("ECON 4720", "ECON 4730")),
        )
        self.programs = [Program("econ-ba", "Economics B.A.", rules=rules,
                                 deadline=Deadline(rules=("micro",), by_semester=6))]
        either = PrereqNode("any", children=(PrereqNode("course", course="ECON 2010"),
                                             PrereqNode("course", course="ECON 9999")))
        both = PrereqNode("all", children=(either, PrereqNode("course", course="STAT 2120")))
        self.facts = {
            "ECON 2010": course("ECON 2010"),
            "STAT 2120": course("STAT 2120"),
            "ECON 3010": course("ECON 3010", prereq_tree=both),
            "ECON 4010": course("ECON 4010", prereq_tree=PrereqNode("course", course="econ 3010")),
        }
        self.plan = plan(["ECON 3010", "STAT 2120"])
        self.plan["courses"].append({"id": "ECON 4010", "term": "Fall 2027", "sections": None})
        self.plan["profile"]["completed"] = [{"id": "ECON 2010", "grade": "A-", "term": "Fall 2025"}]

    def route(self):
        rules, _ = checker.check_rules(self.plan, self.facts, self.programs)
        return degree.route(self.plan, self.facts, self.programs, rules)

    def test_rules_share_a_named_line_and_unnamed_rules_get_their_own(self):
        lines = self.route()["lines"]
        self.assertEqual([(l["name"], l["rule_ids"]) for l in lines], [
            ("Foundations", ["intro", "stats"]), ("Core theory", ["micro"]),
            ("Economics electives", ["el"]), ("Lab credits", ["lab"]),
        ])
        self.assertEqual({l["program_id"] for l in lines}, {"econ-ba"})

    def test_deadline_comes_from_the_program(self):
        self.assertEqual(self.route()["deadline"], {"program_id": "econ-ba", "rule_ids": ["micro"], "by_semester": 6})
        self.programs = [Program("econ-ba", "Economics B.A.", rules=self.programs[0].rules)]
        self.assertIsNone(self.route()["deadline"])

    def test_slots_are_courses_the_plan_has_not_chosen(self):
        slots = {s["rule_id"]: (s["line"], s["open"]) for s in self.route()["slots"]}
        # ECON 2020 unchosen; 3 of 4 electives open; 6 lab credits is 2 courses.
        self.assertEqual(slots, {"intro": ("Foundations", 1), "el": ("Economics electives", 3),
                                 "lab": ("Lab credits", 2)})

    def test_edges_link_prerequisites_inside_the_plan_only(self):
        edges = {(e["from"], e["to"]) for e in self.route()["edges"]}
        # AND and OR parts alike; ECON 9999 is not in the plan, so no edge.
        self.assertEqual(edges, {("ECON 2010", "ECON 3010"), ("STAT 2120", "ECON 3010"), ("ECON 3010", "ECON 4010")})

    def test_unknown_facts_give_no_edges(self):
        self.facts["ECON 3010"] = CourseFacts("ECON 3010", known="unavailable")
        edges = {(e["from"], e["to"]) for e in self.route()["edges"]}
        self.assertEqual(edges, {("ECON 3010", "ECON 4010")})
