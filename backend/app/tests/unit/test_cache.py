"""Tests for the source disk cache (app.sources.cache)."""

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

import app.config
from app.config import AppSettings
from app.sources import cache


class CacheTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.patch = patch.object(cache, "CACHE_DIR", Path(self.tmp.name))
        self.patch.start()
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Denver"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
        )

    def tearDown(self):
        self.patch.stop()
        self.tmp.cleanup()
        app.config._settings = None


class TestCacheKeys(CacheTestCase):
    def test_urls_differing_only_by_query_get_separate_files(self):
        a, _ = cache._paths("https://example.edu/events.ics?calendar=one")
        b, _ = cache._paths("https://example.edu/events.ics?calendar=two")
        self.assertNotEqual(a, b)


class TestCacheRecovery(CacheTestCase):
    URL = "https://example.edu/feed.ics"

    def test_corrupt_meta_is_treated_as_a_miss_and_refetched(self):
        data_path, meta_path = cache._paths(self.URL)
        data_path.parent.mkdir(parents=True, exist_ok=True)
        data_path.write_text("old")
        meta_path.write_text("{not json")
        with patch.object(cache, "_download", return_value=("new", None)) as download:
            text, _ = cache.load_text(self.URL, 1)
        self.assertEqual(text, "new")
        download.assert_called_once()

    def test_failed_write_still_returns_the_download(self):
        with patch.object(cache, "_download", return_value=("fresh", None)), \
             patch.object(Path, "write_text", side_effect=OSError("read-only")):
            text, _ = cache.load_text(self.URL, 1)
        self.assertEqual(text, "fresh")

    def test_write_is_atomic(self):
        # A reader never sees a half-written file: data lands via os.replace.
        with patch.object(cache, "_download", return_value=("x" * 10, None)), \
             patch.object(cache.os, "replace", wraps=cache.os.replace) as replace:
            cache.load_text(self.URL, 1)
        self.assertGreaterEqual(replace.call_count, 2)

    def test_strict_refresh_failure_raises_instead_of_serving_stale(self):
        # warm_cache must not print "ok" for a stale copy before an offline demo.
        with patch.object(cache, "_download", return_value=("old", None)):
            cache.load_text(self.URL, 1)
        with patch.object(cache, "_download", side_effect=RuntimeError("down")):
            self.assertEqual(cache.load_text(self.URL, 0)[0], "old")
            with self.assertRaises(RuntimeError):
                cache.load_text(self.URL, 0, strict=True)

    def test_strict_write_failure_raises(self):
        with patch.object(cache, "_download", return_value=("fresh", None)), \
             patch.object(Path, "write_text", side_effect=OSError("disk full")):
            with self.assertRaises(RuntimeError):
                cache.load_text(self.URL, 0, strict=True)

    def test_copy_under_the_old_file_name_is_still_read(self):
        # Caches warmed before the URL hash was added stay usable offline.
        data_path, _ = cache._paths(self.URL)
        legacy = cache._legacy_path(self.URL)
        legacy.parent.mkdir(parents=True, exist_ok=True)
        legacy.write_text("warmed earlier")
        legacy.with_name(legacy.name + ".meta.json").write_text(
            json.dumps({"fetched_at": time.time(), "url": self.URL})
        )
        self.assertFalse(data_path.exists())
        with patch.dict(cache.os.environ, {"SOURCES_OFFLINE": "1"}):
            text, _ = cache.load_text(self.URL, 1)
        self.assertEqual(text, "warmed earlier")

    def test_legacy_copy_of_another_url_is_not_served(self):
        # Old names ignored the query string, so a legacy file may be another feed's.
        other = self.URL + "?calendar=two"
        legacy = cache._legacy_path(self.URL)
        legacy.parent.mkdir(parents=True, exist_ok=True)
        legacy.write_text("other feed")
        legacy.with_name(legacy.name + ".meta.json").write_text(json.dumps({"fetched_at": time.time(), "url": other}))
        self.assertIsNone(cache._read(self.URL))

    def test_fresh_copy_is_served_without_download(self):
        with patch.object(cache, "_download", return_value=("first", None)):
            cache.load_text(self.URL, 1)
        with patch.object(cache, "_download", side_effect=AssertionError("should not fetch")):
            text, _ = cache.load_text(self.URL, 1)
        self.assertEqual(text, "first")


if __name__ == "__main__":
    unittest.main()
