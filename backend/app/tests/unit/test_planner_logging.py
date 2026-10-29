"""Planner log lines (CEO review C5): fact deadline misses and the new routes."""

import asyncio
import hashlib
import logging
import unittest

from fastapi import HTTPException

from app.api.routes import planner as routes
from app.models.planner import PreviewRequest, UndoRequest
from app.planner.facts import load_facts, load_facts_by_term
from app.tests.unit.planner_fakes import course
from app.tests.unit.test_planner_terms import PlannerTestCase, add


async def _slow_for(slow, ids, term):
    if set(ids) & slow:
        await asyncio.sleep(5)
    return {i: course(i) for i in ids}


def test_timed_out_batch_logs_one_warning_naming_the_courses(caplog):
    async def provider(ids, term):
        return await _slow_for({"ECON 4998", "ECON 4999"}, ids, term)

    with caplog.at_level(logging.WARNING, logger="app.planner.facts"):
        asyncio.run(load_facts(["ECON 3010", "ECON 4998", "ECON 4999"], "Spring 2027", provider=provider,
                               budget_s=0.05, school="uva"))
    (record,) = [r for r in caplog.records if r.name == "app.planner.facts"]
    assert record.levelno == logging.WARNING
    message = record.getMessage()
    for part in ("school=uva", "term=Spring 2027", "budget_s=0.05", "ECON 4998", "ECON 4999"):
        assert part in message
    assert "ECON 3010" not in message
    assert record.facts_timeout["terms"] == {"Spring 2027": ["ECON 4998", "ECON 4999"]}


def test_multi_term_batch_still_logs_once(caplog):
    async def provider(ids, term):
        return await _slow_for({"ECON 4999"} if term == "Spring 2027" else {"ECON 3020"}, ids, term)

    with caplog.at_level(logging.WARNING, logger="app.planner.facts"):
        asyncio.run(load_facts_by_term({"Spring 2027": ["ECON 4999"], "Fall 2027": ["ECON 3020", "ECON 3010"]},
                                       provider=provider, budget_s=0.05, school="uva"))
    (record,) = [r for r in caplog.records if r.name == "app.planner.facts"]
    assert record.facts_timeout["terms"] == {"Spring 2027": ["ECON 4999"], "Fall 2027": ["ECON 3020"]}


def test_batch_within_budget_logs_nothing(caplog):
    async def provider(ids, term):
        return {i: course(i) for i in ids}

    with caplog.at_level(logging.WARNING, logger="app.planner.facts"):
        asyncio.run(load_facts(["ECON 3010"], "Spring 2027", provider=provider, school="uva"))
    assert not [r for r in caplog.records if r.name == "app.planner.facts"]


class RouteLogTests(PlannerTestCase):
    def line(self, logs, name):
        (found,) = [r.getMessage() for r in logs.records if r.getMessage().startswith(f"planner {name} ")]
        return found

    async def test_preview_redo_and_degree_log_one_line_each(self):
        await self.edit([add("ECON 3010")])
        user_hash = hashlib.sha256(str(self.user.id).encode()).hexdigest()[:12]
        with self.assertLogs("app.api.routes.planner", logging.INFO) as logs:
            await routes.post_preview(PreviewRequest(ops=[add("ECON 3020")], expected_revision=1), self.user)
            await routes.get_degree(self.user)
            with self.assertRaises(HTTPException):
                await routes.post_redo(UndoRequest(expected_revision=1), self.user)
        preview, degree, redo = (self.line(logs, n) for n in ("preview", "degree", "redo"))
        self.assertRegex(preview, rf"^planner preview user={user_hash} revision=1 duration_ms=\d+ outcome=ok$")
        self.assertIn("revision=1", degree)
        self.assertIn("outcome=ok", degree)
        self.assertTrue(redo.endswith("outcome=refused"))
        self.assertNotIn(str(self.user.id), "\n".join(r.getMessage() for r in logs.records))

    async def test_route_log_carries_the_error_code(self):
        await self.edit([add("ECON 3010")])
        with self.assertLogs("app.api.routes.planner", logging.INFO) as logs:
            for ops, revision in (([add("ECON 3020")], 0), ([add("ECON 9999")], 1)):
                with self.assertRaises(HTTPException):
                    await routes.post_preview(PreviewRequest(ops=ops, expected_revision=revision), self.user)
        outcomes = [r.getMessage().rsplit("outcome=", 1)[1] for r in logs.records]
        self.assertEqual(outcomes, ["revision_conflict", "unknown_course"])


if __name__ == "__main__":
    unittest.main()
