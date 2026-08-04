"""UW course tool data source backed by the UW Course Map public APIs.

Fetches from ``static.uwcourses.com`` and ``search.uwcourses.com``. Result
shapes match the previous tool contracts so ``build_visuals`` keeps working.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

from app.api.routes.courses import (
    course_reference_label,
    sanitize_course_identifier,
)

logger = logging.getLogger(__name__)

UPSTREAM_BASE = "https://static.uwcourses.com"
SEARCH_API_URL = "https://search.uwcourses.com/search"
DEFAULT_TTL_SECONDS = 15 * 60
MAX_CACHE_ITEMS = 256

_GPA_WEIGHTS = {
    "a": 4.0,
    "ab": 3.5,
    "b": 3.0,
    "bc": 2.5,
    "c": 2.0,
    "d": 1.0,
    "f": 0.0,
}


class _CacheEntry:
    __slots__ = ("value", "expires_at", "etag")

    def __init__(self, value: Any, expires_at: float, etag: Optional[str] = None):
        self.value = value
        self.expires_at = expires_at
        self.etag = etag


_cache: Dict[str, _CacheEntry] = {}
_cache_lock = asyncio.Lock()


def normalize_identifier(text: str) -> str:
    """Collapse whitespace in a course identifier, e.g. ``" comp sci  300 "``."""
    return " ".join((text or "").split()).upper()


def _cache_ttl(headers: httpx.Headers) -> int:
    cache_control = headers.get("cache-control", "")
    match = re.search(r"(?:s-maxage|max-age)=(\d+)", cache_control)
    return max(60, min(int(match.group(1)), 24 * 60 * 60)) if match else DEFAULT_TTL_SECONDS


async def _fetch_static_json(path: str, *, optional: bool = False) -> Any:
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
        raise RuntimeError(f"Course Map unavailable: {exc}") from exc

    if response.status_code == 304 and cached:
        cached.expires_at = now + _cache_ttl(response.headers)
        return cached.value
    if response.status_code == 404 and optional:
        return None
    if response.status_code == 404:
        raise FileNotFoundError(f"Course Map resource not found: {path}")
    if response.is_error:
        if optional:
            return None
        raise RuntimeError(f"Course Map error {response.status_code} for {path}")

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


def _display_identifier(subjects: List[Any], number: Any) -> str:
    cleaned = [str(s).strip() for s in (subjects or []) if str(s).strip()]
    return f"{'/'.join(cleaned)} {number}".strip()


def _course_key_from_identifier(identifier: str) -> str:
    return sanitize_course_identifier(normalize_identifier(identifier))


def _walk_prereq_refs(node: Any, found: List[Dict[str, Any]]) -> None:
    if isinstance(node, dict):
        if "course_number" in node and "subjects" in node:
            found.append(
                {
                    "identifier": _display_identifier(
                        node.get("subjects") or [], node.get("course_number")
                    ),
                    "title": "",
                }
            )
            return
        for value in node.values():
            _walk_prereq_refs(value, found)
    elif isinstance(node, list):
        for item in node:
            _walk_prereq_refs(item, found)


def _prereq_text_from_ast(node: Any) -> str:
    """Best-effort plain-text summary from Course Map prerequisite AST."""
    if node is None:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if "course_number" in node and "subjects" in node:
            return _display_identifier(node.get("subjects") or [], node.get("course_number"))
        children = node.get("children")
        if children is not None:
            parts = [_prereq_text_from_ast(child) for child in children]
            parts = [p for p in parts if p]
            joiner = f" {node.get('type', 'AND')} "
            return joiner.join(parts)
        return ""
    if isinstance(node, list):
        return " AND ".join(p for p in (_prereq_text_from_ast(x) for x in node) if p)
    return str(node)


def _compute_gpa(row: Dict[str, Any]) -> Optional[float]:
    weighted = 0.0
    graded = 0
    for bucket, weight in _GPA_WEIGHTS.items():
        count = row.get(bucket) or 0
        weighted += weight * count
        graded += count
    if graded == 0:
        return None
    return round(weighted / graded, 2)


def _summarize_grade_row(row: Dict[str, Any], term_code: Any) -> Dict[str, Any]:
    distribution = {bucket: (row.get(bucket) or 0) for bucket in _GPA_WEIGHTS}
    instructors = row.get("instructors") or ""
    if isinstance(instructors, list):
        instructors = ", ".join(str(item) for item in instructors if item)
    return {
        "term_code": term_code,
        "total": row.get("total") or 0,
        "distribution": distribution,
        "average_gpa": _compute_gpa(row),
        "instructors": instructors or "",
    }


async def _search_coursemap(
    subject: str, course_number: str, keyword: str, limit: int
) -> List[Dict[str, Any]]:
    parts = [p for p in (subject, course_number, keyword) if p]
    query_text = " ".join(parts).strip()
    if not query_text:
        return []

    # Direct subject+number resolve via CDN when both are present.
    if subject and course_number and not keyword:
        try:
            key = sanitize_course_identifier(f"{subject} {course_number}")
            course = await _fetch_static_json(f"/course/{quote(key, safe='_')}.json")
            ref = course.get("course_reference") or {}
            identifier = course_reference_label(ref) or _display_identifier(
                ref.get("subjects") or [subject], course_number
            )
            return [
                {
                    "identifier": identifier,
                    "subjects": "/".join(str(s) for s in (ref.get("subjects") or [])),
                    "number": str(ref.get("course_number") or course_number),
                    "title": course.get("course_title") or "",
                    "description": course.get("description") or "",
                    "prereq_text": _prereq_text_from_ast(
                        (course.get("prerequisites") or {}).get("abstract_syntax_tree")
                    ),
                }
            ]
        except (ValueError, FileNotFoundError, RuntimeError) as exc:
            logger.info("Course Map direct resolve failed (%s); falling back to search", exc)

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.post(SEARCH_API_URL, json={"query": query_text})
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise RuntimeError(f"Course Map search failed: {exc}") from exc

    hits = payload.get("courses") or []
    subject_token = subject.replace(" ", "").upper() if subject else ""
    number_token = course_number.strip() if course_number else ""

    rows: List[Dict[str, Any]] = []
    for hit in hits:
        subjects = hit.get("subjects") or []
        number = hit.get("course_number")
        if subject_token:
            joined = "".join(str(s) for s in subjects).upper().replace(" ", "")
            if subject_token not in joined:
                continue
        if number_token and str(number) != number_token:
            continue
        identifier = _display_identifier(subjects, number)
        rows.append(
            {
                "identifier": identifier,
                "subjects": "/".join(str(s) for s in subjects),
                "number": str(number) if number is not None else "",
                "title": hit.get("course_title") or "",
                "description": "",
                "prereq_text": "",
            }
        )
        if len(rows) >= limit:
            break

    # Hydrate description for a small top slice so chat answers stay useful.
    hydrate_n = min(len(rows), 5)
    for index in range(hydrate_n):
        try:
            key = sanitize_course_identifier(rows[index]["identifier"])
            course = await _fetch_static_json(
                f"/course/{quote(key, safe='_')}.json", optional=True
            )
            if not course:
                continue
            rows[index]["description"] = course.get("description") or ""
            rows[index]["prereq_text"] = _prereq_text_from_ast(
                (course.get("prerequisites") or {}).get("abstract_syntax_tree")
            )
            title = course.get("course_title")
            if title:
                rows[index]["title"] = title
        except Exception as exc:  # noqa: BLE001 — keep search results even if hydrate fails
            logger.debug("Failed to hydrate search hit: %s", exc)

    return rows


async def _grades_coursemap(identifier: str) -> Tuple[str, Optional[Dict], List[Dict]]:
    key = _course_key_from_identifier(identifier)
    course = await _fetch_static_json(f"/course/{quote(key, safe='_')}.json")
    ref = course.get("course_reference") or {}
    display = course_reference_label(ref) or normalize_identifier(identifier)

    cumulative_raw = course.get("cumulative_grade_data") or {}
    cumulative = (
        _summarize_grade_row(cumulative_raw, "cumulative") if cumulative_raw else None
    )

    terms: List[Dict[str, Any]] = []
    term_data = course.get("term_data") or {}
    for code in sorted(term_data.keys(), reverse=True):
        grade_data = (term_data[code] or {}).get("grade_data") or {}
        if not grade_data:
            continue
        terms.append(_summarize_grade_row(grade_data, str(code)))

    return display, cumulative, terms


async def _prerequisites_coursemap(identifier: str) -> Dict[str, Any]:
    key = _course_key_from_identifier(identifier)
    course = await _fetch_static_json(f"/course/{quote(key, safe='_')}.json")
    ref = course.get("course_reference") or {}
    display = course_reference_label(ref) or normalize_identifier(identifier)
    ast = (course.get("prerequisites") or {}).get("abstract_syntax_tree")
    prereqs: List[Dict[str, Any]] = []
    _walk_prereq_refs(ast, prereqs)
    seen = set()
    unique: List[Dict[str, Any]] = []
    for item in prereqs:
        token = item["identifier"]
        if token in seen:
            continue
        seen.add(token)
        unique.append(item)

    return {
        "identifier": display,
        "title": course.get("course_title") or "",
        "prereq_text": _prereq_text_from_ast(ast),
        "prerequisites": unique,
    }


_NEXT_NOTE = (
    "Listed courses include this course in their prerequisite expression; "
    "they may still require additional courses."
)


async def _next_courses_coursemap(
    identifier: str, limit: int
) -> Dict[str, Any]:
    """Courses that list ``identifier`` as a prerequisite (Course Map ``satisfies``)."""
    key = _course_key_from_identifier(identifier)
    course = await _fetch_static_json(f"/course/{quote(key, safe='_')}.json")
    ref = course.get("course_reference") or {}
    display = course_reference_label(ref) or normalize_identifier(identifier)

    refs = course.get("satisfies") or []
    seen = set()
    next_courses: List[Dict[str, Any]] = []
    for item in refs:
        if not isinstance(item, dict):
            continue
        label = course_reference_label(item) or _display_identifier(
            item.get("subjects") or [], item.get("course_number")
        )
        if not label or label in seen:
            continue
        seen.add(label)
        next_courses.append({"identifier": label, "title": ""})

    total = len(next_courses)
    truncated = total > limit
    next_courses = next_courses[:limit]

    # Hydrate titles for a small top slice so chat answers stay useful.
    hydrate_n = min(len(next_courses), 10)
    for index in range(hydrate_n):
        try:
            next_key = sanitize_course_identifier(next_courses[index]["identifier"])
            details = await _fetch_static_json(
                f"/course/{quote(next_key, safe='_')}.json", optional=True
            )
            if not details:
                continue
            title = details.get("course_title")
            if title:
                next_courses[index]["title"] = title
        except Exception as exc:  # noqa: BLE001 — keep list even if hydrate fails
            logger.debug("Failed to hydrate next-course title: %s", exc)

    return {
        "identifier": display,
        "title": course.get("course_title") or "",
        "next_courses": next_courses,
        "total_results": total,
        "truncated": truncated,
    }


def _meeting_to_section(meeting: Dict[str, Any], term_label: str) -> Dict[str, Any]:
    location = meeting.get("location") or {}
    enrolled = meeting.get("current_enrollment") or 0
    capacity = location.get("capacity") or 0
    instructors = meeting.get("instructors") or []
    if isinstance(instructors, list):
        instructors_text = ", ".join(str(i) for i in instructors if i)
    else:
        instructors_text = str(instructors or "")
    name = meeting.get("name") or ""
    return {
        "term": term_label,
        "section": name,
        "type": meeting.get("type") or "",
        "instructors": instructors_text,
        "current_enrolled": enrolled,
        "capacity": capacity,
        "seats_available": max(capacity - enrolled, 0) if capacity else 0,
        "is_open": capacity > enrolled if capacity else True,
    }


async def _sections_coursemap(
    identifier: str, term: str, limit: int
) -> Tuple[str, List[Dict[str, Any]]]:
    key = _course_key_from_identifier(identifier)
    terms_map, course, meetings = await asyncio.gather(
        _fetch_static_json("/terms.json", optional=True),
        _fetch_static_json(f"/course/{quote(key, safe='_')}.json"),
        _fetch_static_json(f"/course/{quote(key, safe='_')}/meetings.json", optional=True),
    )
    terms_map = terms_map or {}
    ref = course.get("course_reference") or {}
    display = course_reference_label(ref) or normalize_identifier(identifier)

    rows: List[Dict[str, Any]] = []
    term_filter = (term or "").strip().lower()

    if meetings:
        term_codes = sorted((course.get("term_data") or {}).keys(), reverse=True)
        latest = term_codes[0] if term_codes else ""
        term_label = terms_map.get(latest) or latest or "Current"
        if term_filter and term_filter not in term_label.lower() and term_filter != str(latest).lower():
            meetings = []
        else:
            for meeting in meetings:
                rows.append(_meeting_to_section(meeting, term_label))
                if len(rows) >= limit:
                    return display, rows

    if rows:
        return display, rows

    # Fallback: synthesize section-like rows from enrollment / grade instructors.
    term_data = course.get("term_data") or {}
    for code in sorted(term_data.keys(), reverse=True):
        label = terms_map.get(code) or str(code)
        if term_filter and term_filter not in label.lower() and term_filter != str(code).lower():
            continue
        data = term_data[code] or {}
        enrollment = data.get("enrollment_data") or {}
        instructors_map = enrollment.get("instructors") or {}
        grade_instructors = (data.get("grade_data") or {}).get("instructors") or []
        names = list(instructors_map.keys()) or list(grade_instructors)
        if not names:
            continue
        rows.append(
            {
                "term": label,
                "section": "ALL",
                "type": "CLASS",
                "instructors": ", ".join(str(n) for n in names if n),
                "current_enrolled": 0,
                "capacity": 0,
                "seats_available": 0,
                "is_open": True,
            }
        )
        if len(rows) >= limit:
            break

    return display, rows


def _to_section(row: Dict[str, Any]) -> Dict[str, Any]:
    enrolled = row.get("current_enrolled") or 0
    capacity = row.get("capacity") or 0
    return {
        "term": row.get("term_description") or row.get("term_code") or row.get("term"),
        "section": row.get("section"),
        "type": row.get("type"),
        "instructors": row.get("instructors") or "",
        "current_enrolled": enrolled,
        "capacity": capacity,
        "seats_available": max(capacity - enrolled, 0),
        "is_open": capacity > enrolled if capacity else bool(row.get("is_open", True)),
    }


async def search_courses(
    *,
    tool_name: str = "",
    subject: str = "",
    course_number: str = "",
    keyword: str = "",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    del tool_name  # kept for call-site compatibility
    return await _search_coursemap(subject, course_number, keyword, limit)


async def course_grades(
    *, tool_name: str = "", course_identifier: str
) -> Dict[str, Any]:
    del tool_name
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier}

    try:
        display, cumulative, terms = await _grades_coursemap(identifier)
    except FileNotFoundError:
        return {
            "grades": None,
            "error": f"No grade data found for '{identifier}'.",
            "query": query_meta,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("coursemap grades failed: %s", exc)
        return {"grades": None, "error": str(exc), "query": query_meta}

    if not cumulative and not terms:
        return {
            "grades": None,
            "error": f"No grade data found for '{identifier}'.",
            "query": query_meta,
        }
    return {
        "course_identifier": display,
        "cumulative": cumulative,
        "terms": terms,
        "query": query_meta,
    }


async def prerequisites(
    *, tool_name: str = "", course_identifier: str
) -> Dict[str, Any]:
    del tool_name
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier}

    try:
        course = await _prerequisites_coursemap(identifier)
    except FileNotFoundError:
        return {
            "course": None,
            "error": f"No course found for '{identifier}'.",
            "query": query_meta,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("coursemap prerequisites failed: %s", exc)
        return {"course": None, "error": str(exc), "query": query_meta}

    prereqs = course.get("prerequisites") or []
    return {
        "course_identifier": course["identifier"],
        "title": course.get("title", ""),
        "prereq_text": course.get("prereq_text", "") or "",
        "prerequisites": prereqs,
        "has_prerequisites": bool(
            (course.get("prereq_text") or "").strip() or prereqs
        ),
        "query": query_meta,
    }


async def next_courses(
    *, tool_name: str = "", course_identifier: str, limit: int = 40
) -> Dict[str, Any]:
    del tool_name
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier}

    try:
        course = await _next_courses_coursemap(identifier, limit)
    except FileNotFoundError:
        return {
            "course": None,
            "error": f"No course found for '{identifier}'.",
            "query": query_meta,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("coursemap next_courses failed: %s", exc)
        return {"course": None, "error": str(exc), "query": query_meta}

    rows = course.get("next_courses") or []
    return {
        "course_identifier": course["identifier"],
        "title": course.get("title", ""),
        "next_courses": rows,
        "total_results": course.get("total_results", len(rows)),
        "truncated": bool(course.get("truncated")),
        "has_next_courses": bool(rows),
        "note": _NEXT_NOTE,
        "query": query_meta,
    }


async def course_sections(
    *,
    tool_name: str = "",
    course_identifier: str,
    term: str = "",
    limit: int = 25,
) -> Dict[str, Any]:
    del tool_name
    identifier = normalize_identifier(course_identifier)
    query_meta = {"course_identifier": identifier, "term": term or None}

    try:
        display, rows = await _sections_coursemap(identifier, term, limit + 1)
    except FileNotFoundError:
        return {
            "sections": [],
            "error": f"No sections found for '{identifier}'.",
            "query": query_meta,
        }
    except Exception as exc:  # noqa: BLE001
        logger.error("coursemap sections failed: %s", exc)
        return {"sections": [], "error": str(exc), "query": query_meta}

    if not rows:
        return {
            "sections": [],
            "error": f"No sections found for '{identifier}'.",
            "query": query_meta,
        }

    truncated = len(rows) > limit
    rows = rows[:limit]
    return {
        "course_identifier": display,
        "sections": [_to_section(r) for r in rows],
        "total_results": len(rows),
        "truncated": truncated,
        "query": query_meta,
    }
