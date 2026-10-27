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
CATEGORIES = ("academic", "library", "dining", "health", "housing", "recreation", "arts", "landmark", "transit", "other")

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


# Words that say nothing about which place is meant: "the Rotunda", "CS building".
FILLER_WORDS = {"the", "a", "of", "and", "at", "building", "bldg"}
MIN_WORD_RATIO = 0.75
DUPLICATE_WITHIN_M = 150


def _significant(text: str) -> List[str]:
    words = text.split()
    kept = [w for w in words if w not in FILLER_WORDS]
    return kept or words


def _word_ratio(query_word: str, key_word: str) -> float:
    if query_word == key_word:
        return 1.0
    if len(query_word) >= 3 and key_word.startswith(query_word):
        return 0.95
    if min(len(query_word), len(key_word)) < 4:
        return 0.0
    return difflib.SequenceMatcher(None, query_word, key_word).ratio()


def _score(place: Dict[str, Any], query: str) -> float:
    """Score 0..1. Every meaningful query word must match a word of the name
    (typos allowed), so "CS building" no longer matches "Soils Building"."""
    query_words = _significant(query)
    best = 0.0
    for key in place["_keys"]:
        if key == query or _significant(key) == query_words:
            return 1.0
        if key.startswith(query):
            best = max(best, 0.95)
            continue
        key_words = _significant(key)
        ratios = [max((_word_ratio(q, k) for k in key_words), default=0.0) for q in query_words]
        if ratios and min(ratios) >= MIN_WORD_RATIO:
            extra = max(0, len(key_words) - len(query_words))
            best = max(best, 0.9 * sum(ratios) / len(ratios) - 0.02 * min(extra, 5))
        else:
            whole = difflib.SequenceMatcher(None, " ".join(query_words), " ".join(key_words)).ratio()
            best = max(best, whole * 0.8)
    return best


def _same_place(a: Dict[str, Any], b: Dict[str, Any]) -> bool:
    """OSM often maps one landmark twice ("Rotunda" and "The Rotunda")."""
    return _significant(a["_keys"][0]) == _significant(b["_keys"][0]) and distance_m(a, b) <= DUPLICATE_WITHIN_M


def search(query: str, *, category: str = "", limit: int = 5) -> List[Dict[str, Any]]:
    places, _ = load_places()
    pool = [p for p in places if not category or p["category"] == category]
    q = _normalize(query)
    if not q:
        return pool[:limit]
    scored = sorted(((_score(p, q), p) for p in pool), key=lambda item: -item[0])
    results: List[Dict[str, Any]] = []
    for score, place in scored:
        if score < 0.6 or len(results) >= limit:
            break
        if not any(_same_place(place, kept) for kept in results):
            results.append(place)
    return results


def distance_m(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def public(place: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in place.items() if not k.startswith("_")}
    out["map_url"] = f"https://www.openstreetmap.org/?mlat={place['lat']:.6f}&mlon={place['lon']:.6f}#map=18/{place['lat']:.6f}/{place['lon']:.6f}"
    return out
