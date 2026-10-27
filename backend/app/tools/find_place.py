"""
find_place tool — campus buildings, libraries, dining, bus stops and walking distance.
"""

import logging
from typing import Any, Dict

from app.sources import places

logger = logging.getLogger(__name__)

TOOL_NAME = "find_place"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Find a place on this school's campus (building, library, dining, "
            "health center, residence hall, recreation, bus stop) by name or "
            "nickname, or the nearest places of a category. With 'from_place', "
            "also returns the straight-line distance and an estimated walking "
            "time; say that it is an estimate. Use this to answer 'where is X' "
            "and 'how do I get to X from Y'. For an event, pass its location "
            "text as 'query'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Place name or nickname, e.g. 'Norlin', 'Memorial Union', 'JPJ'.",
                },
                "category": {
                    "type": "string",
                    "enum": list(places.CATEGORIES),
                    "description": "Optional: only places of this kind, e.g. 'dining'.",
                },
                "from_place": {
                    "type": "string",
                    "description": "Optional starting place for distance and walking time.",
                },
            },
            "required": [],
        },
    },
}


def _with_distance(origin: Dict[str, Any], place: Dict[str, Any]) -> Dict[str, Any]:
    meters = places.distance_m(origin, place)
    out = places.public(place)
    out["distance_m"] = round(meters)
    out["walk_minutes_estimate"] = max(1, round(meters / places.WALK_METERS_PER_MINUTE))
    return out


async def execute(*, name: str = "", query: str = "", category: str = "", from_place: str = "") -> Dict[str, Any]:
    """Look up campus places; optionally rank by distance from another place."""
    query_meta = {"query": query or None, "category": category or None, "from_place": from_place or None}
    _, error = places.load_places()
    if error:
        return {"places": [], "error": error, "query": query_meta}
    if category and category not in places.CATEGORIES:
        category = ""
    if not (query or category):
        return {"places": [], "error": "Provide a place name or a category.", "query": query_meta}

    origin = None
    if from_place:
        found = places.search(from_place, limit=1)
        if not found:
            return {"places": [], "error": f"Couldn't find '{from_place}' on the campus map.", "query": query_meta}
        origin = found[0]

    if query:
        matches = places.search(query, category=category, limit=5)
        if not matches:
            return {"places": [], "error": f"Couldn't find '{query}' on the campus map.", "query": query_meta}
    elif origin:
        pool = places.search("", category=category, limit=10_000)
        matches = sorted(pool, key=lambda p: places.distance_m(origin, p))[:5]
    else:
        matches = places.search("", category=category, limit=5)

    results = [_with_distance(origin, p) if origin else places.public(p) for p in matches]
    response: Dict[str, Any] = {"places": results, "query": query_meta}
    if origin:
        response["from"] = places.public(origin)
        response["note"] = "Distances are straight lines; walking times are estimates."
    return response
