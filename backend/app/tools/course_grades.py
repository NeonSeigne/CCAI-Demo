"""
course_grades tool — historical grade distributions and GPA.
"""

import logging
from typing import Any, Dict

from app.sources import academics

logger = logging.getLogger(__name__)

TOOL_NAME = "course_grades"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Look up historical grade distributions and the average GPA for a "
            "course at this school. Returns the cumulative distribution across "
            "all terms plus the computed average GPA. Useful for gauging course "
            "difficulty. Snapshot results include data_as_of: say how old the "
            "data is."
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
    return await academics.get_provider().course_grades(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
    )
