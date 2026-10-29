"""The degree board (eng review R12): all planned terms, one bounded batch."""

import asyncio
import time
import unittest
from unittest.mock import patch

from app.api.routes import planner as routes
from app.planner import service
from app.tests.unit.planner_fakes import TERM, course
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
                               "harder": True, "offered": "yes", "requirements": ["Economics electives"], "gen_ed": []})
        self.assertEqual(body["completed"], [{"id": "ECON 2010", "title": "ECON 2010 title", "credits": [3.0, 3.0],
                                              "grade": "B+", "term": None}])
        (rule,) = body["rules"]
        self.assertEqual((rule["rule_id"], rule["planned"], rule["needed"]), ("el", 2, 4))
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

    async def test_board_route_for_a_new_plan(self):
        body = await routes.get_degree(self.user)
        self.assertEqual([t["term"] for t in body["terms"]], [TERM])
        self.assertEqual((body["terms"][0]["courses"], body["completed"], body["rules"]), ([], [], []))


if __name__ == "__main__":
    unittest.main()
