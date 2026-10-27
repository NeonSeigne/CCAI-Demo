"""Tests for the student's start place (GET/PUT /api/me/campus-origin)."""

import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from bson import ObjectId
from fastapi import HTTPException

import app.config
from app.api.routes import origin as origin_api
from app.api.routes.origin import CampusOriginRequest
from app.config import AppSettings
from app.models.user import User
from app.sources import places


def feature(name, lon, lat, category="academic"):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"name": name, "category": category}}


CAMPUS = {"type": "FeatureCollection", "features": [
    feature("College Library", -89.4012, 43.0766, "library"),
    feature("Union South", -89.4085, 43.0717, "dining"),
]}


def make_user(**overrides):
    data = dict(_id=ObjectId(), firstName="Test", lastName="User", email="test@example.com",
                hashed_password="x", created_at=datetime(2025, 1, 1))
    data.update(overrides)
    return User(**data)


class OriginTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "demo").mkdir()
        (root / "demo" / "places.geojson").write_text(json.dumps(CAMPUS))
        with patch.object(app.config, "SCHOOLS_DIR", root):
            app.config._settings = AppSettings(
                school={"slug": "demo", "timezone": "America/Chicago"},
                mongodb={"database_name": "demo_advisor"},
                rag={"chroma_collection": "demo_docs"},
                campus={"places_file": "places.geojson", "default_origin": "College Library",
                        "default_category": "library"},
            )
        places._loaded.clear()
        self.db = MagicMock()
        self.db.users.update_one = AsyncMock()
        self.patches = [
            patch.object(places, "SCHOOLS_DIR", root),
            patch.object(origin_api, "get_database", return_value=self.db),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        places._loaded.clear()
        self.tmp.cleanup()
        app.config._settings = None

    async def test_default_when_nothing_saved(self):
        body = await origin_api.get_campus_origin(current_user=make_user())
        self.assertEqual(body["place"]["id"], "college-library")
        self.assertTrue(body["is_default"])

    async def test_set_saves_on_this_user_only(self):
        user = make_user()
        body = await origin_api.update_campus_origin(CampusOriginRequest(place_id="union-south"), current_user=user)
        self.assertEqual(body["place"]["id"], "union-south")
        self.assertFalse(body["is_default"])
        self.db.users.update_one.assert_awaited_once_with(
            {"_id": user.id}, {"$set": {"campus_origin": "union-south"}}
        )
        again = await origin_api.get_campus_origin(current_user=user)
        self.assertEqual(again["place"]["id"], "union-south")

    async def test_unknown_id_is_400_and_not_saved(self):
        with self.assertRaises(HTTPException) as ctx:
            await origin_api.update_campus_origin(CampusOriginRequest(place_id="nowhere"), current_user=make_user())
        self.assertEqual(ctx.exception.status_code, 400)
        self.db.users.update_one.assert_not_awaited()

    async def test_vanished_id_falls_back_to_default(self):
        body = await origin_api.get_campus_origin(current_user=make_user(campus_origin="old-building"))
        self.assertEqual(body["place"]["id"], "college-library")
        self.assertTrue(body["is_default"])


if __name__ == "__main__":
    unittest.main()
