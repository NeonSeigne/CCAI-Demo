"""
uw_course_grades tool — historical grade distributions and computed GPA for a
UW-Madison course, read from the committed SQLite snapshot
(``scripts/scrape_uw_courses.py``, Madgrades data).

Exposes TOOL_DEFINITION (OpenAI tool format) and an async execute().
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.tools._uw_db import get_db_path, normalize_identifier, query

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_course_grades"

# Standard UW-Madison 4.0 GPA weights for the letter-grade buckets we store.
_GPA_WEIGHTS = {
    "a": 4.0, "ab": 3.5, "b": 3.0, "bc": 2.5, "c": 2.0, "d": 1.0, "f": 0.0,
}

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Look up historical grade distributions and the average GPA for a "
            "University of Wisconsin-Madison course (from Madgrades data). "
            "Returns the cumulative distribution across all terms plus the "
            "computed average GPA. Useful for gauging course difficulty."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "course_identifier": {
                    "type": "string",
                    "description": (
                        "Course identifier, e.g. 'COMP SCI 300' or "
                        "'MATH 240'. Subject and number."
                    ),
                },
            },
            "required": ["course_identifier"],
        },
    },
}


def _compute_gpa(row: Dict[str, Any]) -> Optional[float]:
    weighted = 0.0
    graded = 0
    for bucket, weight in _GPA_WEIGHTS.items():
        count = row.get(bucket) or 0
        weighted += weight * count
        graded += count
    if graded == 0:
        return None
    return round(weighted / graded, 2)


def _summarize(row: Dict[str, Any]) -> Dict[str, Any]:
    distribution = {
        bucket: (row.get(bucket) or 0) for bucket in _GPA_WEIGHTS
    }
    return {
        "term_code": row.get("term_code"),
        "total": row.get("total") or 0,
        "distribution": distribution,
        "average_gpa": _compute_gpa(row),
        "instructors": row.get("instructors") or "",
    }


def _run(db_path, identifier: str) -> List[Dict[str, Any]]:
    token = identifier.replace(" ", "").upper()
    sql = (
        "SELECT * FROM grades "
        "WHERE UPPER(REPLACE(course_identifier, ' ', '')) LIKE ? "
        "ORDER BY (term_code = 'cumulative') DESC, term_code DESC"
    )
    return query(db_path, sql, [f"%{token}%"])


async def execute(
    *,
    name: str = "",
    course_identifier: str,
) -> Dict[str, Any]:
    """Return cumulative + per-term grade distributions for a course."""
    db_path = get_db_path(TOOL_NAME)
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier}

    try:
        rows = await asyncio.to_thread(_run, db_path, identifier)
    except FileNotFoundError as exc:
        logger.error("uw_course_grades: %s", exc)
        return {"grades": None, "error": str(exc), "query": query_meta}
    except Exception as exc:
        logger.error("uw_course_grades query failed: %s", exc)
        return {"grades": None, "error": str(exc), "query": query_meta}

    if not rows:
        return {
            "grades": None,
            "error": f"No grade data found for '{identifier}'.",
            "query": query_meta,
        }

    cumulative = next(
        (r for r in rows if r.get("term_code") == "cumulative"), None
    )
    per_term = [r for r in rows if r.get("term_code") != "cumulative"]

    return {
        "course_identifier": rows[0].get("course_identifier"),
        "cumulative": _summarize(cumulative) if cumulative else None,
        "terms": [_summarize(r) for r in per_term],
        "query": query_meta,
    }
