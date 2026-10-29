"""Tests for the Events page endpoints, feed paging and stable event ids."""

import json
import os
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

import app.config
from app.api.routes import events as events_api
from app.config import AppSettings, EventFeedConfig
from app.sources import cache, ical_events, places, routing

DENVER = ZoneInfo("America/Denver")
FEED_URL = "https://calendar.example.edu/events.ics?limit=200"


def calendar(*events):
    return "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:test\n" + "".join(events) + "END:VCALENDAR\n"


def vevent(summary, start, end, uid=None, location="", extra=""):
    lines = ["BEGIN:VEVENT", f"SUMMARY:{summary}", f"DTSTART:{start}", f"DTEND:{end}"]
    if uid:
        lines.append(f"UID:{uid}")
    if location:
        lines.append(f"LOCATION:{location}")
    if extra:
        lines.append(extra)
    return "\n".join(lines + ["END:VEVENT"]) + "\n"


# Page 1 ends on Oct 28; page 2 repeats one event (the overlap) and goes to Nov 2.
PAGE_1 = calendar(
    vevent("Jazz Concert", "20261027T193000", "20261027T210000", "jazz@cal", "Macky Auditorium, Main Hall"),
    vevent("Coding Club", "20261027T180000", "20261027T190000", "code@cal", "Online via Zoom"),
    vevent("Poetry Night", "20261027T200000", "20261027T210000", "poetry@cal", "Somewhere Unmapped"),
    vevent("Library Tour", "20261028T100000", "20261028T110000", "tour@cal", "Norlin Library, E206"),
    vevent("Weekly Yoga", "20261006T180000", "20261006T190000", "yoga@cal", "Rec Center", "RRULE:FREQ=WEEKLY"),
)
PAGE_2 = calendar(
    vevent("Library Tour", "20261028T100000", "20261028T110000", "tour@cal", "Norlin Library, E206"),
    vevent("Football vs. Utah", "20261031T140000", "20261031T170000", "football@cal", "Folsom Field"),
    vevent("Fall Fest", "20261102T120000", "20261102T150000", None, "UMC"),
)
PAGES = {
    "https://calendar.example.edu/events.ics?limit=200&page=1": PAGE_1,
    "https://calendar.example.edu/events.ics?limit=200&page=2": PAGE_2,
}


def feature(name, lon, lat, category="academic", aliases=()):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": {"name": name, "aliases": list(aliases), "category": category},
    }


CAMPUS = {
    "type": "FeatureCollection",
    "features": [
        feature("University Memorial Center", -105.2715, 40.0067, aliases=["UMC"]),
        feature("Norlin Library", -105.2708, 40.0086, "library"),
        feature("Macky Auditorium", -105.2729, 40.0093, "arts"),
        feature("Folsom Field", -105.2669, 40.0092, "recreation"),
    ],
}


def at(day, hour=0, month=10):
    return datetime(2026, month, day, hour, tzinfo=DENVER)


class EventsApiTestCase(unittest.IsolatedAsyncioTestCase):
    pages = 2
    feed_text = PAGES

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
            student_life={"event_feeds": [{"url": FEED_URL, "name": "Campus", "pages": self.pages}]},
        )
        ical_events._parsed.clear()
        places._loaded.clear()
        self.downloads = []
        self.table_calls = []
        self.patches = [
            patch.object(cache, "CACHE_DIR", root / "cache"),
            patch.object(cache, "_download", side_effect=self.download),
            patch.object(places, "SCHOOLS_DIR", root),
            patch.object(routing, "walking_table", side_effect=self.table),
            patch.dict(os.environ, {"SOURCES_OFFLINE": ""}),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        ical_events._parsed.clear()
        places._loaded.clear()
        app.config._settings = None

    def download(self, url, with_commit_date=False):
        self.downloads.append(url)
        if isinstance(self.feed_text, dict):
            if url in self.feed_text:
                return self.feed_text[url], None
            raise RuntimeError("feed down")
        return self.feed_text, None

    def table(self, origin, targets):
        self.table_calls.append((origin["id"], [t["id"] for t in targets]))
        return {t["id"]: {"minutes": 7, "distance_m": 560} for t in targets}

    async def list_events(self, now, **kwargs):
        class FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return now.astimezone(tz) if tz else now

        kwargs.setdefault("q", "")
        kwargs.setdefault("from_", "")
        with patch.object(events_api, "datetime", FrozenDatetime):
            return await events_api.list_events(current_user=None, **kwargs)


class TestPaging(EventsApiTestCase):
    def test_page_urls_keep_existing_query(self):
        feed = EventFeedConfig(url="https://x.edu/events.ics?limit=200&tag=a", pages=2)
        self.assertEqual(ical_events.feed_urls(feed), [
            "https://x.edu/events.ics?limit=200&tag=a&page=1",
            "https://x.edu/events.ics?limit=200&tag=a&page=2",
        ])
        self.assertEqual(ical_events.feed_urls(EventFeedConfig(url="https://x.edu/e.ics", pages=2))[1],
                         "https://x.edu/e.ics?limit=200&page=2")
        self.assertEqual(ical_events.feed_urls(EventFeedConfig(url="https://x.edu/e.ics")), ["https://x.edu/e.ics"])

    async def test_pages_are_fetched_cached_and_merged(self):
        body = await self.list_events(at(27, 9), window="next_7_days")
        titles = [e["title"] for e in body["events"]]
        self.assertEqual(titles.count("Library Tour"), 1)  # on both pages, listed once
        self.assertIn("Football vs. Utah", titles)  # page 2 only
        self.assertEqual(sorted(self.downloads), sorted(PAGES))
        # Each page has its own cache entry: a second request downloads nothing.
        ical_events._parsed.clear()
        await self.list_events(at(27, 9), window="next_7_days")
        self.assertEqual(len(self.downloads), 2)

    async def test_listed_through_is_the_last_date_any_page_lists(self):
        body = await self.list_events(at(27, 9), window="today")
        self.assertEqual(body["listed_through"], "2026-11-02")

    async def test_a_failed_page_is_reported_not_fatal(self):
        self.feed_text = {k: v for k, v in PAGES.items() if k.endswith("page=1")}
        body = await self.list_events(at(27, 9), window="next_7_days")
        self.assertIn("Jazz Concert", [e["title"] for e in body["events"]])
        self.assertIn("Campus", body["error"])
        self.assertEqual(body["listed_through"], "2026-10-28")


class TestEventIds(EventsApiTestCase):
    async def ids(self, start, end):
        events, _ = await ical_events.events_between(start, end)
        return {e["title"]: e["id"] for e in events}

    async def test_id_is_start_date_and_feed_uid(self):
        ids = await self.ids(at(27), at(28))
        self.assertEqual(ids["Jazz Concert"], "2026-10-27:jazz@cal")

    async def test_id_survives_a_title_edit(self):
        before = (await self.ids(at(27), at(28)))["Jazz Concert"]
        self.feed_text = {k: v.replace("Jazz Concert", "Jazz Concert (moved to 8pm)") for k, v in PAGES.items()}
        ical_events._parsed.clear()
        shutil.rmtree(cache.CACHE_DIR, ignore_errors=True)
        after = (await self.ids(at(27), at(28)))["Jazz Concert (moved to 8pm)"]
        self.assertEqual(before, after)

    async def test_repeating_instances_have_distinct_ids(self):
        events, _ = await ical_events.events_between(at(27), at(11, month=11))
        yoga = [e["id"] for e in events if e["title"] == "Weekly Yoga"]
        self.assertEqual(yoga, ["2026-10-27:yoga@cal:20261027T180000", "2026-11-03:yoga@cal:20261103T180000",
                                "2026-11-10:yoga@cal:20261110T180000"])

    async def test_no_uid_falls_back_to_a_hash_with_the_date(self):
        ids = await self.ids(at(2, month=11), at(3, month=11))
        fest = ids["Fall Fest"]
        self.assertRegex(fest, r"^2026-11-02:[0-9a-f]{16}$")
        self.assertEqual(fest, (await self.ids(at(2, month=11), at(3, month=11)))["Fall Fest"])


class TestListEndpoint(EventsApiTestCase):
    async def test_windows(self):
        today = await self.list_events(at(27, 9), window="today")
        self.assertEqual({e["title"] for e in today["events"]},
                         {"Jazz Concert", "Coding Club", "Poetry Night", "Weekly Yoga"})
        tomorrow = await self.list_events(at(27, 9), window="tomorrow")
        self.assertEqual([e["title"] for e in tomorrow["events"]], ["Library Tour"])
        weekend = await self.list_events(at(27, 9), window="this_weekend")
        self.assertEqual([e["title"] for e in weekend["events"]], ["Football vs. Utah"])
        self.assertEqual(today["timezone"], "America/Denver")
        self.assertEqual(today["source"], ["Campus"])

    async def test_more_than_the_chat_tool_cap(self):
        many = calendar(*(vevent(f"Talk {i}", f"20261027T1{i % 10}0000", f"20261027T1{i % 10}3000", f"t{i}") for i in range(20)))
        self.feed_text = many
        body = await self.list_events(at(27, 9), window="today")
        self.assertEqual(len(body["events"]), 20)

    async def test_unknown_window_is_400(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.list_events(at(27, 9), window="someday")
        self.assertEqual(ctx.exception.status_code, 400)

    async def test_keyword_filter(self):
        body = await self.list_events(at(27, 9), window="today", q="jazz")
        self.assertEqual([e["title"] for e in body["events"]], ["Jazz Concert"])

    async def test_fields(self):
        body = await self.list_events(at(27, 9), window="today")
        jazz = next(e for e in body["events"] if e["title"] == "Jazz Concert")
        self.assertEqual(set(jazz), {"id", "title", "start", "end", "all_day", "location", "url", "description", "calendar",
                                     "ongoing", "place_id", "place_name", "kind", "host", "cost"})
        self.assertEqual(jazz["place_id"], "macky-auditorium")
        self.assertEqual(jazz["place_name"], "Macky Auditorium")
        self.assertEqual((jazz["kind"], jazz["host"], jazz["cost"]), (None, None, None))
        coding = next(e for e in body["events"] if e["title"] == "Coding Club")
        self.assertIsNone(coding["place_name"])
        self.assertNotIn("place_id", coding)

    async def test_walk_minutes_only_for_matched_venues_with_one_table_call(self):
        body = await self.list_events(at(27, 9), window="today", from_="norlin-library")
        by_title = {e["title"]: e for e in body["events"]}
        self.assertEqual(by_title["Jazz Concert"]["walk_minutes"], 7)
        for title in ("Coding Club", "Poetry Night"):  # online, unmatched
            self.assertNotIn("walk_minutes", by_title[title])
            self.assertNotIn("place_id", by_title[title])
        self.assertEqual(len(self.table_calls), 1)
        self.assertEqual(self.table_calls[0][0], "norlin-library")

    async def test_failed_walking_table_leaves_minutes_out(self):
        with patch.object(routing, "walking_table", return_value={}):
            body = await self.list_events(at(27, 9), window="today", from_="norlin-library")
        self.assertTrue(all("walk_minutes" not in e for e in body["events"]))

    async def test_unknown_from_is_400(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.list_events(at(27, 9), window="today", from_="nowhere")
        self.assertEqual(ctx.exception.status_code, 400)


class TestVenueMatch(EventsApiTestCase):
    def test_venue_text_matches(self):
        cases = {
            "Macky Auditorium, Main Hall": "macky-auditorium",
            "Norlin Library (Also offered online)": "norlin-library",
            "University Memorial Center (UMC), Room 235": "university-memorial-center",
            # A room nickname that half-matches another place loses to the building.
            '"The Field," Room 233, Norlin Library': "norlin-library",
            "Online via Zoom": None,
            "Somewhere Unmapped": None,
            "": None,
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                found = places.match_venue(text)
                self.assertEqual(found["id"] if found else None, expected)


class TestResolveById(EventsApiTestCase):
    async def test_resolves_within_its_start_day(self):
        body = await events_api.get_event("2026-10-31:football@cal", from_="", current_user=None)
        self.assertEqual(body["event"]["title"], "Football vs. Utah")
        self.assertEqual(body["event"]["place_id"], "folsom-field")

    async def test_repeating_instance_resolves(self):
        body = await events_api.get_event("2026-11-03:yoga@cal:20261103T180000", from_="", current_user=None)
        self.assertEqual(body["event"]["start"], "2026-11-03T18:00:00-07:00")

    async def test_gone_or_malformed_is_404(self):
        for event_id in ("2026-10-31:no-such@cal", "2026-10-30:football@cal", "not-an-id"):
            with self.subTest(event_id=event_id):
                with self.assertRaises(HTTPException) as ctx:
                    await events_api.get_event(event_id, from_="", current_user=None)
                self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
