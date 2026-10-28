"""
plan_edit tool — propose a change to the signed-in student's semester plan.

Propose only (R10): the change is stored as the plan's one pending proposal
and the student accepts or discards it from the card. Whose plan, which
school and the plan revision the model saw all come from the server-built
``ToolContext`` (R2, R9); nothing the model sends can name another student,
switch to apply, or pick a revision.
"""

import logging
from typing import Any, Dict, List, Optional

from app.planner import service, store
from app.planner.edits import EditError

logger = logging.getLogger(__name__)

TOOL_NAME = "plan_edit"

NO_CONTEXT = {
    "error": "The plan tool needs a signed-in student.",
    "code": "no_context",
}

TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": TOOL_NAME,
        "description": (
            "Propose a change to the student's semester plan: add, remove, "
            "move or swap courses, or pick sections. The change is NOT "
            "applied; it is shown to the student as a proposal with its "
            "checked consequences, and they accept or discard it. Use course "
            "identifiers from the plan summary or the shortlist (a shortlist "
            "option id such as 'option-2' also works as a course)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "ops": {
                    "type": "array",
                    "description": "The edits, applied in order.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "op": {
                                "type": "string",
                                "enum": ["add", "remove", "move", "swap", "pick_section"],
                            },
                            "course": {
                                "type": "string",
                                "description": "Course identifier, e.g. 'ECON 3010', or a shortlist option id.",
                            },
                            "to_term": {
                                "type": "string",
                                "description": "For move: the term to move the course to, e.g. 'Fall 2027'.",
                            },
                            "out": {"type": "string", "description": "For swap: the course to take out."},
                            "in": {"type": "string", "description": "For swap: the course to put in."},
                            "sections": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "For pick_section: section ids.",
                            },
                        },
                        "required": ["op"],
                    },
                },
                "asked": {
                    "type": "string",
                    "description": (
                        "What the student literally asked for, in their words "
                        "(e.g. 'drop ECON 3010'), so the card can say when the "
                        "proposal differs."
                    ),
                },
            },
            "required": ["ops"],
        },
    },
}

# Keys an op may carry; anything else the model adds is dropped.
_OP_KEYS = ("op", "course", "to_term", "term", "out", "in", "sections")
_COURSE_KEYS = ("course", "out", "in")


def _resolve(value: Any, options: Dict[str, str]) -> Any:
    """Map a shortlist option id ("option-2", "option 2") to its course."""
    if not isinstance(value, str):
        return value
    key = value.strip().lower().replace(" ", "-").replace("_", "-")
    return options.get(key, value)


def clean_ops(ops: Any, options: Optional[Dict[str, str]] = None) -> List[Dict[str, Any]]:
    """Course edits only, with option ids resolved; ``set_profile`` is not for chat."""
    options = {k.lower(): v for k, v in (options or {}).items()}
    cleaned = []
    for op in ops or []:
        if not isinstance(op, dict) or op.get("op") not in ("add", "remove", "move", "swap", "pick_section"):
            continue
        item = {k: op[k] for k in _OP_KEYS if op.get(k) is not None}
        for key in _COURSE_KEYS:
            if key in item:
                item[key] = _resolve(item[key], options)
        cleaned.append(item)
    return cleaned


async def execute(
    *,
    name: str = "",
    context=None,
    ops: Optional[List[Dict[str, Any]]] = None,
    asked: Optional[str] = None,
    **_: Any,
) -> Dict[str, Any]:
    """Store ``ops`` as the student's pending proposal; never applies them.

    Extra model arguments (``mode``, ``apply``, ``expected_revision``,
    ``user_id`` ...) are ignored.
    """
    if context is None or not getattr(context, "user_id", None) or not getattr(context, "school", None):
        return dict(NO_CONTEXT)
    cleaned = clean_ops(ops, dict(context.options or {}))
    if not cleaned:
        return {"error": "No course edits given.", "code": "bad_op"}
    try:
        proposal = await service.propose_for_user(
            str(context.user_id),
            context.school,
            cleaned,
            asked=asked,
            base_revision=context.plan_revision,
        )
    except store.RevisionConflict as exc:
        return {
            "error": "The student's plan changed since the summary you were given.",
            "code": "revision_conflict",
            "revision": exc.revision,
        }
    except EditError as exc:
        return {"error": exc.message, "code": exc.code, "course": exc.course}
    return {"status": "proposed", "proposal": proposal}
