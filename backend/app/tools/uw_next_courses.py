"""
uw_next_courses tool — courses unlocked / post-requisites via UW Course Map.
"""

import logging
from typing import Any, Dict

from app.config import get_settings
from app.tools import _uw_source

logger = logging.getLogger(__name__)

TOOL_NAME = "uw_next_courses"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "List University of Wisconsin-Madison courses you can take next "
            "after completing a given course (post-requisites / what this "
            "course unlocks). Returns courses that list the given course in "
            "their prerequisite expression. Note: listed courses may still "
            "require additional prerequisites. Use for questions like "
            "'what should I take after ART 100?', 'what does COMP SCI 300 "
            "unlock?', or 'post-requisites for MATH 221'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "course_identifier": {
                    "type": "string",
                    "description": (
                        "Course identifier, e.g. 'ART 100' or 'COMP SCI 300'."
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
    """Return courses that list this course as a prerequisite."""
    tool_cfg = get_settings().tools.get_tool_config(TOOL_NAME)
    max_results = tool_cfg.get("max_results", 40)
    return await _uw_source.next_courses(
        tool_name=TOOL_NAME,
        course_identifier=course_identifier,
        limit=max_results,
    )
