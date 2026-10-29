"""Instructor ratings: /api/catalog/ratings/{id} (CEO C4, eng re-review N1/N5).

RateMyProfessors is always mocked; nothing here reaches the network.
"""

import asyncio
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.config
from app.api.routes import catalog
from app.api.routes import router as api_router
from app.config import AppSettings
from app.core.auth import get_current_active_user
from app.sources import academics, cache, csv_snapshot, ratings
from app.tests.unit.test_catalog_api import UW, TestUVA, fake_coursemap, fake_download
from app.tools import _uw_source, rate_my_professor

RMP = {"rate_my_professor": {"enabled": True, "school_id": "U2Nob29sLTEyNzc="}}


def prof(name, department="Computer Science", rating=4.2, num_ratings=30, legacy_id=1234):
    return {"name": name, "department": department, "rating": rating, "difficulty": 3.1,
            "would_take_again_pct": 81.6, "num_ratings": num_ratings, "rmp_id": "x", "legacy_id": legacy_id}


def summary(identifier="CS 2100", instructors=(), instructor_grades=()):
    return {"identifier": identifier, "instructors": list(instructors),
            "instructor_grades": [{"name": n, "gpa": 3.0, "students": 10} for n in instructor_grades]}


class RatingsTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        app.config._settings = AppSettings(
            tools={"course_search": {"enabled": True}, **RMP},
            academics={"provider": "csv_snapshot"},
        )
        self.tmp = tempfile.TemporaryDirectory()
        self.found = {}
        self.rmp = AsyncMock(side_effect=self.lookup)
        self.patches = [
            patch.object(cache, "CACHE_DIR", Path(self.tmp.name) / "cache"),
            patch.object(rate_my_professor, "execute", self.rmp),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        app.config._settings = None

    async def lookup(self, *, professor_name):
        return {"professors": self.found.get(professor_name, []), "query": {"professor_name": professor_name}}

    async def ratings_for(self, **kwargs):
        with patch.object(academics, "course_summary", new=AsyncMock(return_value=summary(**kwargs))):
            return await ratings.course_ratings(kwargs.get("identifier", "CS 2100"))


class TestMatchRule(RatingsTestCase):
    async def test_one_exact_match_gives_a_rating(self):
        self.found = {"Briana Morrison": [prof("Briana Morrison"), prof("Brian Morrison")]}
        body = await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(body["ratings"], [{
            "name": "Briana Morrison", "rating": 4.2, "difficulty": 3.1, "num_ratings": 30,
            "would_take_again_pct": 82, "url": "https://www.ratemyprofessors.com/professor/1234",
        }])
        self.assertEqual(body["source"]["name"], "RateMyProfessors")

    async def test_same_school_namesakes_give_no_rating(self):
        self.found = {"John Smith": [prof("John Smith"), prof("John Smith", legacy_id=99)]}
        body = await self.ratings_for(instructors=["John Smith"])
        self.assertEqual(body["ratings"], [])

    async def test_accent_case_and_middle_initial_still_match(self):
        self.found = {"JOSE Q. GARCIA": [prof("José García")]}
        body = await self.ratings_for(instructors=["JOSE Q. GARCIA"])
        self.assertEqual([r["name"] for r in body["ratings"]], ["JOSE Q. GARCIA"])

    async def test_department_must_fit_the_subject(self):
        self.found = {"Ada Lovelace": [prof("Ada Lovelace", department="History")]}
        body = await self.ratings_for(instructors=["Ada Lovelace"])
        self.assertEqual(body["ratings"], [])

    async def test_partial_name_is_not_a_match(self):
        self.found = {"Ada Lovelace": [prof("Ada King Lovelace")]}
        self.assertEqual((await self.ratings_for(instructors=["Ada Lovelace"]))["ratings"], [])

    async def test_a_miss_is_cached(self):
        self.found = {"John Smith": [prof("John Smith"), prof("John Smith")]}
        await self.ratings_for(instructors=["John Smith"])
        await self.ratings_for(instructors=["John Smith"])
        self.assertEqual(self.rmp.await_count, 1)

    def test_department_fits(self):
        for subject, department in [("CSCI", "Computer Science"), ("CS", "Computer Science"),
                                    ("COMP SCI", "Computer Science"), ("APPM", "Applied Mathematics"),
                                    ("ECON", "Economics"), ("ECE", "Electrical & Computer Engineering")]:
            self.assertTrue(ratings.department_fits(subject, department), (subject, department))
        for subject, department in [("MATH", "Computer Science"), ("CS", ""), ("ECON", "English")]:
            self.assertFalse(ratings.department_fits(subject, department), (subject, department))


class TestLookups(RatingsTestCase):
    async def test_second_call_is_a_cache_hit(self):
        self.found = {"Briana Morrison": [prof("Briana Morrison")]}
        first = await self.ratings_for(instructors=["Briana Morrison"])
        second = await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(first, second)
        self.assertEqual(self.rmp.await_count, 1)

    async def test_cache_expires_after_seven_days(self):
        self.found = {"Briana Morrison": [prof("Briana Morrison")]}
        await self.ratings_for(instructors=["Briana Morrison"])
        real_time = ratings.time.time
        with patch.object(ratings.time, "time", return_value=real_time() + 8 * 86400):
            await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(self.rmp.await_count, 2)

    async def test_a_timeout_omits_the_rating_and_is_not_cached(self):
        async def slow(*, professor_name):
            await asyncio.sleep(5)

        self.rmp.side_effect = slow
        with patch.object(ratings, "LOOKUP_TIMEOUT_S", 0.05):
            body = await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(body["ratings"], [])
        self.assertNotIn("error", body)
        self.rmp.side_effect = self.lookup
        self.found = {"Briana Morrison": [prof("Briana Morrison")]}
        self.assertEqual(len((await self.ratings_for(instructors=["Briana Morrison"]))["ratings"]), 1)

    async def test_a_failed_lookup_omits_the_rating(self):
        self.rmp.side_effect = None
        self.rmp.return_value = {"professors": [], "error": "RateMyProfessors authentication failed"}
        body = await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(body["ratings"], [])
        self.assertNotIn("error", body)

    async def test_never_more_than_four_lookups_current_instructors_first(self):
        current = ["Ann One", "Bob Two", "Cat Three"]
        past = ["Bob Two", "Dan Four", "Eve Five", "Fay Six"]
        self.found = {n: [prof(n)] for n in current + past}
        body = await self.ratings_for(instructors=current + ["Staff"], instructor_grades=past)
        asked = [c.kwargs["professor_name"] for c in self.rmp.await_args_list]
        self.assertEqual(sorted(asked), sorted(["Ann One", "Bob Two", "Cat Three", "Dan Four"]))
        self.assertEqual([r["name"] for r in body["ratings"]], ["Ann One", "Bob Two", "Cat Three", "Dan Four"])

    async def test_rmp_disabled_gives_no_ratings(self):
        app.config._settings = AppSettings(
            tools={"course_search": {"enabled": True}}, academics={"provider": "csv_snapshot"},
        )
        body = await self.ratings_for(instructors=["Briana Morrison"])
        self.assertEqual(body["ratings"], [])
        self.rmp.assert_not_awaited()


class TestRoutes(unittest.TestCase):
    def setUp(self):
        app.config._settings = AppSettings(**UW)
        api = FastAPI()
        api.include_router(api_router)
        api.dependency_overrides[get_current_active_user] = lambda: object()
        self.client = TestClient(api)
        _uw_source._cache.clear()

    def tearDown(self):
        app.config._settings = None
        _uw_source._cache.clear()

    def test_ratings_and_summary_routes_both_resolve(self):
        with patch.object(ratings, "course_ratings", new=AsyncMock(return_value={"ratings": []})) as rated, \
                patch.object(academics, "course_summary", new=AsyncMock(return_value={"ok": 1})) as summarized:
            self.assertEqual(self.client.get("/api/catalog/ratings/COMP SCI 400").json(), {"ratings": []})
            self.assertEqual(self.client.get("/api/catalog/COMP SCI 400").json(), {"ok": 1})
        rated.assert_awaited_once_with("COMP SCI 400")
        summarized.assert_awaited_once_with("COMP SCI 400")

    def test_uw_uses_course_map_ratings(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap()), \
                patch.object(rate_my_professor, "execute", new=AsyncMock()) as rmp:
            body = self.client.get("/api/catalog/ratings/COMP SCI 300").json()
        self.assertEqual(body["identifier"], "COMPSCI 300")
        self.assertEqual(body["ratings"], [{"name": "Jim Williams", "rating": 2.98, "difficulty": 3.39, "num_ratings": 155}])
        self.assertEqual(body["source"]["name"], "UW Course Map")
        rmp.assert_not_awaited()

    def test_unknown_course_is_404(self):
        with patch.object(_uw_source, "_fetch_json", side_effect=fake_coursemap([[]])):
            self.assertEqual(self.client.get("/api/catalog/ratings/BOGUS 999").status_code, 404)

    def test_bad_identifier_is_400(self):
        self.assertEqual(self.client.get("/api/catalog/ratings/CS 2100;drop").status_code, 400)


class TestUVARoute(unittest.TestCase):
    """End to end through the UVA snapshot: section and grade-file names."""

    def setUp(self):
        settings = dict(TestUVA.settings)
        settings["tools"] = {**settings["tools"], **RMP}
        app.config._settings = AppSettings(**settings)
        csv_snapshot._tables.clear()
        self.tmp = tempfile.TemporaryDirectory()
        self.rmp = AsyncMock(return_value={"professors": [prof("Briana Morrison")]})
        self.patches = [
            patch.object(cache, "CACHE_DIR", Path(self.tmp.name) / "cache"),
            patch.object(cache, "_download", side_effect=fake_download),
            patch.object(rate_my_professor, "execute", self.rmp),
            patch.dict(os.environ, {"SOURCES_OFFLINE": ""}),
        ]
        for p in self.patches:
            p.start()
        api = FastAPI()
        api.include_router(api_router)
        api.dependency_overrides[get_current_active_user] = lambda: object()
        self.client = TestClient(api)

    def tearDown(self):
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()
        csv_snapshot._tables.clear()
        app.config._settings = None

    def test_instructor_from_sections_and_grades_is_looked_up_once(self):
        body = self.client.get("/api/catalog/ratings/CS 2100").json()
        self.assertEqual([r["name"] for r in body["ratings"]], ["Briana Morrison"])
        # "Morrison,Briana" in the grades file is the same person as the sections' "Briana Morrison".
        asked = [c.kwargs["professor_name"] for c in self.rmp.await_args_list]
        self.assertCountEqual(asked, ["Briana Morrison", "Ana Lab"])
        self.client.get("/api/catalog/ratings/CS 2100")
        self.assertEqual(self.rmp.await_count, 2)


if __name__ == "__main__":
    unittest.main()
