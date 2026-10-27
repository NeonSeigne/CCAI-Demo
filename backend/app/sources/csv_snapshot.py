"""Academics provider backed by public CSV snapshots (UVA via theCourseForum).

The school pack lists a sections CSV (one row per section) and grade CSVs (one
row per section per term). Files are cached on disk and refreshed every
``refresh_hours``; if a refresh fails the last good copy is served. Every result
carries ``data_as_of`` and ``data_note`` because this is snapshot data: seat
counts are historical, not live availability.

Sections CSV columns: ClassNumber, Mnemonic, Number, Section, Type, Units,
Instructor1-4, Days1-4, Room1-4, MeetingDates1-4, Title, Topic, Status,
Enrollment, EnrollmentLimit, Waitlist, WaitlistLimit, Description, ...
Grades CSV columns: Term Desc, Subject, Catalog Number, Class Title,
Primary Instructor Name, Class Section, Course GPA, # of Students,
A+, A, A-, B+, B, B-, C+, C, C-, DFW.
"""

from __future__ import annotations

import asyncio
import csv
import io
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

from app.config import get_settings
from app.sources import cache

logger = logging.getLogger(__name__)

_GRADE_BUCKETS = ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "DFW")
_NOT_AVAILABLE = "This school's course data does not include {what}."

_tables: Dict[str, Tuple[float, List[Dict[str, str]], Optional[str]]] = {}
# One lock per file, so loading one CSV never blocks lookups in another.
_locks: Dict[str, asyncio.Lock] = {}


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def _load_table(url: str, refresh_hours: float) -> Tuple[List[Dict[str, str]], Optional[str]]:
    text, as_of = cache.load_text(url, refresh_hours, with_commit_date=True)
    return list(csv.DictReader(io.StringIO(text))), as_of


async def _table(url: str) -> Tuple[List[Dict[str, str]], Optional[str]]:
    refresh_hours = get_settings().academics.snapshot.refresh_hours
    async with _locks.setdefault(url, asyncio.Lock()):
        hit = _tables.get(url)
        if hit and time.time() - hit[0] < refresh_hours * 3600:
            return hit[1], hit[2]
        # Download and parse off the event loop: the files are several MB.
        rows, as_of = await asyncio.to_thread(_load_table, url, refresh_hours)
        _tables[url] = (time.time(), rows, as_of)
        return rows, as_of


async def _sections() -> Tuple[List[Dict[str, str]], Optional[str]]:
    url = get_settings().academics.snapshot.sections_url
    if not url:
        raise RuntimeError("academics.snapshot.sections_url is not configured")
    return await _table(url)


async def _grades() -> Tuple[List[Dict[str, str]], Optional[str], List[str]]:
    """Rows from every grades file, the newest file date, and failed files.

    A file that can't be loaded is skipped and reported; only when every file
    fails does this raise.
    """
    urls = get_settings().academics.snapshot.grades_urls
    results = await asyncio.gather(*(_table(url) for url in urls), return_exceptions=True)
    rows: List[Dict[str, str]] = []
    dates: List[str] = []
    failures: List[str] = []
    for url, result in zip(urls, results):
        if isinstance(result, BaseException):
            logger.warning("Grades file %s failed: %s", url, result)
            failures.append(f"{url.rsplit('/', 1)[-1]}: {result}")
            continue
        table, as_of = result
        rows.extend(table)
        if as_of:
            dates.append(as_of)
    if urls and len(failures) == len(urls):
        raise RuntimeError("No grades files could be loaded: " + "; ".join(failures))
    return rows, max(dates) if dates else None, failures


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split(identifier: str) -> Tuple[str, str]:
    """``"CS 2100"`` / ``"cs2100"`` -> (``"CS"``, ``"2100"``)."""
    match = re.match(r"^\s*([A-Za-z]+)\s*(\d{3,4}[A-Za-z]?)\s*$", identifier or "")
    if not match:
        return "", ""
    return match.group(1).upper(), match.group(2).upper()


def _identifier(subject: str, number: str) -> str:
    return f"{subject} {number}".strip()


def _int(value: Any) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0


def _float(value: Any) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


_SEASON_ORDER = {"january": 0, "spring": 1, "summer": 2, "fall": 3}


def _term_order(label: str) -> Tuple[int, int]:
    """``"2025 Fall"`` -> (2025, 3) so terms sort chronologically."""
    year, _, season = (label or "").partition(" ")
    return _int(year), _SEASON_ORDER.get(season.strip().lower(), -1)


def _meta(as_of: Optional[str]) -> Dict[str, Any]:
    snapshot = get_settings().academics.snapshot
    when = f"as of {as_of}" if as_of else "of unknown date"
    return {
        "data_as_of": as_of,
        "data_source": {"name": snapshot.source_name, "url": snapshot.source_url},
        "data_note": (
            f"Snapshot data {when} from {snapshot.source_name or 'a public export'}. "
            "Enrollment and seat counts are historical, not current availability."
        ),
    }


def _instructors(row: Dict[str, str]) -> str:
    names = [row.get(f"Instructor{i}", "").strip() for i in range(1, 5)]
    return ", ".join(dict.fromkeys(n for n in names if n and n != "-"))


def _meetings(row: Dict[str, str]) -> List[str]:
    meetings = []
    for i in range(1, 5):
        days = (row.get(f"Days{i}") or "").strip()
        dates = (row.get(f"MeetingDates{i}") or "").strip()
        if days:
            meetings.append(f"{days} ({dates})" if dates else days)
    return meetings


# ---------------------------------------------------------------------------
# Provider interface
# ---------------------------------------------------------------------------

async def search_courses(
    *,
    tool_name: str = "",
    subject: str = "",
    course_number: str = "",
    keyword: str = "",
    limit: int = 20,
) -> List[Dict[str, Any]]:
    del tool_name
    rows, as_of = await _sections()
    subject_token = re.sub(r"\s+", "", subject).upper()
    number_token = course_number.strip().upper()
    words = [w.lower() for w in keyword.split()] if keyword else []
    meta = _meta(as_of)

    courses: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        subj, num = row.get("Mnemonic", "").upper(), row.get("Number", "").upper()
        if subject_token and subj != subject_token:
            continue
        if number_token and num != number_token:
            continue
        key = _identifier(subj, num)
        if words:
            haystack = " ".join([key, row.get("Title", ""), row.get("Topic", ""), row.get("Description", "")]).lower()
            if not all(word in haystack for word in words):
                continue
        if key not in courses:
            courses[key] = {
                "identifier": key,
                "subjects": subj,
                "number": num,
                "title": row.get("Title", ""),
                "description": row.get("Description", ""),
                "units": row.get("Units", ""),
                "prereq_text": "",
                **meta,
            }
            if len(courses) >= limit:
                break
    return list(courses.values())


async def course_grades(*, tool_name: str = "", course_identifier: str) -> Dict[str, Any]:
    del tool_name
    subject, number = _split(course_identifier)
    query_meta = {"course_identifier": course_identifier}
    if not subject:
        return {"grades": None, "error": f"Could not read '{course_identifier}' as a course.", "query": query_meta}
    try:
        all_rows, as_of, failures = await _grades()
        rows = [
            r for r in all_rows
            if r.get("Subject", "").upper() == subject and r.get("Catalog Number", "").upper() == number
        ]
    except Exception as exc:  # noqa: BLE001
        logger.error("snapshot grades failed: %s", exc)
        return {"grades": None, "error": str(exc), "query": query_meta}
    if not rows:
        return {"grades": None, "error": f"No grade data found for '{_identifier(subject, number)}'.", "query": query_meta}

    by_term: Dict[str, List[Dict[str, str]]] = {}
    for row in rows:
        by_term.setdefault(row.get("Term Desc", ""), []).append(row)

    def summarize(group: List[Dict[str, str]], label: str) -> Dict[str, Any]:
        students = sum(_int(r.get("# of Students")) for r in group)
        weighted = sum((_float(r.get("Course GPA")) or 0) * _int(r.get("# of Students")) for r in group)
        distribution = {b: sum(_int(r.get(b)) for r in group) for b in _GRADE_BUCKETS}
        instructors = ", ".join(dict.fromkeys(r.get("Primary Instructor Name", "") for r in group if r.get("Primary Instructor Name")))
        return {
            "term_code": label,
            "total": students,
            "distribution": distribution,
            "average_gpa": round(weighted / students, 2) if students else None,
            "dfw_rate": round(distribution["DFW"] / students, 3) if students else None,
            "instructors": instructors,
        }

    terms = [summarize(group, label) for label, group in by_term.items()]
    terms.sort(key=lambda t: _term_order(t["term_code"]), reverse=True)
    return {
        "course_identifier": _identifier(subject, number),
        "grade_scale": "A+..C-, DFW (UVA)",
        "cumulative": summarize(rows, "cumulative"),
        "terms": terms,
        "query": query_meta,
        **_meta(as_of),
        "data_note": (
            "Grade distributions from UVA's public grade reports via theCourseForum. "
            "DFW counts D, F and withdrawals together."
        ),
        **({"partial_failure": failures} if failures else {}),
    }


async def prerequisites(*, tool_name: str = "", course_identifier: str) -> Dict[str, Any]:
    del tool_name
    return {
        "course": None,
        "error": _NOT_AVAILABLE.format(what="prerequisite information"),
        "query": {"course_identifier": course_identifier},
    }


async def next_courses(*, tool_name: str = "", course_identifier: str, limit: int = 40) -> Dict[str, Any]:
    del tool_name, limit
    return {
        "course": None,
        "error": _NOT_AVAILABLE.format(what="which courses a course leads to"),
        "query": {"course_identifier": course_identifier},
    }


async def course_sections(
    *,
    tool_name: str = "",
    course_identifier: str,
    term: str = "",
    limit: int = 25,
) -> Dict[str, Any]:
    del tool_name, term  # the snapshot holds one term
    subject, number = _split(course_identifier)
    query_meta = {"course_identifier": course_identifier}
    try:
        rows, as_of = await _sections()
    except Exception as exc:  # noqa: BLE001
        logger.error("snapshot sections failed: %s", exc)
        return {"sections": [], "error": str(exc), "query": query_meta}
    matches = [
        r for r in rows
        if r.get("Mnemonic", "").upper() == subject and r.get("Number", "").upper() == number
    ]
    if not matches:
        return {"sections": [], "error": f"No sections found for '{_identifier(subject, number)}'.", "query": query_meta}
    sections = []
    for row in matches[:limit]:
        enrolled, capacity = _int(row.get("Enrollment")), _int(row.get("EnrollmentLimit"))
        sections.append({
            "section": row.get("Section", ""),
            "type": row.get("Type", ""),
            "instructors": _instructors(row),
            "meetings": _meetings(row),
            "status_at_snapshot": row.get("Status", ""),
            "enrolled_at_snapshot": enrolled,
            "capacity": capacity,
            "waitlist_at_snapshot": _int(row.get("Waitlist")),
        })
    return {
        "course_identifier": _identifier(subject, number),
        "title": matches[0].get("Title", ""),
        "sections": sections,
        "total_results": len(sections),
        "truncated": len(matches) > limit,
        "query": query_meta,
        **_meta(as_of),
    }
