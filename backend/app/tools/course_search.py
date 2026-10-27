"""
course_search tool — search the school's course catalog.
"""

import logging
from typing import Any, Dict

from app.config import get_settings
from app.sources import academics

logger = logging.getLogger(__name__)

TOOL_NAME = "course_search"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Search this school's course catalog. "
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


async def execute(
    *,
    name: str = "",
    subject: str = "",
    course_number: str = "",
    keyword: str = "",
) -> Dict[str, Any]:
    """Query the school's course catalog. Returns {"courses": [...]}."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 20)

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
        rows = await academics.get_provider().search_courses(
            tool_name=TOOL_NAME,
            subject=subject,
            course_number=course_number,
            keyword=keyword,
            limit=max_results + 1,
        )
    except Exception as exc:
        logger.error("course_search query failed: %s", exc)
        return {"courses": [], "error": str(exc), "query": query_meta}

    truncated = len(rows) > max_results
    rows = rows[:max_results]

    return {
        "courses": rows,
        "total_results": len(rows),
        "truncated": truncated,
        "query": query_meta,
    }
