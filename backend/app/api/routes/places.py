"""Campus map endpoints (no LLM involved).

``GET /api/places`` lists places of a category (or matching ``q``), nearest
first from ``from``, with open-now from the parsed OSM hours and walking
times for the listed rows (one OSRM table call; a failure leaves the times
out). ``suggested`` is the nearest place in the category known to be open
now, picked across the whole category before ``limit``; when none is known
open it is the nearest overall, labelled "Nearest <category>".
"""

from __future__ import annotations

import asyncio
from collections import Counter
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.models.user import User
from app.sources import ical_events, places, routing

router = APIRouter(prefix="/places", tags=["places"])

DEFAULT_LIMIT = 25
CATEGORY_LABELS = {
    "academic": "academic building", "library": "library", "dining": "dining", "health": "health",
    "housing": "housing", "recreation": "recreation", "arts": "arts", "landmark": "landmark",
    "transit": "bus stop", "other": "place",
}


def _now() -> datetime:
    return datetime.now(ical_events.school_zone())


def _row(place: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    """A list row. ``walk_minutes`` and ``distance_m`` are added only from
    the walking table (route distance), never as straight-line guesses."""
    row = {k: place[k] for k in ("id", "name", "category", "lat", "lon", "hours")}
    row.update(places.hours_status(place, now))
    return row


async def _with_walks(rows: List[Dict[str, Any]], origin: Dict[str, Any], shown: List[Dict[str, Any]]) -> None:
    times = await asyncio.to_thread(routing.walking_table, origin, shown)
    for row in rows:
        if row["id"] in times:
            row["walk_minutes"] = times[row["id"]]["minutes"]
            row["distance_m"] = times[row["id"]]["distance_m"]


def _origin(place_id: str) -> Optional[Dict[str, Any]]:
    if not place_id:
        return places.default_origin()
    origin = places.get(place_id)
    if origin is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown place id '{place_id}'.")
    return origin


def _suggested(
    pool: List[Dict[str, Any]], category: str, now: datetime, origin: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, str]]:
    """Nearest known-open place in *pool* (already nearest first), else the
    nearest. Never the starting place itself: a 0 min walk suggests nothing."""
    pool = [p for p in pool if not origin or p["id"] != origin["id"]]
    if not pool:
        return None
    label = CATEGORY_LABELS.get(category, category or "place")
    for place in pool:
        if places.hours_status(place, now)["open_now"] is True:
            return {"id": place["id"], "label": f"Nearest open {label}"}
    return {"id": pool[0]["id"], "label": f"Nearest {label}"}


@router.get("")
async def list_places(
    category: str = Query(""),
    q: str = Query(""),
    from_: str = Query("", alias="from"),
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    del current_user
    all_places, error = places.load_places()
    if error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=error)
    if category and category not in places.CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"category must be one of {', '.join(places.CATEGORIES)}.",
        )
    origin = _origin(from_)
    now = _now()
    if q.strip():
        pool = places.search(q, category=category, limit=10_000)
    else:
        pool = [p for p in all_places if not category or p["category"] == category]
    if origin:
        pool = sorted(pool, key=lambda p: places.distance_m(origin, p))
    # Picked across the whole category before the list is cut to `limit` (DO4).
    suggested = _suggested(pool, category, now, origin) if category and not q.strip() else None
    shown = pool[:limit]
    if suggested and all(p["id"] != suggested["id"] for p in shown):
        shown = [places.get(suggested["id"]), *shown[: limit - 1]]
    rows = [_row(p, now) for p in shown]
    if origin and shown:
        await _with_walks(rows, origin, shown)
    return {
        "places": rows,
        "categories": dict(Counter(p["category"] for p in all_places)),
        "suggested": suggested,
        "from": places.public(origin) if origin else None,
        "default_category": get_settings().campus.default_category or None,
    }


@router.get("/{place_id}")
async def get_place(
    place_id: str,
    from_: str = Query("", alias="from"),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    del current_user
    place = places.get(place_id)
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Place not found.")
    origin = _origin(from_) if from_ else None
    row = _row(place, _now())
    if origin:
        await _with_walks([row], origin, [place])
    row["aliases"] = place["aliases"]
    row["map_url"] = places.public(place)["map_url"]
    # OSM details and the photo credit, only those the place has.
    row.update({k: place[k] for k in places.DETAIL_FIELDS if k in place})
    return {"place": row}
