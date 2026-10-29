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

import asyncio
import json
import logging
import re
from dataclasses import replace
from datetime import date, datetime
from types import ModuleType
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.planner.facts import CourseFacts, Meeting, PrereqNode, Section, difficulty_of

logger = logging.getLogger(__name__)

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

# ``meeting_times``, ``section_bundles`` and ``gen_ed`` say what the
# planner's course facts can carry (see ``course_facts``).
_CAPABILITIES: Dict[str, Dict[str, bool]] = {
    "uw_coursemap": {
        "keyword_search": True, "seat_filter": False, "grades": True, "sections": True,
        "seats": True, "seats_historical": False, "instructors": True,
        "prerequisites": True, "next_courses": True,
        "meeting_times": False, "section_bundles": False, "gen_ed": True,
    },
    # UVA: theCourseForum snapshot. Seats are counts at snapshot time.
    "csv_snapshot": {
        "keyword_search": True, "seat_filter": True, "grades": True, "sections": True,
        "seats": True, "seats_historical": True, "instructors": True,
        "prerequisites": False, "next_courses": False,
        "meeting_times": True, "section_bundles": True, "gen_ed": True,
    },
    # CU: FOSE needs a subject code and lists sections without seat counts.
    FOSE: {
        "keyword_search": False, "seat_filter": False, "grades": False, "sections": True,
        "seats": False, "seats_historical": False, "instructors": True,
        "prerequisites": False, "next_courses": False,
        "meeting_times": True, "section_bundles": True, "gen_ed": False,
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
        # FOSE lists co-teachers in one string ("A. One, B. Two").
        for instructor in _names(row.get("instructor") or ""):
            if instructor not in course["instructors"]:
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
        rows = _fose_courses(await fose_subject_rows(subject), course_number.upper(), keyword)
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
        # The id the planner's pick_section op expects (matches course_facts).
        "id": str(row.get("id") or row.get("crn") or row.get("section") or ""),
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
    # FOSE's building (``bldg``, carried as ``location``); other sources have none.
    bldg = " ".join(re.sub(r"<[^>]+>", " ", str(row.get("location") or "")).split())
    if bldg:
        out["bldg"] = bldg
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


def fose_terms() -> List[str]:
    """Terms CU summaries and searches read, in order: the next term, then the other
    covered terms newest first (a course not offered next term still shows)."""
    first = next_term()
    return [first, *[t for t in reversed(planner_terms()) if t != first]]


async def fose_subject_rows(subject: str) -> List[Dict[str, Any]]:
    """FOSE lecture/seminar rows for ``subject`` from the first term in
    ``fose_terms()`` that lists any (the next term may not be published yet)."""
    from app.tools import search_courses as fose

    rows: List[Dict[str, Any]] = []
    for term in fose_terms():
        rows = await fose.fose_search(subject, term)
        if rows:
            break
    return rows


async def _fose_summary(identifier: str, caps: Dict[str, bool]) -> Dict[str, Any]:
    from app.tools import search_courses as fose

    subject, number, _ = parse_query(identifier)
    if not (subject and number):
        raise FileNotFoundError(f"No course found for '{identifier}'")
    code = f"{subject} {number}"
    rows: List[Dict[str, Any]] = []
    for term in fose_terms():
        # Cached per subject and term, so the facts read below asks FOSE once.
        items = await fose.fose_sections(subject, term)
        rows = [
            row for row in (fose.row_to_course(item, term) for item in items)
            if row and _same_code(row.get("course_code")) == code
        ]
        if rows:
            break
    if not rows:
        raise FileNotFoundError(f"No course found for '{code}'")
    return {
        "identifier": code,
        "title": rows[0].get("title") or "",
        "description": "",
        "sections": _sections_figure(rows, rows[0].get("semester"), caps, None),
        "instructors": list(dict.fromkeys(n for r in rows for n in _names(r.get("instructor") or ""))),
    }


def prereq_dict(node: Optional[PrereqNode]) -> Optional[Dict[str, Any]]:
    """A prerequisite tree as JSON: ``{kind: all|any, children}`` groups and
    ``{kind: course, course, minimum_grade?, timing}`` leaves."""
    if node is None:
        return None
    if node.kind == "course":
        out: Dict[str, Any] = {"kind": "course", "course": node.course, "timing": node.timing}
        if node.minimum_grade:
            out["minimum_grade"] = node.minimum_grade
        return out
    return {"kind": node.kind, "children": [prereq_dict(c) for c in node.children]}


def _grade_history(result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Per-term grade figures, oldest term first."""
    if result.get("error"):
        return []
    history = []
    for row in result.get("terms") or []:
        figure = _grade_figure(row)
        history.append({
            "term": row.get("term") or _term_name(row.get("term_code")),
            "gpa": figure["gpa"],
            "students": figure["students"],
            "pct_a": figure["pct_a"],
            "pct_df": figure["pct_df"],
        })
    return sorted(history, key=lambda h: _term_order(h["term"]))


def easier_from_gpa() -> Optional[float]:
    """The school's "easier" cutoff when its pack sets one (else the default)."""
    value = getattr(get_settings().planner, "easier_from_gpa", None)
    return float(value) if isinstance(value, (int, float)) else None


def course_difficulty(facts: Optional[CourseFacts]) -> Optional[str]:
    """``easier`` / ``typical`` / ``harder`` / None by the school's rule (R5)."""
    return difficulty_of(facts, easier_from_gpa())


async def _facts_fields(identifier: str) -> Dict[str, Any]:
    """``difficulty``, ``credits``, ``gen_ed`` and ``prereq_tree`` from the
    planner's course facts for the next term (the sources cache what the
    summary already read). ``difficulty`` is always present (None when
    unknown); any other field the school doesn't publish is left out."""
    facts = (await course_facts([identifier], next_term())).get(identifier)
    if facts is None or facts.known != "yes":
        return {"difficulty": None}
    out: Dict[str, Any] = {"difficulty": course_difficulty(facts)}
    if facts.credits:
        out["credits"] = {"min": facts.credits[0], "max": facts.credits[1]}
    if facts.gen_ed:
        out["gen_ed"] = list(facts.gen_ed)
    if facts.prereq_tree is not None:
        out["prereq_tree"] = prereq_dict(facts.prereq_tree)
    return out


async def course_summary(identifier: str) -> Dict[str, Any]:
    """Everything the Courses preview and Compare show for one course.

    ``grades``, ``cumulative``, ``sections``, ``instructors``,
    ``prerequisites`` and ``next_courses`` appear only when the school's
    source has them (see ``capabilities``); a key that is present but
    ``None`` means the source has that data in general but not for this
    course. ``grade_history`` (per term, oldest first), ``instructor_grades``
    (UVA), ``credits``, ``gen_ed`` and ``prereq_tree`` (UW) appear only when
    there is data for this course. Raises ``FileNotFoundError`` for an
    unknown course and ``RuntimeError`` when the source can't be reached.
    """
    backend = catalog_backend()
    caps = _CAPABILITIES[backend]
    meta = {"capabilities": dict(caps), "source": catalog_source(), "as_of": None}
    if backend == FOSE:
        summary = {**await _fose_summary(identifier, caps), **meta}
        summary.update(await _facts_fields(summary["identifier"]))
        return summary

    provider = get_provider()
    course = await provider.lookup_course(identifier)
    canonical = course["identifier"]
    summary: Dict[str, Any] = {**course, **meta}

    # One at a time: the first call warms the source's cache for the rest.
    if caps["grades"]:
        grades = await provider.course_grades(course_identifier=canonical)
        summary["grades"], summary["cumulative"] = _grades_figures(grades)
        history = _grade_history(grades)
        if history:
            summary["grade_history"] = history
        if hasattr(provider, "instructor_grades"):
            by_instructor = await provider.instructor_grades(canonical)
            if by_instructor:
                summary["instructor_grades"] = by_instructor
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
    summary.update(await _facts_fields(canonical))
    return summary


# ---------------------------------------------------------------------------
# Planner course facts
# ---------------------------------------------------------------------------

# Roughly when each season's classes start, for picking the next term.
_TERM_STARTS = {"january": (1, 2), "spring": (1, 15), "summer": (5, 15), "fall": (8, 20)}
_FOSE_KINDS = {"LEC": "lecture", "REC": "discussion", "LAB": "lab", "SEM": "seminar"}
_BUNDLE_KINDS = ("lecture", "lab", "discussion")
_WEEKDAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")  # FOSE meet_day 0..6
_FOSE_UNAVAILABLE = "CU Class Search didn't answer"


def _same_term(term: str) -> str:
    return " ".join((term or "").split()).title()


def planner_terms() -> List[str]:
    """Terms this school's course data covers, oldest first."""
    if catalog_backend() == "csv_snapshot":
        from app.sources import csv_snapshot

        return csv_snapshot.planner_terms()
    terms = dict.fromkeys(_same_term(t) for t in get_settings().planner.terms if t.strip())
    return sorted(terms, key=_term_order)


def _term_start(term: str) -> date:
    season, _, year = term.rpartition(" ")
    month, day = _TERM_STARTS.get(season.lower(), (1, 1))
    return date(int(year) if year.isdigit() else 1, month, day)


def _school_today() -> date:
    timezone = get_settings().school.timezone
    return datetime.now(ZoneInfo(timezone)).date() if timezone else date.today()


def next_term(today: Optional[date] = None) -> str:
    """The term students plan for now: ``planner.next_term`` when set, else
    the first covered term that hasn't started, else the next spring or fall."""
    configured = get_settings().planner.next_term
    if configured.strip():
        return _same_term(configured)
    today = today or _school_today()
    terms = planner_terms()
    upcoming = [t for t in terms if _term_start(t) > today]
    if upcoming:
        return upcoming[0]
    if terms:
        return terms[-1]
    if today >= date(today.year, *_TERM_STARTS["fall"]):
        return f"Spring {today.year + 1}"
    if today >= date(today.year, *_TERM_STARTS["spring"]):
        return f"Fall {today.year}"
    return f"Spring {today.year}"


async def course_facts(identifiers: List[str], term: str) -> Dict[str, CourseFacts]:
    """Planner facts for each identifier in ``term`` (``"Spring 2027"``),
    keyed by the identifiers as passed. Never raises: a course the source
    can't answer for reads ``known="unavailable"`` with a reason."""
    identifiers = list(identifiers)
    if not identifiers:
        return {}
    term = _same_term(term)
    planner = get_settings().planner
    backend = catalog_backend()
    try:
        if backend == FOSE:
            return await _fose_facts(identifiers, term)
        if backend == "csv_snapshot":
            from app.sources import csv_snapshot

            return await csv_snapshot.course_facts(
                identifiers, term, harder_below_gpa=planner.harder_below_gpa
            )
        from app.tools import _uw_source

        return await _uw_source.course_facts(
            identifiers, term, covered_terms=planner_terms(), harder_below_gpa=planner.harder_below_gpa
        )
    except Exception:  # noqa: BLE001 — providers handle their own failures; this is a backstop
        logger.exception("course_facts failed for %s", backend)
        reason = f"{catalog_source()['name']} didn't answer"
        return {
            i: CourseFacts(identifier=i, known="unavailable", unavailable_reason=reason)
            for i in identifiers
        }


def _fose_clock(text: Any) -> Optional[str]:
    """FOSE ``"930"`` -> ``"09:30"``."""
    digits = str(text or "").strip()
    if not digits.isdigit() or len(digits) > 4:
        return None
    digits = digits.zfill(4)
    return f"{digits[:2]}:{digits[2:]}"


def _fose_meetings(item: Dict[str, Any]) -> Optional[Tuple[Meeting, ...]]:
    """FOSE ``meetingTimes`` (a JSON string) to meetings; None when not given."""
    raw = item.get("meetingTimes")
    try:
        times = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return None
    meetings = []
    for slot in times or []:
        day, start, end = str(slot.get("meet_day", "")), _fose_clock(slot.get("start_time")), _fose_clock(slot.get("end_time"))
        if day.isdigit() and int(day) < len(_WEEKDAYS) and start and end:
            meetings.append(Meeting(day=_WEEKDAYS[int(day)], start=start, end=end))
    return tuple(meetings) or None


def _fose_units(item: Dict[str, Any]) -> Optional[Tuple[float, float]]:
    """Credit hours from FOSE ``cart_opts`` (``"3"`` or ``"1-3"``)."""
    raw = item.get("cart_opts")
    try:
        opts = json.loads(raw) if isinstance(raw, str) else raw or {}
        labels = [o.get("label") for o in opts.get("credit_hrs", {}).get("options") or []]
    except (ValueError, AttributeError):
        return None
    numbers = []
    for label in labels:
        for part in re.split(r"\s*(?:-|to)\s*", str(label or "")):
            try:
                numbers.append(float(part))
            except ValueError:
                pass
    return (min(numbers), max(numbers)) if numbers else None


def _fose_kind(item: Dict[str, Any]) -> str:
    return _FOSE_KINDS.get(str(item.get("schd") or "").upper(), "other")


def _fose_course_facts(code: str, items: List[Dict[str, Any]], term: str) -> CourseFacts:
    kinds = {_fose_kind(i) for i in items}
    bundle = [k for k in _BUNDLE_KINDS if k in kinds]
    sections = []
    for item in items:
        kind = _fose_kind(item)
        sections.append(Section(
            id=str(item.get("crn") or item.get("no") or ""),
            kind=kind,
            meetings=_fose_meetings(item),
            requires=tuple(k for k in bundle if k != kind) if len(bundle) > 1 and kind in bundle else (),
        ))
    lectures = [i for i in items if _fose_kind(i) == "lecture"] or items
    ranges = [u for u in (_fose_units(i) for i in lectures) if u]
    ranges = [u for u in ranges if u[1] > 0] or ranges
    return CourseFacts(
        identifier=code,
        known="yes",
        title=items[0].get("title") or "",
        credits=(min(u[0] for u in ranges), max(u[1] for u in ranges)) if ranges else None,
        offered="yes",
        sections=sections,
        # FOSE lists every row of the subject, recitations and labs included.
        bundles_known=True,
        prereq_known=False,
        as_of=term,
    )


async def _fose_facts(identifiers: List[str], term: str) -> Dict[str, CourseFacts]:
    """CU facts from FOSE, one request per subject and term.

    A course the asked term doesn't list is not offered then; if no covered
    term lists it either, its identity can't be confirmed (``unavailable``).
    """
    from app.tools import search_courses as fose

    codes: Dict[str, str] = {}
    for identifier in identifiers:
        subject, number, _ = parse_query(identifier)
        if subject and number:
            codes[identifier] = f"{subject} {number}"
    other_terms = [t for t in planner_terms() if t != term]

    async def rows_for(subject: str, semester: str) -> Optional[Dict[str, List[Dict[str, Any]]]]:
        try:
            items = await fose.fose_sections(subject, semester)
        except RuntimeError as exc:
            logger.warning("FOSE facts for %s %s failed: %s", subject, semester, exc)
            return None
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for item in items:
            grouped.setdefault(_same_code(item.get("code") or item.get("course_code")), []).append(item)
        return grouped

    async def subject_facts(subject: str, wanted: List[str]) -> Dict[str, CourseFacts]:
        listed = await rows_for(subject, term)
        if listed is None:
            return {
                code: CourseFacts(identifier=code, known="unavailable", unavailable_reason=_FOSE_UNAVAILABLE)
                for code in wanted
            }
        out = {code: _fose_course_facts(code, listed[code], term) for code in wanted if code in listed}
        missing = [code for code in wanted if code not in listed]
        # An empty subject listing means the term isn't published (or the
        # subject is wrong), so "not offered" can't be said.
        offered = "no" if listed else "unknown"
        others = await asyncio.gather(*(rows_for(subject, t) for t in other_terms)) if missing else []
        for code in missing:
            found = next(((t, o[code]) for t, o in zip(other_terms, others) if o and code in o), None)
            if found:
                facts = _fose_course_facts(code, found[1], found[0])
                facts.offered, facts.sections, facts.as_of = offered, [] if offered == "no" else None, term
                out[code] = facts
            else:
                checked = ", ".join([term, *other_terms])
                out[code] = CourseFacts(
                    identifier=code, known="unavailable", offered=offered,
                    sections=[] if offered == "no" else None,
                    unavailable_reason=f"CU Class Search doesn't list {code} in {checked}",
                )
        return out

    by_subject: Dict[str, List[str]] = {}
    for code in dict.fromkeys(codes.values()):
        by_subject.setdefault(parse_query(code)[0], []).append(code)
    results = await asyncio.gather(*(subject_facts(s, wanted) for s, wanted in by_subject.items()))
    facts = {code: f for result in results for code, f in result.items()}
    return {
        identifier: replace(facts[codes[identifier]]) if identifier in codes
        else CourseFacts(identifier=identifier, known="no")
        for identifier in identifiers
    }
