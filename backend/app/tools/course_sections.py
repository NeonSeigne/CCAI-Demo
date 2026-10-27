"""
course_sections tool — sections / meetings / instructors.
"""

import logging
from typing import Any, Dict

from app.config import get_settings
from app.sources import academics

logger = logging.getLogger(__name__)

TOOL_NAME = "course_sections"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "List offered sections for a course at this school, including "
            "section type, instructors, enrollment, capacity, and remaining "
            "seats. Optionally filter by term (e.g. 'Fall 2025'). If the result "
            "includes data_as_of, the counts are from that snapshot date: say so, "
            "and never present them as current availability."
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


async def execute(
    *,
    name: str = "",
    course_identifier: str,
    term: str = "",
) -> Dict[str, Any]:
    """Return offered sections + seat availability for a course."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 25)
    return await academics.get_provider().course_sections(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
        term=term,
        limit=max_results,
    )
