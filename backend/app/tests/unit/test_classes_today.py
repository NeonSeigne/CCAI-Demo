"""'Your classes today' (R12): weekdays inside the term's dates only."""

import unittest
from datetime import date
from unittest.mock import patch

import app.config
from app.api.routes import planner as routes
from app.config import AppSettings, TermDates
from app.planner import service, today
from app.tests.unit.test_planner_terms import TERM, PlannerTestCase, add

DATES = {TERM: TermDates(first_day=date(2027, 1, 7), last_day=date(2027, 4, 23)),
         "Fall 2026": TermDates(first_day=date(2026, 8, 20))}  # no last day: never shown
MONDAY = date(2027, 2, 1)


class TestTermForDay(unittest.TestCase):
    def test_inside_the_dates_on_a_weekday(self):
        self.assertEqual(today.term_for_day(DATES, MONDAY), (TERM, None))
        self.assertEqual(today.term_for_day(DATES, date(2027, 1, 7)), (TERM, None))  # first day
        self.assertEqual(today.term_for_day(DATES, date(2027, 4, 23)), (TERM, None))  # last day

    def test_before_after_weekend_and_missing(self):
        self.assertEqual(today.term_for_day(DATES, date(2027, 1, 6)), (None, "outside_term"))
        self.assertEqual(today.term_for_day(DATES, date(2027, 4, 26)), (None, "outside_term"))
        self.assertEqual(today.term_for_day(DATES, date(2027, 2, 6)), (None, "weekend"))
        # A term with only a first day counts as missing dates.
        self.assertEqual(today.term_for_day({"Fall 2026": DATES["Fall 2026"]}, date(2026, 9, 1)),
                         (None, "no_term_dates"))
        self.assertEqual(today.term_for_day({}, MONDAY), (None, "no_term_dates"))


class TestMeetingsToday(unittest.TestCase):
    def test_todays_blocks_in_start_order_and_courses_without_times(self):
        report = {
            "courses": [{"id": "ECON 3010", "title": "Micro"}, {"id": "ECON 3020", "title": "Macro"},
                        {"id": "ECON 4010", "title": "Seminar"}],
            "schedule": {"blocks": [
                {"course": "ECON 3020", "section": "002", "kind": "lecture", "day": "Mo", "start": "13:00", "end": "13:50"},
                {"course": "ECON 3010", "section": "001", "kind": "lecture", "day": "Mo", "start": "09:00", "end": "09:50"},
                {"course": "ECON 3010", "section": "001", "kind": "lecture", "day": "We", "start": "09:00", "end": "09:50"},
            ]},
        }
        result = today.meetings_today(report, MONDAY)
        self.assertEqual([(m["course"], m["start"], m["title"]) for m in result["meetings"]],
                         [("ECON 3010", "09:00", "Micro"), ("ECON 3020", "13:00", "Macro")])
        self.assertEqual(result["unscheduled"], ["ECON 4010"])


class TestTodayEndpoint(PlannerTestCase):
    def setUp(self):
        super().setUp()
        app.config._settings = AppSettings(planner={"term_dates": {
            TERM: {"first_day": "2027-01-07", "last_day": "2027-04-23"}}})
        self.addCleanup(setattr, app.config, "_settings", None)

    async def get(self, day):
        with patch.object(service, "school_today", return_value=day):
            return await routes.get_today(self.user)

    async def test_meetings_of_the_chosen_sections(self):
        await self.edit([add("ECON 3010"), add("ECON 3020"),
                         {"op": "pick_section", "course": "ECON 3010", "sections": ["001"]}])
        body = await self.get(MONDAY)
        self.assertEqual((body["show"], body["reason"], body["term"], body["date"], body["weekday"]),
                         (True, None, TERM, "2027-02-01", "Mo"))
        self.assertEqual(body["meetings"], [{"course": "ECON 3010", "title": "ECON 3010 title", "section": "001",
                                             "kind": "lecture", "start": "09:00", "end": "09:50"}])
        self.assertEqual(body["unscheduled"], ["ECON 3020"])

    async def test_hidden_outside_the_term_without_reading_the_plan(self):
        self.calls.clear()
        body = await self.get(date(2027, 5, 3))
        self.assertEqual((body["show"], body["reason"], body["meetings"]), (False, "outside_term", []))
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
