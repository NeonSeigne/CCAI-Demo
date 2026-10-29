"""Events page endpoints (no LLM involved).

``GET /api/events`` lists every event in a window (the chat tool caps at 15,
so this calls ``ical_events.events_between`` directly). Each event's venue
text is matched to a campus place with the chat's name/alias match; with
``from``, matched venues get walking minutes from at most one OSRM table call
(cached pairs cover the rest). Unmatched or online venues get no walking time, and a failed table
call leaves ``walk_minutes`` out.

``GET /api/events/{id}`` looks one event up again within its start day (Saved).
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import get_settings
from app.core.auth import get_current_active_user
from app.models.user import User
from app.sources import ical_events, places, routing

router = APIRouter(prefix="/events", tags=["events"])

# kind, host and cost are always sent, null when the feed doesn't say.
EVENT_FIELDS = (
    "id", "title", "start", "end", "all_day", "location", "url", "description", "calendar", "ongoing",
    "kind", "host", "cost",
)
# Sent only when the feed has them (UVA: image, details; CU: geo).
OPTIONAL_FIELDS = ("image_url", "categories", "geo", "details")


def _sources() -> List[str]:
    return [f.name or f.url for f in get_settings().student_life.event_feeds]


def _origin(place_id: str) -> Dict[str, Any]:
    origin = places.get(place_id)
    if origin is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown place id '{place_id}'.")
    return origin


def _matches(text: str, words: List[str]) -> bool:
    return all(w in text for w in words)


async def _walk_minutes(origin: Dict[str, Any], targets: List[Dict[str, Any]]) -> Dict[str, int]:
    # One table call per request (FOSSGIS rate-limits bursts); venues past the
    # first 25 uncached ones get times once their pairs are cached.
    rows = await asyncio.to_thread(routing.walking_table, origin, targets)
    return {pid: row["minutes"] for pid, row in rows.items()}


async def _decorate(events: List[Dict[str, Any]], origin: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Public fields (optional ones only when present) plus ``place_id``
    (matched venue), ``place_name`` (that place's name, ``None`` when the
    venue matches no place) and ``walk_minutes``."""
    venue_cache: Dict[str, Optional[Dict[str, Any]]] = {}
    out = []
    for event in events:
        location = event.get("location") or ""
        if location not in venue_cache:
            venue_cache[location] = places.match_venue(location)
        item = {k: event.get(k) for k in EVENT_FIELDS}
        item.update({k: event[k] for k in OPTIONAL_FIELDS if event.get(k)})
        item["_place"] = venue_cache[location]
        item["place_name"] = item["_place"]["name"] if item["_place"] else None
        if item["_place"]:
            item["place_id"] = item["_place"]["id"]
        out.append(item)
    if origin:
        targets = list({p["id"]: p for p in venue_cache.values() if p}.values())
        minutes = await _walk_minutes(origin, targets) if targets else {}
        for item in out:
            if item.get("place_id") in minutes:
                item["walk_minutes"] = minutes[item["place_id"]]
    for item in out:
        item.pop("_place")
    return out


@router.get("")
async def list_events(
    window: str = Query("today"),
    q: str = Query(""),
    from_: str = Query("", alias="from"),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Events overlapping *window*, optionally filtered by words in *q*."""
    del current_user
    if window not in ical_events.WINDOWS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"window must be one of {', '.join(ical_events.WINDOWS)}.",
        )
    origin = _origin(from_) if from_ else None
    settings = get_settings()
    body: Dict[str, Any] = {
        "events": [],
        "window": window,
        "timezone": settings.school.timezone,
        "listed_through": None,
        "source": _sources(),
    }
    if not settings.student_life.event_feeds:
        body["error"] = "No event calendars are configured for this school."
        return body

    now = datetime.now(ical_events.school_zone())
    start, end = ical_events.window_bounds(window, now)
    events, errors = await ical_events.events_between(start, end)
    if errors and not events:
        body["error"] = "Couldn't load events from " + "; ".join(errors)
        return body
    if errors:
        body["error"] = "Some calendars couldn't be read: " + "; ".join(errors)
    words = q.lower().split()
    if words:
        events = [e for e in events if _matches(f"{e['title']} {e['description']} {e['location']}".lower(), words)]
    body["events"] = await _decorate(events, origin)
    body["listed_through"] = await ical_events.listed_through()
    return body


@router.get("/{event_id:path}")
async def get_event(
    event_id: str,
    from_: str = Query("", alias="from"),
    current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """One event by id, looked up within its start day; 404 once it is gone."""
    del current_user
    try:
        day = date.fromisoformat(event_id.split(":", 1)[0])
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    origin = _origin(from_) if from_ else None
    tz = ical_events.school_zone()
    start = datetime.combine(day, dtime(0), tzinfo=tz)
    events, errors = await ical_events.events_between(start, start + timedelta(days=1))
    match = [e for e in events if e["id"] == event_id]
    if not match:
        if errors and not events:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Couldn't check the event calendars.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found.")
    # Within its own start day an event is never "ongoing".
    event = (await _decorate(match[:1], origin))[0]
    event["ongoing"] = False
    return {"event": event, "timezone": get_settings().school.timezone}
