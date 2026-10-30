"""Shortlist schedule fit (eng review R9): a clash-free section per suggestion."""

import unittest
from unittest.mock import AsyncMock, patch

import app.config
from app.api.visuals import build_visuals
from app.config import AppSettings
from app.planner import checker, suggest
from app.sources import academics
from app.tests.unit.planner_fakes import TERM, course, plan, section

MO_9 = (("Mo", "09:00", "09:50"),)
MO_10 = (("Mo", "10:00", "10:50"),)
TU_9 = (("Tu", "09:00", "09:50"),)
TH_7 = (("Th", "19:00", "19:50"),)


def term_courses(p):
    return [c for c in checker.planned_courses(p) if c.get("term") == TERM]


class TestScheduleFit(unittest.TestCase):
    def fit(self, candidate, planned=(), facts=None):
        p = plan(planned)
        facts = {**(facts or {}), candidate.identifier: candidate}
        return suggest.schedule_fit(candidate.identifier, candidate, term_courses(p), facts)

    def test_first_section_without_a_clash(self):
        busy = course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=MO_9)])
        cand = course("CS 2100", bundles_known=True, sections=[section("c1", meetings=MO_9), section("c2", meetings=MO_10)])
        out = self.fit(cand, planned=["ECON 2010"], facts={"ECON 2010": busy})
        self.assertEqual(out["fit"], "fits")
        self.assertEqual(out["section"], {"ids": ["c2"], "meetings": [
            {"section": "c2", "kind": "lecture", "day": "Mo", "start": "10:00", "end": "10:50"}]})
        self.assertIsNone(out["reason"])

    def test_every_section_clashes(self):
        busy = course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=(("Mo", "09:00", "11:00"),))])
        cand = course("CS 2100", bundles_known=True, sections=[section("c1", meetings=MO_9), section("c2", meetings=MO_10)])
        out = self.fit(cand, planned=["ECON 2010"], facts={"ECON 2010": busy})
        self.assertEqual((out["fit"], out["section"], out["clashes_with"]), ("clashes", None, ["ECON 2010"]))

    def test_times_not_published_is_unknown(self):
        cand = course("COMPSCI 300", sections=[section("001", meetings=None)])  # UW: no times
        out = self.fit(cand)
        self.assertEqual((out["fit"], out["reason"], out["section"]), ("unknown", checker.TIMES_NOT_PUBLISHED, None))
        self.assertEqual(self.fit(course("X 1", sections=None))["fit"], "unknown")

    def test_unchecked_plan_course_makes_it_unknown(self):
        # ECON 2010 has two lectures and none picked: its times can't be checked.
        busy = course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=TU_9), section("e2", meetings=TU_9)])
        cand = course("CS 2100", bundles_known=True, sections=[section("c1", meetings=MO_9)])
        out = self.fit(cand, planned=["ECON 2010"], facts={"ECON 2010": busy})
        self.assertEqual((out["fit"], out["reason"]), ("unknown", checker.SECTIONS_NOT_CHOSEN))
        self.assertEqual(out["section"]["ids"], ["c1"])

    def test_bundle_takes_a_free_companion(self):
        busy = course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=TH_7)])
        cand = course("CS 2100", bundles_known=True, sections=[
            section("lec", meetings=MO_9, requires=("lab",)),
            section("lab1", kind="lab", meetings=TH_7, requires=("lecture",)),
            section("lab2", kind="lab", meetings=TU_9, requires=("lecture",)),
        ])
        out = self.fit(cand, planned=["ECON 2010"], facts={"ECON 2010": busy})
        self.assertEqual((out["fit"], out["section"]["ids"]), ("fits", ["lec", "lab2"]))

    def test_bundle_whose_companions_all_clash(self):
        busy = course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=TH_7)])
        cand = course("CS 2100", bundles_known=True, sections=[
            section("lec", meetings=MO_9, requires=("lab",)),
            section("lab1", kind="lab", meetings=TH_7, requires=("lecture",)),
        ])
        out = self.fit(cand, planned=["ECON 2010"], facts={"ECON 2010": busy})
        self.assertEqual((out["fit"], out["clashes_with"]), ("clashes", ["ECON 2010"]))

    def test_companion_without_times_is_unknown(self):
        cand = course("CS 2100", bundles_known=True, sections=[
            section("lec", meetings=MO_9, requires=("discussion",)),
            section("dis", kind="discussion", meetings=None, requires=("lecture",)),
        ])
        out = self.fit(cand)
        self.assertEqual((out["fit"], out["reason"], out["section"]["ids"]),
                         ("unknown", checker.TIMES_NOT_PUBLISHED, ["lec"]))


class TestSuggestItems(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = AppSettings(tools={"course_search": {"enabled": True}})

    def tearDown(self):
        app.config._settings = None

    async def test_items_carry_fit_section_gpa_and_rank_clashes_last(self):
        facts = {
            "ECON 2010": course("ECON 2010", bundles_known=True, sections=[section("e1", meetings=MO_9)]),
            "CS 2100": course("CS 2100", bundles_known=True, avg_gpa=3.2, harder=False, sections=[section("c1", meetings=MO_9)]),
            "CS 2120": course("CS 2120", bundles_known=True, avg_gpa=2.8, harder=True, sections=[section("d1", meetings=MO_10)]),
        }

        async def provider(ids, term):
            return {i: facts[i] for i in ids if i in facts}

        found = {"courses": [{"identifier": "CS 2100"}, {"identifier": "CS 2120"}]}
        with patch.object(academics, "search_catalog", AsyncMock(return_value=found)):
            out = await suggest.suggest(plan(["ECON 2010"]), "cs", TERM, facts_provider=provider)
        first, second = out["items"]
        self.assertEqual((first["id"], first["fit"]), ("CS 2120", "fits"))
        self.assertEqual(first["section"]["meetings"][0]["start"], "10:00")
        self.assertEqual((first["gpa"], first["difficulty"]), (2.8, "harder"))
        self.assertEqual((second["id"], second["fit"], second["clashes_with"]), ("CS 2100", "clashes", ["ECON 2010"]))
        self.assertEqual((second["gpa"], second["difficulty"], second["section"]), (3.2, "typical", None))

    def test_shortlist_visual_passes_the_fit_through(self):
        item = {"option_id": "option-1", "id": "CS 2120", "title": "t", "why": "", "labels": [],
                "prereqs": {"status": "met", "reason": None}, "credits": [3, 3], "gpa": 2.8,
                "difficulty": "harder", "fit": "fits", "fit_reason": None, "clashes_with": [],
                "section": {"ids": ["d1"], "meetings": [{"section": "d1", "kind": "lecture", "day": "Mo",
                                                         "start": "10:00", "end": "10:50"}]}}
        (spec,) = build_visuals([{"name": "plan_suggest", "result": {"items": [item], "term": TERM}}])
        self.assertEqual(spec["items"][0], item)


if __name__ == "__main__":
    unittest.main()
