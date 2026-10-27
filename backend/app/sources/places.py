"""Campus places from the school pack's ``places.geojson``.

The file is written by ``scripts/import_places.py`` (OpenStreetMap). It is
loaded once and validated; a malformed file disables place lookups with a
clear error instead of failing requests one by one. Distances are straight
lines, so walking times are estimates.
"""

from __future__ import annotations

import difflib
import json
import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import SCHOOLS_DIR, get_settings

logger = logging.getLogger(__name__)

WALK_METERS_PER_MINUTE = 80  # about 4.8 km/h
CATEGORIES = ("academic", "library", "dining", "health", "housing", "recreation", "arts", "transit", "other")

_loaded: Dict[str, Tuple[List[Dict[str, Any]], Optional[str]]] = {}


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).strip()


def places_path() -> Optional[Path]:
    settings = get_settings()
    if not settings.campus.places_file or not settings.school.slug:
        return None
    return SCHOOLS_DIR / settings.school.slug / settings.campus.places_file


def _validate(data: Any) -> List[Dict[str, Any]]:
    if not isinstance(data, dict) or data.get("type") != "FeatureCollection":
        raise ValueError("not a GeoJSON FeatureCollection")
    places = []
    for index, feature in enumerate(data.get("features") or []):
        props = (feature or {}).get("properties") or {}
        coords = ((feature or {}).get("geometry") or {}).get("coordinates")
        if not props.get("name") or not isinstance(coords, list) or len(coords) != 2:
            raise ValueError(f"feature {index} needs properties.name and Point coordinates")
        lon, lat = float(coords[0]), float(coords[1])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError(f"feature {index} has out-of-range coordinates")
        names = [props["name"], *(props.get("aliases") or [])]
        places.append({
            "name": props["name"],
            "aliases": list(props.get("aliases") or []),
            "category": props.get("category") if props.get("category") in CATEGORIES else "other",
            "hours": props.get("hours"),
            "lat": lat,
            "lon": lon,
            "_keys": [_normalize(n) for n in names],
        })
    if not places:
        raise ValueError("no places")
    return places


def load_places() -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Return (places, error). ``error`` explains why lookups are unavailable."""
    path = places_path()
    if path is None:
        return [], "No campus map data is configured for this school."
    key = str(path)
    if key not in _loaded:
        try:
            _loaded[key] = (_validate(json.loads(path.read_text())), None)
        except FileNotFoundError:
            _loaded[key] = ([], "Campus map data has not been imported for this school yet.")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            logger.error("Invalid places file %s: %s; campus lookups disabled", path, exc)
            _loaded[key] = ([], "Campus map data for this school is invalid, so place lookups are off.")
    return _loaded[key]


def _score(place: Dict[str, Any], query: str) -> float:
    best = 0.0
    words = set(query.split())
    for key in place["_keys"]:
        if key == query:
            return 1.0
        if key.startswith(query) or query in key.split():
            best = max(best, 0.9)
        elif words and words <= set(key.split()):
            best = max(best, 0.85)
        else:
            best = max(best, difflib.SequenceMatcher(None, query, key).ratio() * 0.8)
    return best


def search(query: str, *, category: str = "", limit: int = 5) -> List[Dict[str, Any]]:
    places, _ = load_places()
    pool = [p for p in places if not category or p["category"] == category]
    q = _normalize(query)
    if not q:
        return pool[:limit]
    scored = sorted(((_score(p, q), p) for p in pool), key=lambda item: -item[0])
    return [p for score, p in scored if score >= 0.6][:limit]


def distance_m(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def public(place: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in place.items() if not k.startswith("_")}
    out["map_url"] = f"https://www.openstreetmap.org/?mlat={place['lat']:.6f}&mlon={place['lon']:.6f}#map=18/{place['lat']:.6f}/{place['lon']:.6f}"
    return out
