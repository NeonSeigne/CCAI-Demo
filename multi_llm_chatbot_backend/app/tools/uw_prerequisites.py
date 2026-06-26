"""
uw_prerequisites tool — prerequisite requirements for a UW-Madison course,
read from the committed SQLite snapshot (``scripts/scrape_uw_courses.py``).

Returns the raw requisite text plus the resolved set of linked prerequisite
courses (with their titles). Exposes TOOL_DEFINITION and an async execute().
"""

import asyncio
import logging
from typing import Any, Dict, List

from app.tools._uw_db import get_db_path, normalize_identifier, query

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_prerequisites"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Get the prerequisites for a University of Wisconsin-Madison "
            "course. Returns the official requisite text plus the list of "
            "linked prerequisite courses (identifier and title)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "course_identifier": {
                    "type": "string",
                    "description": (
                        "Course identifier, e.g. 'COMP SCI 300' or 'MATH 240'."
                    ),
                },
            },
            "required": ["course_identifier"],
        },
    },
}


def _run(db_path, identifier: str) -> Dict[str, Any]:
    token = identifier.replace(" ", "").upper()
    course_rows = query(
        db_path,
        "SELECT identifier, title, prereq_text FROM courses "
        "WHERE UPPER(REPLACE(identifier, ' ', '')) LIKE ? LIMIT 1",
        [f"%{token}%"],
    )
    if not course_rows:
        return {}

    course = course_rows[0]
    prereqs = query(
        db_path,
        "SELECT cp.prereq_identifier AS identifier, c.title AS title "
        "FROM course_prerequisites cp "
        "LEFT JOIN courses c ON c.identifier = cp.prereq_identifier "
        "WHERE cp.course_identifier = ? "
        "ORDER BY cp.prereq_identifier",
        [course["identifier"]],
    )
    course["prerequisites"] = prereqs
    return course


async def execute(
    *,
    name: str = "",
    course_identifier: str,
) -> Dict[str, Any]:
    """Return prerequisite text + linked prerequisite courses for a course."""
    db_path = get_db_path(TOOL_NAME)
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier}

    try:
        course = await asyncio.to_thread(_run, db_path, identifier)
    except FileNotFoundError as exc:
        logger.error("uw_prerequisites: %s", exc)
        return {"course": None, "error": str(exc), "query": query_meta}
    except Exception as exc:
        logger.error("uw_prerequisites query failed: %s", exc)
        return {"course": None, "error": str(exc), "query": query_meta}

    if not course:
        return {
            "course": None,
            "error": f"No course found for '{identifier}'.",
            "query": query_meta,
        }

    prereqs: List[Dict[str, Any]] = course.get("prerequisites", [])
    return {
        "course_identifier": course["identifier"],
        "title": course.get("title", ""),
        "prereq_text": course.get("prereq_text", "") or "",
        "prerequisites": prereqs,
        "has_prerequisites": bool((course.get("prereq_text") or "").strip() or prereqs),
        "query": query_meta,
    }
