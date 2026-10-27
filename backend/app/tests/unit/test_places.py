"""Tests for campus places (places.geojson) and the find_place tool."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app.config
from app.config import SCHOOLS_DIR, AppSettings
from app.sources import places
from app.tools import find_place


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
        feature("Norlin Library", -105.2708, 40.0086, "library", aliases=["Norlin"]),
        feature("C4C Dining", -105.2650, 40.0045, "dining"),
        feature("Farrand Grab and Go", -105.2658, 40.0059, "dining"),
        feature("Engineering Center", -105.2630, 40.0071),
        feature("Computer Sceinces Building", -105.2640, 40.0080),
        feature("Soils Building", -105.2660, 40.0090),
        feature("Rotunda", -105.2700, 40.0100),
        feature("The Rotunda", -105.2701, 40.0101),
    ],
}


class PlacesTestCase(unittest.IsolatedAsyncioTestCase):
    places_data = CAMPUS

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "demo").mkdir()
        if self.places_data is not None:
            text = self.places_data if isinstance(self.places_data, str) else json.dumps(self.places_data)
            (root / "demo" / "places.geojson").write_text(text)
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            campus={"places_file": "places.geojson"},
        )
        places._loaded.clear()
        self.patch = patch.object(places, "SCHOOLS_DIR", root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        places._loaded.clear()
        self.tmp.cleanup()
        app.config._settings = None


class TestLookup(PlacesTestCase):
    async def test_alias_finds_place(self):
        result = await find_place.execute(query="UMC")
        self.assertEqual(result["places"][0]["name"], "University Memorial Center")
        self.assertIn("openstreetmap.org", result["places"][0]["map_url"])

    async def test_partial_and_case_insensitive_name(self):
        result = await find_place.execute(query="norlin")
        self.assertEqual(result["places"][0]["name"], "Norlin Library")

    async def test_typo_still_matches(self):
        result = await find_place.execute(query="Engineering Centre")
        self.assertEqual(result["places"][0]["name"], "Engineering Center")

    async def test_typo_in_map_data_still_matches(self):
        result = await find_place.execute(query="Computer Sciences")
        self.assertEqual(result["places"][0]["name"], "Computer Sceinces Building")

    async def test_filler_words_do_not_match_on_their_own(self):
        result = await find_place.execute(query="CS building")
        self.assertEqual(result["places"], [])

    async def test_same_landmark_mapped_twice_is_returned_once(self):
        result = await find_place.execute(query="the rotunda")
        self.assertEqual([p["name"] for p in result["places"]], ["Rotunda"])

    async def test_unknown_place(self):
        result = await find_place.execute(query="Hogwarts")
        self.assertEqual(result["places"], [])
        self.assertIn("Couldn't find", result["error"])

    async def test_needs_query_or_category(self):
        result = await find_place.execute()
        self.assertIn("error", result)


class TestDistance(PlacesTestCase):
    async def test_from_place_adds_distance_and_estimate(self):
        result = await find_place.execute(query="UMC", from_place="Norlin")
        place = result["places"][0]
        self.assertEqual(result["from"]["name"], "Norlin Library")
        self.assertAlmostEqual(place["distance_m"], 218, delta=10)
        self.assertEqual(place["walk_minutes_estimate"], 3)
        self.assertIn("estimates", result["note"])

    async def test_nearest_of_category(self):
        result = await find_place.execute(category="dining", from_place="Engineering Center")
        names = [p["name"] for p in result["places"]]
        self.assertEqual(names, ["Farrand Grab and Go", "C4C Dining"])
        self.assertLess(result["places"][0]["distance_m"], result["places"][1]["distance_m"])

    async def test_unknown_origin(self):
        result = await find_place.execute(query="UMC", from_place="Narnia")
        self.assertIn("Narnia", result["error"])

    def test_haversine(self):
        a = {"lat": 40.0, "lon": -105.0}
        b = {"lat": 40.01, "lon": -105.0}
        self.assertAlmostEqual(places.distance_m(a, b), 1112, delta=2)


class TestMalformedFile(PlacesTestCase):
    places_data = '{"type": "FeatureCollection", "features": [{"properties": {}}]}'

    async def test_invalid_file_disables_lookups_with_clear_error(self):
        result = await find_place.execute(query="UMC")
        self.assertEqual(result["places"], [])
        self.assertIn("invalid", result["error"])


class TestMissingFile(PlacesTestCase):
    places_data = None

    async def test_missing_file_reports_not_imported(self):
        result = await find_place.execute(query="UMC")
        self.assertIn("not been imported", result["error"])


class TestShippedPlaces(unittest.TestCase):
    def test_shipped_files_validate_and_contain_curated_aliases(self):
        expected = {"cu-boulder": "UMC", "uw-madison": "Mem U", "uva": "JPJ"}
        for slug, alias in expected.items():
            data = json.loads((SCHOOLS_DIR / slug / "places.geojson").read_text())
            loaded = places._validate(data)
            self.assertTrue(any(alias in p["aliases"] for p in loaded), f"{slug} missing {alias}")


if __name__ == "__main__":
    unittest.main()
