"""The one set of plan edits, their inverses, and the diff of two reports.

Ops (``CONTRACTS.md``): ``add``, ``remove``, ``move``, ``swap``,
``pick_section``, ``set_profile``. Every surface (panel, plan page, chat) goes
through the same three steps:

1. ``validate_ops`` checks each op against the plan and the course facts.
   An added or swapped-in course must be confirmed by the provider: a course
   the provider says doesn't exist is ``unknown_course``; one it couldn't look
   up is ``couldnt_verify_course`` (eng review R11). Completed courses the
   student enters are never refused: an unverified one is kept with a
   "couldn't verify" note (R12).
2. ``apply_ops`` returns a new plan; it never mutates its input.
3. ``inverse_ops`` and ``undo_label`` record how to walk the edit back.

``diff`` compares the reports before and after, and lists every rule whose
counts or status change (R16), not only status flips.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, List, Optional

from app.planner.checker import norm
from app.planner.facts import CourseFacts

OPS = ("add", "remove", "move", "swap", "pick_section", "set_profile")
PROFILE_FIELDS = ("program_ids", "catalog_year", "class_year", "completed", "interests")

# What a student might say for each op, for ``literal_differs`` (design 11A).
ASKED_WORDS = {
    "add": "add", "take": "add", "include": "add",
    "remove": "remove", "drop": "remove", "delete": "remove", "cut": "remove",
    "move": "move", "postpone": "move", "push": "move", "delay": "move", "shift": "move",
    "swap": "swap", "replace": "swap", "switch": "swap",
    "pick_section": "pick_section", "section": "pick_section",
    "set_profile": "set_profile",
}


class EditError(Exception):
    """An op that can't be applied; ``code`` is one of the contract's error codes."""

    def __init__(self, code: str, message: str, course: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.course = course

    def as_dict(self) -> Dict[str, Any]:
        return {"code": self.code, "message": self.message, "course": self.course}


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def _find(plan: Dict[str, Any], course_id: str) -> Optional[Dict[str, Any]]:
    wanted = norm(course_id)
    return next((c for c in plan.get("courses") or [] if norm(c.get("id")) == wanted), None)


def courses_to_verify(ops: List[Dict[str, Any]]) -> List[str]:
    """Course ids whose facts ``validate_ops`` needs."""
    ids: List[str] = []
    for op in ops:
        kind = op.get("op")
        if kind in ("add", "pick_section"):
            ids.append(norm(op.get("course")))
        elif kind == "swap":
            ids.append(norm(op.get("in")))
        elif kind == "set_profile":
            ids += [norm(c.get("id")) for c in op.get("completed") or [] if c.get("id")]
    return [i for i in dict.fromkeys(ids) if i]


def _verify_identity(course_id: str, facts: Dict[str, CourseFacts]) -> None:
    fact = facts.get(course_id)
    if fact is None or fact.known == "unavailable":
        reason = (fact.unavailable_reason if fact else None) or "the course lookup didn't answer"
        raise EditError("couldnt_verify_course", f"Couldn't verify {course_id}: {reason}", course_id)
    if fact.known == "no":
        raise EditError("unknown_course", f"{course_id} isn't a course at this school", course_id)


def _check_shape(op: Dict[str, Any]) -> None:
    kind = op.get("op")
    if kind not in OPS:
        raise EditError("bad_op", f"Unknown edit '{kind}'")
    required = {"add": ("course",), "remove": ("course",), "move": ("course", "to_term"),
                "swap": ("out", "in"), "pick_section": ("course", "sections")}.get(kind, ())
    missing = [name for name in required if not op.get(name)]
    if missing:
        raise EditError("bad_op", f"'{kind}' needs {', '.join(missing)}")
    if kind == "set_profile" and not any(name in op for name in PROFILE_FIELDS):
        raise EditError("bad_op", "'set_profile' needs at least one profile field")


def check_applies(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> None:
    """Raise ``EditError`` when an op doesn't fit the plan (no facts needed).

    Ops are checked in order against the plan as the earlier ops leave it,
    so "remove A, add A" is fine. Undo and stale proposals use this alone.
    """
    current = plan
    for op in ops:
        _check_shape(op)
        kind = op["op"]
        if kind == "add" and _find(current, op["course"]):
            raise EditError("already_in_plan", f"{norm(op['course'])} is already in your plan", norm(op["course"]))
        if kind in ("remove", "move", "pick_section") and not _find(current, op["course"]):
            raise EditError("not_in_plan", f"{norm(op['course'])} isn't in your plan", norm(op["course"]))
        if kind == "swap":
            if not _find(current, op["out"]):
                raise EditError("not_in_plan", f"{norm(op['out'])} isn't in your plan", norm(op["out"]))
            if _find(current, op["in"]) and norm(op["in"]) != norm(op["out"]):
                raise EditError("already_in_plan", f"{norm(op['in'])} is already in your plan", norm(op["in"]))
        current = apply_ops(current, [op])


def validate_ops(
    plan: Dict[str, Any], ops: List[Dict[str, Any]], facts: Dict[str, CourseFacts]
) -> List[str]:
    """Validate ops for a new edit or proposal; returns notes to show with it.

    Raises ``EditError`` for the first op that can't be applied.
    """
    if not ops:
        raise EditError("bad_op", "No edits given")
    check_applies(plan, ops)
    notes: List[str] = []
    for op in ops:
        kind = op["op"]
        if kind == "add":
            _verify_identity(norm(op["course"]), facts)
        elif kind == "swap":
            _verify_identity(norm(op["in"]), facts)
        elif kind == "pick_section":
            course_id = norm(op["course"])
            _verify_identity(course_id, facts)
            sections = facts[course_id].sections
            if sections is not None:
                known = {s.id for s in sections}
                bad = [s for s in op["sections"] if s not in known]
                if bad:
                    raise EditError("unknown_section", f"{course_id} has no section {', '.join(bad)}", course_id)
        elif kind == "set_profile":
            for entry in op.get("completed") or []:
                course_id = norm(entry.get("id"))
                fact = facts.get(course_id)
                if fact is None or fact.known != "yes":
                    # R12: the student's own record is kept, with a label.
                    notes.append(f"Couldn't verify {course_id}; kept as you entered it")
    return notes


# ---------------------------------------------------------------------------
# Applying and inverting
# ---------------------------------------------------------------------------


def apply_ops(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> Dict[str, Any]:
    """A new plan with ``ops`` applied in order; run ``check_applies`` first."""
    new = copy.deepcopy(plan)
    new.setdefault("courses", [])
    new.setdefault("profile", {})
    for op in ops:
        kind = op["op"]
        if kind == "add":
            new["courses"].append({"id": norm(op["course"]), "term": op.get("term") or new.get("term"),
                                   "sections": op.get("sections")})
        elif kind == "remove":
            new["courses"] = [c for c in new["courses"] if norm(c.get("id")) != norm(op["course"])]
        elif kind == "move":
            course = _find(new, op["course"])
            course["term"] = op["to_term"]
        elif kind == "swap":
            course = _find(new, op["out"])
            course["id"] = norm(op["in"])
            course["sections"] = op.get("sections")
        elif kind == "pick_section":
            _find(new, op["course"])["sections"] = list(op["sections"]) if op["sections"] else None
        elif kind == "set_profile":
            for name in PROFILE_FIELDS:
                if name in op:
                    value = copy.deepcopy(op[name])
                    if name == "completed":
                        value = [dict(c, id=norm(c.get("id"))) for c in value or []]
                    new["profile"][name] = value
    return new


def _inverse_one(plan: Dict[str, Any], op: Dict[str, Any]) -> Dict[str, Any]:
    kind = op["op"]
    if kind == "add":
        return {"op": "remove", "course": norm(op["course"])}
    if kind == "remove":
        course = _find(plan, op["course"])
        return {"op": "add", "course": course["id"], "term": course.get("term"), "sections": course.get("sections")}
    if kind == "move":
        course = _find(plan, op["course"])
        return {"op": "move", "course": course["id"], "to_term": course.get("term")}
    if kind == "swap":
        course = _find(plan, op["out"])
        return {"op": "swap", "out": norm(op["in"]), "in": course["id"], "sections": course.get("sections")}
    if kind == "pick_section":
        course = _find(plan, op["course"])
        return {"op": "pick_section", "course": course["id"], "sections": course.get("sections") or []}
    profile = plan.get("profile") or {}
    return {"op": "set_profile", **{name: copy.deepcopy(profile.get(name)) for name in PROFILE_FIELDS if name in op}}


def inverse_ops(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Ops that turn ``apply_ops(plan, ops)`` back into ``plan``."""
    inverses = []
    current = plan
    for op in ops:
        inverses.append(_inverse_one(current, op))
        current = apply_ops(current, [op])
    return list(reversed(inverses))


def _describe(op: Dict[str, Any], *, past: bool) -> str:
    kind = op["op"]
    verbs = {"add": ("add", "added"), "remove": ("remove", "removed"), "move": ("move", "moved"),
             "swap": ("swap", "swapped"), "pick_section": ("pick sections for", "picked sections for"),
             "set_profile": ("update your profile", "updated your profile")}
    verb = verbs[kind][1 if past else 0]
    if kind in ("add", "remove", "pick_section"):
        return f"{verb} {norm(op['course'])}"
    if kind == "move":
        return f"{verb} {norm(op['course'])} to {op['to_term']}"
    if kind == "swap":
        return f"{verb} {norm(op['out'])} for {norm(op['in'])}"
    return verb


def undo_label(ops: List[Dict[str, Any]]) -> str:
    """``"Undo: removed ECON 3010"``."""
    return "Undo: " + ", ".join(_describe(op, past=True) for op in ops)


def heading(ops: List[Dict[str, Any]]) -> str:
    """``"Move ECON 3010 to Fall 2027, add ECON 3300"``."""
    text = ", ".join(_describe(op, past=False) for op in ops)
    return text[:1].upper() + text[1:]


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


def _course_terms(report: Dict[str, Any]) -> Dict[str, str]:
    terms = {c["id"]: c.get("term") for c in report.get("later") or []}
    terms.update({c["id"]: c.get("term") for c in report.get("courses") or []})
    return terms


def _rule_state(rule: Dict[str, Any]) -> Dict[str, Any]:
    return {name: rule.get(name) for name in ("status", "completed", "planned", "needed")}


def _unknowns(report: Dict[str, Any]) -> List[str]:
    found: List[str] = []
    credits = report.get("credits") or {}
    if credits.get("status") == "unknown" and credits.get("reason"):
        found.append(credits["reason"])
    clashes = report.get("clashes") or {}
    if clashes.get("status") != "none" and clashes.get("reason"):
        found.append(f"Clashes: {clashes['reason']}")
    for course in report.get("courses") or []:
        prereqs = course.get("prereqs") or {}
        if prereqs.get("status") == "unknown":
            found.append(f"{prereqs.get('reason') or 'Prerequisites unknown'} for {course['id']}")
    for rule in report.get("rules") or []:
        if rule.get("status") == "unknown":
            found.append(f"{rule.get('title')}: {rule.get('reason') or 'unknown'}")
    return list(dict.fromkeys(found))


def _literal_differs(asked: Optional[str], ops: List[Dict[str, Any]]) -> Optional[str]:
    if not asked:
        return None
    wanted = ASKED_WORDS.get(asked.strip().lower())
    if wanted is None or wanted in {op["op"] for op in ops}:
        return None
    return f"You said {asked.strip().lower()}; I " + ", ".join(_describe(op, past=True) for op in ops)


def diff(
    before: Dict[str, Any],
    after: Dict[str, Any],
    ops: List[Dict[str, Any]],
    *,
    asked: Optional[str] = None,
    notes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """What an edit changes, in the shape of ``CONTRACTS.md``.

    ``asked`` is the student's own verb ("drop"); when it isn't what the ops
    do, ``literal_differs`` says so (design 11A). ``notes`` from
    ``validate_ops`` join the unknowns.
    """
    old_terms, new_terms = _course_terms(before), _course_terms(after)
    courses = {
        "added": [c for c in new_terms if c not in old_terms],
        "removed": [c for c in old_terms if c not in new_terms],
        "moved": [{"id": c, "from": old_terms[c], "to": new_terms[c]}
                  for c in new_terms if c in old_terms and old_terms[c] != new_terms[c]],
    }

    old_rules = {(r.get("program_id"), r.get("rule_id")): r for r in before.get("rules") or []}
    rules = []
    for rule in after.get("rules") or []:
        old = old_rules.get((rule.get("program_id"), rule.get("rule_id")))
        if old is None:
            continue
        allocation = lambda r: (r.get("completed_courses"), r.get("planned_courses"))  # noqa: E731
        if _rule_state(old) != _rule_state(rule) or allocation(old) != allocation(rule):
            rules.append({"program_id": rule.get("program_id"), "rule_id": rule.get("rule_id"),
                          "title": rule.get("title"), "before": _rule_state(old), "after": _rule_state(rule)})

    def span(report: Dict[str, Any]) -> List[Any]:
        credits = report.get("credits") or {}
        return [credits.get("min"), credits.get("max")]

    return {
        "heading": heading(ops),
        "courses": courses,
        "rules": rules,
        "credits": {"before": span(before), "after": span(after)},
        "difficulty": {"before": (before.get("difficulty") or {}).get("label"),
                       "after": (after.get("difficulty") or {}).get("label")},
        "clashes": {"before": (before.get("clashes") or {}).get("status"),
                    "after": (after.get("clashes") or {}).get("status")},
        "unknowns": list(dict.fromkeys(list(notes or []) + _unknowns(after))),
        "literal_differs": _literal_differs(asked, ops),
        # What the panel needs to draw a proposed addition: its report row
        # (title, credits, labels) and its week blocks (design 1A, 18A).
        "added_courses": [c for c in after.get("courses") or [] if c.get("id") in courses["added"]],
        "schedule": {"blocks": [b for b in (after.get("schedule") or {}).get("blocks") or []
                                if b.get("course") in courses["added"]]},
    }

