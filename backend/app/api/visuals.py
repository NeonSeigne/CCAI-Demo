"""Map raw tool results into typed visual specs for the frontend.

Course tools return structured data that the LLM otherwise flattens into prose.
``build_visuals`` emits small declarative specs the frontend renders with
pre-built components. New ``course_*`` refs carry only a course identifier
(and optional term); the client hydrates full UW Course Map data from
``/api/courses``. Legacy ``gpa_chart`` / ``prereq_tree`` shapes remain
renderable for older persisted messages.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

logger = logging.getLogger(__name__)

# Ordered grade buckets as stored by the grades tool (UW-Madison 4.0 scale).
_GRADE_BUCKETS = ["a", "ab", "b", "bc", "c", "d", "f"]

VisualSpec = Dict[str, Any]
BuilderResult = Union[VisualSpec, List[VisualSpec], None]


def _course_ref(course: str, visual_type: str, term: Optional[str] = None) -> VisualSpec:
    spec: VisualSpec = {"type": visual_type, "course": course}
    if term:
        spec["term"] = term
    return spec


def _latest_graded_term(result: Dict[str, Any]) -> Optional[str]:
    terms = result.get("terms") or []
    graded = [
        str(t.get("term_code"))
        for t in terms
        if t.get("term_code") is not None and t.get("average_gpa") is not None
    ]
    if not graded:
        return None
    return max(graded, key=lambda code: int(code) if str(code).isdigit() else 0)


def _grades_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """Emit lightweight course card refs from ``uw_course_grades``."""
    course = (result.get("course_identifier") or "").strip()
    if not course:
        return []

    cumulative = result.get("cumulative") or {}
    distribution = cumulative.get("distribution") or {}
    has_grades = any((distribution.get(b) or 0) for b in _GRADE_BUCKETS)
    if not has_grades and not cumulative.get("average_gpa"):
        return []

    term = _latest_graded_term(result)
    types = [
        "course_gpa",
        "course_completion_rate",
        "course_a_rate",
        "course_class_size",
        "course_grade_distribution",
        "course_trends",
    ]
    return [_course_ref(course, visual_type, term) for visual_type in types]


def _prereq_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    course = (result.get("course_identifier") or "").strip()
    prereqs = result.get("prerequisites") or []
    prereq_text = (result.get("prereq_text") or "").strip()
    if not course or (not prereqs and not prereq_text):
        return []
    # Prefer the rich CDN map in chat; keep a flat tree as a lightweight fallback
    # when the map is unavailable client-side.
    return [
        _course_ref(course, "course_prereq_map"),
        {
            "type": "prereq_tree",
            "course": course,
            "title": result.get("title", ""),
            "prereq_text": prereq_text,
            "prerequisites": [
                {
                    "identifier": p.get("identifier", ""),
                    "title": p.get("title") or "",
                }
                for p in prereqs
                if p.get("identifier")
            ],
        },
    ]


def _next_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    course = (result.get("course_identifier") or "").strip()
    next_courses = result.get("next_courses") or []
    if not course or not next_courses:
        return []
    return [
        {
            "type": "next_courses_tree",
            "course": course,
            "title": result.get("title", ""),
            "note": (result.get("note") or "").strip(),
            "next_courses": [
                {
                    "identifier": p.get("identifier", ""),
                    "title": p.get("title") or "",
                }
                for p in next_courses
                if p.get("identifier")
            ],
        },
    ]


def _sections_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    course = (result.get("course_identifier") or "").strip()
    sections = result.get("sections") or []
    if not course or not sections:
        return []
    return [
        _course_ref(course, "course_schedule"),
        _course_ref(course, "course_instructors"),
    ]


def _search_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """Emit similar-courses card only for a single strong catalog match."""
    courses = result.get("courses") or []
    if len(courses) != 1:
        return []
    course = (courses[0].get("identifier") or "").strip()
    if not course:
        return []
    return [_course_ref(course, "course_similar")]


_BUILDERS = {
    "uw_course_grades": _grades_specs,
    "uw_prerequisites": _prereq_specs,
    "uw_next_courses": _next_specs,
    "uw_course_sections": _sections_specs,
    "uw_search_courses": _search_specs,
}


def build_visuals(tool_outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert captured tool outputs into a list of visual specs.

    ``tool_outputs`` entries look like ``{"name": <tool>, "result": <dict>}``.
    Builders may return one spec, a list of specs, or ``None``. Entries whose
    tool has no mapping, that errored, or that produced no usable data are
    skipped.
    """
    visuals: List[Dict[str, Any]] = []
    for entry in tool_outputs or []:
        name = entry.get("name")
        result = entry.get("result")
        builder = _BUILDERS.get(name)
        if not builder or not isinstance(result, dict) or result.get("error"):
            continue
        try:
            spec = builder(result)
        except Exception as exc:  # never let a visual break the chat response
            logger.warning("Failed to build visual for %s: %s", name, exc)
            spec = None
        if not spec:
            continue
        if isinstance(spec, list):
            visuals.extend(item for item in spec if isinstance(item, dict) and item.get("type"))
        elif isinstance(spec, dict) and spec.get("type"):
            visuals.append(spec)
    return visuals
