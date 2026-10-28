"""Course facts the checker needs, for one term.

Providers (``sources/academics.course_facts``) build these; the planner never
imports a provider's internals. Every field that a school may not publish has
an explicit unknown value (``None`` or ``"unknown"``), so the checker can say
"unknown" instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Literal, Optional, Tuple

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
