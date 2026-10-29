"""A same-key retry racing its original request (tab-workspaces N3).

The client resends a timed-out edit with the same idempotency key. If the
original commits after the retry read the plan but before the retry writes,
the retry's revision-guarded write misses; it must come back as a repeat of
the original, not as a revision conflict.
"""
import unittest
from types import SimpleNamespace

from app.planner import store
from app.tests.unit.planner_fakes import TERM, FakePlans

SCHOOL = "uva"


def add(cid):
    return {"op": "add", "course": cid}


class RacingPlans(FakePlans):
    """Runs `before_write` once, just before the first guarded write lands."""

    def __init__(self):
        super().__init__()
        self.before_write = None

    async def find_one_and_update(self, flt, update, return_document=None):
        hook, self.before_write = self.before_write, None
        if hook:
            await hook()
        return await super().find_one_and_update(flt, update, return_document)


class SameKeyRaceTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = SimpleNamespace(plans=RacingPlans())
        await store.get_or_create(self.db, "u", SCHOOL, term=TERM)

    async def test_retry_that_loses_the_race_to_its_original_is_a_repeat(self):
        async def original_lands():
            await store.commit_edit(self.db, "u", SCHOOL, [add("ECON 3010")],
                                    expected_revision=0, idempotency_key="same")

        self.db.plans.before_write = original_lands
        plan, repeated = await store.commit_edit(self.db, "u", SCHOOL, [add("ECON 3010")],
                                                 expected_revision=0, idempotency_key="same")
        self.assertTrue(repeated)
        self.assertEqual(plan["revision"], 1)
        self.assertEqual([c["id"] for c in plan["courses"]], ["ECON 3010"])

    async def test_a_different_key_that_loses_the_race_is_still_a_conflict(self):
        async def other_tab_lands():
            await store.commit_edit(self.db, "u", SCHOOL, [add("ECON 3020")],
                                    expected_revision=0, idempotency_key="other")

        self.db.plans.before_write = other_tab_lands
        with self.assertRaises(store.RevisionConflict) as caught:
            await store.commit_edit(self.db, "u", SCHOOL, [add("ECON 3010")],
                                    expected_revision=0, idempotency_key="mine")
        self.assertEqual(caught.exception.revision, 1)


if __name__ == "__main__":
    unittest.main()
