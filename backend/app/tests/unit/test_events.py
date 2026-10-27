"""Tests for the iCal events helper and the events_search tool."""

import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

import app.config
from app.config import AppSettings
from app.sources import cache, ical_events
from app.tools import events_search

DENVER = ZoneInfo("America/Denver")
FEED_URL = "https://calendar.example.edu/calendar.ics"

# Tuesday 2026-10-27 is the "today" used throughout.
FEED = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:test
X-WR-TIMEZONE:Mountain
BEGIN:VEVENT
UID:weekly-yoga
SUMMARY:Weekly Yoga
DTSTART;TZID=Mountain Time (US & Canada):20261006T180000
DTEND;TZID=Mountain Time (US & Canada):20261006T190000
RRULE:FREQ=WEEKLY;BYDAY=TU
EXDATE;TZID=Mountain Time (US & Canada):20261103T180000
LOCATION:Rec Center
END:VEVENT
BEGIN:VEVENT
UID:concert
SUMMARY:Jazz Concert: P&#233;lagie Trio
DTSTART:20261027T193000
DTEND:20261027T210000
LOCATION:Macky Auditorium
DESCRIPTION:An evening of jazz.
END:VEVENT
BEGIN:VEVENT
UID:deadline
SUMMARY:Last Day to Drop
DTSTART;VALUE=DATE:20261027
DTEND;VALUE=DATE:20261028
END:VEVENT
BEGIN:VEVENT
UID:exhibit
SUMMARY:Design Exhibition
DTSTART;TZID=America/Denver:20260901T090000
DTEND;TZID=America/Denver:20261215T170000
LOCATION:Gallery
END:VEVENT
BEGIN:VEVENT
UID:saturday-game
SUMMARY:Football vs. Utah
DTSTART:20261031T200000Z
DTEND:20261031T230000Z
END:VEVENT
END:VCALENDAR
"""


def at(day, hour=0, minute=0):
    return datetime(2026, 10, day, hour, minute, tzinfo=DENVER)


class EventsTestCase(unittest.IsolatedAsyncioTestCase):
    feeds = [{"url": FEED_URL, "name": "Campus"}]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            student_life={"event_feeds": self.feeds},
            tools={"events_search": {"enabled": True, "max_results": 15}},
        )
        ical_events._parsed.clear()
        self.patches = [
            patch.object(cache, "CACHE_DIR", Path(self.tmp.name)),
            patch.object(cache, "_download", side_effect=self.download),
            patch.dict(os.environ, {"SOURCES_OFFLINE": ""}),
        ]
        for p in self.patches:
            p.start()

    def download(self, url, with_commit_date=False):
        if url == FEED_URL:
            return FEED, None
        raise RuntimeError("feed down")

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        ical_events._parsed.clear()
        app.config._settings = None

    async def between(self, start, end):
        events, errors = await ical_events.events_between(start, end)
        return {e["title"]: e for e in events}, errors


class TestEventParsing(EventsTestCase):
    async def test_windows_timezone_name_is_read_as_school_zone(self):
        events, errors = await self.between(at(27), at(28))
        self.assertEqual(errors, [])
        self.assertEqual(events["Weekly Yoga"]["start"], "2026-10-27T18:00:00-06:00")

    async def test_recurrence_expands_and_exdate_is_skipped(self):
        events, _ = await ical_events.events_between(at(27), datetime(2026, 11, 11, tzinfo=DENVER))
        yoga = [e["start"][:10] for e in events if e["title"] == "Weekly Yoga"]
        self.assertEqual(yoga, ["2026-10-27", "2026-11-10"])  # 11-03 cancelled

    async def test_floating_time_is_school_local(self):
        events, _ = await self.between(at(27), at(28))
        self.assertEqual(events["Jazz Concert: Pélagie Trio"]["start"], "2026-10-27T19:30:00-06:00")

    async def test_html_entities_are_decoded(self):
        events, _ = await self.between(at(27), at(28))
        self.assertIn("Jazz Concert: Pélagie Trio", events)

    async def test_all_day_event_is_labeled_not_midnight_timed(self):
        events, _ = await self.between(at(27), at(28))
        self.assertTrue(events["Last Day to Drop"]["all_day"])
        self.assertFalse(events["Jazz Concert: Pélagie Trio"]["all_day"])

    async def test_ongoing_events_sort_after_events_starting_in_window(self):
        events, _ = await ical_events.events_between(at(27), at(28))
        titles = [e["title"] for e in events]
        self.assertEqual(titles[-1], "Design Exhibition")
        self.assertTrue(events[-1]["ongoing"])

    async def test_utc_times_convert_to_school_zone(self):
        events, _ = await self.between(at(31), datetime(2026, 11, 1, tzinfo=DENVER))
        self.assertEqual(events["Football vs. Utah"]["start"], "2026-10-31T14:00:00-06:00")


class TestWindows(unittest.TestCase):
    def test_tonight_starts_at_five_or_now(self):
        start, end = ical_events.window_bounds("tonight", at(27, 9))
        self.assertEqual((start, end), (at(27, 17), at(28, 3)))
        start, _ = ical_events.window_bounds("tonight", at(27, 20))
        self.assertEqual(start, at(27, 20))

    def test_weekend_from_a_weekday(self):
        start, end = ical_events.window_bounds("this_weekend", at(27, 9))
        self.assertEqual((start, end), (at(31), datetime(2026, 11, 2, tzinfo=DENVER)))

    def test_weekend_from_saturday_starts_now(self):
        start, end = ical_events.window_bounds("this_weekend", at(31, 12))
        self.assertEqual((start, end), (at(31, 12), datetime(2026, 11, 2, tzinfo=DENVER)))

    def test_non_iana_names_are_replaced(self):
        text = "X-WR-TIMEZONE:Mountain\nDTSTART;TZID=Mountain Time (US & Canada):20261027T180000\nDTSTART;TZID=America/Chicago:20261027T180000"
        out = ical_events.normalize_timezones(text, "America/Denver")
        self.assertIn("X-WR-TIMEZONE:America/Denver", out)
        self.assertIn("TZID=America/Denver:20261027T180000", out)
        self.assertIn("TZID=America/Chicago:20261027T180000", out)


class TestEventsTool(EventsTestCase):
    async def run_tool(self, now, **kwargs):
        class FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return now.astimezone(tz) if tz else now

        with patch.object(events_search, "datetime", FrozenDatetime):
            return await events_search.execute(**kwargs)

    async def test_tonight(self):
        result = await self.run_tool(at(27, 12), when="tonight")
        titles = [e["title"] for e in result["events"]]
        self.assertEqual(titles[:2], ["Weekly Yoga", "Jazz Concert: Pélagie Trio"])
        self.assertEqual(result["timezone"], "America/Denver")
        self.assertEqual(result["window"]["label"], "tonight")

    async def test_keyword_filters(self):
        result = await self.run_tool(at(27, 12), when="today", keyword="jazz")
        self.assertEqual([e["title"] for e in result["events"]], ["Jazz Concert: Pélagie Trio"])

    async def test_unknown_window_defaults_to_today(self):
        result = await self.run_tool(at(27, 12), when="someday")
        self.assertEqual(result["query"]["when"], "today")

    async def test_no_feeds_configured(self):
        app.config._settings.student_life.event_feeds = []
        result = await self.run_tool(at(27, 12))
        self.assertIn("No event calendars", result["error"])


class TestFeedFailures(EventsTestCase):
    feeds = [{"url": FEED_URL, "name": "Campus"}, {"url": "https://down.example.edu/x.ics", "name": "Athletics"}]

    async def test_one_failed_feed_is_partial_not_fatal(self):
        events, errors = await ical_events.events_between(at(27), at(28))
        self.assertTrue(events)
        self.assertEqual(len(errors), 1)
        self.assertIn("Athletics", errors[0])

    async def test_all_feeds_down_is_an_error(self):
        self.patches[1].stop()
        with patch.object(cache, "_download", side_effect=RuntimeError("down")):
            result = await events_search.execute(when="today")
        self.patches[1].start()
        self.assertIn("unavailable", result["error"])


if __name__ == "__main__":
    unittest.main()
