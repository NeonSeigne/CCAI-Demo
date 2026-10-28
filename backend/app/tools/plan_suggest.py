"""
plan_suggest tool — a shortlist of courses for the student's next term.

Candidates come from the school's catalog and are checked against the
signed-in student's plan (``planner.suggest``); each item's labels are the
checker's words. Items carry stable option ids ("option-1" ...) so a later
"use the second one" maps to a course (R15).
"""

import logging
from typing import Any, Dict

from app.planner import service

logger = logging.getLogger(__name__)

TOOL_NAME = "plan_suggest"

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Suggest courses for the student's next term from what they say "
            "they're interested in. Returns up to 5 real catalog courses, "
            "each checked against their plan, with option ids (option-1, "
            "option-2 ...) and labels saying what each fills. Use for 'what "
            "should I take', 'something about climate', 'I need one more "
            "class'."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "q": {
                    "type": "string",
                    "description": (
                        "The student's interests in a few words, e.g. "
                        "'climate policy'. Leave empty to use the interests "
                        "saved in their plan."
                    ),
                },
            },
            "required": [],
        },
    },
}


def option_id(index: int) -> str:
    return f"option-{index}"


async def execute(*, name: str = "", context=None, q: str = "", **_: Any) -> Dict[str, Any]:
    if context is None or not getattr(context, "user_id", None) or not getattr(context, "school", None):
        return {"error": "The plan tool needs a signed-in student.", "code": "no_context"}
    found = await service.suggestions(str(context.user_id), context.school, q or "")
    items = [
        dict(item, option_id=option_id(i))
        for i, item in enumerate(found.get("items") or [], start=1)
    ]
    return {"query": q or "", "items": items, "reason": found.get("reason")}
