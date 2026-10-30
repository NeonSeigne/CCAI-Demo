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
from app.planner.facts import CourseFacts, Meeting, Section
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


def _weighted_gpa(rows: List[Dict[str, str]]) -> Optional[float]:
    """Student-weighted average of ``Course GPA``. Rows without a GPA (blank
    in the grade reports) count in neither the sum nor the student total."""
    graded = [(_float(r.get("Course GPA")), _int(r.get("# of Students"))) for r in rows]
    graded = [(gpa, n) for gpa, n in graded if gpa is not None and n > 0]
    students = sum(n for _, n in graded)
    return round(sum(gpa * n for gpa, n in graded) / students, 2) if students else None


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
        if key in courses:
            # Keep adding this course's sections to its seat count.
            _add_seats(courses[key], row)
            continue
        if len(courses) >= limit:
            continue
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
                "seats_open_at_snapshot": 0,
                **meta,
            }
            _add_seats(courses[key], row)
    return list(courses.values())


def _add_seats(course: Dict[str, Any], row: Dict[str, str]) -> None:
    """Add a section's open seats (at snapshot time) to its course row."""
    open_seats = _int(row.get("EnrollmentLimit")) - _int(row.get("Enrollment"))
    course["seats_open_at_snapshot"] += max(open_seats, 0)


async def lookup_course(identifier: str) -> Dict[str, Any]:
    """The course's identifier, title and description from the snapshot.

    Raises ``FileNotFoundError`` when neither the sections nor the grades
    files list it, and ``RuntimeError`` when the files can't be loaded.
    """
    subject, number = _split(identifier)
    if not subject:
        raise FileNotFoundError(f"Could not read '{identifier}' as a course.")
    rows, _ = await _sections()
    for row in rows:
        if row.get("Mnemonic", "").upper() == subject and row.get("Number", "").upper() == number:
            return {
                "identifier": _identifier(subject, number),
                "title": row.get("Title", ""),
                "description": row.get("Description", ""),
            }
    grade_rows, _, _ = await _grades()
    for row in grade_rows:
        if row.get("Subject", "").upper() == subject and row.get("Catalog Number", "").upper() == number:
            return {"identifier": _identifier(subject, number), "title": row.get("Class Title", ""), "description": ""}
    raise FileNotFoundError(f"No course found for '{_identifier(subject, number)}'")


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
        distribution = {b: sum(_int(r.get(b)) for r in group) for b in _GRADE_BUCKETS}
        instructors = ", ".join(dict.fromkeys(r.get("Primary Instructor Name", "") for r in group if r.get("Primary Instructor Name")))
        return {
            "term_code": label,
            "total": students,
            "distribution": distribution,
            "average_gpa": _weighted_gpa(group),
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


def display_name(name: str) -> str:
    """Grades files write ``"Morrison,Briana"``; sections files ``"Briana Morrison"``."""
    last, comma, first = (name or "").partition(",")
    return " ".join(f"{first} {last}".split()) if comma else " ".join((name or "").split())


async def instructor_grades(course_identifier: str) -> List[Dict[str, Any]]:
    """``[{name, gpa, students}]`` per primary instructor across every grades
    file, the most recent teacher first. Empty when there are no grade rows."""
    subject, number = _split(course_identifier)
    if not subject:
        return []
    try:
        index, _, _, _ = await _grade_index()
    except Exception as exc:  # noqa: BLE001 — an extra beside the pooled grades
        logger.warning("snapshot instructor grades failed: %s", exc)
        return []
    groups: Dict[str, List[Dict[str, str]]] = {}
    for row in index.get(_identifier(subject, number)) or []:
        name = display_name(row.get("Primary Instructor Name", ""))
        if name:
            groups.setdefault(name, []).append(row)
    out = []
    for name, rows in groups.items():
        latest = max(_term_order(r.get("Term Desc", "")) for r in rows)
        out.append(({
            "name": name,
            "gpa": _course_gpa(rows),
            "students": sum(_int(r.get("# of Students")) for r in rows),
        }, latest))
    out.sort(key=lambda item: (item[1], item[0]["students"]), reverse=True)
    return [item for item, _ in out]


# "Prerequisite(s):", "Pre-requisite:", "Co-requisite:" labels in descriptions.
_REQUISITE_LABEL = re.compile(r"\b(pre|co)-?\s?requisites?\s*:\s*", re.I)
# A sentence break, unless the next sentence starts with a course code
# ("ECON 3010. ECON 3110 also counts").
_SENTENCE_END = re.compile(r"\.\s+(?=[A-Z])(?![A-Z]{2,5}\s?\d{4}\b)")
_CODE = re.compile(r"\b([A-Z]{2,5})\s?(\d{4})\b|\b(\d{4})\b")
_REQUISITE_TEXT_LIMIT = 400


def requisite_segments(description: str) -> List[Tuple[str, str]]:
    """``[(timing, text)]`` for each requisite label in a description, each
    text cut at the end of its sentence: ``"prior"`` for prerequisites,
    ``"concurrent"`` for co-requisites."""
    text = " ".join((description or "").split())
    labels = list(_REQUISITE_LABEL.finditer(text))
    out = []
    for i, label in enumerate(labels):
        end = labels[i + 1].start() if i + 1 < len(labels) else len(text)
        body = text[label.end():end]
        stop = _SENTENCE_END.search(body)
        body = (body[:stop.start()] if stop else body).strip().rstrip(".;, ")
        if body:
            timing = "concurrent" if label.group(1).lower() == "co" else "prior"
            out.append((timing, f"{label.group(0).strip()} {body}"))
    return out


def requisite_codes(text: str) -> List[str]:
    """Course codes in requisite text; a bare number takes the subject before
    it ("ECON 3010 or 3110" -> ECON 3010, ECON 3110)."""
    codes: List[str] = []
    subject = ""
    for match in _CODE.finditer(text or ""):
        if match.group(1):
            subject = match.group(1)
            code = _identifier(subject, match.group(2))
        elif subject:
            code = _identifier(subject, match.group(3))
        else:
            continue
        if code not in codes:
            codes.append(code)
    return codes


async def _snapshot_courses() -> Tuple[List[Index], Index, Optional[str]]:
    """Sections indexes of every term file (newest term first), the grade
    index and the newest sections file's date. A file that can't load is
    left out."""
    files = term_files()
    newest_first = sorted(files, key=lambda t: _term_order(" ".join(reversed(t.split()))), reverse=True)
    loaded = await asyncio.gather(*(_table(files[t]) for t in newest_first), return_exceptions=True)
    ok = [(t, result) for t, result in zip(newest_first, loaded) if not isinstance(result, BaseException)]
    indexes = [_index(files[t], result[0], "Mnemonic", "Number") for t, result in ok]
    grades, _, _, _ = await _grade_index()
    return indexes, grades, ok[0][1][1] if ok else None


async def term_instructors(identifier: str, term: str) -> Optional[List[str]]:
    """Instructors of the course's sections in ``term``'s file, in file order;
    ``[]`` when the term doesn't list the course, None when no file covers
    the term. Raises ``RuntimeError`` when the file can't be loaded."""
    url = term_files().get(_same_term(term))
    subject, number = _split(identifier)
    if not url or not subject:
        return None
    rows, _ = await _table(url)
    names: List[str] = []
    for row in _index(url, rows, "Mnemonic", "Number").get(_identifier(subject, number)) or []:
        names.extend(n.strip() for n in _instructors(row).split(","))
    return list(dict.fromkeys(n for n in names if n))


async def prerequisites(*, tool_name: str = "", course_identifier: str) -> Dict[str, Any]:
    """Requisites read from the course description, the newest term first.

    The snapshot has no structured prerequisites: ``prereq_text`` is the
    description's "Prerequisite:" / "Co-requisite:" sentences as written, and
    ``prerequisites`` the courses they name that the snapshot lists, each
    with ``timing`` (``prior`` or ``concurrent``). Whether they combine with
    "and" or "or" is in the text only.
    """
    del tool_name
    query_meta = {"course_identifier": course_identifier}
    subject, number = _split(course_identifier)
    if not subject:
        return {"course": None, "error": f"Could not read '{course_identifier}' as a course.", "query": query_meta}
    key = _identifier(subject, number)
    try:
        indexes, grades, as_of = await _snapshot_courses()
    except Exception as exc:  # noqa: BLE001
        logger.error("snapshot prerequisites failed: %s", exc)
        return {"course": None, "error": str(exc), "query": query_meta}
    rows = [row for index in indexes for row in index.get(key) or []]
    if not rows and key not in grades:
        return {"course": None, "error": f"No course found for '{key}'.", "query": query_meta}

    def title_of(code: str) -> str:
        for index in indexes:
            if index.get(code):
                return index[code][0].get("Title", "")
        return (grades.get(code) or [{}])[0].get("Class Title", "")

    segments: List[Tuple[str, str]] = []
    for row in rows:
        segments = requisite_segments(row.get("Description", ""))
        if segments:
            break
    courses: List[Dict[str, Any]] = []
    for timing, text in segments:
        for code in requisite_codes(text.partition(":")[2]):
            known = any(code in index for index in indexes) or code in grades
            if code == key or not known or any(c["identifier"] == code for c in courses):
                continue
            courses.append({"identifier": code, "title": title_of(code), "timing": timing})
    prereq_text = ". ".join(text for _, text in segments)[:_REQUISITE_TEXT_LIMIT]
    return {
        "course_identifier": key,
        "title": title_of(key),
        "prereq_text": prereq_text,
        "prerequisites": courses,
        "has_prerequisites": bool(prereq_text or courses),
        "query": query_meta,
        **_meta(as_of),
        "data_note": (
            "Prerequisites as written in the course description; the snapshot "
            "does not say how they combine beyond the text."
        ),
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
            # The planner's section id (course_facts uses ClassNumber).
            "id": row.get("ClassNumber") or row.get("Section", ""),
            "section": row.get("Section", ""),
            "type": row.get("Type", ""),
            "instructors": _instructors(row),
            "meetings": _meetings(row),
            "meeting_times": [
                {"day": m.day, "start": m.start, "end": m.end}
                for i in range(1, 5) for m in parse_meetings(row.get(f"Days{i}", ""))
            ],
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


# ---------------------------------------------------------------------------
# Planner course facts
# ---------------------------------------------------------------------------

_SECTION_KINDS = {
    "lecture": "lecture", "discussion": "discussion", "laboratory": "lab",
    "seminar": "seminar", "sem": "seminar",
}
# Kinds a full enrolment takes one of each of, when a course lists them.
_BUNDLE_KINDS = ("lecture", "lab", "discussion")
_DAYS = {"mo": "Mo", "tu": "Tu", "we": "We", "th": "Th", "fr": "Fr", "sa": "Sa", "su": "Su"}
_MEETING = re.compile(r"^([a-z]+)\s+(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)$", re.I)
_UNAVAILABLE = "theCourseForum snapshot couldn't be loaded"

Index = Dict[str, List[Dict[str, str]]]
# Per-file course index, rebuilt when the file's rows are reloaded.
_indexes: Dict[str, Tuple[List[Dict[str, str]], Index]] = {}
# Hardest-third cutoff for the grade tables it was computed from.
_grade_stats: Dict[str, Any] = {}


def _file_term(url: str) -> Optional[str]:
    """``.../2027_spring.csv`` -> ``"Spring 2027"``."""
    match = re.search(r"(\d{4})_(spring|summer|fall|january)", url or "", re.I)
    return f"{match.group(2).title()} {match.group(1)}" if match else None


def _same_term(term: str) -> str:
    return " ".join((term or "").split()).title()


def term_files() -> Dict[str, str]:
    """Sections file per term: ``sections_by_term`` plus ``sections_url``."""
    snapshot = get_settings().academics.snapshot
    files = {_same_term(term): url for term, url in snapshot.sections_by_term.items() if url}
    term = _file_term(snapshot.sections_url)
    if snapshot.sections_url and term and term not in files:
        files[term] = snapshot.sections_url
    return files


def planner_terms() -> List[str]:
    """Terms the configured sections files cover, oldest first."""
    def order(term: str) -> Tuple[int, int]:
        season, _, year = term.rpartition(" ")
        return _int(year), _SEASON_ORDER.get(season.lower(), -1)

    return sorted(term_files(), key=order)


def _index(url: str, rows: List[Dict[str, str]], subject_key: str, number_key: str) -> Index:
    """Rows of one loaded file by course identifier."""
    hit = _indexes.get(url)
    if hit and hit[0] is rows:
        return hit[1]
    index: Index = {}
    for row in rows:
        key = _identifier(row.get(subject_key, "").upper(), row.get(number_key, "").upper())
        index.setdefault(key, []).append(row)
    _indexes[url] = (rows, index)
    return index


async def _grade_index() -> Tuple[Index, Optional[str], bool, Tuple[int, ...]]:
    """Grade rows of every grades file by course, the newest file date,
    whether any file failed, and a key that changes when a file reloads."""
    urls = get_settings().academics.snapshot.grades_urls
    loaded = await asyncio.gather(*(_table(url) for url in urls), return_exceptions=True)
    merged: Index = {}
    dates: List[str] = []
    failed = False
    key: List[int] = []
    for url, result in zip(urls, loaded):
        if isinstance(result, BaseException):
            logger.warning("Grades file %s failed: %s", url, result)
            failed = True
            continue
        rows, as_of = result
        key.append(id(rows))
        if as_of:
            dates.append(as_of)
        for course, group in _index(url, rows, "Subject", "Catalog Number").items():
            merged.setdefault(course, []).extend(group)
    return merged, max(dates) if dates else None, failed, tuple(key)


def _clock(text: str) -> str:
    """``"1:45pm"`` -> ``"13:45"``."""
    match = re.match(r"(\d{1,2}):(\d{2})\s*([ap])m", text.strip(), re.I)
    hour, minute, half = int(match.group(1)), match.group(2), match.group(3).lower()
    hour = hour % 12 + (12 if half == "p" else 0)
    return f"{hour:02d}:{minute}"


def parse_meetings(text: str) -> List[Meeting]:
    """``"tuth 12:30pm - 1:45pm"`` -> Tu and Th 12:30-13:45; ``"tba"`` -> []."""
    match = _MEETING.match((text or "").strip())
    if not match:
        return []
    letters = match.group(1).lower()
    days = [letters[i:i + 2] for i in range(0, len(letters), 2)]
    if not days or any(d not in _DAYS for d in days):
        return []
    start, end = _clock(match.group(2)), _clock(match.group(3))
    return [Meeting(day=_DAYS[d], start=start, end=end) for d in days]


def parse_units(text: str) -> Optional[Tuple[float, float]]:
    """``"3"`` -> (3, 3), ``"1 - 12"`` -> (1, 12), ``""`` -> None."""
    numbers = [_float(part) for part in (text or "").split("-")]
    if not numbers or any(n is None for n in numbers):
        return None
    return min(numbers), max(numbers)


def _section_kind(text: str) -> str:
    return _SECTION_KINDS.get((text or "").strip().lower(), "other")


def _course_credits(rows: List[Dict[str, str]]) -> Optional[Tuple[float, float]]:
    """Credit range of a course: its lectures' units, zero-unit companions aside."""
    lectures = [r for r in rows if _section_kind(r.get("Type", "")) == "lecture"]
    ranges = [u for u in (parse_units(r.get("Units", "")) for r in lectures or rows) if u]
    nonzero = [u for u in ranges if u[1] > 0] or ranges
    if not nonzero:
        return None
    return min(u[0] for u in nonzero), max(u[1] for u in nonzero)


def _term_sections(rows: List[Dict[str, str]]) -> List[Section]:
    kinds = {_section_kind(r.get("Type", "")) for r in rows}
    bundle = [k for k in _BUNDLE_KINDS if k in kinds]
    sections = []
    for row in rows:
        kind = _section_kind(row.get("Type", ""))
        meetings = [m for i in range(1, 5) for m in parse_meetings(row.get(f"Days{i}", ""))]
        open_seats = _int(row.get("EnrollmentLimit")) - _int(row.get("Enrollment"))
        sections.append(Section(
            id=row.get("ClassNumber") or row.get("Section", ""),
            kind=kind,
            meetings=tuple(meetings) if meetings else None,
            seats_open=max(open_seats, 0),
            # Lecture plus discussion/lab rows: a full enrolment takes one of each.
            requires=tuple(k for k in bundle if k != kind) if len(bundle) > 1 and kind in bundle else (),
        ))
    return sections


def _gen_ed(rows: List[Dict[str, str]]) -> Optional[List[str]]:
    """``Disciplines`` names, split on ``$`` (names themselves contain commas)."""
    names = [
        name.strip() for row in rows
        for name in (row.get("Disciplines") or "").split("$") if name.strip()
    ]
    return list(dict.fromkeys(names)) or None


def _course_gpa(rows: List[Dict[str, str]]) -> Optional[float]:
    return _weighted_gpa(rows)


def _hardest_third(index: Index, key: Tuple[int, ...]) -> Optional[float]:
    """Average GPA below which a course is in the snapshot's hardest third."""
    if _grade_stats.get("key") == key:
        return _grade_stats["cutoff"]
    gpas = sorted(g for g in (_course_gpa(group) for group in index.values()) if g is not None)
    cutoff = gpas[len(gpas) // 3] if len(gpas) >= 3 else None
    _grade_stats.update(key=key, cutoff=cutoff)
    return cutoff


async def course_facts(
    identifiers: List[str], term: str, *, harder_below_gpa: Optional[float] = None
) -> Dict[str, CourseFacts]:
    """Planner facts for ``identifiers`` in ``term`` from the snapshot files.

    A course is known when any sections or grades file lists it; it is
    offered when the asked term's file does. Prerequisites aren't published.
    ``harder_below_gpa`` overrides the hardest-third cutoff from the grades.
    Never raises: a file that can't load makes its answers unknown, and a
    course found nowhere while a file is down reads unavailable.
    """
    term = _same_term(term)
    files = term_files()
    loaded = await asyncio.gather(*(_table(url) for url in files.values()), return_exceptions=True)
    indexes: Dict[str, Tuple[Index, Optional[str]]] = {}
    failed = False
    for (label, url), result in zip(files.items(), loaded):
        if isinstance(result, BaseException):
            logger.warning("Sections file %s failed: %s", url, result)
            failed = True
            continue
        rows, as_of = result
        indexes[label] = (_index(url, rows, "Mnemonic", "Number"), as_of)
    grades, grades_as_of, grades_failed, grades_key = await _grade_index()
    failed = failed or grades_failed
    cutoff = harder_below_gpa if harder_below_gpa is not None else _hardest_third(grades, grades_key)

    def one(identifier: str) -> CourseFacts:
        subject, number = _split(identifier)
        if not subject:
            return CourseFacts(identifier=identifier, known="no")
        key = _identifier(subject, number)
        here = indexes[term][0].get(key) if term in indexes else None
        # Rows from every term's file, the asked term first.
        listed = [row for label in [term, *indexes] if label in indexes for row in indexes[label][0].get(key) or []]
        listed = list({id(row): row for row in listed}.values())
        graded = grades.get(key)
        if not (listed or graded):
            if failed:
                return CourseFacts(identifier=key, known="unavailable", unavailable_reason=_UNAVAILABLE)
            return CourseFacts(identifier=key, known="no")

        rows = here or listed
        offered = ("yes" if here else "no") if term in indexes else "unknown"
        avg_gpa = _course_gpa(graded) if graded else None
        title = rows[0].get("Title", "") if rows else graded[0].get("Class Title", "")
        return CourseFacts(
            identifier=key,
            known="yes",
            title=title,
            credits=_course_credits(rows) if rows else None,
            offered=offered,
            sections=_term_sections(here) if here else ([] if offered == "no" else None),
            bundles_known=bool(here),
            gen_ed=_gen_ed(listed),
            avg_gpa=avg_gpa,
            harder=(avg_gpa < cutoff) if avg_gpa is not None and cutoff is not None else None,
            prereq_tree=None,
            prereq_known=False,
            as_of=indexes[term][1] if here else grades_as_of,
        )

    out: Dict[str, CourseFacts] = {}
    for identifier in identifiers:
        try:
            out[identifier] = one(identifier)
        except Exception:  # noqa: BLE001 — one bad course never fails the batch
            logger.exception("Snapshot facts failed for %s", identifier)
            out[identifier] = CourseFacts(
                identifier=identifier, known="unavailable", unavailable_reason=_UNAVAILABLE
            )
    return out
