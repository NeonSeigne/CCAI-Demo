"""Course suggestions from what the student says they like.

Candidates come from the school's real catalog search (``search_catalog``),
never from a model's memory. Each candidate is checked as if added to the
plan, and its ``labels`` are the checker's own words ("Fills: ...",
"General elective credit", "Gen-ed: unknown", prerequisite and offering
status). ``why`` only restates those labels, so nothing here can claim a
requirement or gen-ed fit the checker didn't report. Each item also carries
the first section that fits the term's schedule (``checker.check_schedule``,
eng review R9). No model calls.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from app.planner import checker, edits
from app.planner.facts import CourseFacts, Provider, Section, difficulty_of, load_facts

logger = logging.getLogger(__name__)

MAX_ITEMS = 5
SEARCH_POOL = 20
CANDIDATES = 10

_PREREQ_LABELS = {"met": "Prerequisites met", "short": "Prerequisites not met", "unknown": "Prerequisites unknown"}


def _offered_label(offered: str, term: str) -> str:
    if offered == "yes":
        return f"Offered {term}"
    if offered == "no":
        return f"Not offered {term}"
    return f"Offering in {term} unknown"


def _labels(row: Dict[str, Any], term: str) -> List[str]:
    labels = list(row["fills"])
    labels.append(_PREREQ_LABELS[row["prereqs"]["status"]])
    labels.append(_offered_label(row["offered"], term))
    if row["harder"]:
        labels.append("In the school's hardest third by grades")
    return labels


def _rank(row: Dict[str, Any], fit: str) -> tuple:
    # Offered and prerequisites met first, then schedule fit; search order breaks ties.
    return (
        {"yes": 0, "unknown": 1, "no": 2}[row["offered"]],
        {"met": 0, "unknown": 1, "short": 2}[row["prereqs"]["status"]],
        {"fits": 0, "unknown": 1, "clashes": 2}[fit],
    )


# ---------------------------------------------------------------------------
# Schedule fit (eng review R9)
# ---------------------------------------------------------------------------


def _overlaps(a: Section, b: Section) -> bool:
    for x in a.meetings or ():
        for y in b.meetings or ():
            if x.day == y.day and checker._minutes(x.start) < checker._minutes(y.end) \
                    and checker._minutes(y.start) < checker._minutes(x.end):
                return True
    return False


def _trial(term_courses: List[Dict[str, Any]], course_id: str, bundle: List[Section],
           facts: Dict[str, CourseFacts]) -> Dict[str, Any]:
    """``checker.check_schedule`` with the candidate taking ``bundle``."""
    trial = term_courses + [{"id": course_id, "term": None, "sections": [s.id for s in bundle]}]
    clashes, _ = checker.check_schedule(trial, facts)
    return clashes


def _hits(clashes: Dict[str, Any], course_id: str) -> List[str]:
    return [b if a == course_id else a for a, b in clashes["pairs"] if course_id in (a, b)]


def schedule_fit(
    course_id: str, fact: CourseFacts, term_courses: List[Dict[str, Any]], facts: Dict[str, CourseFacts]
) -> Dict[str, Any]:
    """The candidate's first section (with one of each companion kind it
    requires) that clashes with nothing in the plan's term.

    ``{"fit": "fits"|"clashes"|"unknown", "reason", "section", "clashes_with"}``:
    ``fits`` when ``check_schedule`` finds no clash and could check every
    course; ``clashes`` when every section clashes (``clashes_with`` the plan
    courses hit); ``unknown`` with a reason when the candidate's times aren't
    published or another course in the term can't be checked (then
    ``section`` is the first option with no clash found).
    """
    out: Dict[str, Any] = {"fit": "unknown", "reason": None, "section": None, "clashes_with": []}
    timed = [s for s in fact.sections or [] if s.meetings]
    if not timed:
        out["reason"] = checker.TIMES_NOT_PUBLISHED
        return out
    kinds = {s.kind for s in timed}
    primary_kind = "lecture" if "lecture" in kinds else timed[0].kind
    hit: List[str] = []
    for primary in (s for s in timed if s.kind == primary_kind):
        bundle = [primary]
        untimed = False  # a required companion kind lists no times
        complete = True
        for kind in primary.requires if fact.bundles_known else ():
            options = [s for s in timed if s.kind == kind]
            if not options:
                untimed = True
                continue
            companion = None
            for option in options:
                if any(_overlaps(option, chosen) for chosen in bundle):
                    continue
                against = _hits(_trial(term_courses, course_id, bundle + [option], facts), course_id)
                if not against:
                    companion = option
                    break
                hit.extend(against)
            if companion is None:
                complete = False
                break
            bundle.append(companion)
        if not complete:
            continue
        clashes = _trial(term_courses, course_id, bundle, facts)
        against = _hits(clashes, course_id)
        if against:
            hit.extend(against)
            continue
        out["section"] = {
            "ids": [s.id for s in bundle],
            "meetings": [
                {"section": s.id, "kind": s.kind, "day": m.day, "start": m.start, "end": m.end}
                for s in bundle for m in s.meetings or ()
            ],
        }
        reason = checker.TIMES_NOT_PUBLISHED if untimed else clashes["reason"]
        if reason:
            out["reason"] = reason
        else:
            out["fit"] = "fits"
        return out
    out["fit"] = "clashes"
    out["clashes_with"] = list(dict.fromkeys(hit))
    return out


async def suggest(
    plan: Dict[str, Any],
    q: str,
    term: str,
    *,
    programs: Sequence[Any] = (),
    credit_limits: Optional[Dict[str, float]] = None,
    facts_provider: Optional[Provider] = None,
) -> Dict[str, Any]:
    """Up to ``MAX_ITEMS`` courses for ``term`` matching ``q`` (or the profile's interests)."""
    from app.sources import academics

    q = (q or "").strip() or ((plan.get("profile") or {}).get("interests") or {}).get("text", "").strip()
    if not q:
        return {"items": [], "reason": "Tell me what you're interested in"}
    try:
        found = await academics.search_catalog(q=q, limit=SEARCH_POOL)
    except (academics.CatalogQueryError, RuntimeError) as exc:
        return {"items": [], "reason": str(exc)}

    taken = set(checker.facts_needed(plan))
    candidates = []
    for row in found.get("courses") or []:
        course_id = checker.norm(row.get("identifier"))
        if course_id and course_id not in taken and course_id not in candidates:
            candidates.append(course_id)
    candidates = candidates[:CANDIDATES]
    if not candidates:
        return {"items": [], "reason": None}

    facts = await load_facts(candidates + list(taken), term, provider=facts_provider)
    base = dict(plan, term=term)
    term_courses = [c for c in checker.planned_courses(base) if c.get("term") == term]
    rows = []
    for course_id in candidates:
        if facts.get(course_id) is None or facts[course_id].known != "yes":
            continue  # unverified courses are never suggested (R11)
        trial = edits.apply_ops(base, [{"op": "add", "course": course_id, "term": term}])
        report = checker.check(trial, facts, programs, credit_limits=credit_limits)
        row = next(r for r in report["courses"] if r["id"] == course_id)
        rows.append((row, schedule_fit(course_id, facts[course_id], term_courses, facts)))

    rows.sort(key=lambda pair: _rank(pair[0], pair[1]["fit"]))  # stable: search order within a rank
    items = []
    for row, fit in rows[:MAX_ITEMS]:
        labels = _labels(row, term)
        fact = facts[row["id"]]
        items.append({
            "id": row["id"],
            "title": row["title"],
            "why": "; ".join(labels),
            "labels": labels,
            "prereqs": row["prereqs"],
            "credits": row["credits"],
            "gpa": fact.avg_gpa,
            "difficulty": difficulty_of(fact, academics.easier_from_gpa()),
            "fit": fit["fit"],
            "fit_reason": fit["reason"],
            "section": fit["section"],
            "clashes_with": fit["clashes_with"],
        })
    return {"items": items, "reason": None}
