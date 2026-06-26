"""
uw_search_courses tool — search the UW-Madison course catalog from the
committed SQLite snapshot produced by ``scripts/scrape_uw_courses.py``.

Exposes TOOL_DEFINITION (OpenAI tool format) and an async execute() that the
tool-calling loop dispatches to. This is the UW-Madison counterpart to the
CU-Boulder-only ``search_courses`` tool; enable one or the other per school.
"""

import asyncio
import logging
from typing import Any, Dict, List

from app.config import get_settings
from app.tools._uw_db import get_db_path, query

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_search_courses"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Search the University of Wisconsin-Madison course catalog. "
            "Filter by subject (e.g. 'COMP SCI', 'MATH'), catalog number, "
            "and/or a free-text keyword matched against course titles and "
            "descriptions. Returns matching courses with identifier, title, "
            "description, and prerequisite text."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": (
                        "Department / subject, e.g. 'COMP SCI', 'MATH', "
                        "'PHYSICS'. Spaces are optional."
                    ),
                },
                "course_number": {
                    "type": "string",
                    "description": "Catalog number to filter on, e.g. '300'.",
                },
                "keyword": {
                    "type": "string",
                    "description": (
                        "Free-text term matched against course titles and "
                        "descriptions, e.g. 'machine learning'."
                    ),
                },
            },
            "required": [],
        },
    },
}


def _run(db_path, subject: str, course_number: str, keyword: str, limit: int) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    params: List[Any] = []

    if subject:
        token = subject.replace(" ", "").upper()
        clauses.append("UPPER(REPLACE(subjects, ' ', '')) LIKE ?")
        params.append(f"%{token}%")

    if course_number:
        clauses.append("number = ?")
        params.append(course_number.strip())

    if keyword:
        clauses.append("(title LIKE ? OR description LIKE ?)")
        params.extend([f"%{keyword}%", f"%{keyword}%"])

    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    sql = (
        "SELECT identifier, subjects, number, title, description, prereq_text "
        f"FROM courses {where} ORDER BY number LIMIT ?"
    )
    params.append(limit)
    return query(db_path, sql, params)


async def execute(
    *,
    name: str = "",
    subject: str = "",
    course_number: str = "",
    keyword: str = "",
) -> Dict[str, Any]:
    """Query the UW course catalog snapshot. Returns {"courses": [...]}."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 20)
    db_path = get_db_path(TOOL_NAME)

    query_meta = {
        "subject": subject or None,
        "course_number": course_number or None,
        "keyword": keyword or None,
    }

    if not (subject or course_number or keyword):
        return {
            "courses": [],
            "error": "Provide at least one of: subject, course_number, keyword.",
            "query": query_meta,
        }

    try:
        rows = await asyncio.to_thread(
            _run, db_path, subject, course_number, keyword, max_results + 1
        )
    except FileNotFoundError as exc:
        logger.error("uw_search_courses: %s", exc)
        return {"courses": [], "error": str(exc), "query": query_meta}
    except Exception as exc:
        logger.error("uw_search_courses query failed: %s", exc)
        return {"courses": [], "error": str(exc), "query": query_meta}

    truncated = len(rows) > max_results
    rows = rows[:max_results]

    return {
        "courses": rows,
        "total_results": len(rows),
        "truncated": truncated,
        "query": query_meta,
    }
