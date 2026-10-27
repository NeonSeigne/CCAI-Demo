"""Campus endpoints for the home page (no LLM involved)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.core.auth import get_current_active_user
from app.models.user import User
from app.sources import ical_events
from app.tools import events_search

router = APIRouter(prefix="/campus", tags=["campus"])

TODAY_LIMIT = 5


@router.get("/today")
async def campus_today(current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Events still to come today, from the school's own calendars.

    Ongoing all-day exhibits are listed after timed events; past events are
    dropped. ``error`` is set when no calendar could be read.
    """
    del current_user
    result = await events_search.execute(when="today")
    now = datetime.now(ical_events.school_zone())
    upcoming = [
        e for e in result.get("events") or []
        if datetime.fromisoformat(e["end"]) > now
    ]
    upcoming.sort(key=lambda e: (e.get("ongoing") or e.get("all_day"), e["start"]))
    return {
        "events": upcoming[:TODAY_LIMIT],
        "timezone": result.get("timezone"),
        "source": [f.name or f.url for f in _feeds()],
        "error": result.get("error"),
    }


def _feeds():
    from app.config import get_settings

    return get_settings().student_life.event_feeds
