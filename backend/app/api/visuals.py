"""Map raw tool results into typed visual specs for the frontend.

Course tools return structured data that the LLM otherwise flattens into prose.
``build_visuals`` emits small declarative specs the frontend renders with
pre-built components. New ``course_*`` refs carry only a course identifier
(and optional term); the client hydrates them from ``/api/catalog/{id}``. Legacy ``gpa_chart`` / ``prereq_tree`` shapes remain
renderable for older persisted messages.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Union

from app.sources import academics

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
    """Emit lightweight course card refs from ``course_grades``."""
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
    # The course API has no prerequisite graph yet, so a course_prereq_map card
    # would always be empty; the flat tree is built from the tool result itself.
    return [
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
    """No search cards: the course API has no similar-courses data yet, so a
    ``course_similar`` card would always be empty."""
    return []


EVENT_CARD_LIMIT = 5
PLACE_CARD_LIMIT = 3


def _with_id(item: Dict[str, Any], source: Dict[str, Any]) -> Dict[str, Any]:
    """Pass the stable ``id`` through when the source has one; Save and the page links need it."""
    if source.get("id"):
        item["id"] = source["id"]
    return item


def _events_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """An event list card built from the events_search result itself. Rows
    carry ``kind`` and ``place_name`` (null when unknown); the card groups
    them by date from ``start`` in ``timezone`` (design Q10)."""
    events = [e for e in result.get("events") or [] if e.get("title")]
    if not events:
        return []
    spec: VisualSpec = {
        "type": "event_list",
        "timezone": result.get("timezone"),
        "events": [
            _with_id({
                key: e.get(key)
                for key in ("title", "start", "end", "all_day", "location", "url", "calendar", "ongoing",
                            "kind", "place_name")
            }, e)
            for e in events[:EVENT_CARD_LIMIT]
        ],
        "more": max(0, (result.get("total_results") or len(events)) - EVENT_CARD_LIMIT),
    }
    query = result.get("query")
    if isinstance(query, dict):
        # The window and keyword behind "See all on Events".
        spec["query"] = {"when": query.get("when"), "keyword": query.get("keyword")}
    return [spec]


def _place_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """A place card: matches, and distance from ``from`` when one was given."""
    places = result.get("places") or []
    if not places:
        return []
    origin = result.get("from")
    return [{
        "type": "place_card",
        "from": _with_id({k: origin.get(k) for k in ("name", "lat", "lon")}, origin) if origin else None,
        "note": result.get("note"),
        "places": [
            _with_id({
                key: p.get(key)
                for key in ("name", "category", "lat", "lon", "map_url", "distance_m", "walk_minutes_estimate", "hours")
            }, p)
            for p in places[:PLACE_CARD_LIMIT]
        ],
    }]


_PROPOSAL_KEYS = ("id", "status", "summary", "ops", "diff", "term", "base_revision", "created_at", "expires_at")
_SHORTLIST_KEYS = ("option_id", "id", "title", "why", "labels", "prereqs", "credits")


def _proposal_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """A Proposed-change card from ``plan_edit``: the proposal with its diff (2A, 6A).

    Planner errors (``unknown_course``, ``couldnt_verify_course``,
    ``revision_conflict``) carry ``error`` and never reach here: no card, the
    model replies in plain words.
    """
    proposal = result.get("proposal")
    if not isinstance(proposal, dict) or not proposal.get("id") or not isinstance(proposal.get("diff"), dict):
        return []
    return [{
        "type": "proposed_change",
        "proposal": {key: proposal.get(key) for key in _PROPOSAL_KEYS},
    }]


def _shortlist_specs(result: Dict[str, Any]) -> List[VisualSpec]:
    """A suggestion shortlist card from ``plan_suggest`` (19A), rows keyed by option id."""
    items = [i for i in result.get("items") or [] if i.get("id") and i.get("option_id")]
    if not items:
        return []
    return [{
        "type": "course_shortlist",
        "query": result.get("query") or "",
        # The term the items were checked for; the card's Choose adds them there (N2).
        "term": result.get("term"),
        "items": [{key: item.get(key) for key in _SHORTLIST_KEYS} for item in items],
    }]


# Cards hydrated from the course detail API: only for providers with course pages.
_COURSE_BUILDERS = {
    "course_grades": _grades_specs,
    "course_prerequisites": _prereq_specs,
    "course_next": _next_specs,
    "course_sections": _sections_specs,
    "course_search": _search_specs,
}
# Cards built entirely from the tool result: work for every school.
_SELF_CONTAINED_BUILDERS = {
    "events_search": _events_specs,
    "find_place": _place_specs,
    "plan_edit": _proposal_specs,
    "plan_suggest": _shortlist_specs,
}
_BUILDERS = {**_COURSE_BUILDERS, **_SELF_CONTAINED_BUILDERS}

# What the "Checked" line calls each domain.
DOMAIN_LABELS = {"academics": "Courses", "student_life": "Events", "campus": "Campus map", "planning": "Your plan"}


def sources_checked(tool_outputs: List[Dict[str, Any]]) -> Optional[VisualSpec]:
    """Which domains this answer looked at, in the order the tools ran."""
    from app.core.improved_orchestrator import DOMAIN_OF_TOOL

    domains: List[str] = []
    for entry in tool_outputs or []:
        domain = DOMAIN_OF_TOOL.get(entry.get("name") or "")
        if domain in DOMAIN_LABELS and domain not in domains:
            domains.append(domain)
    if not domains:
        return None
    return {
        "type": "sources_checked",
        "domains": [{"id": d, "label": DOMAIN_LABELS[d]} for d in domains],
    }


def build_visuals(tool_outputs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convert captured tool outputs into a list of visual specs.

    ``tool_outputs`` entries look like ``{"name": <tool>, "result": <dict>}``.
    Builders may return one spec, a list of specs, or ``None``. Entries whose
    tool has no mapping, that errored, or that produced no usable data are
    skipped.
    """
    visuals: List[Dict[str, Any]] = []
    # Providers without course detail pages (snapshots) have nothing to
    # hydrate course cards from; those cards would call another school's API.
    course_pages = academics.links_to_course_pages()
    for entry in tool_outputs or []:
        name = entry.get("name")
        result = entry.get("result")
        builder = _BUILDERS.get(name)
        if not builder or not isinstance(result, dict) or result.get("error"):
            continue
        if name in _COURSE_BUILDERS and (not course_pages or "data_as_of" in result):
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
