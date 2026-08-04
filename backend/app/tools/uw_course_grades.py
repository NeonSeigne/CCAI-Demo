"""
uw_course_grades tool — historical grade distributions and GPA via UW Course Map.
"""

import logging
from typing import Any, Dict

from app.tools import _uw_source

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_course_grades"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Look up historical grade distributions and the average GPA for a "
            "University of Wisconsin-Madison course (from Madgrades data via "
            "UW Course Map). Returns the cumulative distribution across all "
            "terms plus the computed average GPA. Useful for gauging course "
            "difficulty."
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


async def execute(
    *,
    name: str = "",
    course_identifier: str,
) -> Dict[str, Any]:
    """Return cumulative + per-term grade distributions for a course."""
    return await _uw_source.course_grades(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
    )
