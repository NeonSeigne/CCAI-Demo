"""
events_search tool — campus events from the school's public calendars.
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional

from app.config import get_settings
from app.sources import ical_events, places

logger = logging.getLogger(__name__)

TOOL_NAME = "events_search"

# The model gets the short form: the Events page has the full description and
# the image / categories / geo / details fields.
CHAT_DESCRIPTION_CHARS = 400
_PAGE_ONLY_FIELDS = ("image_url", "categories", "geo", "details")


def _for_chat(event: Dict[str, Any], venues: Dict[str, Optional[Dict[str, Any]]]) -> Dict[str, Any]:
    item = {k: v for k, v in event.items() if k not in _PAGE_ONLY_FIELDS}
    item["description"] = " ".join((event.get("description") or "").split())[:CHAT_DESCRIPTION_CHARS]
    # The campus place the venue text names (same match as the Events page).
    location = event.get("location") or ""
    if location not in venues:
        venues[location] = places.match_venue(location)
    item["place_name"] = venues[location]["name"] if venues[location] else None
    return item

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Find campus events at this school (talks, performances, sports, "
            "exhibits, student org events, academic deadlines) from its public "
            "event calendars. Times are in the school's local timezone. Events "
            "marked ongoing started earlier and are still running (exhibits, "
            "multi-day items); mention them after events that start in the "
            "window."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "when": {
                    "type": "string",
                    "enum": list(ical_events.WINDOWS),
                    "description": "Time window, e.g. 'tonight' or 'this_weekend'. Defaults to 'today'.",
                },
                "keyword": {
                    "type": "string",
                    "description": (
                        "Optional words matched against event title, description "
                        "and location, e.g. 'concert', 'career fair', 'basketball'."
                    ),
                },
            },
            "required": [],
        },
    },
}


async def execute(*, name: str = "", when: str = "today", keyword: str = "") -> Dict[str, Any]:
    """Return events overlapping the requested window."""
    settings = get_settings()
    limit = settings.tools.get_tool_config(TOOL_NAME).get("max_results", 15)
    window = when if when in ical_events.WINDOWS else "today"
    query_meta = {"when": window, "keyword": keyword or None}

    if not settings.student_life.event_feeds:
        return {"events": [], "error": "No event calendars are configured for this school.", "query": query_meta}

    now = datetime.now(ical_events.school_zone())
    start, end = ical_events.window_bounds(window, now)
    events, errors = await ical_events.events_between(start, end)
    if errors and not events:
        return {"events": [], "error": "Event calendars are unavailable right now.", "query": query_meta}

    if keyword:
        words = [w.lower() for w in keyword.split()]
        events = [
            e for e in events
            if all(w in f"{e['title']} {e['description']} {e['location']}".lower() for w in words)
        ]

    truncated = len(events) > limit
    venues: Dict[str, Optional[Dict[str, Any]]] = {}
    return {
        "events": [_for_chat(e, venues) for e in events[:limit]],
        "total_results": len(events),
        "truncated": truncated,
        "window": {"label": window, "start": start.isoformat(), "end": end.isoformat()},
        "timezone": settings.school.timezone,
        "partial_failure": errors or None,
        "query": query_meta,
    }
