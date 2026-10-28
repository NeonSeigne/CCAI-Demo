"""The planner's entry points, shared by the HTTP routes and the chat tool.

Each function takes the student's user id and the deployment's school from
the caller's sign-in (never from the client or the model) and wires the pure
modules together: ``facts`` for course data, ``programs`` for the student's
program files, ``checker`` for the report, ``edits`` for validation and the
diff, ``store`` for the document. The chat lane calls ``propose_for_user``
(propose only, R10) and ``plan_summary`` (R3, R9).

The provider, program loader, term and credit limits are reached through the
small functions at the top, so tests replace them without a network or files.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.core.database import get_database
from app.planner import checker, edits, store
from app.planner.facts import CourseFacts, Provider, load_facts
from app.planner.suggest import suggest

logger = logging.getLogger(__name__)

SUMMARY_LIMIT = 1500

# Replaced in tests; None means ``academics.course_facts``.
facts_provider: Optional[Provider] = None


def default_term() -> str:
    from app.sources import academics

    return academics.next_term()


def credit_limits() -> Optional[Dict[str, float]]:
    """Term credit limits from ``school.yaml`` ``planner:``, when the pack has them."""
    from app.config import get_settings

    planner = getattr(get_settings(), "planner", None)
    limits = getattr(planner, "credit_limits", None) if planner is not None else None
    if limits is None and isinstance(planner, dict):
        limits = planner.get("credit_limits")
    if limits is None:
        return None
    if not isinstance(limits, dict):
        limits = {"min": getattr(limits, "min", None), "max": getattr(limits, "max", None)}
    return limits


def list_programs(school: str) -> List[Any]:
    from app.planner import programs

    return programs.list_programs(school)


def programs_for(school: str, program_ids: Sequence[str]) -> List[Any]:
    """The student's program files, in their order; a missing one is skipped."""
    from app.planner import programs

    found = []
    for program_id in program_ids or ():
        try:
            found.append(programs.get_program(school, program_id))
        except Exception as exc:  # a bad or missing file must not break the plan
            logger.warning("Program %s/%s not loaded: %s", school, program_id, exc)
    return found


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


async def _facts(ids: Sequence[str], term: str) -> Dict[str, CourseFacts]:
    return await load_facts(list(ids), term, provider=facts_provider)


def _report(plan: Dict[str, Any], facts: Dict[str, CourseFacts], school: str) -> Dict[str, Any]:
    programs = programs_for(school, (plan.get("profile") or {}).get("program_ids") or [])
    return checker.check(plan, facts, programs, credit_limits=credit_limits())


async def report_for(plan: Dict[str, Any], school: str) -> Dict[str, Any]:
    return _report(plan, await _facts(checker.facts_needed(plan), plan["term"]), school)


async def _plan(db, user_id: str, school: str) -> Dict[str, Any]:
    return await store.get_or_create(db, str(user_id), school, term=default_term())


async def _view(plan: Dict[str, Any], school: str) -> Dict[str, Any]:
    return {
        "plan": store.public_plan(plan),
        "report": await report_for(plan, school),
        "proposal": store.public_proposal(store.pending_proposal(plan)),
        "undo_label": store.current_undo_label(plan),
    }


async def view(user_id: str, school: str) -> Dict[str, Any]:
    """``{plan, report, proposal, undo_label}`` for the plan panel and page."""
    return await _view(await _plan(get_database(), user_id, school), school)


# ---------------------------------------------------------------------------
# Edits, proposals, undo
# ---------------------------------------------------------------------------


async def _validated_diff(
    plan: Dict[str, Any], ops: List[Dict[str, Any]], school: str, *, asked: Optional[str] = None
) -> Dict[str, Any]:
    """Validate ``ops`` against ``plan`` and return their diff (raises ``EditError``)."""
    edits.check_applies(plan, ops)
    after = edits.apply_ops(plan, ops)
    ids = edits.courses_to_verify(ops) + checker.facts_needed(plan) + checker.facts_needed(after)
    facts = await _facts(ids, plan["term"])
    notes = edits.validate_ops(plan, ops, facts)
    return edits.diff(_report(plan, facts, school), _report(after, facts, school), ops, asked=asked, notes=notes)


async def apply_edit(
    user_id: str, school: str, ops: List[Dict[str, Any]], *, expected_revision: int, idempotency_key: str
) -> Dict[str, Any]:
    """The student's own edit from the panel or page: ``{plan, report, undo_label, notes}``."""
    db = get_database()
    plan = await _plan(db, user_id, school)
    notes: List[str] = []
    if not store.seen_key(plan, idempotency_key):
        if plan["revision"] != expected_revision:
            raise store.RevisionConflict(plan["revision"])
        facts = await _facts(edits.courses_to_verify(ops), plan["term"])
        notes = edits.validate_ops(plan, ops, facts)
    plan, _ = await store.commit_edit(
        db, str(user_id), school, ops, expected_revision=expected_revision, idempotency_key=idempotency_key
    )
    view_ = await _view(plan, school)
    return {"plan": view_["plan"], "report": view_["report"], "undo_label": view_["undo_label"], "notes": notes}


async def propose(
    user_id: str, school: str, ops: List[Dict[str, Any]], *, expected_revision: int, asked: Optional[str] = None
) -> Dict[str, Any]:
    """Check ``ops`` and store them as the plan's one pending proposal (with its diff)."""
    db = get_database()
    plan = await _plan(db, user_id, school)
    if plan["revision"] != expected_revision:
        raise store.RevisionConflict(plan["revision"])
    diff = await _validated_diff(plan, ops, school, asked=asked)
    proposal = await store.put_proposal(db, str(user_id), school, ops, base_revision=expected_revision, diff=diff)
    return store.public_proposal(proposal)


async def propose_for_user(
    user_id: str,
    school: str,
    ops: List[Dict[str, Any]],
    *,
    asked: Optional[str] = None,
    base_revision: Optional[int] = None,
) -> Dict[str, Any]:
    """Chat entry point (propose only). ``base_revision`` is the revision of the
    summary the model saw (R9); a moved plan raises ``RevisionConflict``.
    Without it the current revision is used."""
    if base_revision is None:
        base_revision = (await _plan(get_database(), user_id, school))["revision"]
    return await propose(user_id, school, ops, expected_revision=base_revision, asked=asked)


async def accept(user_id: str, school: str, proposal_id: str) -> Dict[str, Any]:
    """Apply a pending proposal: ``{plan, report}``; raises ``NeedsReview`` / ``Refused``."""
    db = get_database()
    await _plan(db, user_id, school)

    async def recheck(plan: Dict[str, Any], proposal: Dict[str, Any]) -> Dict[str, Any]:
        return await _validated_diff(plan, proposal["ops"], school)

    plan = await store.accept(db, str(user_id), school, proposal_id, recheck=recheck)
    view_ = await _view(plan, school)
    return {"plan": view_["plan"], "report": view_["report"], "undo_label": view_["undo_label"]}


async def discard(user_id: str, school: str, proposal_id: str) -> Dict[str, Any]:
    db = get_database()
    await _plan(db, user_id, school)
    return store.public_proposal(await store.discard(db, str(user_id), school, proposal_id))


async def undo(user_id: str, school: str, *, expected_revision: int) -> Dict[str, Any]:
    db = get_database()
    await _plan(db, user_id, school)
    plan = await store.undo(db, str(user_id), school, expected_revision=expected_revision)
    view_ = await _view(plan, school)
    return {"plan": view_["plan"], "report": view_["report"], "undo_label": view_["undo_label"]}


async def suggestions(user_id: str, school: str, q: str, term: Optional[str] = None) -> Dict[str, Any]:
    plan = await _plan(get_database(), user_id, school)
    programs = programs_for(school, (plan.get("profile") or {}).get("program_ids") or [])
    return await suggest(plan, q, term or plan["term"], programs=programs,
                         credit_limits=credit_limits(), facts_provider=facts_provider)


# ---------------------------------------------------------------------------
# Chat context
# ---------------------------------------------------------------------------


def _course_list(courses: List[Dict[str, Any]], *, with_term: bool = False) -> str:
    if not courses:
        return "none"
    parts = []
    for course in courses:
        extra = course.get("grade") if not with_term else course.get("term")
        parts.append(f"{course['id']} ({extra})" if extra else course["id"])
    return ", ".join(parts)


async def plan_summary(user_id: str, school: str) -> Tuple[str, int]:
    """A compact plan summary for the chat's planning pass, and its revision (R3, R9).

    At most ``SUMMARY_LIMIT`` characters: programs, term, completed and
    planned courses, and the pending proposal.
    """
    plan = await _plan(get_database(), user_id, school)
    profile = plan.get("profile") or {}
    programs = programs_for(school, profile.get("program_ids") or [])
    names = [getattr(p, "name", None) or getattr(p, "id", "") for p in programs]
    missing = [i for i in profile.get("program_ids") or [] if i not in {getattr(p, "id", None) for p in programs}]
    term = plan["term"]
    courses = checker.planned_courses(plan)
    pending = store.pending_proposal(plan)
    # The pending suggestion goes near the top so truncation never drops it.
    lines = [
        f"Plan revision {plan['revision']}, planning {term}.",
        f"Pending suggestion: {pending['summary']} (id {pending['id']})" if pending else "Pending suggestion: none",
        "Programs: " + (", ".join(names + [f"{m} (no program file)" for m in missing]) or "none set"),
    ]
    if profile.get("class_year") or profile.get("catalog_year"):
        lines.append(f"Class year: {profile.get('class_year') or 'unknown'}; catalog year: {profile.get('catalog_year') or 'unknown'}.")
    lines.append("Completed: " + _course_list(checker.completed_courses(plan)))
    lines.append(f"Planned for {term}: " + _course_list([c for c in courses if c.get("term") == term]))
    later = [c for c in courses if c.get("term") != term]
    if later:
        lines.append("Other terms: " + _course_list(later, with_term=True))
    interests = (profile.get("interests") or {}).get("text")
    if interests:
        lines.append(f"Interests: {interests}")
    text = "\n".join(lines)
    if len(text) > SUMMARY_LIMIT:
        text = text[: SUMMARY_LIMIT - 1] + "…"
    return text, plan["revision"]
