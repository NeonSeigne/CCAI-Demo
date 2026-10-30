"""The one set of plan edits, their inverses, and the diff of two reports.

Ops (``CONTRACTS.md``): ``add``, ``remove``, ``move``, ``swap``,
``pick_section``, ``set_profile``, ``set_term``. Every surface (panel, plan page, chat) goes
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
counts or status change (R16), not only status flips. Its week blocks show
what an edit does to the shown term's week (tab-workspaces R16):
``blocks_in`` are the after-blocks of every course whose blocks change
(added, moved in, re-sectioned), ``blocks_out`` the before-blocks that go.
"""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, List, Optional, Tuple

from app.planner import checker
from app.planner.checker import norm
from app.planner.facts import CourseFacts

OPS = ("add", "remove", "move", "swap", "pick_section", "set_profile", "set_term")
PROFILE_FIELDS = ("program_ids", "catalog_year", "class_year", "start_term", "completed", "interests")
# A start term (R10) is a regular term label like "Fall 2025".
START_TERM = re.compile(r"^(Spring|Summer|Fall|Winter) (19|20)\d{2}$")
# Credits a completed entry may carry from a transcript row (setup-dialog R10).
COMPLETED_CREDITS = (0, 12)

# What a student might say for each op, for ``literal_differs`` (design 11A).
ASKED_WORDS = {
    "add": "add", "take": "add", "include": "add",
    "remove": "remove", "drop": "remove", "delete": "remove", "cut": "remove",
    "move": "move", "postpone": "move", "push": "move", "delay": "move", "shift": "move",
    "swap": "swap", "replace": "swap", "switch": "swap",
    "pick_section": "pick_section", "section": "pick_section",
    "set_profile": "set_profile",
    "set_term": "set_term",
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


def _verify_ids(op: Dict[str, Any]) -> List[str]:
    """Course ids one op needs facts for (a move is checked where it lands)."""
    kind = op.get("op")
    if kind in ("add", "pick_section", "move"):
        return [norm(op.get("course"))]
    if kind == "swap":
        return [norm(op.get("in"))]
    if kind == "set_profile":
        return [norm(c.get("id")) for c in op.get("completed") or [] if c.get("id")]
    return []


def courses_to_verify(ops: List[Dict[str, Any]]) -> List[str]:
    """Course ids whose facts ``validate_ops`` needs."""
    ids = [i for op in ops for i in _verify_ids(op)]
    return [i for i in dict.fromkeys(ids) if i]


def destination_terms(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> List[str]:
    """The term each op lands in (eng review R13): ``add.term``, ``move.to_term``,
    the term of the course a ``swap`` or ``pick_section`` changes, otherwise
    the plan's term. Ops are walked in order, as ``check_applies`` does."""
    terms: List[str] = []
    current = plan
    for op in ops:
        kind = op.get("op")
        term = current.get("term")
        if kind == "add" and op.get("term"):
            term = op["term"]
        elif kind == "move" and op.get("to_term"):
            term = op["to_term"]
        elif kind in ("swap", "pick_section"):
            found = _find(current, op.get("out") if kind == "swap" else op.get("course"))
            term = (found or {}).get("term") or term
        terms.append(term)
        if kind in OPS and kind != "set_profile":
            try:
                current = apply_ops(current, [op])
            except (KeyError, TypeError, AttributeError):
                pass  # a malformed op; ``check_applies`` reports it
    return terms


def verify_by_term(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    """``{term: course ids}`` for ``validate_ops``, grouped by destination term."""
    grouped: Dict[str, List[str]] = {}
    for op, term in zip(ops, destination_terms(plan, ops)):
        for course_id in _verify_ids(op):
            if course_id and course_id not in grouped.setdefault(term, []):
                grouped[term].append(course_id)
    return grouped


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
                "swap": ("out", "in"), "pick_section": ("course", "sections"), "set_term": ("term",)}.get(kind, ())
    missing = [name for name in required if not op.get(name)]
    if missing:
        raise EditError("bad_op", f"'{kind}' needs {', '.join(missing)}")
    if kind == "set_profile" and not any(name in op for name in PROFILE_FIELDS):
        raise EditError("bad_op", "'set_profile' needs at least one profile field")
    if kind == "set_term" and not isinstance(op["term"], str):
        raise EditError("bad_op", "'set_term' needs a term")
    if kind == "set_profile" and "completed" in op:
        _check_completed(op["completed"])
    if kind == "set_profile" and op.get("start_term") is not None:
        if not isinstance(op["start_term"], str) or not START_TERM.match(op["start_term"]):
            raise EditError("bad_op", "Start term must be a term like Fall 2025")


def _check_completed(completed: Any) -> None:
    """Completed entries are ``{id, grade?, term?, credits?}``; ``credits``,
    when given, is a number from 0 to 12 (setup-dialog R10)."""
    if completed is None:
        return
    if not isinstance(completed, list):
        raise EditError("bad_op", "'completed' must be a list")
    low, high = COMPLETED_CREDITS
    for entry in completed:
        if not isinstance(entry, dict):
            raise EditError("bad_op", "Each completed course must be an object")
        credits = entry.get("credits")
        if credits is None:
            continue
        if isinstance(credits, bool) or not isinstance(credits, (int, float)) or not low <= credits <= high:
            raise EditError("bad_op", f"Credits for {norm(entry.get('id'))} must be a number from {low} to {high}",
                            norm(entry.get("id")) or None)


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


def _not_offered(course_id: str, term: str, fact: Optional[CourseFacts]) -> List[str]:
    if fact is not None and fact.known == "yes" and fact.offered == "no":
        return [f"{course_id} isn't offered in {term}"]
    return []


def validate_ops(
    plan: Dict[str, Any],
    ops: List[Dict[str, Any]],
    facts: Optional[Dict[str, CourseFacts]] = None,
    *,
    by_term: Optional[Dict[str, Dict[str, CourseFacts]]] = None,
) -> List[str]:
    """Validate ops for a new edit or proposal; returns notes to show with it.

    ``by_term`` (``{term: facts}``, loaded for ``verify_by_term``) checks each
    op against the facts of the term it lands in (R13); without it every op
    is checked against ``facts``. A course added or moved into a term where
    it isn't offered is kept, with a note. Raises ``EditError`` for the first
    op that can't be applied.
    """
    if not ops:
        raise EditError("bad_op", "No edits given")
    check_applies(plan, ops)
    notes: List[str] = []
    for op, term in zip(ops, destination_terms(plan, ops)):
        known = by_term.get(term, {}) if by_term is not None else (facts or {})
        kind = op["op"]
        if kind in ("add", "move"):
            course_id = norm(op["course"])
            if kind == "add":
                _verify_identity(course_id, known)
            notes += _not_offered(course_id, term, known.get(course_id))
        elif kind == "swap":
            _verify_identity(norm(op["in"]), known)
        elif kind == "pick_section":
            course_id = norm(op["course"])
            _verify_identity(course_id, known)
            sections = known[course_id].sections
            if sections is not None:
                section_ids = {s.id for s in sections}
                bad = [s for s in op["sections"] if s not in section_ids]
                if bad:
                    raise EditError("unknown_section", f"{course_id} has no section {', '.join(bad)}", course_id)
        elif kind == "set_profile":
            for entry in op.get("completed") or []:
                course_id = norm(entry.get("id"))
                fact = known.get(course_id)
                if fact is None or fact.known != "yes":
                    # R12: the student's own record is kept, with a label.
                    notes.append(f"Couldn't verify {course_id}; kept as you entered it")
    return list(dict.fromkeys(notes))


# ---------------------------------------------------------------------------
# Applying and inverting
# ---------------------------------------------------------------------------


def apply_ops(
    plan: Dict[str, Any], ops: List[Dict[str, Any]], *, keep_sections_on_move: bool = False
) -> Dict[str, Any]:
    """A new plan with ``ops`` applied in order; run ``check_applies`` first.

    A ``move`` clears sections unless it names some. ``keep_sections_on_move``
    keeps them instead when the op has no ``sections`` key: the pre-R13 rule,
    for undo entries stored before moves recorded their sections.
    """
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
            # Sections belong to a term: a move keeps none unless it names new ones (R13).
            if not (keep_sections_on_move and "sections" not in op):
                course["sections"] = list(op["sections"]) if op.get("sections") else None
        elif kind == "swap":
            course = _find(new, op["out"])
            course["id"] = norm(op["in"])
            course["sections"] = op.get("sections")
        elif kind == "pick_section":
            _find(new, op["course"])["sections"] = list(op["sections"]) if op["sections"] else None
        elif kind == "set_term":
            new["term"] = op["term"]
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
        return {"op": "move", "course": course["id"], "to_term": course.get("term"), "sections": course.get("sections")}
    if kind == "swap":
        course = _find(plan, op["out"])
        return {"op": "swap", "out": norm(op["in"]), "in": course["id"], "sections": course.get("sections")}
    if kind == "pick_section":
        course = _find(plan, op["course"])
        return {"op": "pick_section", "course": course["id"], "sections": course.get("sections") or []}
    if kind == "set_term":
        return {"op": "set_term", "term": plan.get("term")}
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
             "set_profile": ("update your profile", "updated your profile"),
             "set_term": ("set your term to", "set your term to")}
    verb = verbs[kind][1 if past else 0]
    if kind in ("add", "remove", "pick_section"):
        return f"{verb} {norm(op['course'])}"
    if kind == "move":
        return f"{verb} {norm(op['course'])} to {op['to_term']}"
    if kind == "swap":
        return f"{verb} {norm(op['out'])} for {norm(op['in'])}"
    if kind == "set_term":
        return f"{verb} {op['term']}"
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


def _unknowns(report: Dict[str, Any], changed: Optional[set] = None, rule_ids: Optional[set] = None) -> List[str]:
    """What the check couldn't settle. With ``changed`` (course ids) and
    ``rule_ids``, only course and rule lines the edit touches are kept, so a
    card lists what bears on this change, not every unknown in the plan."""
    found: List[str] = []
    credits = report.get("credits") or {}
    if credits.get("status") == "unknown" and credits.get("reason"):
        found.append(credits["reason"])
    clashes = report.get("clashes") or {}
    if clashes.get("status") != "none" and clashes.get("reason"):
        found.append(f"Clashes: {clashes['reason']}")
    for course in report.get("courses") or []:
        if changed is not None and course.get("id") not in changed:
            continue
        prereqs = course.get("prereqs") or {}
        if prereqs.get("status") == "unknown":
            found.append(f"{prereqs.get('reason') or 'Prerequisites unknown'} for {course['id']}")
    for rule in report.get("rules") or []:
        if rule_ids is not None and (rule.get("program_id"), rule.get("rule_id")) not in rule_ids:
            continue
        if rule.get("status") == "unknown":
            found.append(f"{rule.get('title')}: {rule.get('reason') or 'unknown'}")
    return list(dict.fromkeys(found))


def _blocks_by_course(report: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    found: Dict[str, List[Dict[str, Any]]] = {}
    for block in (report.get("schedule") or {}).get("blocks") or []:
        found.setdefault(block.get("course"), []).append(block)
    return found


def schedule_change(before: Dict[str, Any], after: Dict[str, Any]) -> Dict[str, Any]:
    """``{blocks_in, blocks_out, blocks}`` for the shown term's week.

    A course whose blocks differ between the reports contributes its after
    blocks to ``blocks_in`` and its before blocks to ``blocks_out``.
    ``blocks`` repeats ``blocks_in`` for the clients that read the old name.
    """
    old, new = _blocks_by_course(before), _blocks_by_course(after)
    blocks_in = [b for course, blocks in new.items() if blocks != old.get(course) for b in blocks]
    blocks_out = [b for course, blocks in old.items() if blocks != new.get(course) for b in blocks]
    return {"blocks_in": blocks_in, "blocks_out": blocks_out, "blocks": blocks_in}


def _by_term(plan: Dict[str, Any]) -> Dict[str, set]:
    found: Dict[str, set] = {}
    for course in checker.planned_courses(plan):
        term = course.get("term") or plan.get("term")
        found.setdefault(term, set()).add((course["id"], tuple(course.get("sections") or ())))
    return found


def affected_terms(before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
    """Terms whose courses (or chosen sections) differ between two plans, in term order."""
    old, new = _by_term(before), _by_term(after)
    return sorted((t for t in set(old) | set(new) if old.get(t, set()) != new.get(t, set())), key=checker.term_key)


def prereq_terms(before: Dict[str, Any], after: Dict[str, Any]) -> List[str]:
    """Terms the prerequisite check reads: the affected ones and every planned
    term after the first of them (a move can break a later course)."""
    affected = affected_terms(before, after)
    if not affected:
        return []
    first = checker.term_key(affected[0])
    planned = set(_by_term(before)) | set(_by_term(after))
    return sorted({t for t in planned if checker.term_key(t) >= first} | set(affected), key=checker.term_key)


def term_ids(before: Dict[str, Any], after: Dict[str, Any], term: str) -> List[str]:
    """Course ids in ``term`` in either plan (the facts a term report needs)."""
    ids = [cid for plan in (before, after) for cid, _ in sorted(_by_term(plan).get(term, set()))]
    return list(dict.fromkeys(ids))


def _credit_state(report: Dict[str, Any]) -> Dict[str, Any]:
    credits = report.get("credits") or {}
    return {"min": credits.get("min"), "max": credits.get("max"), "status": credits.get("status")}


def term_credit_rows(reports: Dict[str, Tuple[Dict[str, Any], Dict[str, Any]]], terms: List[str]) -> List[Dict[str, Any]]:
    """One row per affected term: credits before and after, with the limits."""
    rows = []
    for term in terms:
        if term not in reports:
            continue
        before, after = reports[term]
        rows.append({"term": term, "before": _credit_state(before), "after": _credit_state(after),
                     "limits": (after.get("credits") or {}).get("limits")})
    return rows


_PREREQ_STATUS = {"met": "met", "short": "not_met", "unknown": "unknown"}


def prereq_check(
    reports: Dict[str, Tuple[Dict[str, Any], Dict[str, Any]]], changed: set
) -> Dict[str, Any]:
    """``{status: met|not_met|unknown, courses: [{id, term, status, reason}]}``.

    Checked: every changed course (added, moved, swapped in, re-sectioned)
    and every course whose prerequisite status the edit changes. One course
    not met makes the whole check not met; otherwise one unknown makes it
    unknown. Nothing to check reads met.
    """
    old_status: Dict[str, str] = {}
    for before, _ in reports.values():
        for row in before.get("courses") or []:
            old_status[row["id"]] = (row.get("prereqs") or {}).get("status")
    rows = []
    for term in sorted(reports, key=checker.term_key):
        for row in reports[term][1].get("courses") or []:
            prereqs = row.get("prereqs") or {}
            status = prereqs.get("status")
            if row["id"] in changed or old_status.get(row["id"]) != status:
                rows.append({"id": row["id"], "term": term, "status": _PREREQ_STATUS.get(status, "unknown"),
                             "reason": prereqs.get("reason")})
    statuses = {r["status"] for r in rows}
    overall = "not_met" if "not_met" in statuses else "unknown" if "unknown" in statuses else "met"
    return {"status": overall, "courses": rows}


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
    term_reports: Optional[Dict[str, Tuple[Dict[str, Any], Dict[str, Any]]]] = None,
    terms: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """What an edit changes, in the shape of ``CONTRACTS.md``.

    ``asked`` is the student's own verb ("drop"); when it isn't what the ops
    do, ``literal_differs`` says so (design 11A). ``notes`` from
    ``validate_ops`` join the unknowns.

    ``term_reports`` (``{term: (before, after)}``) are the reports of every
    term the prerequisite check reads, and ``terms`` the affected ones that
    get a credit row; without them only the shown term (``before``/``after``)
    is used.
    """
    old_terms, new_terms = _course_terms(before), _course_terms(after)
    reports = term_reports or {after.get("term"): (before, after)}
    if terms is None:
        terms = [after.get("term")] if _credit_state(before) != _credit_state(after) else []

    def moved_row(course_id: str) -> Dict[str, Any]:
        # Title and credits for a lead "Move" row, from the destination term's report.
        to = new_terms[course_id]
        rows = (reports.get(to) or (None, after))[1].get("courses") or []
        found = next((r for r in rows if r.get("id") == course_id), None) or {}
        return {"id": course_id, "from": old_terms[course_id], "to": to,
                "title": found.get("title") or None, "credits": found.get("credits")}

    courses = {
        "added": [c for c in new_terms if c not in old_terms],
        "removed": [c for c in old_terms if c not in new_terms],
        "moved": [moved_row(c) for c in new_terms if c in old_terms and old_terms[c] != new_terms[c]],
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
        # Every term whose courses change gets a credit row (R10 card).
        "terms": term_credit_rows(reports, terms),
        "prereqs": prereq_check(reports, set(courses["added"]) | {m["id"] for m in courses["moved"]}),
        "difficulty": {"before": (before.get("difficulty") or {}).get("label"),
                       "after": (after.get("difficulty") or {}).get("label")},
        "clashes": {"before": (before.get("clashes") or {}).get("status"),
                    "after": (after.get("clashes") or {}).get("status")},
        "unknowns": list(dict.fromkeys(list(notes or []) + _unknowns(
            after,
            changed=set(courses["added"]) | set(courses["removed"]) | {m["id"] for m in courses["moved"]},
            rule_ids={(r["program_id"], r["rule_id"]) for r in rules},
        ))),
        "literal_differs": _literal_differs(asked, ops),
        # What the panel needs to draw a proposed addition: its report row
        # (title, credits, labels) and the week blocks that come and go
        # (design 1A, 18A; tab-workspaces R16).
        "added_courses": [c for c in after.get("courses") or [] if c.get("id") in courses["added"]],
        "schedule": schedule_change(before, after),
    }

