"""Course suggestions from what the student says they like.

Candidates come from the school's real catalog search (``search_catalog``),
never from a model's memory. Each candidate is checked as if added to the
plan, and its ``labels`` are the checker's own words ("Fills: ...",
"General elective credit", "Gen-ed: unknown", prerequisite and offering
status). ``why`` only restates those labels, so nothing here can claim a
requirement or gen-ed fit the checker didn't report. No model calls.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

from app.planner import checker, edits
from app.planner.facts import Provider, load_facts

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


def _rank(row: Dict[str, Any]) -> tuple:
    # Offered and prerequisites met first; search order breaks ties.
    return ({"yes": 0, "unknown": 1, "no": 2}[row["offered"]], {"met": 0, "unknown": 1, "short": 2}[row["prereqs"]["status"]])


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
    rows = []
    for course_id in candidates:
        if facts.get(course_id) is None or facts[course_id].known != "yes":
            continue  # unverified courses are never suggested (R11)
        trial = edits.apply_ops(base, [{"op": "add", "course": course_id, "term": term}])
        report = checker.check(trial, facts, programs, credit_limits=credit_limits)
        row = next(r for r in report["courses"] if r["id"] == course_id)
        rows.append(row)

    rows.sort(key=_rank)  # stable: search order within a rank
    items = []
    for row in rows[:MAX_ITEMS]:
        labels = _labels(row, term)
        items.append({
            "id": row["id"],
            "title": row["title"],
            "why": "; ".join(labels),
            "labels": labels,
            "prereqs": row["prereqs"],
            "credits": row["credits"],
        })
    return {"items": items, "reason": None}
