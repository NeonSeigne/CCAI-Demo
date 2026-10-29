"""UW course tool data source backed by the UW Course Map public APIs.

Fetches from ``uwcourses.com`` (``/courses/*.json``, ``/search.json`` and
``/api/courses/*/grades``). Result shapes match the previous tool contracts so
``build_visuals`` keeps working.
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

from app.planner.facts import CourseFacts, PrereqNode, Section

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
        raise RuntimeError(f"Course Map unavailable: {exc}") from exc
    # ``optional`` only softens a real 404; outages always raise, so callers
    # can tell a missing course from an unreachable source.
    if response.status_code == 404:
        if optional:
            return None
        raise FileNotFoundError(f"Course Map resource not found: {path}")
    if response.is_error:
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


SEARCH_PAGE_SIZE = 30


async def _search_items(query: str, pages: int = 1) -> List[Dict[str, Any]]:
    """Search hits, up to ``pages`` pages of ``SEARCH_PAGE_SIZE``."""
    items: List[Dict[str, Any]] = []
    for page in range(1, max(pages, 1) + 1):
        params = {"q": query[:200], **({"page": page} if page > 1 else {})}
        payload = await _fetch_json("/search.json", params=params, optional=True)
        results = ((payload or {}).get("data") or {}).get("results") or {}
        batch = results.get("items") or []
        items.extend(batch)
        if len(batch) < SEARCH_PAGE_SIZE or len(items) >= (results.get("total") or 0):
            break
    return items


def _subject_matches(wanted: str, found: str) -> bool:
    """Same subject, or ``wanted`` is a shorthand of it (``CS`` for ``COMPSCI``)."""
    wanted, found = wanted.upper(), found.upper()
    if not wanted or not found or wanted[0] != found[0]:
        return False
    letters = iter(found)
    return all(ch in letters for ch in wanted)


async def _get_course(identifier: str) -> Dict[str, Any]:
    """Resolve an identifier to the Course Map course payload (``data`` object)."""
    subjects, number = _split_identifier(identifier)
    failures: List[str] = []

    async def fetch_page(subject: str) -> Optional[Dict[str, Any]]:
        try:
            page = await _fetch_json(f"/courses/{quote(subject)}_{number}.json", optional=True)
        except RuntimeError as exc:
            failures.append(str(exc))
            return None
        return page["data"] if page and (page.get("data") or {}).get("course") else None

    def not_found() -> Exception:
        # Nothing matched: an outage on any fetch means we can't say it's missing.
        if failures:
            return RuntimeError(f"Course Map unavailable for '{identifier}': {failures[0]}")
        return FileNotFoundError(f"No course found for '{identifier}'")

    for subject in subjects:
        data = await fetch_page(subject)
        if data:
            return data
    # Fall back to search when the code isn't canonical (e.g. "E C E 252").
    if not number:
        raise not_found()
    try:
        items = await _search_items(normalize_identifier(identifier))
    except RuntimeError as exc:
        failures.append(str(exc))
        items = []
    wanted = {s.upper() for s in subjects}
    same_number = []
    for item in items:
        subs, num = _split_identifier(item.get("course_id") or "")
        if num == number:
            same_number.append(subs)
    # Never accept a course that only shares the number. Prefer the exact
    # subject (or a cross-listing of it); fall back to shorthand ("CS" for
    # COMPSCI) only when exactly one hit fits, since "CS" also fits CONS SCI.
    candidates = [subs for subs in same_number if wanted & {s.upper() for s in subs}]
    if not candidates:
        shorthand = [
            subs for subs in same_number
            if any(_subject_matches(w, s) for w in subjects for s in subs)
        ]
        candidates = shorthand if len(shorthand) == 1 else []
    for subs in candidates:
        for subject in subs:
            data = await fetch_page(subject)
            if data:
                return data
    raise not_found()


def _display_identifier(subjects: List[Any], number: Any) -> str:
    cleaned = [str(s).strip() for s in (subjects or []) if str(s).strip()]
    return f"{'/'.join(cleaned)} {number}".strip()


def _course_display(course: Dict[str, Any]) -> str:
    return course.get("course_id") or _display_identifier(course.get("subjects") or [], course.get("course_number"))


_ROMAN = re.compile(r"^(?=[IVX])X{0,3}(IX|IV|V?I{0,3})$")
_KEEP_UPPER = {"AI", "UW", "US", "USA", "DNA", "RNA", "HIV", "STEM", "GIS", "CAD", "ESL", "LGBTQ"}
_SMALL = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with"}
_CONTRACTION = {"s", "t", "d", "ll", "re", "ve", "m"}


def _title_word(word: str, first: bool) -> str:
    upper = word.upper()
    if _ROMAN.match(upper) or upper in _KEEP_UPPER:
        return upper
    lower = word.lower()
    if not first and lower in _SMALL:
        return lower
    head, apostrophe, tail = lower.partition("'")
    if apostrophe and tail and tail not in _CONTRACTION:
        return f"{head.capitalize()}'{tail.capitalize()}"  # O'Brien
    return lower.capitalize()  # Master's


def _title_case(title: str) -> str:
    """Course Map sends some titles in capitals; ``MASTER'S RESEARCH II`` -> ``Master's Research II``."""
    if not title or not title.isupper():
        return title or ""
    count = 0

    def fix(match: re.Match) -> str:
        nonlocal count
        count += 1
        return _title_word(match.group(), count == 1)

    return re.sub(r"[A-Za-z]+(?:'[A-Za-z]+)?", fix, title)


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


def _summarize_grade_row(row: Dict[str, Any], term_code: Any, term: Optional[str] = None) -> Dict[str, Any]:
    """``term_code`` is the numeric UW term id (what the course API takes);
    ``term`` is its display label, e.g. ``Spring 2026``."""
    distribution = {bucket: (row.get(bucket) or 0) for bucket in _GPA_WEIGHTS}
    instructors = row.get("instructors") or ""
    if isinstance(instructors, list):
        instructors = ", ".join(str(item) for item in instructors if item)
    return {
        "term_code": term_code,
        **({"term": term} if term else {}),
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
    subject: str, course_number: str, keyword: str, limit: int, pages: int = 1
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
        items = await _search_items(query_text, pages)
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
        try:
            page = await _fetch_json(f"/api/courses/{course['course_uid']}/grades", optional=True)
        except RuntimeError as exc:  # the course resolved; grades are an extra
            logger.warning("Course Map grades fetch failed: %s", exc)
            page = None
        rows = (page or {}).get("items") or []
    terms: List[Dict[str, Any]] = []
    totals: Dict[str, Any] = {bucket: 0 for bucket in _GPA_WEIGHTS}
    totals["total"] = 0
    for row in sorted(rows, key=lambda r: str(r.get("term_id") or ""), reverse=True):
        label = row.get("term_name") or term_label(row.get("term_id"))
        terms.append(_summarize_grade_row(row, str(row.get("term_id") or ""), label))
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
) -> Tuple[str, List[Dict[str, Any]], str]:
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
                # Course Map does not say who teaches which section.
                "instructors": "",
                "current_enrolled": section.get("enrolled") or 0,
                "capacity": section.get("capacity") or 0,
            }
        )
        if len(rows) >= limit:
            break
    return display, rows, instructors


async def instructor_ratings(identifier: str) -> List[Dict[str, Any]]:
    """Course Map's ratings for the course's instructors, in its order:
    ``[{name, rating, difficulty, num_ratings}]``. Instructors without a
    rating are left out. Raises like ``lookup_course``."""
    data = await _get_course(normalize_identifier(identifier))
    out = []
    for instructor in data["course"].get("instructors") or []:
        ratings = instructor.get("ratings") or {}
        quality, count = ratings.get("quality"), ratings.get("review_count")
        if not instructor.get("name") or not isinstance(quality, (int, float)) or not count:
            continue
        out.append({
            "name": _title_case(instructor["name"]),
            "rating": quality,
            "difficulty": ratings.get("difficulty") if isinstance(ratings.get("difficulty"), (int, float)) else None,
            "num_ratings": count,
        })
    return out


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
    pages: int = 1,
) -> List[Dict[str, Any]]:
    """``pages`` widens the upstream search when the caller filters afterwards."""
    del tool_name  # kept for call-site compatibility
    return await _search_coursemap(subject, course_number, keyword, limit, pages)


async def lookup_course(identifier: str) -> Dict[str, Any]:
    """The course's identifier, title and description.

    Raises ``FileNotFoundError`` when the course doesn't exist and
    ``RuntimeError`` when Course Map can't be reached.
    """
    course = (await _get_course(normalize_identifier(identifier)))["course"]
    return {
        "identifier": _course_display(course),
        "title": _title_case(course.get("title") or ""),
        "description": course.get("description") or course.get("llm_summary") or "",
    }


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
        display, rows, instructors = await _sections_coursemap(identifier, term, limit + 1)
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
        "course_instructors": instructors,
        "instructors_note": (
            "These instructors teach this course; the source does not say "
            "which one teaches which section."
        ),
        "total_results": len(rows),
        "truncated": truncated,
        "query": query_meta,
    }


# ---------------------------------------------------------------------------
# Planner course facts
# ---------------------------------------------------------------------------

_SECTION_KINDS = {"LEC": "lecture", "LAB": "lab", "DIS": "discussion", "SEM": "seminar"}
# Designations that are gen-ed labels; "Level" and "L&S Credit" are not.
_GEN_ED_PREFIXES = ("Core GenEd", "Breadth", "Comm")
# Course pages fetched at once for one batch of facts.
FACTS_CONCURRENCY = 6
_UNAVAILABLE = "Course Map didn't answer"
_COURSE_CODE = re.compile(r"^[A-Z][A-Z&/ ]*?\s*\d{2,4}[A-Z]?$")
_BARE_NUMBER = re.compile(r"^\d{2,4}[A-Z]?$")


def prerequisite_tree(requirements: Dict[str, Any]) -> Tuple[Optional[PrereqNode], List[str]]:
    """Course Map ``requirements.nodes`` to a prerequisite tree, plus notes.

    Keeps ``all``/``any`` groups and ``course`` leaves with their minimum
    grade and timing. A ``condition`` that is only a course code (``"MATH
    217"``, or ``"217"`` beside other MATH courses) becomes a course; any
    other condition (standing, a QR requirement) and every ``not`` exclusion
    is left out of the tree and described in the notes instead. Returns
    ``(None, notes)`` when nothing checkable remains. The flat
    ``prerequisites`` list the chat tools return is unchanged.
    """
    nodes = {
        n["id"]: n for n in (requirements or {}).get("nodes") or []
        if isinstance(n, dict) and n.get("id")
    }
    notes: List[str] = []
    if not nodes:
        return None, notes

    def course_leaf(course: Dict[str, Any]) -> Optional[PrereqNode]:
        label = _display_identifier(course.get("subjects") or [], course.get("course_number"))
        if not course.get("subjects") or not course.get("course_number"):
            return None
        timing = "concurrent" if "concurrent" in str(course.get("timing") or "") else "prior"
        return PrereqNode(
            kind="course", course=label, minimum_grade=course.get("minimum_grade") or None, timing=timing
        )

    def condition_leaf(text: str, siblings: List[Dict[str, Any]]) -> Optional[PrereqNode]:
        code = normalize_identifier(text)
        if _BARE_NUMBER.match(code):
            # "MATH 211, 217, or 221": the bare number takes its siblings' subject.
            subjects = {tuple(s["course"].get("subjects") or []) for s in siblings}
            if len(subjects) == 1:
                return course_leaf({"subjects": list(subjects.pop()), "course_number": code})
            return None
        if _COURSE_CODE.match(code):
            subjects, number = _split_identifier(code)
            if subjects and number:
                return course_leaf({"subjects": subjects, "course_number": number})
        return None

    def described(node_id: str, seen: frozenset) -> List[str]:
        """Course codes and condition texts under a node, for a note."""
        node = nodes.get(node_id)
        if not node or node_id in seen:
            return []
        if node.get("kind") == "course" and node.get("course"):
            leaf = course_leaf(node["course"])
            return [leaf.course] if leaf else []
        if node.get("kind") == "condition":
            return [" ".join(str(node.get("condition") or "").split())]
        return [d for child in node.get("children") or [] for d in described(child, seen | {node_id})]

    def build(node_id: str, seen: frozenset, siblings: List[Dict[str, Any]]) -> Optional[PrereqNode]:
        node = nodes.get(node_id)
        if not node or node_id in seen:
            return None
        seen = seen | {node_id}
        kind = node.get("kind")
        if kind == "course" and node.get("course"):
            return course_leaf(node["course"])
        if kind == "condition":
            text = " ".join(str(node.get("condition") or "").split())
            leaf = condition_leaf(text, siblings)
            if not leaf and text:
                notes.append(f"Not checked: {text}")
            return leaf
        if kind == "not":
            excluded = [
                re.sub(r"^students with credit for\s+", "", d, flags=re.I)
                for child in node.get("children") or [] for d in described(child, seen)
            ]
            if excluded:
                notes.append("Not open to students with credit for " + ", ".join(dict.fromkeys(excluded)))
            return None
        if kind in ("all", "any"):
            children = [nodes[c] for c in node.get("children") or [] if c in nodes]
            courses = [c for c in children if c.get("kind") == "course" and c.get("course")]
            built = [b for b in (build(c["id"], seen, courses) for c in children) if b]
            if not built:
                return None
            return built[0] if len(built) == 1 else PrereqNode(kind=kind, children=tuple(built))
        return None

    root = (requirements or {}).get("root")
    if root not in nodes:
        root = next(iter(nodes))
    return build(root, frozenset(), []), notes


def _same_term(term: str) -> str:
    return " ".join((term or "").split()).title()


def _credits_range(course: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    low, high = course.get("credits_min"), course.get("credits_max")
    numbers = [v for v in (low, high) if isinstance(v, (int, float))]
    if not numbers:
        return None
    return float(min(numbers)), float(max(numbers))


def _gen_ed(course: Dict[str, Any]) -> Optional[List[str]]:
    designations = course.get("designations")
    if not isinstance(designations, list):
        return None
    return [str(d) for d in designations if str(d).startswith(_GEN_ED_PREFIXES)]


def _term_sections(course: Dict[str, Any], term: str) -> List[Section]:
    out = []
    for row in course.get("sections") or []:
        if term_label(row.get("term_id")) != term:
            continue
        capacity, enrolled = row.get("capacity"), row.get("enrolled")
        seats = (
            max(capacity - enrolled, 0)
            if isinstance(capacity, int) and isinstance(enrolled, int) else None
        )
        out.append(Section(
            id=str(row.get("section_number") or row.get("source_section_id") or ""),
            kind=_SECTION_KINDS.get(str(row.get("section_type") or "").upper(), "other"),
            # Course Map doesn't publish meeting times.
            meetings=None,
            seats_open=seats,
        ))
    return out


async def _course_facts_one(
    identifier: str, term: str, covered: List[str], harder_below: Optional[float]
) -> CourseFacts:
    data = await _get_course(normalize_identifier(identifier))
    course = data["course"]
    display = _course_display(course)
    rows = (course.get("offerings") or []) + (course.get("sections") or [])
    terms = {term_label(r.get("term_id")) for r in rows if r.get("term_id")}
    if term in terms:
        offered = "yes"
    elif term in covered:
        offered = "no"
    else:
        offered = "unknown"
    sections = _term_sections(course, term)

    avg_gpa = None
    try:
        _, cumulative, _ = await _grades_coursemap(display)
        avg_gpa = (cumulative or {}).get("average_gpa")
    except (FileNotFoundError, RuntimeError) as exc:  # the course resolved; grades are an extra
        logger.warning("Course Map grades for facts failed: %s", exc)

    requirements = course.get("requirements") or {}
    tree, notes = prerequisite_tree(requirements)
    text = " ".join((course.get("requirements_text") or "").split())
    # Requisite text Course Map didn't structure can't be checked.
    prereq_known = bool(requirements.get("nodes")) or not text
    if text and not requirements.get("nodes"):
        notes.append(f"Prerequisites as written: {text}")

    observed = next(
        (r.get("observed_at") for r in course.get("offerings") or []
         if term_label(r.get("term_id")) == term and r.get("observed_at")),
        course.get("observed_at"),
    )
    return CourseFacts(
        identifier=display,
        known="yes",
        title=_title_case(course.get("title") or ""),
        credits=_credits_range(course),
        offered=offered,
        sections=sections if sections or offered == "no" else None,
        bundles_known=False,  # Course Map doesn't say which sections go together
        gen_ed=_gen_ed(course),
        avg_gpa=avg_gpa,
        harder=(avg_gpa < harder_below) if avg_gpa is not None and harder_below is not None else None,
        prereq_tree=tree,
        prereq_known=prereq_known,
        as_of=str(observed)[:10] if observed else None,
        notes=notes,
    )


async def course_facts(
    identifiers: List[str],
    term: str,
    *,
    covered_terms: Optional[List[str]] = None,
    harder_below_gpa: Optional[float] = None,
) -> Dict[str, CourseFacts]:
    """Planner facts for ``identifiers`` in ``term`` (``"Spring 2027"``).

    ``covered_terms`` are the terms Course Map lists offerings for: a course
    without an offering in a covered term reads not offered; in any other
    term, unknown. Never raises for one course: a missing course is
    ``known="no"``, an outage ``known="unavailable"``.
    """
    term = _same_term(term)
    covered = [_same_term(t) for t in covered_terms or []]
    limit = asyncio.Semaphore(FACTS_CONCURRENCY)

    async def one(identifier: str) -> CourseFacts:
        async with limit:
            try:
                return await _course_facts_one(identifier, term, covered, harder_below_gpa)
            except FileNotFoundError:
                return CourseFacts(identifier=normalize_identifier(identifier), known="no")
            except Exception as exc:  # noqa: BLE001 — one bad course never fails the batch
                if not isinstance(exc, RuntimeError):
                    logger.exception("Course Map facts failed for %s", identifier)
                return CourseFacts(
                    identifier=normalize_identifier(identifier),
                    known="unavailable",
                    unavailable_reason=_UNAVAILABLE,
                )

    unique = list(dict.fromkeys(identifiers))
    results = await asyncio.gather(*(one(i) for i in unique))
    return dict(zip(unique, results))
