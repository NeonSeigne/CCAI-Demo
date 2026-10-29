"""Course catalog endpoints for the Courses page and Compare (no LLM involved).

Own prefix (``/api/catalog``) (R1); the course pop-up and the chat course
cards read the summary route (eng R6). Search
and summaries come from ``app.sources.academics``, the same code the chat
course tools use (R12). Every response carries ``capabilities`` and
``source`` so the page can say "Not available for <school> (<source>)" (R3).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_active_user
from app.models.user import User
from app.sources import academics
from app.sources import ratings as ratings_source

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/catalog", tags=["catalog"])

MAX_LIMIT = 50
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 /&_-]{1,80}$")
# Search row fields the page reads; the rest stay with the chat tool.
_ROW_FIELDS = ("identifier", "title", "description", "level")


def _unavailable(exc: Exception) -> HTTPException:
    logger.warning("catalog source failed: %s", exc)
    source = academics.catalog_source()["name"]
    return HTTPException(status_code=502, detail=f"Couldn't load courses from {source} right now")


def _page_row(row: Dict[str, Any]) -> Dict[str, Any]:
    out = {key: row.get(key) for key in _ROW_FIELDS}
    if "average_gpa" in row:
        out["gpa"] = row["average_gpa"]
    if "seats_open_at_snapshot" in row:
        out["seats_open"] = row["seats_open_at_snapshot"]
    if "sections" in row:
        out["sections"] = row["sections"]
    return out


def _search_response(result: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "courses": [_page_row(row) for row in result["courses"]],
        "truncated": result["truncated"],
        "capabilities": result["capabilities"],
        "source": result["source"],
        "as_of": result["as_of"],
    }


@router.get("/search")
async def search(
    q: str = Query(default="", max_length=120),
    level: Optional[int] = Query(default=None, ge=0, le=9000),
    open_only: bool = False,
    limit: int = Query(default=20, ge=1, le=MAX_LIMIT),
    _current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    try:
        result = await academics.search_catalog(q, level, open_only, limit)
    except academics.CatalogQueryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise _unavailable(exc) from exc
    return _search_response(result)


@router.get("/starters")
async def starters(_current_user: User = Depends(get_current_active_user)) -> Dict[str, Any]:
    """Courses named in the school's academics home-page starters (R6)."""
    found: Dict[str, Dict[str, Any]] = {}
    for code in academics.starter_codes():
        try:
            result = await academics.search_catalog(code, limit=1)
        except academics.CatalogQueryError:
            continue
        except RuntimeError as exc:
            raise _unavailable(exc) from exc
        for row in result["courses"]:
            found.setdefault(row["identifier"], _page_row(row))
    return {
        "courses": list(found.values()),
        "capabilities": academics.catalog_capabilities(),
        "source": academics.catalog_source(),
    }


def _identifier(course_identifier: str) -> str:
    identifier = " ".join(course_identifier.replace("_", " ").split())
    if not _IDENTIFIER_RE.fullmatch(identifier):
        raise HTTPException(status_code=400, detail="Invalid course identifier")
    return identifier


# Declared before the summary's ``{course_identifier:path}`` catch-all, which
# would otherwise read "ratings/CS 2100" as a course (eng re-review N1).
@router.get("/ratings/{course_identifier:path}")
async def ratings(
    course_identifier: str,
    term: Optional[str] = Query(default=None, max_length=40, pattern=r"^[A-Za-z]+ \d{4}$"),
    _current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """Ratings for up to 4 of the course's instructors; an instructor with no
    usable rating is left out, and a failed lookup is never an error.
    ``instructor_rating`` is the mean for the instructors of ``term``'s
    sections (the plan's term; default the next term), or null (design Q15)."""
    identifier = _identifier(course_identifier)
    try:
        return await ratings_source.course_ratings(identifier, term=term)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Course not found") from exc
    except RuntimeError as exc:
        logger.info("ratings source failed: %s", exc)
        return {"identifier": identifier, "ratings": [], "source": None, "instructor_rating": None}


@router.get("/{course_identifier:path}")
async def summary(
    course_identifier: str,
    _current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    identifier = _identifier(course_identifier)
    try:
        return await academics.course_summary(identifier)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Course not found") from exc
    except RuntimeError as exc:
        raise _unavailable(exc) from exc
