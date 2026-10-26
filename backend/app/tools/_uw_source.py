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

logger = logging.getLogger(__name__)


# Course Map moved its public data to uwcourses.com in 2026 (the old
# static./search. subdomains no longer resolve). Outputs below keep the
# original tool contracts so build_visuals and prompts are unchanged.
UPSTREAM_BASE = "https://uwcourses.com"
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

_TERM_SEASONS = {"2": "Fall", "4": "Spring", "6": "Summer"}


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, expires_at: float):
        self.value = value
        self.expires_at = expires_at


_cache: Dict[str, _CacheEntry] = {}
_cache_lock = asyncio.Lock()


def normalize_identifier(text: str) -> str:
    """Collapse whitespace in a course identifier, e.g. ``" comp sci  300 "``."""
    return " ".join((text or "").split()).upper()


def term_label(term_id: Any) -> str:
    """UW term code to a label, e.g. ``1272`` -> ``Fall 2026``."""
    code = str(term_id or "")
    if len(code) != 4 or not code.isdigit():
        return code
    season = _TERM_SEASONS.get(code[3], "")
    start_year = 2000 + int(code[1:3]) - 1
    year = start_year if season == "Fall" else start_year + 1
    return f"{season} {year}".strip()


async def _fetch_json(path: str, *, params: Optional[Dict[str, Any]] = None, optional: bool = False) -> Any:
    key = path + ("?" + "&".join(f"{k}={v}" for k, v in sorted(params.items())) if params else "")
    now = time.monotonic()
    async with _cache_lock:
        cached = _cache.get(key)
        if cached and cached.expires_at > now:
            return cached.value
    try:
        async with httpx.AsyncClient(base_url=UPSTREAM_BASE, timeout=15.0, follow_redirects=True) as client:
            response = await client.get(path, params=params)
    except httpx.RequestError as exc:
        if optional:
            return None
        raise RuntimeError(f"Course Map unavailable: {exc}") from exc
    if response.status_code == 404:
        if optional:
            return None
        raise FileNotFoundError(f"Course Map resource not found: {path}")
    if response.is_error:
        if optional:
            return None
        raise RuntimeError(f"Course Map error {response.status_code} for {path}")
    value = response.json()
    async with _cache_lock:
        if len(_cache) >= MAX_CACHE_ITEMS:
            oldest = min(_cache, key=lambda k: _cache[k].expires_at)
            _cache.pop(oldest, None)
        _cache[key] = _CacheEntry(value, now + DEFAULT_TTL_SECONDS)
    return value


def _split_identifier(identifier: str) -> Tuple[List[str], str]:
    """``"COMP SCI 400"`` -> (["COMPSCI"], "400"); handles cross-listed ``A/B 576``."""
    text = normalize_identifier(identifier).replace("_", " ")
    match = re.match(r"^(.*?)\s*(\d{2,4}[A-Z]?)$", text)
    if not match:
        return [], ""
    subject_part, number = match.group(1), match.group(2)
    subjects = [s.replace(" ", "").replace("&", "") for s in subject_part.split("/") if s.strip()]
    return subjects, number


async def _search_items(query: str) -> List[Dict[str, Any]]:
    payload = await _fetch_json("/search.json", params={"q": query[:200]}, optional=True)
    results = ((payload or {}).get("data") or {}).get("results") or {}
    return results.get("items") or []


async def _get_course(identifier: str) -> Dict[str, Any]:
    """Resolve an identifier to the Course Map course payload (``data`` object)."""
    subjects, number = _split_identifier(identifier)
    for subject in subjects:
        page = await _fetch_json(f"/courses/{quote(subject)}_{number}.json", optional=True)
        if page and (page.get("data") or {}).get("course"):
            return page["data"]
    # Fall back to search when the code isn't canonical (e.g. "E C E 252").
    items = await _search_items(normalize_identifier(identifier))
    for item in items:
        subs, num = _split_identifier(item.get("course_id") or "")
        if number and num != number:
            continue
        for subject in subs:
            page = await _fetch_json(f"/courses/{quote(subject)}_{num}.json", optional=True)
            if page and (page.get("data") or {}).get("course"):
                return page["data"]
    raise FileNotFoundError(f"No course found for '{identifier}'")


def _display_identifier(subjects: List[Any], number: Any) -> str:
    cleaned = [str(s).strip() for s in (subjects or []) if str(s).strip()]
    return f"{'/'.join(cleaned)} {number}".strip()


def _course_display(course: Dict[str, Any]) -> str:
    return course.get("course_id") or _display_identifier(course.get("subjects") or [], course.get("course_number"))


def _title_case(title: str) -> str:
    return title.title() if title and title.isupper() else (title or "")


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


def _requirement_courses(requirements: Dict[str, Any]) -> List[Dict[str, Any]]:
    found: List[Dict[str, Any]] = []
    seen = set()
    for node in (requirements or {}).get("nodes") or []:
        course = node.get("course") if isinstance(node, dict) else None
        if not course:
            continue
        label = _display_identifier(course.get("subjects") or [], course.get("course_number"))
        if label and label not in seen:
            seen.add(label)
            found.append({"identifier": label, "title": ""})
    return found


async def _search_coursemap(
    subject: str, course_number: str, keyword: str, limit: int
) -> List[Dict[str, Any]]:
    parts = [p for p in (subject, course_number, keyword) if p]
    query_text = " ".join(parts).strip()
    if not query_text:
        return []

    if subject and course_number and not keyword:
        try:
            data = await _get_course(f"{subject} {course_number}")
            course = data["course"]
            return [
                {
                    "identifier": _course_display(course),
                    "subjects": "/".join(str(s) for s in (course.get("subjects") or [])),
                    "number": str(course.get("course_number") or course_number),
                    "title": _title_case(course.get("title") or ""),
                    "description": course.get("description") or course.get("llm_summary") or "",
                    "prereq_text": course.get("requirements_text") or "",
                }
            ]
        except (FileNotFoundError, RuntimeError) as exc:
            logger.info("Course Map direct resolve failed (%s); falling back to search", exc)

    try:
        items = await _search_items(query_text)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Course Map search failed: {exc}") from exc

    subject_token = subject.replace(" ", "").upper() if subject else ""
    number_token = course_number.strip() if course_number else ""
    rows: List[Dict[str, Any]] = []
    for item in items:
        subs, num = _split_identifier(item.get("course_id") or "")
        if subject_token and subject_token not in "".join(subs):
            continue
        if number_token and num != number_token:
            continue
        rows.append(
            {
                "identifier": item.get("course_id") or "",
                "subjects": "/".join(subs),
                "number": num,
                "title": _title_case(item.get("title") or ""),
                "description": "",
                "prereq_text": "",
                "average_gpa": round(item["gpa"], 2) if isinstance(item.get("gpa"), (int, float)) else None,
            }
        )
        if len(rows) >= limit:
            break

    for row in rows[:5]:
        try:
            data = await _get_course(row["identifier"])
            course = data["course"]
            row["description"] = course.get("description") or course.get("llm_summary") or ""
            row["prereq_text"] = course.get("requirements_text") or ""
        except Exception as exc:  # noqa: BLE001 — keep search results even if hydrate fails
            logger.debug("Failed to hydrate search hit: %s", exc)
    return rows


async def _grades_coursemap(identifier: str) -> Tuple[str, Optional[Dict], List[Dict]]:
    data = await _get_course(identifier)
    course = data["course"]
    display = _course_display(course)
    rows = course.get("grades") or []
    if not rows and course.get("course_uid"):
        page = await _fetch_json(f"/api/courses/{course['course_uid']}/grades", optional=True)
        rows = (page or {}).get("items") or []
    terms: List[Dict[str, Any]] = []
    totals: Dict[str, Any] = {bucket: 0 for bucket in _GPA_WEIGHTS}
    totals["total"] = 0
    for row in sorted(rows, key=lambda r: str(r.get("term_id") or ""), reverse=True):
        label = row.get("term_name") or term_label(row.get("term_id"))
        terms.append(_summarize_grade_row(row, label))
        for bucket in _GPA_WEIGHTS:
            totals[bucket] += row.get(bucket) or 0
        totals["total"] += row.get("total") or 0
    cumulative = _summarize_grade_row(totals, "cumulative") if totals["total"] else None
    return display, cumulative, terms


async def _prerequisites_coursemap(identifier: str) -> Dict[str, Any]:
    data = await _get_course(identifier)
    course = data["course"]
    return {
        "identifier": _course_display(course),
        "title": _title_case(course.get("title") or ""),
        "prereq_text": course.get("requirements_text") or "",
        "prerequisites": _requirement_courses(course.get("requirements") or {}),
    }


_NEXT_NOTE = (
    "Listed courses include this course in their prerequisite expression; "
    "they may still require additional courses."
)


async def _next_courses_coursemap(identifier: str, limit: int) -> Dict[str, Any]:
    """Courses that list ``identifier`` as a prerequisite (Course Map ``following``)."""
    data = await _get_course(identifier)
    course = data["course"]
    following = data.get("following") or []
    next_courses = [
        {"identifier": item.get("code") or "", "title": _title_case(item.get("title") or "")}
        for item in following
        if isinstance(item, dict) and item.get("code")
    ]
    total = len(next_courses)
    return {
        "identifier": _course_display(course),
        "title": _title_case(course.get("title") or ""),
        "next_courses": next_courses[:limit],
        "total_results": total,
        "truncated": total > limit,
    }


async def _sections_coursemap(
    identifier: str, term: str, limit: int
) -> Tuple[str, List[Dict[str, Any]]]:
    data = await _get_course(identifier)
    course = data["course"]
    display = _course_display(course)
    instructors = ", ".join(
        _title_case(i.get("name") or "") for i in (course.get("instructors") or []) if i.get("name")
    )
    term_filter = (term or "").strip().lower()
    rows: List[Dict[str, Any]] = []
    for section in course.get("sections") or []:
        label = term_label(section.get("term_id"))
        if term_filter and term_filter not in label.lower() and term_filter != str(section.get("term_id")):
            continue
        rows.append(
            {
                "term": label,
                "section": section.get("section_number") or "",
                "type": section.get("section_type") or "",
                "instructors": instructors,
                "current_enrolled": section.get("enrolled") or 0,
                "capacity": section.get("capacity") or 0,
            }
        )
        if len(rows) >= limit:
            break
    return display, rows


def _to_section(row: Dict[str, Any]) -> Dict[str, Any]:
    enrolled = row.get("current_enrolled") or 0
    capacity = row.get("capacity") or 0
    return {
        "term": row.get("term"),
        "section": row.get("section"),
        "type": row.get("type"),
        "instructors": row.get("instructors") or "",
        "current_enrolled": enrolled,
        "capacity": capacity,
        "seats_available": max(capacity - enrolled, 0),
        "is_open": capacity > enrolled if capacity else True,
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
