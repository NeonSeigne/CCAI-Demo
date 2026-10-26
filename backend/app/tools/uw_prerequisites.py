"""
uw_prerequisites tool — prerequisite requirements via UW Course Map.
"""

import logging
from typing import Any, Dict

from app.tools import _uw_source

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


async def execute(
    *,
    name: str = "",
    course_identifier: str,
) -> Dict[str, Any]:
    """Return prerequisite text + linked prerequisite courses for a course."""
    return await _uw_source.prerequisites(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
    )
