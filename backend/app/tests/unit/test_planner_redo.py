"""POST /api/planner/redo (tab-workspaces eng review R4)."""

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.api.routes import planner as routes
from app.models.planner import UndoRequest
from app.planner import service
from app.planner.facts import CourseFacts
from app.tests.unit.planner_fakes import TERM
from app.tests.unit.test_planner_terms import FACTS, FALL, FALL_FACTS, PlannerTestCase, add


class RedoTests(PlannerTestCase):
    async def undo(self):
        return await routes.post_undo(UndoRequest(expected_revision=await self.revision()), self.user)

    async def redo(self, revision=None):
        if revision is None:
            revision = await self.revision()
        return await routes.post_redo(UndoRequest(expected_revision=revision), self.user)

    async def assert_refused(self, call):
        with self.assertRaises(HTTPException) as ctx:
            await call
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["status"]), (409, "refused"))
        return ctx.exception.detail["reason"]

    async def test_redo_after_undo(self):
        await self.edit([add("ECON 3010")])
        await self.edit([add("ECON 3020")])
        undone = await self.undo()
        self.assertEqual(undone["redo_label"], "Redo: added ECON 3020")
        self.assertEqual((await routes.get_plan(self.user))["redo_label"], "Redo: added ECON 3020")

        redone = await self.redo()
        self.assertEqual([c["id"] for c in redone["plan"]["courses"]], ["ECON 3010", "ECON 3020"])
        self.assertEqual(redone["plan"]["revision"], 4)
        self.assertEqual(redone["undo_label"], "Undo: added ECON 3020")
        self.assertIsNone(redone["redo_label"])
        self.assertEqual(redone["plan"]["undo"]["pointer"], 2)
        # The redone step can be undone again.
        self.assertEqual([c["id"] for c in (await self.undo())["plan"]["courses"]], ["ECON 3010"])

    async def test_two_undos_then_two_redos(self):
        for cid in ("ECON 3010", "ECON 3020"):
            await self.edit([add(cid)])
        await self.undo()
        await self.undo()
        self.assertEqual((await self.redo())["redo_label"], "Redo: added ECON 3020")
        self.assertEqual([c["id"] for c in (await self.redo())["plan"]["courses"]], ["ECON 3010", "ECON 3020"])
        self.assertEqual(await self.assert_refused(self.redo()), "Nothing to redo")

    async def test_redo_is_cleared_by_a_new_edit(self):
        await self.edit([add("ECON 3010")])
        await self.edit([add("ECON 3020")])
        await self.undo()
        result = await self.edit([add("ECON 4010")])
        self.assertIsNone(result["redo_label"])
        self.assertEqual(await self.assert_refused(self.redo()), "Nothing to redo")

    async def test_refused_redo_returns_the_reason(self):
        await self.edit([add("ECON 3020")])
        await self.undo()
        gone = CourseFacts("ECON 3020", known="no")
        with patch.dict(FACTS, {"ECON 3020": gone}), patch.dict(FALL_FACTS, {"ECON 3020": gone}):
            reason = await self.assert_refused(self.redo())
        self.assertEqual(reason, "Can't redo that: ECON 3020 isn't a course at this school")
        self.assertEqual((await routes.get_plan(self.user))["plan"]["courses"], [])

    async def test_redo_on_a_stale_revision_is_a_conflict(self):
        await self.edit([add("ECON 3010")])
        await self.undo()
        with self.assertRaises(HTTPException) as ctx:
            await self.redo(revision=1)
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (409, "revision_conflict"))

    async def test_set_term_undo_and_redo_persist(self):
        result = await self.edit([{"op": "set_term", "term": "fall 2027"}])
        self.assertEqual(result["plan"]["term"], FALL)
        self.assertEqual(result["undo_label"], "Undo: set your term to Fall 2027")
        self.assertEqual(self.db.plans.docs[0]["term"], FALL)

        undone = await self.undo()
        self.assertEqual(undone["plan"]["term"], TERM)
        self.assertEqual((await routes.get_plan(self.user))["plan"]["term"], TERM)

        redone = await self.redo()
        self.assertEqual(redone["plan"]["term"], FALL)
        self.assertEqual((await routes.get_plan(self.user))["plan"]["term"], FALL)
        self.assertEqual(self.db.plans.docs[0]["term"], FALL)

    async def test_redo_of_a_term_no_longer_known_is_refused(self):
        await self.edit([{"op": "set_term", "term": FALL}])
        await self.undo()
        with patch.object(service, "covered_terms", return_value=[TERM]):
            reason = await self.assert_refused(self.redo())
        self.assertEqual(reason, "Can't redo that: Fall 2027 isn't a term in your plan or the school's data")
        self.assertEqual((await routes.get_plan(self.user))["plan"]["term"], TERM)


if __name__ == "__main__":
    unittest.main()
