"""Pick the academics provider a school pack configures.

Each provider is a module exposing the same coroutines the course tools call:
``search_courses``, ``course_grades``, ``prerequisites``, ``next_courses`` and
``course_sections``, each returning the tool's result dict, plus
``lookup_course``, which raises ``FileNotFoundError`` for an unknown course
and ``RuntimeError`` when the source is down. A provider that lacks a
capability returns an ``error`` result for it.

Below the provider pick sits the catalog: one ``search_catalog`` used by the
chat ``course_search`` tool and ``/api/catalog/search``, and the
``course_summary`` behind ``/api/catalog/{id}``. A school that enables only
CU's FOSE ``search_courses`` tool (no provider tools) is served by the FOSE
class search instead. ``catalog_capabilities()`` says what each school's
source can serve, so pages can say "Not available" for the rest.
"""

from __future__ import annotations

import re
from types import ModuleType
from typing import Any, Dict, List, Optional, Tuple

from app.config import get_settings

PROVIDERS = ("uw_coursemap", "csv_snapshot")


def get_provider() -> ModuleType:
    name = get_settings().academics.provider
    if name == "uw_coursemap":
        from app.tools import _uw_source

        return _uw_source
    if name == "csv_snapshot":
        from app.sources import csv_snapshot

        return csv_snapshot
    raise ValueError(f"Unknown academics provider '{name}'. Expected one of {PROVIDERS}.")


def links_to_course_pages() -> bool:
    """Whether course identifiers resolve on the course detail page."""
    return get_settings().academics.provider == "uw_coursemap"


# ---------------------------------------------------------------------------
# Catalog backends and what they can serve
# ---------------------------------------------------------------------------

FOSE = "fose"
# Upstream rows read before a level or seat filter runs, so the filter sees
# more than the first page of matches.
FILTER_POOL = 150
SECTION_LIMIT = 100
CU_SUBJECT_HINT = "Search CU courses by subject code, e.g. CSCI"

_CAPABILITIES: Dict[str, Dict[str, bool]] = {
    "uw_coursemap": {
        "keyword_search": True, "seat_filter": False, "grades": True, "sections": True,
        "seats": True, "seats_historical": False, "instructors": True,
        "prerequisites": True, "next_courses": True,
    },
    # UVA: theCourseForum snapshot. Seats are counts at snapshot time.
    "csv_snapshot": {
        "keyword_search": True, "seat_filter": True, "grades": True, "sections": True,
        "seats": True, "seats_historical": True, "instructors": True,
        "prerequisites": False, "next_courses": False,
    },
    # CU: FOSE needs a subject code and lists sections without seat counts.
    FOSE: {
        "keyword_search": False, "seat_filter": False, "grades": False, "sections": True,
        "seats": False, "seats_historical": False, "instructors": True,
        "prerequisites": False, "next_courses": False,
    },
}
# Section types whose seats count toward a course's open seats.
_PRIMARY_TYPES = {"LEC", "LECTURE"}
_A_BUCKETS = ("a", "ab", "A+", "A", "A-")
_DF_BUCKETS = ("d", "f", "DFW")
_SEASONS = {"january": 0, "spring": 1, "summer": 2, "fall": 3}


class CatalogQueryError(ValueError):
    """A search the school's source can't answer as asked (HTTP 400)."""


def catalog_backend() -> str:
    enabled = set(get_settings().tools.get_enabled_names())
    if "course_search" not in enabled and "search_courses" in enabled:
        return FOSE
    return get_settings().academics.provider


def catalog_capabilities() -> Dict[str, bool]:
    return dict(_CAPABILITIES[catalog_backend()])


def catalog_source() -> Dict[str, str]:
    backend = catalog_backend()
    if backend == "csv_snapshot":
        snapshot = get_settings().academics.snapshot
        return {"name": snapshot.source_name or "Course snapshot", "url": snapshot.source_url}
    if backend == FOSE:
        return {"name": "CU Boulder Class Search", "url": "https://classes.colorado.edu"}
    return {"name": "UW Course Map", "url": "https://uwcourses.com"}


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------

def parse_query(q: str) -> Tuple[str, str, str]:
    """Free text to (subject, course_number, keyword).

    ``"comp sci 300"`` -> ("COMP SCI", "300", ""), ``"CS2100"`` -> ("CS", "2100", ""),
    ``"machine learning"`` -> ("", "", "machine learning").
    """
    text = " ".join((q or "").split())
    match = re.fullmatch(r"(.*?)\s*(\d{3,4}[A-Za-z]?)", text)
    if match:
        return match.group(1).upper(), match.group(2).upper(), ""
    return "", "", text


def _looks_like_subject(word: str, max_len: int) -> bool:
    return word.isalpha() and 2 <= len(word) <= max_len


def course_level(number: Any) -> Optional[int]:
    """``"300"`` -> 300, ``"2100"`` -> 2000, ``"576A"`` -> 500."""
    digits = re.match(r"\d+", str(number or ""))
    if not digits or len(digits.group()) not in (3, 4):
        return None
    step = 100 if len(digits.group()) == 3 else 1000
    return int(digits.group()) // step * step


def _number_of(row: Dict[str, Any]) -> str:
    if row.get("number"):
        return str(row["number"])
    return parse_query(row.get("identifier") or "")[1]


def _number_order(row: Dict[str, Any]) -> Tuple[int, str]:
    number = _number_of(row)
    digits = re.match(r"\d+", number)
    return (int(digits.group()) if digits else 10**6, number)


def _same_code(text: Any) -> str:
    return " ".join(str(text or "").split()).upper()


def _fose_courses(rows: List[Dict[str, Any]], number: str, keyword: str) -> List[Dict[str, Any]]:
    """FOSE section rows to one row per course."""
    courses: Dict[str, Dict[str, Any]] = {}
    words = keyword.lower().split()
    for row in rows:
        code = _same_code(row.get("course_code"))
        subject, num, _ = parse_query(code)
        if not num or (number and num != number):
            continue
        if words and not all(w in (row.get("title") or "").lower() for w in words):
            continue
        course = courses.setdefault(code, {
            "identifier": code, "subjects": subject, "number": num,
            "title": row.get("title") or "", "semester": row.get("semester"),
            "sections": 0, "instructors": [],
        })
        course["sections"] += 1
        instructor = row.get("instructor") or ""
        if instructor and instructor not in course["instructors"]:
            course["instructors"].append(instructor)
    return list(courses.values())


async def _provider_search(subject: str, course_number: str, keyword: str, pool: int) -> List[Dict[str, Any]]:
    kwargs: Dict[str, Any] = {}
    if catalog_backend() == "uw_coursemap":
        from app.tools import _uw_source

        # Course Map pages its search; read enough pages to fill the pool.
        kwargs["pages"] = -(-pool // _uw_source.SEARCH_PAGE_SIZE)
    return await get_provider().search_courses(
        subject=subject, course_number=course_number, keyword=keyword, limit=pool, **kwargs
    )


async def search_catalog(
    q: str = "",
    level: Optional[int] = None,
    open_only: bool = False,
    limit: int = 20,
    *,
    subject: str = "",
    course_number: str = "",
    keyword: str = "",
) -> Dict[str, Any]:
    """Search the school's catalog; filters run before ``limit`` truncates.

    Give free text as ``q`` (the Courses page) or the parts directly (the
    chat ``course_search`` tool). ``level`` matches the course number's
    hundreds (UW, 300) or thousands (UVA/CU, 2000). ``open_only`` keeps
    courses that had open seats and needs ``seat_filter``. Raises
    ``CatalogQueryError`` for a search the source can't answer and
    ``RuntimeError`` when the source is down.
    """
    backend = catalog_backend()
    caps = _CAPABILITIES[backend]
    guess_subject = False
    subject_listing = bool(subject) and not (course_number or keyword)
    if q:
        subject, course_number, keyword = parse_query(q)
        guess_subject = bool(keyword)
    subject, course_number, keyword = subject.strip(), course_number.strip(), keyword.strip()
    if not (subject or course_number or keyword):
        raise CatalogQueryError("Provide a course code or keyword.")
    if open_only and not caps["seat_filter"]:
        raise CatalogQueryError(f"{catalog_source()['name']} does not list seats in search results.")

    pool = max(limit, FILTER_POOL) if (level is not None or open_only or subject_listing) else limit
    if backend == FOSE:
        from app.tools import search_courses as fose

        if guess_subject:
            first, _, rest = keyword.partition(" ")
            if _looks_like_subject(first, 4):
                subject, keyword = first.upper(), rest
        if not subject:
            raise CatalogQueryError(CU_SUBJECT_HINT)
        subject_listing = not (course_number or keyword)
        rows = _fose_courses(await fose.fose_search(subject), course_number.upper(), keyword)
    else:
        rows = []
        if guess_subject and _looks_like_subject(keyword.replace(" ", ""), 8):
            # A lone word like "MATH" or "CS", or "comp sci", is most likely a
            # subject. Read the whole listing so it can run in course order;
            # upstream ranks graduate research courses first.
            rows = await _provider_search(keyword, "", "", max(pool, FILTER_POOL) + 1)
            subject_listing = bool(rows)
        if not rows:
            rows = await _provider_search(subject, course_number, keyword, pool + 1)

    if subject_listing:
        rows.sort(key=_number_order)
    for row in rows:
        row["level"] = course_level(_number_of(row))
    if level is not None:
        rows = [row for row in rows if row["level"] == level]
    if open_only:
        rows = [row for row in rows if (row.get("seats_open_at_snapshot") or 0) > 0]

    truncated = len(rows) > limit
    rows = rows[:limit]
    as_of = next((row["data_as_of"] for row in rows if row.get("data_as_of")), None)
    return {
        "courses": rows,
        "total_results": len(rows),
        "truncated": truncated,
        "capabilities": dict(caps),
        "source": catalog_source(),
        "as_of": as_of,
        "query": {
            "subject": subject or None,
            "course_number": course_number or None,
            "keyword": keyword or None,
            "level": level,
            "open_only": open_only,
        },
    }


def starter_codes() -> List[str]:
    """Course codes named in the school's academics home-page starters."""
    pattern = re.compile(r"\b((?:[A-Z][A-Z&]{1,7} ){1,3})(\d{3,4}[A-Z]?)\b")
    codes: List[str] = []
    for group in get_settings().homepage.starters:
        if group.domain != "academics":
            continue
        for prompt in group.prompts:
            for subject, number in pattern.findall(prompt):
                code = f"{subject.strip()} {number}"
                if code not in codes:
                    codes.append(code)
    return codes


# ---------------------------------------------------------------------------
# Course summary
# ---------------------------------------------------------------------------

def _term_name(label: Any) -> str:
    """``"2026 Spring"`` (UVA) -> ``"Spring 2026"``; other labels unchanged."""
    match = re.fullmatch(r"(\d{4}) (\w+)", str(label or ""))
    return f"{match.group(2)} {match.group(1)}" if match else str(label or "")


def _term_order(name: str) -> Tuple[int, int]:
    season, _, year = (name or "").rpartition(" ")
    return int(year) if year.isdigit() else 0, _SEASONS.get(season.lower(), -1)


def _snapshot_term() -> Optional[str]:
    """The sections file's term from its name, e.g. ``2026_fall.csv`` -> Fall 2026."""
    url = get_settings().academics.snapshot.sections_url
    match = re.search(r"(\d{4})_(spring|summer|fall|january)", url or "", re.I)
    return f"{match.group(2).title()} {match.group(1)}" if match else None


def _grade_figure(summary: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not summary:
        return None
    distribution = summary.get("distribution") or {}
    graded = sum(distribution.values())

    def pct(buckets) -> Optional[float]:
        if not graded:
            return None
        return round(100 * sum(distribution.get(b, 0) for b in buckets) / graded, 1)

    return {
        "gpa": summary.get("average_gpa"),
        "students": summary.get("total") or 0,
        "pct_a": pct(_A_BUCKETS),
        "pct_df": pct(_DF_BUCKETS),
        "distribution": distribution,
    }


def _grades_figures(result: Dict[str, Any]) -> Tuple[Optional[Dict], Optional[Dict]]:
    """(latest term, cumulative) from a provider ``course_grades`` result."""
    if result.get("error") or not result.get("terms"):
        return None, None
    latest = result["terms"][0]
    distribution = latest.get("distribution") or {}
    term = {
        **_grade_figure(latest),
        "term": latest.get("term") or _term_name(latest.get("term_code")),
        # UW buckets A and AB and reports D and F; UVA reports A+..A- and DFW.
        "labels": {
            "a": "A/AB" if "ab" in distribution else "A range",
            "df": "D/F" if "d" in distribution else "DFW",
        },
        **({"as_of": result["data_as_of"]} if result.get("data_as_of") else {}),
    }
    return term, _grade_figure(result.get("cumulative"))


def _section_row(row: Dict[str, Any]) -> Dict[str, Any]:
    enrolled = row.get("current_enrolled", row.get("enrolled_at_snapshot"))
    capacity = row.get("capacity")
    seats = None if enrolled is None or capacity is None else max(capacity - enrolled, 0)
    status = row.get("status_at_snapshot")
    is_open = (status == "Open") if status else row.get("is_open")
    out = {
        "section": row.get("section") or "",
        "type": row.get("type") or "",
        "instructors": row.get("instructors") or row.get("instructor") or "",
        "enrolled": enrolled,
        "capacity": capacity,
        "seats_open": seats,
        "is_open": is_open,
    }
    if row.get("meetings"):
        out["meetings"] = row["meetings"]
    if (row.get("schedule") or {}).get("raw"):
        out["meetings"] = [row["schedule"]["raw"]]
    return out


def _sections_figure(
    rows: List[Dict[str, Any]], term: Optional[str], caps: Dict[str, bool], as_of: Optional[str]
) -> Dict[str, Any]:
    out = [_section_row(r) for r in rows]
    primary = [r for r in out if r["type"].upper() in _PRIMARY_TYPES] or out
    seats = [r["seats_open"] for r in primary if r["seats_open"] is not None]
    return {
        "term": term,
        "historical": caps["seats_historical"],
        "seats_published": caps["seats"],
        "as_of": as_of,
        "seats_open": sum(seats) if caps["seats"] and seats else None,
        "rows": out,
    }


def _names(text: str) -> List[str]:
    return [n.strip() for n in (text or "").split(",") if n.strip()]


async def _fose_summary(identifier: str, caps: Dict[str, bool]) -> Dict[str, Any]:
    from app.tools import search_courses as fose

    subject, number, _ = parse_query(identifier)
    if not (subject and number):
        raise FileNotFoundError(f"No course found for '{identifier}'")
    code = f"{subject} {number}"
    rows = [r for r in await fose.fose_search(subject) if _same_code(r.get("course_code")) == code]
    if not rows:
        raise FileNotFoundError(f"No course found for '{code}'")
    return {
        "identifier": code,
        "title": rows[0].get("title") or "",
        "description": "",
        "sections": _sections_figure(rows, rows[0].get("semester"), caps, None),
        "instructors": list(dict.fromkeys(r["instructor"] for r in rows if r.get("instructor"))),
    }


async def course_summary(identifier: str) -> Dict[str, Any]:
    """Everything the Courses preview and Compare show for one course.

    ``grades``, ``cumulative``, ``sections``, ``instructors``,
    ``prerequisites`` and ``next_courses`` appear only when the school's
    source has them (see ``capabilities``); a key that is present but
    ``None`` means the source has that data in general but not for this
    course. Raises ``FileNotFoundError`` for an unknown course and
    ``RuntimeError`` when the source can't be reached.
    """
    backend = catalog_backend()
    caps = _CAPABILITIES[backend]
    meta = {"capabilities": dict(caps), "source": catalog_source(), "as_of": None}
    if backend == FOSE:
        return {**await _fose_summary(identifier, caps), **meta}

    provider = get_provider()
    course = await provider.lookup_course(identifier)
    canonical = course["identifier"]
    summary: Dict[str, Any] = {**course, **meta}

    # One at a time: the first call warms the source's cache for the rest.
    if caps["grades"]:
        summary["grades"], summary["cumulative"] = _grades_figures(
            await provider.course_grades(course_identifier=canonical)
        )
    if caps["sections"]:
        result = await provider.course_sections(course_identifier=canonical, limit=SECTION_LIMIT)
        rows = [] if result.get("error") else result.get("sections") or []
        if any(r.get("term") for r in rows):
            # Live schedules list several terms; show the newest one.
            term = max({r["term"] for r in rows if r.get("term")}, key=_term_order)
            rows = [r for r in rows if r.get("term") == term]
        else:
            term = _snapshot_term()
        summary["as_of"] = result.get("data_as_of")
        summary["sections"] = _sections_figure(rows, term, caps, summary["as_of"]) if rows else None
        names = _names(result.get("course_instructors") or "")
        for row in rows:
            names.extend(_names(row.get("instructors") or ""))
        summary["instructors"] = list(dict.fromkeys(names))
    if caps["prerequisites"]:
        result = await provider.prerequisites(course_identifier=canonical)
        summary["prerequisites"] = None if result.get("error") else {
            "text": result.get("prereq_text") or "",
            "courses": result.get("prerequisites") or [],
        }
    if caps["next_courses"]:
        result = await provider.next_courses(course_identifier=canonical)
        summary["next_courses"] = None if result.get("error") else result.get("next_courses") or []
    return summary
