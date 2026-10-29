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

import dataclasses
import logging
from typing import Any, Dict, List, Optional, Sequence, Tuple

from app.core.database import get_database
from app.planner import checker, degree as degree_board, edits, store
from app.planner.facts import CourseFacts, Provider, load_facts_by_term
from app.planner.suggest import suggest

logger = logging.getLogger(__name__)

SUMMARY_LIMIT = 1500
# One deadline for every fact batch, however many terms it spans (R8, R12).
FACTS_BUDGET_S = 6.0

# Replaced in tests; None means ``academics.course_facts``.
facts_provider: Optional[Provider] = None


def default_term() -> str:
    from app.sources import academics

    return academics.next_term()


def covered_terms() -> List[str]:
    """Terms the school's course data covers (``academics.planner_terms``)."""
    from app.sources import academics

    return academics.planner_terms()


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


def _same_term(term: Optional[str]) -> str:
    return " ".join(str(term or "").split()).title()


def _uncovered(fact: CourseFacts, term: str) -> CourseFacts:
    """A course in a term past the data's coverage: what it is, but not when it runs."""
    if fact.known != "yes":
        return fact
    return dataclasses.replace(fact, offered="unknown", sections=None, bundles_known=False,
                               notes=[*fact.notes, f"No course data for {term} yet"])


async def _facts_by_term(wanted: Dict[str, Sequence[str]], school: str) -> Dict[str, Dict[str, CourseFacts]]:
    """``{term: {id: facts}}`` for ``{term: ids}``, all terms in one bounded batch (R12, R13).

    A term outside ``covered_terms()`` makes no provider call of its own: its
    courses are looked up in the newest covered term and read offered
    "unknown" with no sections. With no coverage list every term is asked.
    """
    covered = {_same_term(t): t for t in covered_terms()}
    newest = list(covered.values())[-1] if covered else None
    wanted = {t: list(dict.fromkeys(i for i in ids if i)) for t, ids in wanted.items()}
    source = {t: t if not covered or _same_term(t) in covered else newest for t in wanted}
    fetch: Dict[str, List[str]] = {}
    for term, ids in wanted.items():
        fetch[source[term]] = list(dict.fromkeys(fetch.get(source[term], []) + ids))
    loaded = await load_facts_by_term(fetch, provider=facts_provider, budget_s=FACTS_BUDGET_S, school=school)
    return {
        term: {i: loaded[source[term]][i] if source[term] == term else _uncovered(loaded[source[term]][i], term)
               for i in ids}
        for term, ids in wanted.items()
    }


async def _facts(ids: Sequence[str], term: str, school: str) -> Dict[str, CourseFacts]:
    return (await _facts_by_term({term: ids}, school))[term]


def _report(plan: Dict[str, Any], facts: Dict[str, CourseFacts], school: str) -> Dict[str, Any]:
    programs = programs_for(school, (plan.get("profile") or {}).get("program_ids") or [])
    return checker.check(plan, facts, programs, credit_limits=credit_limits())


def _in_term(plan: Dict[str, Any], term: Optional[str]) -> Dict[str, Any]:
    """The plan as checked for ``term`` (the semester view of any term, R13)."""
    return dict(plan, term=term) if term else plan


async def report_for(plan: Dict[str, Any], school: str, term: Optional[str] = None) -> Dict[str, Any]:
    shown = _in_term(plan, term)
    return _report(shown, await _facts(checker.facts_needed(shown), shown["term"], school), school)


async def _plan(db, user_id: str, school: str) -> Dict[str, Any]:
    return await store.get_or_create(db, str(user_id), school, term=default_term())


async def _view(plan: Dict[str, Any], school: str, term: Optional[str] = None) -> Dict[str, Any]:
    return {
        "plan": store.public_plan(plan),
        "report": await report_for(plan, school, term),
        "proposal": store.public_proposal(store.pending_proposal(plan)),
        "undo_label": store.current_undo_label(plan),
        "redo_label": store.current_redo_label(plan),
    }


def _changed(view_: Dict[str, Any]) -> Dict[str, Any]:
    """What a write returns: the view without the proposal."""
    return {key: view_[key] for key in ("plan", "report", "undo_label", "redo_label")}


async def view(user_id: str, school: str, term: Optional[str] = None) -> Dict[str, Any]:
    """``{plan, report, proposal, undo_label, redo_label}`` for the plan panel and page;
    ``term`` checks the plan as the semester view of that term (R13)."""
    return await _view(await _plan(get_database(), user_id, school), school, term)


# ---------------------------------------------------------------------------
# Edits, proposals, undo
# ---------------------------------------------------------------------------


async def degree(user_id: str, school: str) -> Dict[str, Any]:
    """The multi-term degree board (eng review R12, R14); shape in ``CONTRACTS.md``.

    Every planned term's facts load in one bounded batch (shared deadline):
    a term that misses it shows unknown credits and load.
    """
    plan = await _plan(get_database(), user_id, school)
    by_term = await _facts_by_term(degree_board.facts_wanted(plan), school)
    programs = programs_for(school, (plan.get("profile") or {}).get("program_ids") or [])
    covered = {_same_term(t) for t in covered_terms()}
    return degree_board.board(plan, by_term, programs, credit_limits=credit_limits(),
                              covered=lambda t: not covered or _same_term(t) in covered)


async def _validated_diff(
    plan: Dict[str, Any],
    ops: List[Dict[str, Any]],
    school: str,
    *,
    asked: Optional[str] = None,
    term: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate ``ops`` against ``plan`` and return their diff as seen in
    ``term`` (default the plan's term); raises ``EditError``.

    Each op is checked against the facts of the term it lands in (R13); the
    reports' facts and every destination term's facts load in one batch.
    """
    edits.check_applies(plan, ops)
    after = edits.apply_ops(plan, ops)
    shown = term or plan["term"]
    wanted = {shown: checker.facts_needed(plan) + checker.facts_needed(after)}
    for dest, ids in edits.verify_by_term(plan, ops).items():
        wanted[dest] = wanted.get(dest, []) + ids
    by_term = await _facts_by_term(wanted, school)
    notes = edits.validate_ops(plan, ops, by_term=by_term)
    facts = by_term[shown]
    before_report = _report(_in_term(plan, shown), facts, school)
    after_report = _report(_in_term(after, shown), facts, school)
    return edits.diff(before_report, after_report, ops, asked=asked, notes=notes)


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
        by_term = await _facts_by_term(edits.verify_by_term(plan, ops), school)
        notes = edits.validate_ops(plan, ops, by_term=by_term)
    plan, _ = await store.commit_edit(
        db, str(user_id), school, ops, expected_revision=expected_revision, idempotency_key=idempotency_key
    )
    return dict(_changed(await _view(plan, school)), notes=notes)


async def preview(
    user_id: str,
    school: str,
    ops: List[Dict[str, Any]],
    *,
    expected_revision: int,
    term: Optional[str] = None,
) -> Dict[str, Any]:
    """The diff a proposal of ``ops`` would carry, seen in ``term`` (eng review R2).

    Writes nothing: no revision bump, and a pending proposal stays as it is.
    """
    plan = await _plan(get_database(), user_id, school)
    if plan["revision"] != expected_revision:
        raise store.RevisionConflict(plan["revision"])
    return {"diff": await _validated_diff(plan, ops, school, term=term), "revision": plan["revision"]}


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
    return _changed(await _view(plan, school))


async def discard(user_id: str, school: str, proposal_id: str) -> Dict[str, Any]:
    db = get_database()
    await _plan(db, user_id, school)
    return store.public_proposal(await store.discard(db, str(user_id), school, proposal_id))


async def undo(user_id: str, school: str, *, expected_revision: int) -> Dict[str, Any]:
    db = get_database()
    await _plan(db, user_id, school)
    plan = await store.undo(db, str(user_id), school, expected_revision=expected_revision)
    return _changed(await _view(plan, school))


async def redo(user_id: str, school: str, *, expected_revision: int) -> Dict[str, Any]:
    """Re-apply the step after the undo pointer, checked like a new edit (R4)."""
    db = get_database()
    await _plan(db, user_id, school)

    async def validate(plan: Dict[str, Any], ops: List[Dict[str, Any]]) -> None:
        edits.validate_ops(plan, ops, by_term=await _facts_by_term(edits.verify_by_term(plan, ops), school))

    plan = await store.redo(db, str(user_id), school, expected_revision=expected_revision, validate=validate)
    return _changed(await _view(plan, school))


async def suggestions(user_id: str, school: str, q: str, term: Optional[str] = None) -> Dict[str, Any]:
    """``{items, reason, term}``: up to five courses for ``term`` (default the plan's)."""
    plan = await _plan(get_database(), user_id, school)
    programs = programs_for(school, (plan.get("profile") or {}).get("program_ids") or [])
    term = term or plan["term"]
    found = await suggest(plan, q, term, programs=programs,
                          credit_limits=credit_limits(), facts_provider=facts_provider)
    return dict(found, term=term)


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


async def plan_summary(user_id: str, school: str, active_term: Optional[str] = None) -> Tuple[str, int]:
    """A compact plan summary for the chat's planning pass, and its revision (R3, R9).

    At most ``SUMMARY_LIMIT`` characters: programs, term, completed and
    planned courses, and the pending proposal. ``active_term`` (the term
    open in the semester view, already checked) is labelled as the term
    being planned (tab-workspaces O1).
    """
    plan = await _plan(get_database(), user_id, school)
    profile = plan.get("profile") or {}
    programs = programs_for(school, profile.get("program_ids") or [])
    names = [getattr(p, "name", None) or getattr(p, "id", "") for p in programs]
    missing = [i for i in profile.get("program_ids") or [] if i not in {getattr(p, "id", None) for p in programs}]
    term = active_term or plan["term"]
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
