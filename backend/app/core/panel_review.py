"""Panel review on a change (panel-answers phase 7).

When a tool answer carries a ``proposed_change`` visual, 2–3 advisors each
review the proposal, the current plan and the course facts the planner
checked, and return ``{"verdict": "fine" | "concern", "line": "..."}``. The
rows are attached to the visual as ``review: [{persona_id, verdict, line}]``.
The review never changes what Apply does.
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

from app.core.improved_orchestrator import NO_INVENTED_FIGURES, _json_object

logger = logging.getLogger(__name__)

VERDICTS = ("fine", "concern")
MAX_LINE_CHARS = 200
MAX_REVIEWERS = 3
MIN_REVIEWERS = 2

# Diff keys the reviewers read; the week schedule is left out (too long, and
# clashes are already summarised).
_DIFF_KEYS = (
    "heading", "courses", "rules", "credits", "terms", "prereqs", "difficulty",
    "clashes", "unknowns", "literal_differs", "added_courses",
)


def proposal_index(visuals: List[Dict[str, Any]]) -> Optional[int]:
    """Where the ``proposed_change`` visual is, or None."""
    for i, visual in enumerate(visuals or []):
        if isinstance(visual, dict) and visual.get("type") == "proposed_change" and isinstance(visual.get("proposal"), dict):
            return i
    return None


def reviewer_count(panel_size: int) -> int:
    """2 or 3: the school's panel size on data answers, kept in range."""
    try:
        size = int(panel_size)
    except (TypeError, ValueError):
        size = MIN_REVIEWERS
    return max(MIN_REVIEWERS, min(MAX_REVIEWERS, size))


def plan_lines(plan: Optional[Dict[str, Any]]) -> str:
    """The plan for its term (``brief.term_plan``) as plain text."""
    if not plan:
        return ""
    courses = [
        " ".join(filter(None, [c.get("code"), c.get("title")]))
        + (f" ({c['credits']} credits)" if c.get("credits") else "")
        for c in plan.get("courses") or []
    ]
    head = f"The student's current plan for {plan.get('term')}" if plan.get("term") else "The student's current plan"
    if not courses:
        return f"{head}: no courses yet."
    total = f"\nTotal: {plan['total_credits']} credits" if plan.get("total_credits") else ""
    return f"{head}:\n" + "\n".join(f"- {c}" for c in courses) + total


def review_instructions(proposal: Dict[str, Any], plan: Optional[Dict[str, Any]]) -> str:
    """What an advisor reads to review a proposal: the change as the planner
    checked it (its course facts included), and the current plan."""
    diff = proposal.get("diff") or {}
    checked = {key: diff[key] for key in _DIFF_KEYS if diff.get(key) not in (None, [], {})}
    change = json.dumps(checked, ensure_ascii=False, default=str)[:6000]
    current = plan_lines(plan)
    return (
        "(For the advisor: the app has proposed a change to the student's plan. "
        "It is not applied; the student will choose Apply or Not now.\n"
        + (f"Summary: {proposal['summary']}\n" if isinstance(proposal.get("summary"), str) and proposal["summary"] else "")
        + f"The change, as the planner checked it (course facts included):\n{change}\n"
        + (f"\n{current}\n" if current else "")
        + "\nReview the change from your role. Reply with JSON only, no code "
        'fences: {"verdict": "fine" | "concern", "line": "..."}. "fine" when '
        'nothing worries you from your role; "concern" when something does. '
        '"line" is one short sentence saying why. Do not repeat or add numbers '
        f"(credits, grades, GPAs, seats, dates, prices). {NO_INVENTED_FIGURES})"
    )


def parse_review(raw: Any) -> Optional[Dict[str, str]]:
    """``{"verdict", "line"}`` from an advisor's reply, or None when it isn't
    that JSON (any other verdict, an empty line)."""
    if not isinstance(raw, str):
        return None
    parsed = _json_object(raw)
    if parsed is None:
        return None
    verdict = parsed.get("verdict")
    line = parsed.get("line")
    if not isinstance(verdict, str) or verdict.strip().lower() not in VERDICTS:
        return None
    if not isinstance(line, str):
        return None
    line = " ".join(line.split())
    if not line:
        return None
    if len(line) > MAX_LINE_CHARS:
        line = line[: MAX_LINE_CHARS - 1].rstrip() + "…"
    return {"verdict": verdict.strip().lower(), "line": line}


async def review_proposal(
    orchestrator: Any,
    session: Any,
    advisors: List[str],
    proposal: Dict[str, Any],
    plan: Optional[Dict[str, Any]],
    persona_llms: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, str]]:
    """Each advisor's review, in the order given. An advisor whose call fails
    or whose reply doesn't parse is left out."""
    instructions = review_instructions(proposal, plan)

    async def _one(pid: str) -> Optional[Dict[str, str]]:
        try:
            persona = orchestrator.get_persona(pid)
            if persona is None:
                return None
            result = await orchestrator.generate_single_persona_response(
                session, persona, "short",
                llm_client=(persona_llms or {}).get(pid),
                extra_instructions=instructions,
            )
        except Exception as exc:  # noqa: BLE001 — leave this advisor out
            logger.warning("Review failed for %s: %r", pid, exc)
            return None
        if not isinstance(result, dict) or result.get("failed"):
            return None
        parsed = parse_review(result.get("response"))
        if parsed is None:
            logger.info("Review from %s didn't parse; left out", pid)
            return None
        return {"persona_id": pid, **parsed}

    results = await asyncio.gather(*(_one(pid) for pid in advisors[:MAX_REVIEWERS]))
    return [r for r in results if r]
