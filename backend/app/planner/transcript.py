"""Course rows from an uploaded transcript, for the setup dialog's Completed step.

Pure code over the transcript's text (``utils/document_extractor`` reads the
file, in memory); no I/O and no logging, so nothing from the transcript
leaves this module except the rows it returns (setup-dialog R5, R8).

``scan`` finds course codes line by line. A code is a subject of one to three
upper-case words (UW's ``COMP SCI``, ``E M A``; UVA's ``ECON``; CU's
``CSCI``) and a three- or four-digit number, or the two fused (``CS2100``).
With the school's known subjects (from its program files) the longest known
subject before the number wins, so ``FALL 2024`` or a title word never reads
as a subject; a subject not in that list is kept only when its row carries a
grade or credits. The text after a code, up to the next code on the line, is
its row: trailing grade and number tokens are the grade and credits (the
first number, which is the attempted credits on a row with quality points;
a whole number before a decimal one stays in the title, as in
``Computer Science 1  4.0  A``), the rest the title. The last term heading seen (``Fall 2024``) is the row's
term.

``collapse`` keeps one row per course: its latest passing attempt, else its
latest attempt (R9). ``rows_for`` adds what the catalog check found (R6).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from app.planner.checker import term_key
from app.planner.facts import CourseFacts
from app.planner.programs import normalize_course

# Ticked to start with (R9): letter grades A to D- (UW's AB and BC too) and
# pass grades. Every other grade, and no grade, is listed unticked.
PASSING = {"A+", "A", "A-", "AB", "B+", "B", "B-", "BC", "C+", "C", "C-", "D+", "D", "D-", "P", "S", "CR"}
NOT_PASSING = {"F", "W", "WF", "WP", "NC", "U", "I", "INC", "IP"}
GRADES = PASSING | NOT_PASSING
CREDITS_RANGE = (0.0, 12.0)
MAX_SUBJECT_WORDS = 3

# Upper-case words that come before a number on a transcript without being a subject.
NOT_SUBJECTS = {
    "FALL", "SPRING", "SUMMER", "WINTER", "AUTUMN", "TERM", "SEMESTER", "SESSION", "YEAR", "PAGE", "OF",
    "TOTAL", "TOTALS", "GPA", "CUM", "CUMULATIVE", "EARNED", "ATTEMPTED", "CREDITS", "CREDIT", "UNITS",
    "HOURS", "HRS", "POINTS", "QPTS", "ID", "NO", "NUMBER", "STUDENT", "DATE", "ROOM", "SUITE", "BOX",
    "PO", "ZIP", "PHONE", "CATALOG", "CLASS", "AND", "THE", "IN", "AT", "TO", "FOR", "TRANSFER",
}

_SEASON = r"(Fall|Spring|Summer|Winter|Autumn)"
_TERM = re.compile(rf"\b{_SEASON}\s+(?:Term\s+|Semester\s+)?(\d{{4}})\b|\b(\d{{4}})\s+{_SEASON}\b", re.IGNORECASE)
_WORD = re.compile(r"^[A-Z][A-Z&]*$")
_NUMBER = re.compile(r"^\d{3,4}[A-Z]?$")
_FUSED = re.compile(r"^([A-Z][A-Z&]{1,7})(\d{3,4}[A-Z]?)$")
_CREDITS = re.compile(r"^\d{1,2}(?:\.\d{1,3})?$")
_DASHES = str.maketrans({"−": "-", "–": "-", "—": "-"})


@dataclass(frozen=True)
class Row:
    id: str  # "COMP SCI 300"
    title: str
    grade: Optional[str]  # upper-case, as on the transcript ("A-", "IP"); None when absent
    credits: Optional[float]  # None when absent or outside 0-12
    term: Optional[str]  # "Fall 2024"
    position: int  # order in the text, for repeats in the same term


def known_subjects(programs: Iterable[object]) -> List[str]:
    """Subjects named by the school's program files (rule courses, groups,
    level subjects), the list ``scan`` prefers."""
    from app.planner.checker import split_id

    found = set()
    for program in programs:
        for rule in getattr(program, "rules", ()) or ():
            ids = list(getattr(rule, "courses", ()) or ()) + list(getattr(rule, "exclude", ()) or ())
            ids += [c for group in getattr(rule, "groups", ()) or () for c in group]
            found.update(split_id(c)[0] for c in ids)
            found.update(getattr(rule, "subjects", ()) or ())
    return sorted(s for s in found if s)


def _term_of(text: str) -> Optional[str]:
    match = _TERM.search(text)
    if not match:
        return None
    season, year = (match.group(1), match.group(2)) if match.group(1) else (match.group(4), match.group(3))
    return f"{season.title()} {year}"


def grade_token(token: str) -> Optional[str]:
    grade = token.translate(_DASHES).upper().strip("()*")
    return grade if grade in GRADES else None


def _credits(token: str) -> Optional[float]:
    if not _CREDITS.match(token):
        return None
    return float(token)


def _subject(words: Sequence[str], known: set) -> Tuple[Optional[str], bool]:
    """The subject ending at ``words[-1]``, and whether it is a known one."""
    words = list(words[-MAX_SUBJECT_WORDS:])
    for size in range(len(words), 0, -1):
        subject = " ".join(words[-size:])
        if subject in known:
            return subject, True
    # Not a known subject: the words back to the first that can't be part of one.
    taken: List[str] = []
    for word in reversed(words):
        if word in NOT_SUBJECTS or (len(word) > 1 and word in GRADES):
            break
        taken.insert(0, word)
    return (" ".join(taken) or None), False


def _codes(tokens: List[str], known: set) -> List[Tuple[int, int, str, bool]]:
    """``(start, end, code, known)`` for each course code in a line's tokens;
    ``tokens[start:end]`` are the code's own tokens."""
    found = []
    for i, token in enumerate(tokens):
        fused = _FUSED.match(token)
        if fused:
            subject, number, start = fused.group(1), fused.group(2), i
            is_known = subject in known
            if subject in NOT_SUBJECTS:
                continue
        elif _NUMBER.match(token):
            words: List[str] = []
            j = i
            while j > 0 and len(words) < MAX_SUBJECT_WORDS and _WORD.match(tokens[j - 1]):
                words.insert(0, tokens[j - 1])
                j -= 1
            subject, is_known = _subject(words, known)
            if not subject:
                continue
            start = i - len(subject.split())
        else:
            continue
        try:
            code = normalize_course(f"{subject} {number if fused else token}")
        except ValueError:
            continue
        if found and start < found[-1][1]:
            continue  # overlaps the code before it
        found.append((start, i + 1, code, is_known))
    return found


def _row_fields(tokens: List[str]) -> Tuple[str, Optional[str], Optional[float]]:
    """``(title, grade, credits)`` from the tokens after a code."""
    tail: List[str] = []
    grade_seen = False
    for token in reversed(tokens):
        if _credits(token) is not None:
            tail.insert(0, token)
        elif grade_token(token) and not grade_seen:
            tail.insert(0, token)
            grade_seen = True
        else:
            break
    decimal = next((i for i, t in enumerate(tail) if "." in t and _credits(t) is not None), None)
    while decimal and _credits(tail[0]) is not None and "." not in tail[0]:
        tail.pop(0)  # "Computer Science 1  4.0  A": the 1 is the title's
        decimal -= 1
    title_tokens = tokens[: len(tokens) - len(tail)]
    grades = [grade_token(t) for t in tail if grade_token(t)]
    numbers = [_credits(t) for t in tail if _credits(t) is not None]
    credits = numbers[0] if numbers else None
    low, high = CREDITS_RANGE
    if credits is not None and not low <= credits <= high:
        credits = None
    return " ".join(title_tokens).strip(" -:|"), (grades[-1] if grades else None), credits


def scan(text: str, subjects: Iterable[str] = ()) -> List[Row]:
    """Every course row in ``text``, in order; repeats are kept (see ``collapse``)."""
    known = {" ".join(s.upper().split()) for s in subjects if s}
    rows: List[Row] = []
    term: Optional[str] = None
    for line in (text or "").splitlines():
        tokens = line.split()
        codes = _codes(tokens, known)
        if not codes:
            term = _term_of(line) or term
            continue
        term = line_term = _term_of(" ".join(tokens[: codes[0][0]])) or term
        for index, (start, end, code, is_known) in enumerate(codes):
            stop = codes[index + 1][0] if index + 1 < len(codes) else len(tokens)
            rest = tokens[end:stop]
            row_term = _term_of(" ".join(rest)) or line_term
            rest = _TERM.sub(" ", " ".join(rest)).split()
            title, grade, credits = _row_fields(rest)
            if not is_known and grade is None and credits is None:
                continue  # an unknown subject with nothing else course-like about it
            rows.append(Row(code, title, grade, credits, row_term, len(rows)))
    return rows


def passing(grade: Optional[str]) -> bool:
    return grade in PASSING


def collapse(rows: Sequence[Row]) -> List[Row]:
    """One row per course, in order of first appearance: the latest passing
    attempt, or the latest attempt when none passed (R9)."""
    by_id: Dict[str, List[Row]] = {}
    for row in rows:
        by_id.setdefault(row.id, []).append(row)
    picked = []
    for attempts in by_id.values():
        latest = lambda r: (term_key(r.term), r.position)  # noqa: E731
        passed = [r for r in attempts if passing(r.grade)]
        picked.append(max(passed or attempts, key=latest))
    return sorted(picked, key=lambda r: min(a.position for a in by_id[r.id]))


def rows_for(rows: Sequence[Row], facts: Dict[str, CourseFacts]) -> Dict[str, object]:
    """``{rows, counts}`` for the route. A row is ticked only when it passed,
    was checked in time and is in the catalog; ``in_catalog`` is None for a
    row not checked in time."""
    out = []
    for row in rows:
        fact = facts.get(row.id)
        checked = fact is not None and fact.known in ("yes", "no")
        in_catalog = (fact.known == "yes") if checked else None
        title = fact.title if in_catalog and fact.title else row.title
        out.append({
            "id": row.id, "title": title, "grade": row.grade, "credits": row.credits, "term": row.term,
            "ticked": bool(passing(row.grade) and in_catalog), "checked": checked, "in_catalog": in_catalog,
        })
    counts = {
        "rows": len(out),
        "ticked": sum(r["ticked"] for r in out),
        "not_checked": sum(not r["checked"] for r in out),
        "not_in_catalog": sum(r["in_catalog"] is False for r in out),
    }
    return {"rows": out, "counts": counts}

