"""Map raw tool results into typed visual specs for the frontend.

The course tools (``uw_course_grades``, ``uw_prerequisites``) return rich
structured data that the LLM otherwise flattens into prose. ``build_visuals``
preserves that structure as small, declarative specs which the frontend renders
with pre-built components (a GPA bar chart, a prerequisite tree). No code is
generated or executed -- each spec only selects a known component and binds
data to it.
"""

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

# Ordered grade buckets as stored by the grades tool (UW-Madison 4.0 scale).
_GRADE_BUCKETS = ["a", "ab", "b", "bc", "c", "d", "f"]


def _gpa_chart_spec(result: Dict[str, Any]) -> Dict[str, Any] | None:
    """Build a ``gpa_chart`` spec from a ``uw_course_grades`` result."""
    cumulative = result.get("cumulative")
    if not cumulative:
        return None

    distribution = cumulative.get("distribution") or {}
    # Require at least one graded student so we never render an empty chart.
    if not any((distribution.get(b) or 0) for b in _GRADE_BUCKETS):
        return None

    terms = [
        {
            "term_code": t.get("term_code"),
            "average_gpa": t.get("average_gpa"),
            "total": t.get("total") or 0,
        }
        for t in (result.get("terms") or [])
        if t.get("average_gpa") is not None
    ]

    return {
        "type": "gpa_chart",
        "course": result.get("course_identifier", ""),
        "average_gpa": cumulative.get("average_gpa"),
        "total": cumulative.get("total") or 0,
        "distribution": {b: (distribution.get(b) or 0) for b in _GRADE_BUCKETS},
        "terms": terms,
    }


def _prereq_tree_spec(result: Dict[str, Any]) -> Dict[str, Any] | None:
    """Build a ``prereq_tree`` spec from a ``uw_prerequisites`` result."""
    prereqs = result.get("prerequisites") or []
    prereq_text = (result.get("prereq_text") or "").strip()
    # Skip when there is nothing meaningful to show; the prose will cover it.
    if not prereqs and not prereq_text:
        return None

    return {
        "type": "prereq_tree",
        "course": result.get("course_identifier", ""),
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
    }


_BUILDERS = {
    "uw_course_grades": _gpa_chart_spec,
    "uw_prerequisites": _prereq_tree_spec,
}


def build_visuals(tool_outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert captured tool outputs into a list of visual specs.

    ``tool_outputs`` entries look like ``{"name": <tool>, "result": <dict>}``.
    Entries whose tool has no mapping, that errored, or that produced no usable
    data are skipped, so the return value may be empty.
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
        if spec:
            visuals.append(spec)
    return visuals
