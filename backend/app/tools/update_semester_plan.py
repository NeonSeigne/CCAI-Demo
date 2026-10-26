"""
update_semester_plan tool — mutate the active Plan My Semester schedule.

Only useful when the chat request includes a semester_plan_id; the chat route
auto-injects plan_id into tool args so the model does not need to invent one.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.core.semester_planner import (
    apply_plan_patch,
    get_plan,
    public_plan,
    select_option,
)

logger = logging.getLogger(__name__)

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "update_semester_plan",
        "description": (
            "Modify the student's active semester course plan. Use this when "
            "they ask to add, drop, remove, swap, or replace courses, or to "
            "switch between plan options (On-track core, Gen-ed heavy, Explore "
            "electives). Always prefer this tool over guessing schedule changes."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "plan_id": {
                    "type": "string",
                    "description": "Active semester plan id (provided by the system).",
                },
                "action": {
                    "type": "string",
                    "enum": ["add", "remove", "replace", "select_option"],
                    "description": "Mutation to apply.",
                },
                "identifier": {
                    "type": "string",
                    "description": "Course identifier for add or remove, e.g. 'COMP SCI 300'.",
                },
                "old": {
                    "type": "string",
                    "description": "Course to replace (replace action).",
                },
                "new": {
                    "type": "string",
                    "description": "Replacement course (replace action).",
                },
                "option_id": {
                    "type": "string",
                    "description": (
                        "Plan option id for select_option, e.g. 'opt_core', "
                        "'opt_gened', 'opt_explore'."
                    ),
                },
            },
            "required": ["action"],
        },
    },
}


async def execute(
    name: str = "update_semester_plan",
    plan_id: Optional[str] = None,
    action: str = "",
    identifier: str = "",
    old: str = "",
    new: str = "",
    option_id: str = "",
    **_kwargs: Any,
) -> Dict[str, Any]:
    if not plan_id:
        return {"error": "No active semester plan. Ask the student to open Plan my Semester."}

    plan = get_plan(plan_id)
    if not plan:
        return {"error": f"Semester plan not found: {plan_id}"}

    action = (action or "").lower().strip()
    try:
        if action == "select_option":
            if not option_id:
                return {"error": "option_id required for select_option"}
            updated = select_option(plan_id, option_id)
        elif action == "remove":
            if not identifier:
                return {"error": "identifier required for remove"}
            apply_plan_patch(plan, {"remove": [identifier]})
            updated = public_plan(plan)
        elif action == "add":
            if not identifier:
                return {"error": "identifier required for add"}
            apply_plan_patch(plan, {"add": [identifier]})
            updated = public_plan(plan)
        elif action == "replace":
            if not old or not new:
                return {"error": "old and new required for replace"}
            apply_plan_patch(plan, {"replace": [{"old": old, "new": new}]})
            updated = public_plan(plan)
        else:
            return {"error": "action must be add, remove, replace, or select_option"}
    except (KeyError, ValueError) as exc:
        logger.warning("update_semester_plan failed: %s", exc)
        return {"error": str(exc)}

    selected = None
    for opt in updated.get("options") or []:
        if opt.get("id") == updated.get("selected_option_id"):
            selected = opt
            break

    course_ids = [c.get("identifier") for c in (selected or {}).get("courses") or []]
    return {
        "ok": True,
        "action": action,
        "selected_option_id": updated.get("selected_option_id"),
        "courses": course_ids,
        "total_credits": (selected or {}).get("total_credits"),
        "plan": updated,
    }
