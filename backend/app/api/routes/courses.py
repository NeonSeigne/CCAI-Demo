"""Authenticated UW course-detail API.

This is a clean-room adapter over the public UW Course Map static API. The
payload contract and fetch sequence were researched from:
https://github.com/twangodev/uw-coursemap/blob/main/src/routes/courses/%5BcourseIdentifier%5D/+page.ts

No AGPL-licensed UI source is copied into this project.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_active_user
from app.models.user import User

router = APIRouter(prefix="/courses", tags=["courses"])

UPSTREAM_BASE = "https://static.uwcourses.com"
DEFAULT_TTL_SECONDS = 15 * 60
MAX_CACHE_ITEMS = 256
MAX_HYDRATED_INSTRUCTORS = 24
MAX_HYDRATED_SIMILAR = 12
_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 /&-]{1,80}$")


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float
    etag: Optional[str] = None


_cache: Dict[str, _CacheEntry] = {}
_cache_lock = asyncio.Lock()


def sanitize_course_identifier(identifier: str) -> str:
    """Convert a displayed course identifier (``COMP SCI 300``) to a CDN key."""
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


def course_reference_key(reference: Dict[str, Any]) -> str:
    subjects = reference.get("subjects") or []
    number = reference.get("course_number")
    if not subjects or number is None:
        raise ValueError("Invalid course reference")
    cleaned = [re.sub(r"[^A-Za-z0-9]", "", str(subject)).upper() for subject in subjects]
    return "_".join([*filter(None, cleaned), str(number).upper()])


def course_reference_label(reference: Dict[str, Any]) -> str:
    subjects = reference.get("subjects") or []
    number = reference.get("course_number", "")
    return f"{'/'.join(str(subject) for subject in subjects)} {number}".strip()


def sanitize_instructor_id(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", name.strip()).strip("_").upper()


def _cache_ttl(headers: httpx.Headers) -> int:
    cache_control = headers.get("cache-control", "")
    match = re.search(r"(?:s-maxage|max-age)=(\d+)", cache_control)
    return max(60, min(int(match.group(1)), 24 * 60 * 60)) if match else DEFAULT_TTL_SECONDS


async def _fetch_json(path: str, *, optional: bool = False) -> Any:
    """Fetch one fixed-origin JSON resource with bounded ETag-aware caching."""
    now = time.monotonic()
    async with _cache_lock:
        cached = _cache.get(path)
        if cached and cached.expires_at > now:
            return cached.value
        etag = cached.etag if cached else None

    headers = {"If-None-Match": etag} if etag else {}
    try:
        async with httpx.AsyncClient(base_url=UPSTREAM_BASE, timeout=12.0) as client:
            response = await client.get(path, headers=headers)
    except httpx.RequestError as exc:
        if optional:
            return None
        raise HTTPException(status_code=502, detail="Course data service is unavailable") from exc

    if response.status_code == 304 and cached:
        cached.expires_at = now + _cache_ttl(response.headers)
        return cached.value
    if response.status_code == 404 and optional:
        return None
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="Course not found")
    if response.is_error:
        if optional:
            return None
        raise HTTPException(status_code=502, detail="Course data service returned an error")

    value = response.json()
    entry = _CacheEntry(
        value=value,
        expires_at=now + _cache_ttl(response.headers),
        etag=response.headers.get("etag"),
    )
    async with _cache_lock:
        if len(_cache) >= MAX_CACHE_ITEMS:
            oldest = min(_cache, key=lambda key: _cache[key].expires_at)
            _cache.pop(oldest, None)
        _cache[path] = entry
    return value


def _select_term(course: Dict[str, Any], requested_term: Optional[str]) -> Optional[str]:
    term_data = course.get("term_data") or {}
    if requested_term and requested_term in term_data:
        return requested_term
    graded_terms = [
        code for code, data in term_data.items() if (data or {}).get("grade_data")
    ]
    available = graded_terms or list(term_data)
    return max(available, key=lambda code: int(code)) if available else None


def _latest_enrollment(course: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    term_data = course.get("term_data") or {}
    for code in sorted(term_data, key=lambda item: int(item), reverse=True):
        enrollment = (term_data[code] or {}).get("enrollment_data")
        if enrollment:
            return enrollment
    return None


async def _optional(path: str) -> Any:
    return await _fetch_json(path, optional=True)


async def _build_course_payload(course_key: str, requested_term: Optional[str]) -> Dict[str, Any]:
    terms, course = await asyncio.gather(
        _fetch_json("/terms.json"),
        _fetch_json(f"/course/{quote(course_key, safe='_')}.json"),
    )
    selected_term = _select_term(course, requested_term)
    selected_data = (course.get("term_data") or {}).get(selected_term, {}) if selected_term else {}
    enrollment = selected_data.get("enrollment_data") or _latest_enrollment(course) or {}
    instructor_names = list(dict.fromkeys(
        (selected_data.get("grade_data") or {}).get("instructors") or
        list((enrollment.get("instructors") or {}).keys())
    ))[:MAX_HYDRATED_INSTRUCTORS]
    similar_refs = (course.get("similar_courses") or [])[:MAX_HYDRATED_SIMILAR]

    subject = ((course.get("course_reference") or {}).get("subjects") or [""])[0]
    subject_key = re.sub(r"[^A-Za-z0-9]", "", str(subject)).upper()
    base_tasks = [
        _optional(f"/graphs/course/{quote(course_key, safe='_')}.json"),
        _optional(f"/styles/{quote(subject_key)}.json"),
        _optional(f"/course/{quote(course_key, safe='_')}/meetings.json"),
    ]
    instructor_tasks = [
        _optional(f"/instructors/{quote(sanitize_instructor_id(name), safe='_')}.json")
        for name in instructor_names
    ]
    similar_tasks = [
        _optional(f"/course/{quote(course_reference_key(ref), safe='_')}.json")
        for ref in similar_refs
    ]
    results = await asyncio.gather(*base_tasks, *instructor_tasks, *similar_tasks)
    graph, graph_styles, meetings = results[:3]
    instructor_results = results[3:3 + len(instructor_tasks)]
    similar_results = results[3 + len(instructor_tasks):]

    instructors: List[Dict[str, Any]] = []
    emails = enrollment.get("instructors") or {}
    for name, details in zip(instructor_names, instructor_results):
        item = details or {"name": name}
        item.setdefault("email", emails.get(name))
        instructors.append(item)
    instructors.sort(
        key=lambda item: ((item.get("rmp_data") or {}).get("average_rating") is not None,
                          (item.get("rmp_data") or {}).get("average_rating") or 0),
        reverse=True,
    )

    similar_courses = []
    for reference, details in zip(similar_refs, similar_results):
        if details:
            similar_courses.append(details)
        else:
            similar_courses.append({
                "course_reference": reference,
                "course_title": course_reference_label(reference),
            })

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
        "enrollment": enrollment,
        "instructors": instructors,
        "similar_courses": similar_courses,
        "prerequisite_graph": graph or [],
        "graph_styles": graph_styles or [],
        "meetings": meetings or [],
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
