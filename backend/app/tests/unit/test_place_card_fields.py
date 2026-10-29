"""Place card fields (home-colors alignment Phase 3): ``type`` from the OSM
tag the importer keeps, ``floors`` and ``access`` from OSM, null when absent."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import app.config
from app.api.routes import places as places_api
from app.config import AppSettings
from app.sources import places

REPO = Path(__file__).resolve().parents[4]
_spec = importlib.util.spec_from_file_location("import_places", REPO / "scripts" / "import_places.py")
import_places = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(import_places)


def feature(name, lon, lat, category="academic", **props):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"name": name, "aliases": [], "category": category, **props}}


CAMPUS = {"type": "FeatureCollection", "features": [
    feature("Norlin Library", -105.2708, 40.0086, "library", osm_tag="amenity=library",
            building_levels=4, wheelchair="yes"),
    feature("Engineering Center", -105.2630, 40.0070, osm_tag="building=university", wheelchair="limited"),
    feature("Old Main", -105.2730, 40.0080),  # imported before osm_tag existed
    feature("Odd Tag", -105.2731, 40.0081, osm_tag="building=greenhouse", wheelchair="designated"),
    feature("Bad Tag", -105.2732, 40.0082, osm_tag="not a tag", wheelchair="maybe"),
]}


class TestCardFields(unittest.IsolatedAsyncioTestCase):
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
        self.patch = patch.object(places, "SCHOOLS_DIR", root)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        places._loaded.clear()
        self.tmp.cleanup()
        app.config._settings = None

    async def detail(self, place_id):
        return (await places_api.get_place(place_id, from_="", current_user=None))["place"]

    async def test_type_floors_and_access(self):
        norlin = await self.detail("norlin-library")
        self.assertEqual((norlin["type"], norlin["floors"], norlin["access"]), ("Library", 4, "yes"))
        engineering = await self.detail("engineering-center")
        self.assertEqual((engineering["type"], engineering["floors"], engineering["access"]),
                         ("Academic building", None, "limited"))

    async def test_missing_values_are_null_not_guessed(self):
        # No osm_tag: an "academic" category alone could be any building.
        old = await self.detail("old-main")
        self.assertEqual((old["type"], old["floors"], old["access"]), (None, None, None))

    async def test_unlisted_or_malformed_values_are_null(self):
        odd = await self.detail("odd-tag")
        self.assertEqual((odd["type"], odd["access"]), (None, "yes"))  # designated reads as yes
        bad = await self.detail("bad-tag")
        self.assertEqual((bad["type"], bad["access"]), (None, None))

    def test_public_carries_them_too(self):
        public = places.public(places.get("norlin-library"))
        self.assertEqual((public["type"], public["floors"], public["access"]), ("Library", 4, "yes"))


class TestImporterKeepsTheTag(unittest.TestCase):
    def test_category_tag_then_specific_building(self):
        self.assertEqual(import_places.osm_tag({"amenity": "library", "building": "university"}), "amenity=library")
        self.assertEqual(import_places.osm_tag({"building": "university"}), "building=university")
        self.assertEqual(import_places.osm_tag({"building": "greenhouse"}), "building=greenhouse")

    def test_generic_building_gives_none(self):
        self.assertIsNone(import_places.osm_tag({"building": "yes"}))
        self.assertIsNone(import_places.osm_tag({}))

    def test_feature_gets_osm_tag(self):
        element = {"type": "way", "id": 1, "center": {"lat": 40.0, "lon": -105.0},
                   "tags": {"name": "UMC", "building": "university"}}
        self.assertEqual(import_places.to_feature(element, {})["properties"]["osm_tag"], "building=university")


if __name__ == "__main__":
    unittest.main()
