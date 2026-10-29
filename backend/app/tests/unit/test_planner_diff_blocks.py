"""Diff week blocks for the ghost preview (tab-workspaces eng review R16)."""

import unittest

from app.planner import checker, edits
from app.tests.unit.planner_fakes import TERM, course, plan, section

FALL = "Fall 2027"
FACTS = {
    "ECON 3010": course("ECON 3010", bundles_known=True, sections=[
        section("001", meetings=(("Mo", "09:00", "09:50"),)), section("002", meetings=(("Tu", "13:00", "13:50"),))]),
    "ECON 3020": course("ECON 3020", bundles_known=True, sections=[section("001", meetings=(("We", "11:00", "11:50"),))]),
    "ECON 4010": course("ECON 4010", bundles_known=True, sections=[section("001", meetings=(("Th", "15:00", "15:50"),))]),
}


def run(p, ops):
    before = checker.check(p, FACTS, [])
    after = checker.check(edits.apply_ops(p, ops), FACTS, [])
    return edits.diff(before, after, ops)["schedule"]


def spots(blocks):
    return [(b["course"], b["section"], b["day"]) for b in blocks]


class DiffBlocksTests(unittest.TestCase):
    def test_add_only_matches_the_added_course_blocks(self):
        p = plan(courses=[("ECON 3010", TERM, ["001"])])
        schedule = run(p, [{"op": "add", "course": "ECON 3020"}])
        self.assertEqual(spots(schedule["blocks_in"]), [("ECON 3020", "001", "We")])
        self.assertEqual(schedule["blocks_out"], [])
        self.assertEqual(schedule["blocks"], schedule["blocks_in"])  # alias for PlanPanel
        # The pre-R16 rule: the after-blocks of added courses only.
        after = checker.check(edits.apply_ops(p, [{"op": "add", "course": "ECON 3020"}]), FACTS, [])
        self.assertEqual(schedule["blocks"], [b for b in after["schedule"]["blocks"] if b["course"] == "ECON 3020"])

    def test_move_in_brings_its_blocks(self):
        p = plan(courses=[("ECON 3010", TERM, ["001"]), ("ECON 4010", FALL)])
        schedule = run(p, [{"op": "move", "course": "ECON 4010", "to_term": TERM}])
        self.assertEqual(spots(schedule["blocks_in"]), [("ECON 4010", "001", "Th")])
        self.assertEqual(schedule["blocks_out"], [])

    def test_move_out_takes_its_blocks(self):
        p = plan(courses=[("ECON 3010", TERM, ["001"]), ("ECON 3020", TERM)])
        schedule = run(p, [{"op": "move", "course": "ECON 3020", "to_term": FALL}])
        self.assertEqual((schedule["blocks_in"], spots(schedule["blocks_out"])), ([], [("ECON 3020", "001", "We")]))

    def test_pick_section_swaps_the_old_block_for_the_new(self):
        p = plan(courses=[("ECON 3010", TERM, ["001"]), ("ECON 3020", TERM)])
        schedule = run(p, [{"op": "pick_section", "course": "ECON 3010", "sections": ["002"]}])
        self.assertEqual(spots(schedule["blocks_in"]), [("ECON 3010", "002", "Tu")])
        self.assertEqual(spots(schedule["blocks_out"]), [("ECON 3010", "001", "Mo")])

    def test_remove_shows_only_what_disappears(self):
        p = plan(courses=[("ECON 3010", TERM, ["002"]), ("ECON 3020", TERM)])
        schedule = run(p, [{"op": "remove", "course": "ECON 3010"}])
        self.assertEqual(schedule["blocks_in"], [])
        self.assertEqual(spots(schedule["blocks_out"]), [("ECON 3010", "002", "Tu")])


if __name__ == "__main__":
    unittest.main()
