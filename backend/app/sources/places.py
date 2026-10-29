"""Campus places from the school pack's ``places.geojson``.

The file is written by ``scripts/import_places.py`` (OpenStreetMap). It is
loaded once and validated; a malformed file disables place lookups with a
clear error instead of failing requests one by one. Distances are straight
lines, so walking times are estimates (``sources/routing.py`` has real ones).

Each place gets a stable ``id``: the slug of its name, with ``-2``, ``-3``
added in file order when names collide. Opening hours are parsed once here
(``sources/hours.py``). The OSM ``type/id`` and the import's detail fields
(``DETAIL_FIELDS``: website, phone, photo with its credit, ...) are kept when
present and well formed; a missing or malformed one is left out.
"""

from __future__ import annotations

import difflib
import json
import logging
import math
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.config import SCHOOLS_DIR, get_settings
from app.sources import hours as hours_parser

logger = logging.getLogger(__name__)

WALK_METERS_PER_MINUTE = 80  # about 4.8 km/h
CATEGORIES = ("academic", "library", "dining", "health", "housing", "recreation", "arts", "landmark", "transit", "other")

_loaded: Dict[str, Tuple[List[Dict[str, Any]], Optional[str]]] = {}

DETAIL_FIELDS = (
    "osm", "website", "phone", "wheelchair", "cuisine", "building_levels", "address",
    "operator", "description", "wikidata", "wikipedia", "photo",
)
_TEXT_FIELDS = ("phone", "wheelchair", "address", "operator", "description", "wikidata")
_URL_FIELDS = ("website", "wikipedia")
_OSM_RE = re.compile(r"^(node|way|relation)/\d+$")


def _web_url(value: Any) -> Optional[str]:
    url = value.strip() if isinstance(value, str) else ""
    return url if re.match(r"^https?://[^\s/]+", url) and not re.search(r"\s", url) else None


def _photo(value: Any) -> Optional[Dict[str, str]]:
    """``{url, license, author?, page?}``; a photo without a licence is dropped."""
    if not isinstance(value, dict):
        return None
    url, license_name = _web_url(value.get("url")), value.get("license")
    if not url or not isinstance(license_name, str) or not license_name.strip():
        return None
    photo = {"url": url, "license": license_name.strip()}
    if isinstance(value.get("author"), str) and value["author"].strip():
        photo["author"] = value["author"].strip()
    if _web_url(value.get("page")):
        photo["page"] = value["page"].strip()
    return photo


def _details(props: Dict[str, Any]) -> Dict[str, Any]:
    """The detail fields of one feature that are present and well formed."""
    out: Dict[str, Any] = {}
    if isinstance(props.get("osm"), str) and _OSM_RE.match(props["osm"]):
        out["osm"] = props["osm"]
    for key in _TEXT_FIELDS:
        if isinstance(props.get(key), str) and props[key].strip():
            out[key] = props[key].strip()
    for key in _URL_FIELDS:
        url = _web_url(props.get(key))
        if url:
            out[key] = url
    cuisine = props.get("cuisine")
    if isinstance(cuisine, list) and all(isinstance(c, str) for c in cuisine) and cuisine:
        out["cuisine"] = [c for c in cuisine if c.strip()]
    levels = props.get("building_levels")
    if isinstance(levels, int) and not isinstance(levels, bool) and levels > 0:
        out["building_levels"] = levels
    photo = _photo(props.get("photo"))
    if photo:
        out["photo"] = photo
    return out


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", (text or "").lower()).strip()


def places_path() -> Optional[Path]:
    settings = get_settings()
    if not settings.campus.places_file or not settings.school.slug:
        return None
    return SCHOOLS_DIR / settings.school.slug / settings.campus.places_file


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (text or "").lower()).strip("-") or "place"


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
            "id": "",
            "name": props["name"],
            "aliases": list(props.get("aliases") or []),
            "category": props.get("category") if props.get("category") in CATEGORIES else "other",
            "hours": props.get("hours"),
            "lat": lat,
            "lon": lon,
            **_details(props),
            "_keys": [_normalize(n) for n in names],
            "_hours": hours_parser.parse(props.get("hours")),
        })
    if not places:
        raise ValueError("no places")
    seen = set()
    for place in places:
        base = place_id = slugify(place["name"])
        suffix = 2
        while place_id in seen:
            place_id, suffix = f"{base}-{suffix}", suffix + 1
        seen.add(place_id)
        place["id"] = place_id
    return places


def read_file(path: Path) -> List[Dict[str, Any]]:
    """Read and validate a places file (raises on a missing or bad file)."""
    return _validate(json.loads(Path(path).read_text()))


def find_in(pool: List[Dict[str, Any]], name_or_id: str) -> Optional[Dict[str, Any]]:
    """The place whose id or exact name (case-insensitive) is *name_or_id*."""
    wanted = (name_or_id or "").strip()
    for place in pool:
        if place["id"] == wanted:
            return place
    for place in pool:
        if place["name"].lower() == wanted.lower():
            return place
    return None


def get(place_id: str) -> Optional[Dict[str, Any]]:
    """The place with this id, or ``None``."""
    pool, _ = load_places()
    return next((p for p in pool if p["id"] == place_id), None)


def default_origin() -> Optional[Dict[str, Any]]:
    """The school pack's ``campus.default_origin`` place (validated at startup)."""
    name = get_settings().campus.default_origin
    return find_in(load_places()[0], name) if name else None


def load_places() -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Return (places, error). ``error`` explains why lookups are unavailable."""
    path = places_path()
    if path is None:
        return [], "No campus map data is configured for this school."
    key = str(path)
    if key not in _loaded:
        try:
            _loaded[key] = (read_file(path), None)
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


# Venue text that is not a place on the map.
_NOT_A_PLACE = re.compile(r"\b(online|virtual|zoom|webinar|teams|livestream|tba|tbd)\b", re.I)


def match_venue(location: str) -> Optional[Dict[str, Any]]:
    """The campus place an event's free-text venue names, if one matches.

    Same name/alias match the chat uses for events -> campus: the whole text
    first, then each comma part ("Norlin Library, E206" -> "Norlin Library"),
    with parenthesised nicknames tried too ("University Memorial Center (UMC)").
    Online or unnamed venues match nothing, so they get no walking time.
    """
    text = (location or "").strip()
    # "Wisconsin Energy Institute (Also offered online)" is still a room on
    # campus; only venues that are online once the asides are dropped are not.
    if not text or _NOT_A_PLACE.search(re.sub(r"\([^)]*\)", "", text)):
        return None
    candidates: List[str] = []
    for part in [text, *text.split(",")]:
        part = part.strip()
        bare = re.sub(r"\s*\([^)]*\)", "", part).strip()
        for candidate in (part, bare):
            if candidate and candidate not in candidates:
                candidates.append(candidate)
    # The best match over all parts, earlier parts winning ties: in
    # '"The Well," Room 233, Union South' the building is a full match, while
    # "The Well" only half-matches a water well.
    best, best_score = None, 0.0
    for candidate in candidates:
        found = search(candidate, limit=1)
        if not found:
            continue
        score = _score(found[0], _normalize(candidate))
        if score >= 1.0:
            return found[0]
        if score > best_score:
            best, best_score = found[0], score
    return best


def public(place: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: v for k, v in place.items() if not k.startswith("_")}
    out["map_url"] = f"https://www.openstreetmap.org/?mlat={place['lat']:.6f}&mlon={place['lon']:.6f}#map=18/{place['lat']:.6f}/{place['lon']:.6f}"
    return out


def hours_status(place: Dict[str, Any], now: datetime) -> Dict[str, Any]:
    """``open_now`` (True, False, or None when hours are unknown) and, while
    open and not 24/7, ``open_until`` as an ISO time in *now*'s zone."""
    is_open, until = hours_parser.status(place.get("_hours"), now)
    out: Dict[str, Any] = {"open_now": is_open}
    if until is not None:
        out["open_until"] = until.isoformat()
    return out
