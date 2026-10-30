"""POST /api/planner/preview (eng review R2): the diff a proposal would make, stored nowhere."""

import copy
import unittest

from fastapi import HTTPException

from app.api.routes import planner as routes
from app.models.planner import PreviewRequest, ProposalRequest
from app.tests.unit.test_planner_terms import FALL, PlannerTestCase, add


class PreviewTests(PlannerTestCase):
    async def preview(self, ops, term=None, revision=None):
        if revision is None:
            revision = await self.revision()
        return await routes.post_preview(PreviewRequest(ops=ops, expected_revision=revision, term=term), self.user)

    async def test_preview_writes_nothing_and_keeps_the_pending_proposal(self):
        await self.edit([add("ECON 3010")])
        revision = await self.revision()
        pending = (await routes.post_proposal(ProposalRequest(ops=[add("ECON 3020")], expected_revision=revision),
                                              self.user))["proposal"]
        stored = copy.deepcopy(self.db.plans.docs)

        result = await self.preview([add("ECON 4010")])

        self.assertEqual(result["revision"], revision)
        self.assertEqual(result["diff"]["courses"]["added"], ["ECON 4010"])
        self.assertEqual(self.db.plans.docs, stored)  # no revision bump, proposal untouched
        view = await routes.get_plan(self.user)
        self.assertEqual(view["plan"]["revision"], revision)
        self.assertEqual(view["proposal"]["id"], pending["id"])
        self.assertEqual(view["proposal"]["status"], "pending")

    async def test_preview_diff_equals_the_equivalent_proposals_diff(self):
        await self.edit([add("ECON 3010")])
        ops = [{"op": "move", "course": "ECON 3010", "to_term": FALL}, add("ECON 3300")]
        previewed = (await self.preview(ops))["diff"]
        proposal = (await routes.post_proposal(ProposalRequest(ops=ops, expected_revision=await self.revision()),
                                               self.user))["proposal"]
        self.assertEqual(previewed, proposal["diff"])

    async def test_preview_in_another_term(self):
        await self.edit([add("ECON 3010")])
        diff = (await self.preview([{"op": "move", "course": "ECON 3010", "to_term": FALL}], term=FALL))["diff"]
        self.assertEqual(diff["courses"]["moved"], [{"id": "ECON 3010", "from": "Spring 2027", "to": FALL,
                                                     "title": "ECON 3010 title", "credits": [3.0, 3.0]}])
        self.assertEqual([t["term"] for t in diff["terms"]], ["Spring 2027", FALL])
        spring, fall = diff["terms"]
        self.assertEqual((spring["before"]["min"], spring["after"]["min"]), (3.0, 0))
        self.assertEqual((fall["before"]["min"], fall["after"]["min"]), (0, 3.0))
        self.assertEqual(diff["credits"], {"before": [0, 0], "after": [3.0, 3.0]})
        self.assertIn("ECON 3010 isn't offered in Fall 2027", diff["unknowns"])

    async def test_stale_revision_and_bad_ops(self):
        await self.edit([add("ECON 3010")])
        with self.assertRaises(HTTPException) as ctx:
            await self.preview([add("ECON 3020")], revision=0)
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (409, "revision_conflict"))
        with self.assertRaises(HTTPException) as ctx:
            await self.preview([add("ECON 9999")])
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail["code"]), (422, "unknown_course"))


if __name__ == "__main__":
    unittest.main()
