"""Instructor ratings for one course (``/api/catalog/ratings/{id}``).

At most ``MAX_INSTRUCTORS`` instructors, the course's current ones first.
UW reads the ratings Course Map publishes with the course. UVA and CU look
each instructor up with the RateMyProfessors tool, through the disk cache
(``sources/cache.py``): the candidates RMP returns for a (school, instructor)
are kept ``TTL_DAYS`` days, and each lookup gets ``LOOKUP_TIMEOUT_S``.

A rating is used only on an unambiguous match (eng re-review N5): exactly one
candidate whose normalized full name (case- and accent-folded, middle
initials ignored) equals the instructor's, and whose department fits the
course's subject. Anything else is no rating, and since the candidates are
cached the miss is too. A failed or timed-out lookup gives no rating and is
cached as a miss for ``FAILURE_TTL_S`` (an hour), so a down RMP is not asked
again on every pop-up; no error text reaches the page.

    names ─► cached entry? ─┬► candidates (7d) ──────────────► match rule ─► rating / none
                            ├► failure marker (1h) ───────────────────────► none
                            └► no ─► RMP (2s) ─┬► ok ─► cache candidates ─┘
                                               └► fail/timeout ─► cache marker ─► none
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import unicodedata
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from app.config import get_settings
from app.sources import academics, cache

logger = logging.getLogger(__name__)

MAX_INSTRUCTORS = 4
TTL_DAYS = 7
FAILURE_TTL_S = 3600
LOOKUP_TIMEOUT_S = 2.0
RMP_SOURCE = {"name": "RateMyProfessors", "url": "https://www.ratemyprofessors.com"}
COURSEMAP_SOURCE = {"name": "UW Course Map", "url": "https://uwcourses.com"}
_PLACEHOLDER_NAMES = {"staff", "tba", "tbd", "instructor", "to be announced"}


def normalize_name(name: str) -> str:
    """``"José  Q. O'Neil"`` -> ``"jose oneil"``: accents and case folded,
    punctuation dropped, single letters (middle initials) ignored."""
    text = unicodedata.normalize("NFKD", name or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).casefold().replace("'", "").replace("’", "")
    return " ".join(t for t in re.split(r"[^a-z0-9]+", text) if len(t) > 1)


def _letters(text: str) -> str:
    return re.sub(r"[^a-z]", "", normalize_name(text))


def department_fits(subject: str, department: str) -> bool:
    """Whether an RMP department reads as the course subject: the subject
    code's letters appear in order in the department name, starting with
    its first letter (CSCI / CS / COMP SCI -> Computer Science, APPM ->
    Applied Mathematics, ECON -> Economics)."""
    code = re.sub(r"[^a-z]", "", (subject or "").casefold())
    name = _letters(department)
    if not code or not name or code[0] != name[0]:
        return False
    position = 0
    for letter in code:
        position = name.find(letter, position)
        if position < 0:
            return False
        position += 1
    return True


def match(name: str, candidates: List[Dict[str, Any]], subject: str = "") -> Optional[Dict[str, Any]]:
    """The one candidate that is unambiguously ``name`` (see module doc), or None."""
    wanted = normalize_name(name)
    if not wanted:
        return None
    same = [c for c in candidates if normalize_name(c.get("name") or "") == wanted]
    if len(same) != 1:
        return None
    found = same[0]
    if subject and not department_fits(subject, found.get("department") or ""):
        return None
    if not found.get("num_ratings") or not found.get("rating"):
        return None
    return found


def _cache_key(school_id: str, name: str) -> str:
    return f"rmp://{quote(school_id, safe='')}/{quote(normalize_name(name))}"


def _cached_candidates(key: str) -> Optional[List[Dict[str, Any]]]:
    """Cached candidates; ``[]`` for a failure marker under an hour old;
    None when there is no fresh entry."""
    entry = cache.read_entry(key)
    if not entry:
        return None
    try:
        body = json.loads(entry[0])
        age = time.time() - entry[1]
        if body.get("failed"):
            return [] if age <= FAILURE_TTL_S else None
        return list(body["candidates"]) if age <= TTL_DAYS * 86400 else None
    except (ValueError, KeyError, TypeError, AttributeError):
        return None


async def _candidates(school_id: str, name: str) -> Optional[List[Dict[str, Any]]]:
    """RMP candidates for ``name``: cached, else looked up (None on failure)."""
    from app.tools import rate_my_professor

    key = _cache_key(school_id, name)
    cached = await asyncio.to_thread(_cached_candidates, key)
    if cached is not None:
        return cached
    try:
        result = await asyncio.wait_for(rate_my_professor.execute(professor_name=name), LOOKUP_TIMEOUT_S)
    except Exception as exc:  # noqa: BLE001 — timeouts included; the rating is just omitted
        logger.info("RMP lookup for %s gave no answer: %s", name, exc or type(exc).__name__)
        result = {"error": type(exc).__name__}
    if result.get("error"):
        logger.info("RMP lookup for %s failed: %s", name, result["error"])
        await asyncio.to_thread(cache.write_entry, key, json.dumps({"failed": True}))
        return None
    candidates = result.get("professors") or []
    await asyncio.to_thread(cache.write_entry, key, json.dumps({"candidates": candidates}))
    return candidates


def _rating(name: str, found: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {
        "name": name,
        "rating": found["rating"],
        "difficulty": found.get("difficulty") or None,
        "num_ratings": found["num_ratings"],
    }
    if isinstance(found.get("would_take_again_pct"), (int, float)) and found["would_take_again_pct"] >= 0:
        out["would_take_again_pct"] = round(found["would_take_again_pct"])
    if found.get("legacy_id"):
        out["url"] = f"{RMP_SOURCE['url']}/professor/{found['legacy_id']}"
    return out


def _usable(name: str) -> bool:
    return bool(normalize_name(name)) and name.strip().casefold() not in _PLACEHOLDER_NAMES


async def _instructor_names(identifier: str) -> tuple:
    """(canonical identifier, up to MAX_INSTRUCTORS names): the course's
    current instructors, then the ones its grade history lists."""
    summary = await academics.course_summary(identifier)
    names = [n for n in summary.get("instructors") or [] if isinstance(n, str)]
    names += [i["name"] for i in summary.get("instructor_grades") or [] if i.get("name")]
    unique: Dict[str, str] = {}
    for name in names:
        if _usable(name):
            unique.setdefault(normalize_name(name), name)
    return summary["identifier"], list(unique.values())[:MAX_INSTRUCTORS]


async def course_ratings(identifier: str) -> Dict[str, Any]:
    """``{identifier, ratings: [{name, rating, difficulty, num_ratings,
    would_take_again_pct?, url?}], source}``; instructors without a usable
    rating are left out. Raises ``FileNotFoundError`` for an unknown course."""
    if academics.catalog_backend() == "uw_coursemap":
        from app.tools import _uw_source

        course = await _uw_source.lookup_course(identifier)
        try:
            rated = await _uw_source.instructor_ratings(course["identifier"])
        except RuntimeError as exc:
            logger.info("Course Map ratings for %s unavailable: %s", identifier, exc)
            rated = []
        return {"identifier": course["identifier"], "ratings": rated[:MAX_INSTRUCTORS], "source": COURSEMAP_SOURCE}

    try:
        canonical, names = await _instructor_names(identifier)
    except RuntimeError as exc:
        logger.info("Ratings for %s: catalog unavailable: %s", identifier, exc)
        return {"identifier": identifier, "ratings": [], "source": RMP_SOURCE}
    rmp = get_settings().tools.get_tool_config("rate_my_professor")
    school_id = rmp.get("school_id") if rmp.get("enabled", True) else None
    if not school_id or not names:
        return {"identifier": canonical, "ratings": [], "source": RMP_SOURCE}
    subject = academics.parse_query(canonical)[0]
    looked_up = await asyncio.gather(*(_candidates(school_id, name) for name in names))
    ratings = []
    for name, candidates in zip(names, looked_up):
        found = match(name, candidates or [], subject)
        if found:
            ratings.append(_rating(name, found))
    return {"identifier": canonical, "ratings": ratings, "source": RMP_SOURCE}
