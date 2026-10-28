"""Hand-checked program files from the school pack.

Each ``schools/<slug>/programs/<id>.yaml`` describes one major, minor or
certificate as a list of rules (format: ``planner/CONTRACTS.md``, "Program
files"). Files are loaded once per school and validated strictly: a bad file
raises ``ValueError`` naming the file and the field, so a typo never turns
into a requirement that silently reads "met".

Rule kinds:

- ``all_of``        every listed course
- ``n_of``          ``n`` of the listed courses
- ``credits_from``  ``credits`` credits from the listed courses
- ``level``         ``n`` courses in ``subjects`` numbered ``min_level`` or
                    above (and ``max_level`` or below), minus ``exclude``
- ``one_of_groups`` every course of any one listed group (``groups``), e.g.
                    MATH 221, or MATH 211 and MATH 213

Anything the official page states that these kinds cannot express goes in the
program's (or rule's) ``notes`` so it is shown, not dropped. Course
identifiers are normalised to ``"SUBJ 1234"``: upper-case subject, one space.
Subjects may themselves contain spaces (UW's ``COMP SCI``).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from app.config import SCHOOLS_DIR

PROGRAM_TYPES = ("major", "minor", "certificate")
RULE_KINDS = ("all_of", "n_of", "credits_from", "level", "one_of_groups")

PROGRAM_FIELDS = {"id", "name", "type", "catalog_year", "source_url", "checked_on", "total_credits", "rules", "notes"}
RULE_FIELDS = {
    "id", "title", "kind", "courses", "n", "credits", "subjects", "min_level", "max_level",
    "exclude", "min_grade", "double_count", "notes", "groups",
}

_COURSE = re.compile(r"^([A-Z][A-Z &/]*?)\s*(\d{2,4}[A-Z]?)$")
_SUBJECT = re.compile(r"^[A-Z][A-Z &/]*$")
_GRADE = re.compile(r"^(?:[A-D][+-]?|F)$")
_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]*$")


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    kind: str  # one of RULE_KINDS
    courses: Tuple[str, ...] = ()
    n: Optional[int] = None  # n_of / level: number of courses
    credits: Optional[float] = None  # credits_from
    subjects: Tuple[str, ...] = ()  # level
    min_level: Optional[int] = None  # level
    max_level: Optional[int] = None  # level, optional
    exclude: Tuple[str, ...] = ()  # level
    groups: Tuple[Tuple[str, ...], ...] = ()  # one_of_groups
    min_grade: Optional[str] = None
    double_count: bool = False  # may a course also count toward another rule
    notes: Tuple[str, ...] = ()


@dataclass(frozen=True)
class Program:
    id: str
    name: str
    type: str  # one of PROGRAM_TYPES
    catalog_year: int
    source_url: str
    checked_on: date
    rules: Tuple[Rule, ...]
    total_credits: Optional[int] = None  # degree total-credit rule; None unknown
    notes: Tuple[str, ...] = ()  # requirements the rule kinds cannot express


_cache: Dict[str, Tuple[Program, ...]] = {}


class _Where:
    """Builds error messages that name the file and the field."""

    def __init__(self, label: object):
        self.label = str(label)  # the file path, plus the rule for rule fields

    def error(self, field: str, problem: str) -> ValueError:
        return ValueError(f"{self.label}: {field}: {problem}")


def normalize_subject(text: str) -> str:
    """``" comp  sci "`` -> ``"COMP SCI"``; raises ``ValueError`` if not a subject."""
    subject = " ".join(str(text or "").upper().split())
    if not _SUBJECT.match(subject):
        raise ValueError(f"not a subject code: {text!r}")
    return subject


def normalize_course(text: str) -> str:
    """``"econ2010"`` -> ``"ECON 2010"``, ``"comp  sci 300"`` -> ``"COMP SCI 300"``."""
    match = _COURSE.match(" ".join(str(text or "").upper().split()))
    if not match:
        raise ValueError(f"not a course identifier: {text!r}")
    return f"{normalize_subject(match.group(1))} {match.group(2)}"


def _text(raw: Dict[str, Any], key: str, where: _Where, required: bool = True) -> Optional[str]:
    value = raw.get(key)
    if value is None and not required:
        return None
    if not isinstance(value, str) or not value.strip():
        raise where.error(key, "must be a non-empty string")
    return value.strip()


def _int(raw: Dict[str, Any], key: str, where: _Where, required: bool, minimum: int = 0) -> Optional[int]:
    value = raw.get(key)
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < minimum:
        raise where.error(key, f"must be a whole number of at least {minimum}")
    return value


def _notes(raw: Dict[str, Any], where: _Where, field: str) -> Tuple[str, ...]:
    value = raw.get("notes")
    if value is None:
        return ()
    if not isinstance(value, list) or not all(isinstance(n, str) and n.strip() for n in value):
        raise where.error(field, "must be a list of non-empty strings")
    return tuple(n.strip() for n in value)


def _courses(raw: Dict[str, Any], key: str, where: _Where, field: str, required: bool) -> Tuple[str, ...]:
    value = raw.get(key)
    if value is None and not required:
        return ()
    if not isinstance(value, list) or (required and not value):
        raise where.error(field, "must be a non-empty list of course identifiers")
    try:
        courses = tuple(normalize_course(c) for c in value)
    except ValueError as exc:
        raise where.error(field, str(exc)) from None
    if len(set(courses)) != len(courses):
        raise where.error(field, "lists a course twice")
    return courses


def _checked_on(value: Any, where: _Where) -> date:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise where.error("checked_on", f"must be a date like 2026-10-28, got {value!r}") from None


def _rule(raw: Any, index: int, where: _Where) -> Rule:
    field = f"rules[{index}]"
    if not isinstance(raw, dict):
        raise where.error(field, "must be a mapping")
    unknown = sorted(set(raw) - RULE_FIELDS)
    if unknown:
        raise where.error(f"{field}.{unknown[0]}", "unknown field")
    rule_id = _text(raw, "id", _Where(f"{where.label}: {field}"))
    field = f"rules[{rule_id}]"
    rw = _Where(f"{where.label}: {field}")
    title = _text(raw, "title", rw)
    kind = raw.get("kind")
    if kind not in RULE_KINDS:
        raise rw.error("kind", f"must be one of {', '.join(RULE_KINDS)}, got {kind!r}")

    courses = _courses(raw, "courses", where, f"{field}.courses", required=kind not in ("level", "one_of_groups"))
    groups: Tuple[Tuple[str, ...], ...] = ()
    if kind == "one_of_groups":
        value = raw.get("groups")
        if not isinstance(value, list) or len(value) < 2:
            raise rw.error("groups", "must list at least two course groups")
        parsed = []
        for g_index, group in enumerate(value):
            if not isinstance(group, list) or not group:
                raise rw.error(f"groups[{g_index}]", "must be a non-empty list of courses")
            parsed.append(_courses({"group": group}, "group", where, f"{field}.groups[{g_index}]", required=True))
        groups = tuple(parsed)
        if courses:
            raise rw.error("courses", "is not used by one_of_groups; list the courses in groups")
    elif "groups" in raw:
        raise rw.error("groups", f"is only used by one_of_groups rules, not {kind}")
    n = _int(raw, "n", rw, required=kind in ("n_of", "level"), minimum=1)
    if kind == "n_of" and n > len(courses):
        raise rw.error("n", f"is {n} but only {len(courses)} courses are listed")
    credits = raw.get("credits")
    if kind == "credits_from":
        if isinstance(credits, bool) or not isinstance(credits, (int, float)) or credits <= 0:
            raise rw.error("credits", "must be a positive number")
        credits = float(credits)
    elif credits is not None:
        raise rw.error("credits", f"is only used by credits_from, not {kind}")

    subjects: Tuple[str, ...] = ()
    min_level = max_level = None
    exclude: Tuple[str, ...] = ()
    if kind == "level":
        value = raw.get("subjects")
        if not isinstance(value, list) or not value:
            raise rw.error("subjects", "must be a non-empty list of subject codes")
        try:
            subjects = tuple(normalize_subject(s) for s in value)
        except ValueError as exc:
            raise rw.error("subjects", str(exc)) from None
        min_level = _int(raw, "min_level", rw, required=True)
        max_level = _int(raw, "max_level", rw, required=False)
        if max_level is not None and max_level < min_level:
            raise rw.error("max_level", "is below min_level")
        exclude = _courses(raw, "exclude", where, f"{field}.exclude", required=False)
    else:
        for key in ("subjects", "min_level", "max_level", "exclude"):
            if key in raw:
                raise rw.error(key, f"is only used by level rules, not {kind}")

    min_grade = raw.get("min_grade")
    if min_grade is not None:
        min_grade = str(min_grade).strip().upper()
        if not _GRADE.match(min_grade):
            raise rw.error("min_grade", f"must be a letter grade like C-, got {raw.get('min_grade')!r}")
    double_count = raw.get("double_count", False)
    if not isinstance(double_count, bool):
        raise rw.error("double_count", "must be true or false")

    return Rule(
        id=rule_id, title=title, kind=kind, courses=courses, n=n, credits=credits,
        subjects=subjects, min_level=min_level, max_level=max_level, exclude=exclude,
        groups=groups, min_grade=min_grade, double_count=double_count, notes=_notes(raw, rw, "notes"),
    )


def _program(raw: Any, path: Path) -> Program:
    where = _Where(path)
    if not isinstance(raw, dict):
        raise ValueError(f"{path}: not a YAML mapping")
    unknown = sorted(set(raw) - PROGRAM_FIELDS)
    if unknown:
        raise where.error(unknown[0], "unknown field")
    program_id = _text(raw, "id", where)
    if program_id != path.stem:
        raise where.error("id", f"is {program_id!r} but the file is named {path.name}")
    program_type = raw.get("type")
    if program_type not in PROGRAM_TYPES:
        raise where.error("type", f"must be one of {', '.join(PROGRAM_TYPES)}, got {program_type!r}")
    if "checked_on" not in raw:
        raise where.error("checked_on", "is required")
    rules_raw = raw.get("rules")
    if not isinstance(rules_raw, list) or not rules_raw:
        raise where.error("rules", "must be a non-empty list")
    rules = tuple(_rule(r, i, where) for i, r in enumerate(rules_raw))
    ids = [r.id for r in rules]
    duplicate = next((i for i in ids if ids.count(i) > 1), None)
    if duplicate:
        raise where.error(f"rules[{duplicate}].id", "is used twice")
    return Program(
        id=program_id,
        name=_text(raw, "name", where),
        type=program_type,
        catalog_year=_int(raw, "catalog_year", where, required=True, minimum=1900),
        source_url=_text(raw, "source_url", where),
        checked_on=_checked_on(raw["checked_on"], where),
        rules=rules,
        total_credits=_int(raw, "total_credits", where, required=False, minimum=1),
        notes=_notes(raw, where, "notes"),
    )


def read_file(path: Path) -> Program:
    """Read and validate one program file (raises ``ValueError`` on a bad file)."""
    path = Path(path)
    try:
        raw = yaml.safe_load(path.read_text())
    except yaml.YAMLError as exc:
        raise ValueError(f"{path}: not valid YAML: {exc}") from None
    return _program(raw, path)


def programs_dir(slug: str) -> Path:
    if not _SLUG.match(slug or ""):
        raise ValueError(f"not a school slug: {slug!r}")
    return SCHOOLS_DIR / slug / "programs"


def list_programs(slug: str) -> List[Program]:
    """Every program for this school, sorted by id; [] when it has none."""
    if slug not in _cache:
        directory = programs_dir(slug)
        files = sorted(directory.glob("*.yaml")) if directory.is_dir() else []
        _cache[slug] = tuple(read_file(f) for f in files)
    return list(_cache[slug])


def get_program(slug: str, program_id: str) -> Program:
    """The program with this id; raises ``KeyError`` when the school has none."""
    for program in list_programs(slug):
        if program.id == program_id:
            return program
    raise KeyError(f"no program {program_id!r} for {slug}")


def clear_cache() -> None:
    _cache.clear()
