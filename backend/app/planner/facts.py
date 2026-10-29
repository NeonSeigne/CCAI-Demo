"""Course facts the checker needs, per term.

Providers (``sources/academics.course_facts``) build these; the planner never
imports a provider's internals. Every field that a school may not publish has
an explicit unknown value (``None`` or ``"unknown"``), so the checker can say
"unknown" instead of guessing.

``load_facts`` fetches facts for a whole plan in one bounded batch (eng review
R8), and ``load_facts_by_term`` does the same for several terms at once (R12):
at most ``concurrency`` provider calls in flight, and one deadline for
the batch. A course that misses the deadline, or whose call fails, comes back
``known="unavailable"`` with a reason, so the check still runs and reads
"unknown" for that course (R4); an add of such a course is refused with
``couldnt_verify_course`` by ``edits`` (R11).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Dict, Iterable, List, Literal, Mapping, Optional, Tuple

logger = logging.getLogger(__name__)

Day = Literal["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
SectionKind = Literal["lecture", "lab", "discussion", "seminar", "other"]


@dataclass(frozen=True)
class Meeting:
    day: Day
    start: str  # "HH:MM", 24-hour, school-local
    end: str


@dataclass(frozen=True)
class Section:
    id: str  # stable within the term, e.g. UVA ClassNumber or "001"
    kind: SectionKind
    meetings: Optional[Tuple[Meeting, ...]]  # None: times not published
    seats_open: Optional[int] = None  # None: unknown
    # Required companion kinds for a full enrolment ("lab", "discussion").
    # Empty when the data says none; see CourseFacts.bundles_known.
    requires: Tuple[SectionKind, ...] = ()


@dataclass(frozen=True)
class PrereqNode:
    kind: Literal["all", "any", "course"]
    children: Tuple["PrereqNode", ...] = ()
    course: Optional[str] = None  # canonical identifier when kind == "course"
    minimum_grade: Optional[str] = None
    timing: Literal["prior", "concurrent"] = "prior"


@dataclass
class CourseFacts:
    identifier: str  # canonical display form, e.g. "ECON 3010"
    # yes: the provider confirmed the course exists; no: it confirmed it does
    # not; unavailable: the lookup failed or timed out (identity unverified).
    known: Literal["yes", "no", "unavailable"]
    title: str = ""
    credits: Optional[Tuple[float, float]] = None  # (min, max); None unknown
    offered: Literal["yes", "no", "unknown"] = "unknown"  # in the asked term
    sections: Optional[List[Section]] = None  # None: no section data
    bundles_known: bool = False  # whether `requires` can be trusted
    gen_ed: Optional[List[str]] = None  # None unknown; [] none
    avg_gpa: Optional[float] = None
    harder: Optional[bool] = None  # in the school's hardest third; None unknown
    prereq_tree: Optional[PrereqNode] = None  # None: no prerequisite data
    prereq_known: bool = False  # True when the school publishes prerequisites
    unavailable_reason: Optional[str] = None  # e.g. "Course Map didn't answer"
    as_of: Optional[str] = None  # snapshot date or term label of the data
    notes: List[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Batch loading
# ---------------------------------------------------------------------------

TOO_SLOW = "Took too long to check"
NO_ANSWER = "Course data didn't answer"

Provider = Callable[[List[str], str], Awaitable[Dict[str, CourseFacts]]]


def unavailable(identifier: str, reason: str) -> CourseFacts:
    return CourseFacts(identifier=identifier, known="unavailable", unavailable_reason=reason)


async def load_facts(
    ids: Iterable[str],
    term: str,
    *,
    provider: Optional[Provider] = None,
    concurrency: int = 8,
    budget_s: float = 6.0,
    chunk_size: int = 1,
    school: Optional[str] = None,
) -> Dict[str, CourseFacts]:
    """Facts for every id in ``ids`` for ``term``, keyed by the ids as given.

    ``provider`` defaults to ``academics.course_facts`` (imported here so the
    planner never loads a provider at import time). Ids go out in chunks of
    ``chunk_size``; one chunk per call keeps a slow course from holding the
    others past the deadline.
    """
    found = await load_facts_by_term(
        {term: ids}, provider=provider, concurrency=concurrency, budget_s=budget_s, chunk_size=chunk_size,
        school=school,
    )
    return found.get(term, {})


async def load_facts_by_term(
    wanted: Mapping[str, Iterable[str]],
    *,
    provider: Optional[Provider] = None,
    concurrency: int = 8,
    budget_s: float = 6.0,
    chunk_size: int = 1,
    school: Optional[str] = None,
) -> Dict[str, Dict[str, CourseFacts]]:
    """Facts for ``{term: ids}``, every term in ONE bounded batch: one gate of
    ``concurrency`` calls and one ``budget_s`` deadline shared by all terms
    (eng review R12, R13). Returns ``{term: {id: facts}}``; a term with no ids
    maps to ``{}``. A batch with courses past the deadline logs one warning
    naming them, with ``school`` (for the log only), term and budget (C5).
    """
    unique = {term: list(dict.fromkeys(i for i in ids if i)) for term, ids in wanted.items()}
    if not any(unique.values()):
        return {term: {} for term in unique}
    if provider is None:
        from app.sources import academics

        provider = academics.course_facts

    gate = asyncio.Semaphore(max(1, concurrency))
    size = max(1, chunk_size)
    chunks = [(term, ids[i:i + size]) for term, ids in unique.items() for i in range(0, len(ids), size)]

    async def fetch(term: str, chunk: List[str]) -> Dict[str, CourseFacts]:
        async with gate:
            return await provider(chunk, term)

    tasks = {asyncio.ensure_future(fetch(term, chunk)): (term, chunk) for term, chunk in chunks}
    done, pending = await asyncio.wait(tasks, timeout=budget_s)
    for task in pending:
        task.cancel()

    result: Dict[str, Dict[str, CourseFacts]] = {term: {} for term in unique}
    for task, (term, chunk) in tasks.items():
        if task in pending:
            for identifier in chunk:
                result[term][identifier] = unavailable(identifier, TOO_SLOW)
            continue
        try:
            answered = task.result() or {}
        except Exception as exc:  # a provider should not raise; never let one course sink the check
            logger.warning("course_facts failed for %s (%s): %s", chunk, term, exc)
            answered = {}
        for identifier in chunk:
            result[term][identifier] = answered.get(identifier) or unavailable(identifier, NO_ANSWER)
    if pending:
        _log_timeouts([chunk for task, chunk in tasks.items() if task in pending], school, budget_s)
        await asyncio.gather(*pending, return_exceptions=True)
    return {term: {i: result[term][i] for i in ids} for term, ids in unique.items()}


def _log_timeouts(chunks: List[Tuple[str, List[str]]], school: Optional[str], budget_s: float) -> None:
    by_term: Dict[str, List[str]] = {}
    for term, chunk in chunks:
        by_term.setdefault(term, []).extend(chunk)
    ids = [i for chunk_ids in by_term.values() for i in chunk_ids]
    logger.warning(
        "course facts timed out: school=%s term=%s budget_s=%s ids=%s",
        school, ", ".join(by_term), budget_s, ", ".join(ids),
        extra={"facts_timeout": {"school": school, "terms": by_term, "budget_s": budget_s}},
    )
