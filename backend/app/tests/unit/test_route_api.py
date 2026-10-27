"""Tests for the walking-route client (sources/routing.py) and /api/route."""

import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
from fastapi import HTTPException

import app.config
from app.api.routes import route as route_api
from app.config import AppSettings
from app.sources import cache, places, routing


def feature(name, lon, lat):
    return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": {"name": name, "category": "academic"}}


CAMPUS = {"type": "FeatureCollection", "features": [
    feature("College Library", -89.4012, 43.0766),
    feature("Union South", -89.4085, 43.0717),
    feature("Memorial Union", -89.3997, 43.0750),
    feature("Grainger Hall", -89.4019, 43.0729),
]}
LINE = {"type": "LineString", "coordinates": [[-89.4012, 43.0766], [-89.4085, 43.0717]]}


def response(payload, status_code=200):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = payload
    resp.raise_for_status.side_effect = (
        None if status_code < 400 else httpx.HTTPStatusError("err", request=MagicMock(), response=MagicMock())
    )
    return resp


ROUTE_OK = {"code": "Ok", "routes": [{"geometry": LINE, "distance": 1210.3, "duration": 968.3}]}


class RoutingTestCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / "demo").mkdir()
        (root / "demo" / "places.geojson").write_text(json.dumps(CAMPUS))
        app.config._settings = AppSettings(
            school={"slug": "demo", "timezone": "America/Chicago"},
            mongodb={"database_name": "demo_advisor"},
            rag={"chroma_collection": "demo_docs"},
            campus={"places_file": "places.geojson"},
        )
        places._loaded.clear()
        self.get = MagicMock(return_value=response(ROUTE_OK))
        self.patches = [
            patch.object(places, "SCHOOLS_DIR", root),
            patch.object(cache, "CACHE_DIR", root / "cache"),
            patch.object(routing.httpx, "get", self.get),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()
        places._loaded.clear()
        self.tmp.cleanup()
        app.config._settings = None

    async def route(self, a="college-library", b="union-south"):
        return await route_api.walking_route(from_=a, to=b, current_user=None)


class TestRouteEndpoint(RoutingTestCase):
    async def test_success(self):
        body = await self.route()
        self.assertEqual(body, {
            "geometry": LINE, "distance_m": 1210, "minutes": 16, "source": "osrm",
            "attribution": "Routes © OSRM, data © OpenStreetMap contributors (ODbL)",
        })
        url = self.get.call_args.args[0]
        self.assertEqual(url, "https://routing.openstreetmap.de/routed-foot/route/v1/foot/"
                              "-89.401200,43.076600;-89.408500,43.071700")
        kwargs = self.get.call_args.kwargs
        self.assertEqual(kwargs["params"], {"overview": "full", "geometries": "geojson"})
        self.assertEqual(kwargs["timeout"], 5.0)
        self.assertEqual(kwargs["headers"]["User-Agent"],
                         "CampusCompanion/0.1 (+https://github.com/NeonSeigne/CCAI-Demo)")

    async def test_cached_pair_skips_the_service(self):
        await self.route()
        self.get.side_effect = httpx.ConnectError("down")
        body = await self.route()
        self.assertEqual(body["minutes"], 16)
        self.assertEqual(self.get.call_count, 1)  # only the first request reached OSRM

    async def test_old_cache_is_refreshed_and_served_when_refresh_fails(self):
        await self.route()
        with patch.object(routing.time, "time", return_value=time.time() + 31 * 86400):
            self.get.side_effect = httpx.ConnectError("down")
            body = await self.route()
        self.assertEqual(self.get.call_count, 2)
        self.assertEqual(body["minutes"], 16)

    async def test_timeout_is_503(self):
        self.get.side_effect = httpx.ReadTimeout("slow")
        with self.assertRaises(HTTPException) as ctx:
            await self.route()
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail, "Walking route unavailable.")

    async def test_no_route_is_503(self):
        for payload in ({"code": "NoRoute"}, {"code": "Ok", "routes": []}):
            with self.subTest(payload=payload):
                self.get.return_value = response(payload)
                with self.assertRaises(HTTPException) as ctx:
                    await self.route(b="memorial-union")
                self.assertEqual(ctx.exception.status_code, 503)

    async def test_http_error_is_503(self):
        self.get.return_value = response({}, status_code=429)
        with self.assertRaises(HTTPException) as ctx:
            await self.route()
        self.assertEqual(ctx.exception.status_code, 503)

    async def test_unknown_place_is_400(self):
        with self.assertRaises(HTTPException) as ctx:
            await self.route(b="nowhere")
        self.assertEqual(ctx.exception.status_code, 400)
        self.get.assert_not_called()


class TestWalkingTable(RoutingTestCase):
    def table_payload(self, n):
        return {"code": "Ok", "durations": [[0] + [60.0 * (i + 1) for i in range(n)]],
                "distances": [[0] + [80.0 * (i + 1) for i in range(n)]]}

    def test_one_call_for_n_rows(self):
        origin, *targets = places.load_places()[0]
        self.get.return_value = response(self.table_payload(3))
        rows = routing.walking_table(origin, targets)
        self.assertEqual(self.get.call_count, 1)
        self.assertEqual(rows, {
            "union-south": {"minutes": 1, "distance_m": 80},
            "memorial-union": {"minutes": 2, "distance_m": 160},
            "grainger-hall": {"minutes": 3, "distance_m": 240},
        })
        url, kwargs = self.get.call_args.args[0], self.get.call_args.kwargs
        self.assertTrue(url.startswith("https://routing.openstreetmap.de/routed-foot/table/v1/foot/-89.401200,43.076600;"))
        self.assertEqual(kwargs["params"], {"sources": "0", "annotations": "duration,distance"})
        self.assertEqual(kwargs["timeout"], 5.0)

    def test_cached_pairs_are_reused(self):
        origin, *targets = places.load_places()[0]
        self.get.return_value = response(self.table_payload(3))
        routing.walking_table(origin, targets)
        self.get.return_value = response(self.table_payload(1))
        rows = routing.walking_table(origin, [*targets, origin])
        self.assertEqual(self.get.call_count, 1)
        self.assertEqual(rows["college-library"], {"minutes": 0, "distance_m": 0})
        self.assertEqual(len(rows), 4)

    def test_failure_leaves_rows_out(self):
        origin, *targets = places.load_places()[0]
        self.get.side_effect = httpx.ReadTimeout("slow")
        self.assertEqual(routing.walking_table(origin, targets), {})

    def test_unreachable_pair_is_left_out(self):
        origin, *targets = places.load_places()[0]
        payload = self.table_payload(3)
        payload["durations"][0][2] = None
        self.get.return_value = response(payload)
        self.assertNotIn("memorial-union", routing.walking_table(origin, targets))

    def test_at_most_25_places_per_call(self):
        origin = places.load_places()[0][0]
        many = [{"id": f"p{i}", "lat": 43.07 + i / 1000, "lon": -89.40} for i in range(30)]
        self.get.return_value = response(self.table_payload(25))
        rows = routing.walking_table(origin, many)
        coords = self.get.call_args.args[0].rsplit("/", 1)[1].split(";")
        self.assertEqual(len(coords), 26)
        self.assertEqual(len(rows), 25)


    def test_cached_pairs_beyond_25_are_served_with_one_call(self):
        origin = places.load_places()[0][0]
        many = [{"id": f"p{i}", "lat": 43.07 + i / 1000, "lon": -89.40} for i in range(30)]
        self.get.return_value = response(self.table_payload(25))
        routing.walking_table(origin, many)
        self.get.return_value = response(self.table_payload(5))
        rows = routing.walking_table(origin, many)
        self.assertEqual(self.get.call_count, 2)
        self.assertEqual(len(rows), 30)
        self.assertEqual(len(routing.walking_table(origin, many)), 30)
        self.assertEqual(self.get.call_count, 2)

if __name__ == "__main__":
    unittest.main()
