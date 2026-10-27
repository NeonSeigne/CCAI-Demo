"""Tests for event/place cards, the "checked" line and GET /api/campus/today."""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

from app.api import visuals as visuals_module
from app.api.routes import campus
from app.api.visuals import build_visuals, sources_checked
from app.sources import ical_events

EVENT = {
    "title": "Jazz Night", "start": "2026-10-27T19:00:00-06:00", "end": "2026-10-27T21:00:00-06:00",
    "all_day": False, "location": "Macky Auditorium", "url": "https://example.edu/jazz",
    "calendar": "CU Events", "ongoing": False, "description": "long text not needed on the card",
}
PLACE = {
    "name": "University Memorial Center", "category": "academic", "lat": 40.0067, "lon": -105.2715,
    "map_url": "https://www.openstreetmap.org/?mlat=40.0067", "distance_m": 233, "walk_minutes_estimate": 3,
    "aliases": ["UMC"],
}


class TestEventAndPlaceCards(unittest.TestCase):
    def test_events_become_one_event_list_card(self):
        result = {"events": [EVENT] * 7, "total_results": 7, "timezone": "America/Denver"}
        (card,) = build_visuals([{"name": "events_search", "result": result}])
        self.assertEqual(card["type"], "event_list")
        self.assertEqual(len(card["events"]), 5)
        self.assertEqual(card["more"], 2)
        self.assertNotIn("description", card["events"][0])
        self.assertEqual(card["events"][0]["location"], "Macky Auditorium")

    def test_place_card_keeps_origin_and_estimate(self):
        result = {"places": [PLACE], "from": {"name": "Norlin Library", "lat": 40.0, "lon": -105.0},
                  "note": "Distances are straight lines; walking times are estimates."}
        (card,) = build_visuals([{"name": "find_place", "result": result}])
        self.assertEqual(card["type"], "place_card")
        self.assertEqual(card["from"]["name"], "Norlin Library")
        self.assertEqual(card["places"][0]["walk_minutes_estimate"], 3)
        self.assertNotIn("aliases", card["places"][0])

    def test_campus_cards_show_for_schools_without_course_pages(self):
        with patch.object(visuals_module.academics, "links_to_course_pages", return_value=False):
            cards = build_visuals([
                {"name": "events_search", "result": {"events": [EVENT]}},
                {"name": "course_grades", "result": {"course_identifier": "CS 2100"}},
            ])
        self.assertEqual([c["type"] for c in cards], ["event_list"])

    def test_empty_or_failed_results_make_no_card(self):
        self.assertEqual(build_visuals([
            {"name": "events_search", "result": {"events": []}},
            {"name": "find_place", "result": {"places": [], "error": "Couldn't find 'X'"}},
        ]), [])


class TestSourcesChecked(unittest.TestCase):
    def test_lists_each_domain_once_in_tool_order(self):
        checked = sources_checked([
            {"name": "events_search", "result": {}},
            {"name": "find_place", "result": {}},
            {"name": "find_place", "result": {}},
        ])
        self.assertEqual([d["label"] for d in checked["domains"]], ["Events", "Campus map"])

    def test_no_known_tool_means_no_line(self):
        self.assertIsNone(sources_checked([{"name": "mystery", "result": {}}]))


class TestFeedText(unittest.TestCase):
    def test_html_in_feed_fields_becomes_plain_text(self):
        component = {"LOCATION": '<a href="https://apply.example.edu/x">apply.example.edu&hellip;</a>'}
        self.assertEqual(ical_events._text(component, "LOCATION"), "apply.example.edu…")


class TestCampusToday(unittest.IsolatedAsyncioTestCase):
    async def test_drops_past_events_and_lists_timed_before_all_day(self):
        tz = ZoneInfo("America/Denver")
        now = datetime.now(tz)
        def at(hours):
            return (now + timedelta(hours=hours)).isoformat()
        events = [
            {**EVENT, "title": "Earlier", "start": at(-3), "end": at(-2)},
            {**EVENT, "title": "Exhibit", "start": at(-5), "end": at(8), "all_day": True},
            {**EVENT, "title": "Soon", "start": at(1), "end": at(2)},
        ]
        result = {"events": events, "timezone": "America/Denver"}
        with patch.object(campus.events_search, "execute", AsyncMock(return_value=result)), \
             patch.object(campus.ical_events, "school_zone", return_value=tz), \
             patch.object(campus, "_feeds", return_value=[SimpleNamespace(name="CU Events", url="u")]):
            body = await campus.campus_today(current_user=None)
        self.assertEqual([e["title"] for e in body["events"]], ["Soon", "Exhibit"])
        self.assertEqual(body["source"], ["CU Events"])


if __name__ == "__main__":
    unittest.main()
