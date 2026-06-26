"""
uw_course_sections tool — offered sections, instructors, and seat availability
for a UW-Madison course, read from the committed SQLite snapshot
(``scripts/scrape_uw_courses.py``, UW Public Enroll data).

Exposes TOOL_DEFINITION and an async execute().
"""

import asyncio
import logging
from typing import Any, Dict, List

from app.config import get_settings
from app.tools._uw_db import get_db_path, normalize_identifier, query

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_course_sections"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "List offered sections for a University of Wisconsin-Madison "
            "course, including section type, instructors, current enrollment, "
            "capacity, and remaining seats. Optionally filter by term "
            "(e.g. 'Fall 2025'). Useful for checking availability."
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
                "term": {
                    "type": "string",
                    "description": (
                        "Optional term to filter on, e.g. 'Fall 2025'. "
                        "Omit to return sections across all stored terms."
                    ),
                },
            },
            "required": ["course_identifier"],
        },
    },
}


def _to_section(row: Dict[str, Any]) -> Dict[str, Any]:
    enrolled = row.get("current_enrolled") or 0
    capacity = row.get("capacity") or 0
    return {
        "term": row.get("term_description") or row.get("term_code"),
        "section": row.get("section"),
        "type": row.get("type"),
        "instructors": row.get("instructors") or "",
        "current_enrolled": enrolled,
        "capacity": capacity,
        "seats_available": max(capacity - enrolled, 0),
        "is_open": capacity > enrolled,
    }


def _run(db_path, identifier: str, term: str, limit: int) -> List[Dict[str, Any]]:
    token = identifier.replace(" ", "").upper()
    clauses = ["UPPER(REPLACE(s.course_identifier, ' ', '')) LIKE ?"]
    params: List[Any] = [f"%{token}%"]

    if term:
        clauses.append("(t.description LIKE ? OR s.term_code = ?)")
        params.extend([f"%{term}%", term.strip()])

    sql = (
        "SELECT s.course_identifier, s.term_code, s.section, s.type, "
        "s.instructors, s.current_enrolled, s.capacity, "
        "t.description AS term_description "
        "FROM sections s "
        "LEFT JOIN terms t ON CAST(s.term_code AS INTEGER) = t.term_code "
        f"WHERE {' AND '.join(clauses)} "
        "ORDER BY CAST(s.term_code AS INTEGER) DESC, s.section "
        "LIMIT ?"
    )
    params.append(limit)
    return query(db_path, sql, params)


async def execute(
    *,
    name: str = "",
    course_identifier: str,
    term: str = "",
) -> Dict[str, Any]:
    """Return offered sections + seat availability for a course."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 25)
    db_path = get_db_path(TOOL_NAME)

    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier, "term": term or None}

    try:
        rows = await asyncio.to_thread(
            _run, db_path, identifier, term, max_results + 1
        )
    except FileNotFoundError as exc:
        logger.error("uw_course_sections: %s", exc)
        return {"sections": [], "error": str(exc), "query": query_meta}
    except Exception as exc:
        logger.error("uw_course_sections query failed: %s", exc)
        return {"sections": [], "error": str(exc), "query": query_meta}

    if not rows:
        return {
            "sections": [],
            "error": f"No sections found for '{identifier}'.",
            "query": query_meta,
        }

    truncated = len(rows) > max_results
    rows = rows[:max_results]

    return {
        "course_identifier": rows[0].get("course_identifier"),
        "sections": [_to_section(r) for r in rows],
        "total_results": len(rows),
        "truncated": truncated,
        "query": query_meta,
    }
