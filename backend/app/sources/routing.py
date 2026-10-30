"""Walking routes and times from OSRM's foot profile (FOSSGIS, no key).

``walking_route(a, b)`` returns the full route line for the selected place;
``walking_table(origin, places)`` returns minutes and metres for list rows
with at most one table call (25 uncached places) per request. Both send an identifying
User-Agent, give up after 5 seconds, and cache each place pair on disk for 30
days (``sources/cache.py``)::

    pair cached (< 30 days) ─────────────► serve
    not cached / old ─► OSRM ─┬► ok ─────► write, serve
                              └► fail ───► old copy if any, else unavailable

FOSSGIS may block heavy or anonymous clients, so callers treat "unavailable"
as normal: the route endpoint answers 503 and list rows show no time.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Dict, List, Optional

import httpx

from app.sources import cache

logger = logging.getLogger(__name__)

OSRM_BASE = "https://routing.openstreetmap.de/routed-foot"
USER_AGENT = "CampusCompanion/0.1 (+https://github.com/NeonSeigne/CCAI-Demo)"
TIMEOUT = 5.0
CACHE_DAYS = 30
TABLE_MAX = 25
ATTRIBUTION = "Routes © OSRM, data © OpenStreetMap contributors (ODbL)"


class RouteUnavailable(RuntimeError):
    """OSRM failed, timed out or found no walking route."""


def _coord(place: Dict[str, Any]) -> str:
    return f"{place['lon']:.6f},{place['lat']:.6f}"


def _key(kind: str, a: Dict[str, Any], b: Dict[str, Any]) -> str:
    # Coordinates are part of the key, so a place that moves is re-routed.
    return f"osrm://foot/{kind}/{a['id']}/{b['id']}?{_coord(a)};{_coord(b)}"


def _cached(key: str, *, fresh_only: bool) -> Optional[Dict[str, Any]]:
    entry = cache.read_entry(key)
    if not entry:
        return None
    if fresh_only and time.time() - entry[1] > CACHE_DAYS * 86400:
        return None
    try:
        return json.loads(entry[0])
    except ValueError:
        return None


def _get(url: str, params: Dict[str, str]) -> Dict[str, Any]:
    try:
        response = httpx.get(url, params=params, timeout=TIMEOUT, headers={"User-Agent": USER_AGENT})
        response.raise_for_status()
        data = response.json()
    except Exception as exc:  # noqa: BLE001
        raise RouteUnavailable(f"walking route service unavailable: {exc}") from exc
    if data.get("code") != "Ok":
        raise RouteUnavailable(f"no walking route ({data.get('code')})")
    return data


def _minutes(seconds: float) -> int:
    return max(1, round(seconds / 60))


def walking_route(a: Dict[str, Any], b: Dict[str, Any]) -> Dict[str, Any]:
    """``{geometry, distance_m, minutes}`` from place *a* to place *b*.

    Raises :class:`RouteUnavailable` when OSRM fails and nothing is cached.
    """
    key = _key("route", a, b)
    hit = _cached(key, fresh_only=True)
    if hit:
        return hit
    try:
        data = _get(
            f"{OSRM_BASE}/route/v1/foot/{_coord(a)};{_coord(b)}",
            {"overview": "full", "geometries": "geojson"},
        )
        route = (data.get("routes") or [None])[0]
        if not route:
            raise RouteUnavailable("no walking route")
    except RouteUnavailable:
        stale = _cached(key, fresh_only=False)
        if stale:
            return stale
        raise
    result = {
        "geometry": route["geometry"],
        "distance_m": round(route["distance"]),
        "minutes": _minutes(route["duration"]),
    }
    cache.write_entry(key, json.dumps(result))
    return result


def walking_table(origin: Dict[str, Any], places: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    """Place id -> ``{minutes, distance_m}`` from *origin*.

    Cached pairs are served for every place; at most one OSRM table call is
    made, for the first 25 places not cached. Later uncached places, and any
    the call could not answer, are left out (the row shows no time).
    """
    out: Dict[str, Dict[str, int]] = {}
    missing: List[Dict[str, Any]] = []
    for place in places:
        if place["id"] == origin["id"]:
            out[place["id"]] = {"minutes": 0, "distance_m": 0}
            continue
        hit = _cached(_key("table", origin, place), fresh_only=True)
        if hit:
            out[place["id"]] = hit
        elif len(missing) < TABLE_MAX and place not in missing:
            missing.append(place)
    if not missing:
        return out
    coords = ";".join(_coord(p) for p in [origin, *missing])
    try:
        data = _get(
            f"{OSRM_BASE}/table/v1/foot/{coords}",
            {"sources": "0", "annotations": "duration,distance"},
        )
        durations = data["durations"][0][1:]
        distances = data["distances"][0][1:]
    except (RouteUnavailable, KeyError, IndexError, TypeError) as exc:
        logger.warning("Walking table failed: %s", exc)
        for place in missing:
            stale = _cached(_key("table", origin, place), fresh_only=False)
            if stale:
                out[place["id"]] = stale
        return out
    for place, seconds, metres in zip(missing, durations, distances):
        if seconds is None or metres is None:
            continue
        row = {"minutes": _minutes(seconds), "distance_m": round(metres)}
        out[place["id"]] = row
        cache.write_entry(_key("table", origin, place), json.dumps(row))
    return out


async def walk_minutes(origin: Dict[str, Any], targets: List[Dict[str, Any]]) -> Dict[str, int]:
    """Place id -> walking minutes from *origin*: one ``walking_table`` call
    (FOSSGIS rate-limits bursts), off the event loop. Places past the first 25
    uncached ones, or that the call could not answer, are left out."""
    if not targets:
        return {}
    rows = await asyncio.to_thread(walking_table, origin, targets)
    return {pid: row["minutes"] for pid, row in rows.items()}
