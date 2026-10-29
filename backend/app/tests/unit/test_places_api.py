"""Tests for the Campus map places endpoints and stable place ids."""

import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import HTTPException

import app.config
from app.api.routes import places as places_api
from app.config import SCHOOLS_DIR, AppSettings
from app.sources import places, routing

DENVER = ZoneInfo("America/Denver")
TUESDAY_NOON = datetime(2026, 10, 27, 12, 0, tzinfo=DENVER)
TUESDAY_NIGHT = datetime(2026, 10, 27, 23, 30, tzinfo=DENVER)


def feature(name, lon, lat, category="academic", hours=None):
    props = {"name": name, "aliases": [], "category": category}
    if hours:
        props["hours"] = hours
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]}, "properties": props}


# Origin at UMC; dining places sorted by distance: Farrand (closest, no hours),
# C4C (open 07-20), Late Night (open 18-02), then two of the same name.
CAMPUS = {
    "type": "FeatureCollection",
    "features": [
        feature("University Memorial Center", -105.2715, 40.0067),
        feature("Farrand Grab and Go", -105.2712, 40.0069, "dining"),
        feature("C4C Dining", -105.2700, 40.0060, "dining", "Mo-Fr 07:00-20:00; Sa,Su off"),
        feature("Late Night", -105.2650, 40.0045, "dining", "Mo-Su 18:00-02:00"),
        feature("Coffee Cart", -105.2600, 40.0030, "dining", "PH off"),
        feature("Coffee Cart", -105.2550, 40.0020, "dining"),
        feature("Norlin Library", -105.2708, 40.0086, "library"),
    ],
}
# What scripts/import_places.py writes for a place with OSM details and a photo.
NORLIN_DETAILS = {
    "osm": "way/24021733",
    "website": "https://www.colorado.edu/libraries/norlin",
    "phone": "+1 303-492-8705",
    "wheelchair": "yes",
    "building_levels": 4,
    "address": "1720 Pleasant Street",
    "operator": "University of Colorado Boulder Libraries",
    "wikidata": "Q99990003",
    "wikipedia": "https://en.wikipedia.org/wiki/Norlin_Library",
    "photo": {"url": "https://upload.wikimedia.org/x/640px-Norlin.jpg", "author": "A. Photographer",
              "license": "CC BY 4.0", "page": "https://commons.wikimedia.org/wiki/File:Norlin.jpg"},
}
CAMPUS["features"][6]["properties"].update(NORLIN_DETAILS)
# Malformed details on C4C: each one is dropped on its own.
CAMPUS["features"][2]["properties"].update({
    "osm": "way/abc", "website": "javascript:alert(1)", "building_levels": "3", "cuisine": "pizza",
    "photo": {"url": "https://upload.wikimedia.org/x/c4c.jpg", "author": "Someone"},  # no licence
    "phone": "+1 303-492-0000",
})


class PlacesApiTestCase(unittest.IsolatedAsyncioTestCase):
    now = TUESDAY_NOON

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
        )
        places._loaded.clear()
        self.table_calls = []
        self.patches = [
            patch.object(places, "SCHOOLS_DIR", root),
            patch.object(places_api, "_now", side_effect=lambda: self.now),
            patch.object(routing, "walking_table", side_effect=self.table),
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
        self.table_calls.append([t["id"] for t in targets])
        return {t["id"]: {"minutes": 3, "distance_m": 240} for t in targets}

    async def list_places(self, **kwargs):
        args = {"category": "", "q": "", "from_": "", "limit": 25, **kwargs}
        return await places_api.list_places(current_user=None, **args)


class TestPlaceIds(PlacesApiTestCase):
    def test_ids_are_name_slugs_and_collisions_get_a_suffix(self):
        ids = [p["id"] for p in places.load_places()[0]]
        self.assertEqual(ids, ["university-memorial-center", "farrand-grab-and-go", "c4c-dining", "late-night",
                               "coffee-cart", "coffee-cart-2", "norlin-library"])
        self.assertEqual(places.public(places.get("c4c-dining"))["id"], "c4c-dining")

    def test_shipped_ids_are_unique(self):
        for path in SCHOOLS_DIR.glob("*/places.geojson"):
            ids = [p["id"] for p in places.read_file(path)]
            self.assertEqual(len(ids), len(set(ids)), path)


class TestList(PlacesApiTestCase):
    async def test_rows_counts_and_hours(self):
        body = await self.list_places(category="dining", from_="university-memorial-center")
        self.assertEqual([p["id"] for p in body["places"]],
                         ["farrand-grab-and-go", "c4c-dining", "late-night", "coffee-cart", "coffee-cart-2"])
        self.assertEqual(body["categories"], {"academic": 1, "dining": 5, "library": 1})
        rows = {p["id"]: p for p in body["places"]}
        self.assertIsNone(rows["farrand-grab-and-go"]["open_now"])
        self.assertTrue(rows["c4c-dining"]["open_now"])
        self.assertEqual(rows["c4c-dining"]["open_until"], "2026-10-27T20:00:00-06:00")
        self.assertFalse(rows["late-night"]["open_now"])
        self.assertIsNone(rows["coffee-cart"]["open_now"])  # "PH off" is unknown
        self.assertEqual(rows["c4c-dining"]["walk_minutes"], 3)
        self.assertEqual(self.table_calls, [[p["id"] for p in body["places"]]])  # one call for N rows

    async def test_suggested_is_nearest_known_open(self):
        body = await self.list_places(category="dining", from_="university-memorial-center")
        self.assertEqual(body["suggested"], {"id": "c4c-dining", "label": "Nearest open dining"})

    async def test_suggested_is_picked_before_the_limit(self):
        self.now = datetime(2026, 10, 27, 23, 0, tzinfo=DENVER)  # only Late Night (3rd) is open
        body = await self.list_places(category="dining", from_="university-memorial-center", limit=1)
        self.assertEqual(body["suggested"], {"id": "late-night", "label": "Nearest open dining"})
        self.assertEqual([p["id"] for p in body["places"]], ["late-night"])

    async def test_nothing_known_open_falls_back_to_nearest(self):
        self.now = datetime(2026, 10, 31, 12, 0, tzinfo=DENVER)  # Saturday noon: C4C off, Late Night closed
        body = await self.list_places(category="dining", from_="university-memorial-center")
        self.assertEqual(body["suggested"], {"id": "farrand-grab-and-go", "label": "Nearest dining"})

    async def test_suggested_is_never_the_starting_place(self):
        # Starting at Farrand, the nearest dining is Farrand itself: a 0 min walk.
        self.now = datetime(2026, 10, 31, 12, 0, tzinfo=DENVER)  # nothing known open
        body = await self.list_places(category="dining", from_="farrand-grab-and-go")
        self.assertEqual(body["suggested"], {"id": "c4c-dining", "label": "Nearest dining"})
        only = await self.list_places(category="library", from_="norlin-library")
        self.assertIsNone(only["suggested"])

    async def test_failed_table_leaves_times_out(self):
        with patch.object(routing, "walking_table", return_value={}):
            body = await self.list_places(category="dining", from_="university-memorial-center")
        self.assertTrue(all("walk_minutes" not in p and "distance_m" not in p for p in body["places"]))

    async def test_query(self):
        body = await self.list_places(q="norlin")
        self.assertEqual([p["id"] for p in body["places"]], ["norlin-library"])
        self.assertIsNone(body["suggested"])

    async def test_bad_category_and_unknown_origin_are_400(self):
        for kwargs in ({"category": "bars"}, {"from_": "nowhere"}):
            with self.subTest(**kwargs):
                with self.assertRaises(HTTPException) as ctx:
                    await self.list_places(**kwargs)
                self.assertEqual(ctx.exception.status_code, 400)

    async def test_default_origin_when_from_is_empty(self):
        app.config._settings.campus.default_origin = "Norlin Library"
        body = await self.list_places(category="library")
        self.assertEqual(body["from"]["id"], "norlin-library")
        self.assertEqual(body["places"][0]["walk_minutes"], 3)


class TestDetail(PlacesApiTestCase):
    async def test_detail_and_404(self):
        body = await places_api.get_place("c4c-dining", from_="", current_user=None)
        self.assertEqual(body["place"]["name"], "C4C Dining")
        self.assertTrue(body["place"]["open_now"])
        self.assertIn("openstreetmap.org", body["place"]["map_url"])
        with self.assertRaises(HTTPException) as ctx:
            await places_api.get_place("nope", from_="", current_user=None)
        self.assertEqual(ctx.exception.status_code, 404)

    async def test_detail_has_osm_fields_and_photo_credit(self):
        place = (await places_api.get_place("norlin-library", from_="", current_user=None))["place"]
        for key, value in NORLIN_DETAILS.items():
            self.assertEqual(place[key], value, key)
        self.assertEqual(places.public(places.get("norlin-library"))["photo"]["license"], "CC BY 4.0")

    async def test_missing_and_malformed_fields_are_left_out(self):
        place = (await places_api.get_place("c4c-dining", from_="", current_user=None))["place"]
        self.assertEqual(place["phone"], "+1 303-492-0000")
        for key in ("osm", "website", "building_levels", "cuisine", "photo", "wikidata", "description"):
            self.assertNotIn(key, place)
        bare = (await places_api.get_place("late-night", from_="", current_user=None))["place"]
        self.assertFalse(set(places.DETAIL_FIELDS) & set(bare))

    async def test_list_rows_stay_short(self):
        body = await self.list_places(category="library")
        self.assertNotIn("photo", body["places"][0])


if __name__ == "__main__":
    unittest.main()
