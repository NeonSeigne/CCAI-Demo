"""Event kind, host, cost and place_name (home-colors alignment Phase 3).

Kinds come only from the school pack's ``student_life.event_kinds`` map of
feed values; host and cost only from the feed's own fields. Missing stays null.
"""

import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

import icalendar

import app.config
from app.api import visuals
from app.config import AppSettings, load_settings
from app.sources import ical_events, places
from app.tools import events_search

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "events"
EASTERN = ZoneInfo("America/New_York")


def recorded(name):
    calendar = icalendar.Calendar.from_ical((FIXTURES / name).read_text(encoding="utf-8"))
    return {e["title"]: e for e in (ical_events._event(c, EASTERN, "Campus") for c in calendar.walk("VEVENT"))}


def settings(**kinds):
    return AppSettings(
        school={"slug": "demo", "timezone": "America/New_York"},
        mongodb={"database_name": "demo_advisor"},
        rag={"chroma_collection": "demo_docs"},
        student_life={
            "event_feeds": [{"url": "https://x.edu/e.ics", "name": "Campus"}],
            "event_kinds": kinds,
        },
        tools={"events_search": {"enabled": True, "max_results": 15}},
    )


class KindsTestCase(unittest.TestCase):
    kinds = {}

    def setUp(self):
        app.config._settings = settings(**self.kinds)

    def tearDown(self):
        app.config._settings = None


class TestEventKind(KindsTestCase):
    kinds = {"Exhibit": "arts", "Student Activity": "campus_life", "Academic": "academic",
             "Tour": "campus_life", "Sporting Event": "athletics"}

    def test_trumba_event_type_maps_to_a_kind(self):
        exhibit = recorded("uva.ics")["Color is Life: Women's Work Today"]
        self.assertEqual(exhibit["kind"], "arts")

    def test_unmapped_values_give_no_kind(self):
        events = recorded("uva.ics")
        self.assertIsNone(events["Finding My Way: Mentoring Faculty"]["kind"])  # Workshop
        self.assertIsNone(events["UVA Batten Graduate Certificate Information Session"]["kind"])  # Admissions

    def test_categories_map_too(self):
        tour = recorded("cu.ics")["Cruiser guided Ebike Tour of Boulder"]
        self.assertEqual(tour["kind"], "campus_life")

    def test_matching_ignores_case_and_spacing(self):
        self.assertEqual(ical_events.event_kind({"categories": [" sporting event "]}), "athletics")

    def test_the_more_specific_kind_wins(self):
        both = {"details": {"event_type": "Student Activity,Academic"}}
        self.assertEqual(ical_events.event_kind(both), "academic")
        arts = {"details": {"event_type": "Student Activity"}, "categories": ["Exhibit"]}
        self.assertEqual(ical_events.event_kind(arts), "arts")

    def test_feed_without_categories_has_no_kind(self):
        workshop = recorded("uw.ics")["STEM Extension (OPT): ISS Advising Workshop"]
        self.assertIsNone(workshop["kind"])


class TestNoKindMap(KindsTestCase):
    def test_a_pack_without_a_map_gives_null(self):
        exhibit = recorded("uva.ics")["Color is Life: Women's Work Today"]
        self.assertIsNone(exhibit["kind"])


class TestHostAndCost(KindsTestCase):
    def test_host_from_hosted_by_else_sponsor(self):
        events = recorded("uva.ics")
        self.assertEqual(events["Finding My Way: Mentoring Faculty"]["host"],
                         "Center for Faculty Well-Being and Development")
        self.assertEqual(events["Managing Anxiety in Uncertain Times"]["host"],
                         "UVA Provost’s Faculty Guide Program, UVA FEAP and Hoos Well’s")

    def test_multi_value_sponsor_is_comma_spaced(self):
        item = {"details": {"sponsor": "Darden School of Business,McIntire School of Commerce"}}
        self.assertEqual(ical_events.event_host(item), "Darden School of Business, McIntire School of Commerce")

    def test_cost_is_the_feeds_own_text(self):
        self.assertEqual(ical_events.event_cost({"details": {"cost": "Free & open to all"}}), "Free & open to all")

    def test_missing_host_and_cost_stay_null_even_when_the_description_says(self):
        tour = recorded("cu.ics")["Cruiser guided Ebike Tour of Boulder"]
        self.assertEqual((tour["host"], tour["cost"]), (None, None))
        workshop = recorded("uw.ics")["STEM Extension (OPT): ISS Advising Workshop"]
        self.assertEqual((workshop["host"], workshop["cost"]), (None, None))


class TestChatToolAndCard(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = settings(Exhibit="arts")
        exhibit = dict(recorded("uva.ics")["Color is Life: Women's Work Today"])
        exhibit.pop("_start"), exhibit.pop("_end")
        exhibit["location"] = "Kluge-Ruhe Collection"
        self.match = {"id": "kluge-ruhe", "name": "Kluge-Ruhe Aboriginal Art Collection"}
        self.patches = [
            patch.object(ical_events, "events_between", AsyncMock(return_value=([exhibit], []))),
            patch.object(places, "match_venue", side_effect=lambda text: self.match if "Kluge" in text else None),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        app.config._settings = None

    async def test_tool_rows_carry_kind_host_cost_and_place_name(self):
        result = await events_search.execute(when="today")
        row = result["events"][0]
        self.assertEqual(row["kind"], "arts")
        self.assertEqual(row["place_name"], "Kluge-Ruhe Aboriginal Art Collection")
        self.assertIn("host", row)
        self.assertIn("cost", row)

    async def test_event_list_card_rows_carry_kind_and_place_name(self):
        result = await events_search.execute(when="today")
        card = visuals._events_specs(result)[0]
        self.assertEqual(card["events"][0]["kind"], "arts")
        self.assertEqual(card["events"][0]["place_name"], "Kluge-Ruhe Aboriginal Art Collection")
        self.assertEqual(card["timezone"], "America/New_York")


class TestShippedMaps(unittest.TestCase):
    def tearDown(self):
        app.config._settings = None

    def load(self, slug):
        app.config._settings = None
        env = {k: v for k, v in os.environ.items() if k not in ("SCHOOL", "CONFIG_PATH", "ALLOW_DRAFT")}
        env["SCHOOL"] = slug
        with patch.dict(os.environ, env, clear=True):
            return load_settings().student_life.event_kinds

    def test_uva_and_cu_map_their_feed_values_uw_has_none(self):
        self.assertEqual(self.load("uva")["Lectures & Seminars"], "academic")
        self.assertEqual(self.load("cu-boulder")["Sporting Event"], "athletics")
        self.assertEqual(self.load("uw-madison"), {})


if __name__ == "__main__":
    unittest.main()
