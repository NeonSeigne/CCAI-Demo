"""Authenticated UW course-detail API.

Serves the course detail page from the live UW Course Map API through
``app.tools._uw_source`` (the same client and cache the chat course tools
use). The old ``static.uwcourses.com`` host no longer resolves, so the live
course record is mapped into the payload shape the page already reads.

No AGPL-licensed UI source is copied into this project.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_active_user
from app.models.user import User
from app.tools import _uw_source

router = APIRouter(prefix="/courses", tags=["courses"])

MAX_HYDRATED_INSTRUCTORS = 24
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 /&-]{1,80}$")


def sanitize_course_identifier(identifier: str) -> str:
    """Convert a displayed course identifier (``COMP SCI 300``) to a lookup key."""
    value = " ".join(identifier.strip().split())
    if not _IDENTIFIER_RE.fullmatch(value):
        raise ValueError("Invalid course identifier")

    match = re.fullmatch(r"(.+?)\s*(\d+[A-Za-z]?)", value)
    if not match:
        raise ValueError("Course identifier must end with a course number")

    subjects, number = match.groups()
    subject_parts = [
        re.sub(r"[^A-Za-z0-9]", "", part).upper()
        for part in re.split(r"[/&]", subjects)
    ]
    subject_parts = [part for part in subject_parts if part]
    if not subject_parts:
        raise ValueError("Course identifier must include a subject")
    return "_".join([*subject_parts, number.upper()])


_GRADE_BUCKETS = ("a", "ab", "b", "bc", "c", "d", "f")


def _reference(subjects: List[Any], number: Any) -> Dict[str, Any]:
    return {"subjects": [str(s) for s in subjects or []], "course_number": number}


def _reference_from_code(code: str) -> Optional[Dict[str, Any]]:
    subjects, number = _uw_source._split_identifier(code)
    if not subjects or not number:
        return None
    return _reference(subjects, int(number) if number.isdigit() else number)


def _grade_data(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    totals = {bucket: sum(row.get(bucket) or 0 for row in rows) for bucket in _GRADE_BUCKETS}
    totals["total"] = sum(row.get("total") or 0 for row in rows)
    names = [name for row in rows for name in (row.get("instructors") or [])]
    totals["instructors"] = list(dict.fromkeys(names)) or None
    return totals


def _instructor(item: Dict[str, Any]) -> Dict[str, Any]:
    ratings = item.get("ratings") or {}
    rmp = None
    if ratings:
        rmp = {
            "average_rating": ratings.get("quality"),
            "average_difficulty": ratings.get("difficulty"),
            "num_ratings": ratings.get("review_count"),
            "ratings": [],
        }
    return {
        "name": _uw_source._title_case(item.get("name") or ""),
        "email": (item.get("email") or "").lower() or None,
        "rmp_data": rmp,
    }


def _meeting(section: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": f"{section.get('section_type') or ''} {section.get('section_number') or ''}".strip(),
        "type": "CLASS",
        # Course Map lists instructors per course, not per section.
        "instructors": [],
        "current_enrollment": section.get("enrolled") or 0,
        "location": {"capacity": section.get("capacity")},
        "start_time": None,
        "end_time": None,
    }


def _build_course(data: Dict[str, Any]) -> Dict[str, Any]:
    """Map a live Course Map record to the course detail page's shape."""
    course = data["course"]
    grades = course.get("grades") or []
    term_data: Dict[str, Dict[str, Any]] = {}
    for row in grades:
        term = str(row.get("term_id") or "")
        if term:
            term_data.setdefault(term, {})["grade_data"] = _grade_data([row])
    for section in course.get("sections") or []:
        term = str(section.get("term_id") or "")
        if term:
            term_data.setdefault(term, {})
    instructors = course.get("instructors") or []
    emails = {
        _uw_source._title_case(i.get("name") or ""): (i.get("email") or "").lower()
        for i in instructors if i.get("name")
    }
    for term, entry in term_data.items():
        entry.setdefault("enrollment_data", {"instructors": emails})

    prerequisite_refs = []
    for node in (course.get("requirements") or {}).get("nodes") or []:
        ref = node.get("course") if isinstance(node, dict) else None
        if ref:
            prerequisite_refs.append(_reference(ref.get("subjects"), ref.get("course_number")))
    satisfies = [
        ref for ref in (_reference_from_code(item.get("code") or "") for item in data.get("following") or [])
        if ref
    ]
    return {
        "course_reference": _reference(course.get("subjects"), course.get("course_number")),
        "course_title": course.get("title") or "",
        "description": course.get("description") or course.get("llm_summary") or "",
        "prerequisites": {
            "course_references": prerequisite_refs,
            "linked_requisite_text": [course.get("requirements_text") or ""],
        },
        "satisfies": satisfies,
        "cumulative_grade_data": _grade_data(grades) if grades else None,
        "term_data": term_data,
    }


def _select_term(term_data: Dict[str, Any], requested_term: Optional[str]) -> Optional[str]:
    if requested_term and requested_term in term_data:
        return requested_term
    graded = [code for code, entry in term_data.items() if (entry or {}).get("grade_data")]
    available = graded or list(term_data)
    return max(available, key=int) if available else None


async def _build_course_payload(course_key: str, requested_term: Optional[str]) -> Dict[str, Any]:
    try:
        data = await _uw_source._get_course(course_key.replace("_", " "))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Course not found") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail="Course data is unavailable right now") from exc

    course = _build_course(data)
    raw = data["course"]
    term_data = course["term_data"]
    terms = {code: _uw_source.term_label(code) for code in term_data}
    for row in raw.get("grades") or []:
        if row.get("term_id") and row.get("term_name"):
            terms[str(row["term_id"])] = row["term_name"]
    selected_term = _select_term(term_data, requested_term)

    instructors = [_instructor(item) for item in raw.get("instructors") or []]
    instructors.sort(
        key=lambda item: ((item.get("rmp_data") or {}).get("average_rating") is not None,
                          (item.get("rmp_data") or {}).get("average_rating") or 0),
        reverse=True,
    )
    sections = raw.get("sections") or []
    section_terms = {str(section.get("term_id")) for section in sections if section.get("term_id")}
    # Grades lag a term behind schedules; show the newest schedule when the
    # selected term has none.
    meeting_term = selected_term if selected_term in section_terms else (
        max(section_terms, key=int) if section_terms else None
    )
    meetings = [
        _meeting(section)
        for section in sections
        if str(section.get("term_id")) == meeting_term
    ]

    return {
        "source": {
            "name": "UW Course Map",
            "url": "https://uwcourses.com",
            "repository": "https://github.com/twangodev/uw-coursemap",
        },
        "course_key": course_key,
        "course": course,
        "terms": terms,
        "selected_term": selected_term,
        "selected_term_label": terms.get(selected_term) if selected_term else None,
        "enrollment": (term_data.get(selected_term) or {}).get("enrollment_data") or {},
        "instructors": instructors[:MAX_HYDRATED_INSTRUCTORS],
        "similar_courses": [],
        "prerequisite_graph": [],
        "graph_styles": [],
        "meetings": meetings,
    }


@router.get("/{course_identifier:path}")
async def get_course_detail(
    course_identifier: str,
    term: Optional[str] = Query(default=None, pattern=r"^\d{3,5}$"),
    _current_user: User = Depends(get_current_active_user),
) -> Dict[str, Any]:
    try:
        course_key = sanitize_course_identifier(course_identifier)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _build_course_payload(course_key, term)
