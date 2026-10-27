"""Tests for school pack loading (SCHOOL=<slug>) and its startup checks."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import yaml

import app.config
from app.config import SCHOOLS_DIR, load_settings


def write_yaml(path: Path, data: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
    return path


ISOLATED = {
    "mongodb": {"database_name": "test_advisor"},
    "rag": {"chroma_collection": "test_docs"},
}


class SchoolPackTestCase(unittest.TestCase):
    def setUp(self):
        app.config._settings = None
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        env = {k: v for k, v in os.environ.items() if k not in ("SCHOOL", "CONFIG_PATH", "ALLOW_DRAFT")}
        self.env = patch.dict(os.environ, env, clear=True)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()
        app.config._settings = None

    def pack(self, slug="demo", **school):
        data = {"school": {"slug": slug, "timezone": "America/Denver", **school}, **ISOLATED}
        return write_yaml(self.root / slug / "school.yaml", data)


class TestShippedPacks(SchoolPackTestCase):
    def load_shipped(self, slug):
        with patch.dict(os.environ, {"SCHOOL": slug}):
            return load_settings()

    def test_cu_pack_inherits_cu_config(self):
        settings = self.load_shipped("cu-boulder")
        self.assertEqual(settings.app.institution, "University of Colorado Boulder")
        self.assertEqual(settings.school.timezone, "America/Denver")
        self.assertEqual(settings.mongodb.database_name, "undergrad_advisor")
        self.assertIn("search_courses", settings.tools.get_enabled_names())

    def test_uw_pack_keeps_existing_stores(self):
        settings = self.load_shipped("uw-madison")
        self.assertEqual(settings.school.timezone, "America/Chicago")
        self.assertEqual(settings.mongodb.database_name, "wisconsin_advisor")
        self.assertEqual(settings.rag.chroma_collection, "wisconsin_advisor_documents")

    def test_uva_pack_has_own_branding_and_stores(self):
        settings = self.load_shipped("uva")
        self.assertEqual(settings.app.institution, "University of Virginia")
        self.assertEqual(settings.school.timezone, "America/New_York")
        self.assertEqual(settings.mongodb.database_name, "uva_advisor")
        self.assertEqual(settings.rag.chroma_collection, "uva_docs")
        enabled = settings.tools.get_enabled_names()
        self.assertNotIn("search_courses", enabled)
        self.assertEqual(
            settings.tools.get_tool_config("rate_my_professor")["school_id"], "U2Nob29sLTEyNzc="
        )
        # Personas come from the base config.
        self.assertTrue(settings.personas.items)

    def test_shipped_packs_never_mention_another_school(self):
        for slug in ("cu-boulder", "uw-madison", "uva"):
            text = (SCHOOLS_DIR / slug / "school.yaml").read_text()
            others = {"cu-boulder": "Virginia", "uw-madison": "Virginia", "uva": "Colorado"}
            self.assertNotIn(others[slug], text)


class TestPackSelection(SchoolPackTestCase):
    def test_school_and_config_path_together_is_an_error(self):
        with patch.dict(os.environ, {"SCHOOL": "cu-boulder", "CONFIG_PATH": "/x.yaml"}):
            with self.assertRaisesRegex(ValueError, "either SCHOOL or CONFIG_PATH"):
                load_settings()

    def test_unknown_school_is_an_error(self):
        with patch.dict(os.environ, {"SCHOOL": "no-such-school"}):
            with self.assertRaises(FileNotFoundError):
                load_settings()

    def test_base_is_deep_merged_under_pack(self):
        write_yaml(self.root / "base.yaml", {"app": {"title": "Base", "subtitle": "Kept"}})
        path = write_yaml(
            self.root / "demo" / "school.yaml",
            {"base": "../base.yaml", "app": {"title": "Pack"},
             "school": {"slug": "demo", "timezone": "America/Denver"}, **ISOLATED},
        )
        settings = load_settings(str(path))
        self.assertEqual(settings.app.title, "Pack")
        self.assertEqual(settings.app.subtitle, "Kept")


class TestStartupChecks(SchoolPackTestCase):
    def test_missing_timezone_is_refused(self):
        path = write_yaml(self.root / "demo" / "school.yaml", {"school": {"slug": "demo"}, **ISOLATED})
        with self.assertRaisesRegex(ValueError, "school.timezone"):
            load_settings(str(path))

    def test_non_iana_timezone_is_refused(self):
        # CU's own iCal feed declares "Mountain", which is not an IANA zone.
        with self.assertRaisesRegex(ValueError, "not an IANA timezone"):
            load_settings(str(self.pack(timezone="Mountain")))

    def test_draft_pack_is_refused_without_allow_draft(self):
        with self.assertRaisesRegex(ValueError, "draft"):
            load_settings(str(self.pack(status="draft")))

    def test_draft_pack_loads_with_allow_draft(self):
        with patch.dict(os.environ, {"ALLOW_DRAFT": "1"}):
            settings = load_settings(str(self.pack(status="draft")))
        self.assertEqual(settings.school.status, "draft")

    def test_shared_default_database_is_refused(self):
        path = write_yaml(
            self.root / "demo" / "school.yaml",
            {"school": {"slug": "demo", "timezone": "America/Denver"},
             "rag": {"chroma_collection": "test_docs"}},
        )
        with self.assertRaisesRegex(ValueError, "mongodb.database_name"):
            load_settings(str(path))

    def test_shared_default_collection_is_refused(self):
        path = write_yaml(
            self.root / "demo" / "school.yaml",
            {"school": {"slug": "demo", "timezone": "America/Denver"},
             "mongodb": {"database_name": "test_advisor"}},
        )
        with self.assertRaisesRegex(ValueError, "rag.chroma_collection"):
            load_settings(str(path))

    def test_legacy_config_without_school_still_loads(self):
        path = write_yaml(self.root / "legacy.yaml", {"app": {"title": "Legacy"}})
        settings = load_settings(str(path))
        self.assertEqual(settings.app.title, "Legacy")
        self.assertEqual(settings.school.slug, "")


class TestCampusDefaults(SchoolPackTestCase):
    PLACES = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [-105.27, 40.0]},
         "properties": {"name": "University Memorial Center", "category": "dining"}},
    ]}

    def campus_pack(self, **campus):
        (self.root / "demo").mkdir(parents=True, exist_ok=True)
        (self.root / "demo" / "places.geojson").write_text(json.dumps(self.PLACES))
        data = {"school": {"slug": "demo", "timezone": "America/Denver"},
                "campus": {"places_file": "places.geojson", **campus}, **ISOLATED}
        return write_yaml(self.root / "demo" / "school.yaml", data)

    def load(self, path):
        with patch.object(app.config, "SCHOOLS_DIR", self.root):
            return load_settings(str(path))

    def test_origin_by_name_or_id_and_category_load(self):
        for origin in ("University Memorial Center", "university-memorial-center"):
            with self.subTest(origin=origin):
                app.config._settings = None
                settings = self.load(self.campus_pack(default_origin=origin, default_category="dining"))
                self.assertEqual(settings.campus.default_origin, origin)

    def test_unknown_origin_is_refused(self):
        with self.assertRaisesRegex(ValueError, "default_origin 'Old Main' is not a place"):
            self.load(self.campus_pack(default_origin="Old Main"))

    def test_empty_category_is_refused(self):
        with self.assertRaisesRegex(ValueError, "default_category 'library' has no places"):
            self.load(self.campus_pack(default_category="library"))

    def test_defaults_without_a_places_file_are_refused(self):
        path = write_yaml(self.root / "demo" / "school.yaml", {
            "school": {"slug": "demo", "timezone": "America/Denver"},
            "campus": {"places_file": "missing.geojson", "default_origin": "X"}, **ISOLATED})
        with self.assertRaisesRegex(ValueError, "places file can't be read"):
            self.load(path)

    def test_shipped_packs_have_real_defaults(self):
        expected = {"uw-madison": ("College Library", "library"), "uva": ("Shannon Library", "library"),
                    "cu-boulder": ("University Memorial Center", "dining")}
        for slug, (origin, category) in expected.items():
            with self.subTest(slug=slug):
                app.config._settings = None
                with patch.dict(os.environ, {"SCHOOL": slug}):
                    settings = load_settings()
                self.assertEqual((settings.campus.default_origin, settings.campus.default_category),
                                 (origin, category))

    def test_uw_feed_reads_two_pages(self):
        with patch.dict(os.environ, {"SCHOOL": "uw-madison"}):
            feed = load_settings().student_life.event_feeds[0]
        self.assertEqual((feed.url, feed.pages), ("https://today.wisc.edu/events.ics?limit=200", 2))


if __name__ == "__main__":
    unittest.main()
