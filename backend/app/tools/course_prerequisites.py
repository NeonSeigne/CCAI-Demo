"""
course_prerequisites tool — prerequisite requirements.
"""

import logging
from typing import Any, Dict

from app.sources import academics

logger = logging.getLogger(__name__)

TOOL_NAME = "course_prerequisites"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Get the prerequisites for a course at this school. Returns the official requisite text plus the list of "
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
    return await academics.get_provider().prerequisites(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
    )
