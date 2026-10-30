"""Chat card fields: event walk minutes and place open-now/access/type/floors.

No network and no LLM: the walking table and the event feeds are patched.
"""

import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from zoneinfo import ZoneInfo

import app.config
from app.api.routes import chat
from app.api.visuals import build_visuals
from app.config import AppSettings
from app.core.improved_orchestrator import ImprovedChatOrchestrator
from app.llm.llm_client import ToolCallResult
from app.sources import academics, ical_events, places, routing
from app.tools import ToolContext, events_search, find_place

DENVER = ZoneInfo("America/Denver")
TUESDAY_NOON = datetime(2026, 10, 27, 12, 0, tzinfo=DENVER)


def feature(name, lon, lat, category="academic", **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"name": name, "aliases": [], "category": category, **props},
    }


CAMPUS = {
    "type": "FeatureCollection",
    "features": [
        feature("University Memorial Center", -105.2715, 40.0067),
        feature("Norlin Library", -105.2708, 40.0086, "library", hours="Mo-Fr 07:00-20:00; Sa,Su off",
                wheelchair="designated", building_levels=4, osm_tag="amenity=library"),
        feature("Macky Auditorium", -105.2729, 40.0093, "arts", hours="Mo-Fr 18:00-22:00"),
        feature("Folsom Field", -105.2669, 40.0092, "recreation"),
    ],
}


def event(title, location):
    return {
        "title": title, "start": "2026-10-27T19:00:00-06:00", "end": "2026-10-27T21:00:00-06:00",
        "all_day": False, "location": location, "url": "", "description": "", "calendar": "Campus",
        "ongoing": False,
    }


EVENTS = [
    event("Jazz Concert", "Macky Auditorium, Main Hall"),
    event("Coding Club", "Online via Zoom"),
    event("Poetry Night", "Somewhere Unmapped"),
    event("Choir", "Macky Auditorium, Main Hall"),
    event("Football", "Folsom Field"),
]


class FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return TUESDAY_NOON.astimezone(tz) if tz else TUESDAY_NOON


class CampusTestCase(unittest.IsolatedAsyncioTestCase):
    default_origin = ""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "demo").mkdir()
        (root / "demo" / "places.geojson").write_text(json.dumps(CAMPUS))
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            campus={"places_file": "places.geojson"},
            student_life={"event_feeds": [{"url": "https://x.edu/e.ics", "name": "Campus"}]},
            tools={"events_search": {"enabled": True, "max_results": 15}},
        )
        # Set after load: the pack validator checks it against the real places file.
        app.config._settings.campus.default_origin = self.default_origin
        places._loaded.clear()
        self.table_calls = []
        self.patches = [
            patch.object(places, "SCHOOLS_DIR", root),
            patch.object(routing, "walking_table", side_effect=self.table),
            patch.object(ical_events, "events_between", AsyncMock(return_value=(list(EVENTS), []))),
            patch.object(events_search, "datetime", FrozenDatetime),
            patch.object(find_place, "datetime", FrozenDatetime),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        places._loaded.clear()
        self.tmp.cleanup()
        app.config._settings = None

    def table(self, origin, targets):
        self.table_calls.append((origin["id"], [t["id"] for t in targets]))
        return {t["id"]: {"minutes": 7, "distance_m": 560} for t in targets if t["id"] != "folsom-field"}


def context(campus_origin=None):
    return ToolContext(user_id="u1", school="demo", campus_origin=campus_origin)


class TestEventWalkMinutes(CampusTestCase):
    async def test_rows_get_walk_minutes_from_the_saved_start_place_in_one_table_call(self):
        result = await events_search.execute(when="today", context=context("norlin-library"))
        walks = {e["title"]: e["walk_minutes"] for e in result["events"]}
        self.assertEqual(walks, {
            "Jazz Concert": 7, "Choir": 7,
            "Coding Club": None, "Poetry Night": None,  # online, unmatched
            "Football": None,  # the table didn't answer
        })
        self.assertEqual(self.table_calls, [("norlin-library", ["macky-auditorium", "folsom-field"])])

    async def test_card_rows_carry_walk_minutes(self):
        result = await events_search.execute(when="today", context=context("norlin-library"))
        (card,) = build_visuals([{"name": "events_search", "result": result}])
        self.assertEqual(card["events"][0]["walk_minutes"], 7)
        self.assertIsNone(card["events"][1]["walk_minutes"])

    async def test_no_start_place_leaves_walks_null(self):
        result = await events_search.execute(when="today", context=context())
        self.assertTrue(all(e["walk_minutes"] is None for e in result["events"]))
        self.assertEqual(self.table_calls, [])

    async def test_without_a_chat_context_there_is_no_table_call(self):
        result = await events_search.execute(when="today")
        self.assertTrue(all(e["walk_minutes"] is None for e in result["events"]))
        self.assertEqual(self.table_calls, [])

    async def test_failed_table_leaves_walks_null(self):
        with patch.object(routing, "walking_table", return_value={}):
            result = await events_search.execute(when="today", context=context("norlin-library"))
        self.assertTrue(all(e["walk_minutes"] is None for e in result["events"]))

    def test_old_card_payloads_without_walks_read_null(self):
        (card,) = build_visuals([{"name": "events_search", "result": {"events": [event("A", "B")]}}])
        self.assertIsNone(card["events"][0]["walk_minutes"])


class TestDefaultStartPlace(CampusTestCase):
    default_origin = "University Memorial Center"

    async def test_unsaved_or_vanished_start_place_uses_the_school_default(self):
        for saved in (None, "gone-place"):
            with self.subTest(saved=saved):
                self.table_calls.clear()
                result = await events_search.execute(when="today", context=context(saved))
                self.assertEqual(result["events"][0]["walk_minutes"], 7)
                self.assertEqual(self.table_calls[0][0], "university-memorial-center")


class TestStartPlaceReachesTools(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
        )
        terms = patch.object(academics, "planner_terms", return_value=[])
        terms.start()
        self.addCleanup(terms.stop)

    def tearDown(self):
        app.config._settings = None

    def test_tool_context_carries_the_saved_start_place(self):
        user = SimpleNamespace(id="u1", campus_origin="norlin-library")
        self.assertEqual(chat.tool_context_for(user).campus_origin, "norlin-library")
        self.assertIsNone(chat.tool_context_for(SimpleNamespace(id="u1")).campus_origin)

    async def test_events_then_campus_passes_the_context_to_both_passes(self):
        orchestrator = ImprovedChatOrchestrator.__new__(ImprovedChatOrchestrator)
        seen = []

        async def fake_pass(llm, tools, message, context=None, history=None):
            seen.append(context)
            return ToolCallResult(text="", used_tool=False)

        orchestrator._tool_pass = fake_pass
        ctx = context("norlin-library")
        by_domain = {"student_life": ["events_search"], "campus": ["find_place"]}
        await orchestrator._events_then_campus(None, by_domain, "events tonight", context=ctx)
        self.assertEqual(seen, [ctx, ctx])


class TestPlaceCardFields(CampusTestCase):
    async def test_rows_carry_open_now_until_access_type_and_floors(self):
        result = await find_place.execute(query="Norlin Library")
        row = result["places"][0]
        self.assertIs(row["open_now"], True)
        self.assertEqual(row["open_until"], "2026-10-27T20:00:00-06:00")
        self.assertEqual((row["access"], row["type"], row["floors"]), ("yes", "Library", 4))
        (card,) = build_visuals([{"name": "find_place", "result": result}])
        place = card["places"][0]
        for key, value in (("open_now", True), ("open_until", "2026-10-27T20:00:00-06:00"),
                           ("access", "yes"), ("type", "Library"), ("floors", 4)):
            self.assertEqual(place[key], value, key)

    async def test_closed_and_unknown_hours(self):
        closed = (await find_place.execute(query="Macky Auditorium"))["places"][0]
        self.assertIs(closed["open_now"], False)
        self.assertIsNone(closed["open_until"])
        unknown = (await find_place.execute(query="Folsom Field"))["places"][0]
        self.assertIsNone(unknown["open_now"])
        self.assertIsNone(unknown["open_until"])
        self.assertEqual((unknown["access"], unknown["type"], unknown["floors"]), (None, None, None))

    async def test_rows_with_a_start_keep_their_estimate(self):
        result = await find_place.execute(query="Norlin Library", from_place="Folsom Field")
        row = result["places"][0]
        self.assertIn("walk_minutes_estimate", row)
        self.assertIs(row["open_now"], True)

    def test_old_card_payloads_read_null(self):
        (card,) = build_visuals([{"name": "find_place", "result": {"places": [{"name": "X"}]}}])
        place = card["places"][0]
        for key in ("open_now", "open_until", "access", "type", "floors"):
            self.assertIsNone(place[key], key)


if __name__ == "__main__":
    unittest.main()
