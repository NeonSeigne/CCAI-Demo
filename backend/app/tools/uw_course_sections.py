"""
uw_course_sections tool — sections / meetings / instructors via UW Course Map.
"""

import logging
from typing import Any, Dict

from app.config import get_settings
from app.tools import _uw_source

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


async def execute(
    *,
    name: str = "",
    course_identifier: str,
    term: str = "",
) -> Dict[str, Any]:
    """Return offered sections + seat availability for a course."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 25)
    return await _uw_source.course_sections(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
        term=term,
        limit=max_results,
    )
