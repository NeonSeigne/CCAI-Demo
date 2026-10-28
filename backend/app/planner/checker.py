"""Every check behind one call: ``check(plan, facts, programs) -> report``.

Pure code over the plan document, the term's course facts and the student's
program files; no I/O, no model. The report shape is in ``CONTRACTS.md``.
Every check has three outcomes, and "unknown" always carries a reason, so the
UI and the chat can say what couldn't be checked instead of guessing.

Requirement matching (double-count policy): programs are read in the order
the student listed them, and rules in file order. Each rule takes the courses
it needs, completed courses first, then planned ones in term order, and stops
once it has enough. A course taken by a rule without ``double_count`` is used
up: no later non-double-count rule sees it. A ``double_count: true`` rule may
take any course, used or not, and never uses one up. Greedy by rule order is
simple and predictable; it can miss an allocation a solver would find, which
is why the program files list narrow rules (named courses) before broad ones
(levels).

Prerequisites: a course's tree is evaluated against completed courses and
courses planned in an earlier term; a ``concurrent`` leaf also accepts the same
term. A leaf with a minimum grade is unknown unless the completed course has a
grade on record.

Credits: each course's credits are a range; the term total is a range. It is
met only if the whole range is within the school's limits, over or short only
if the whole range is outside them, otherwise unknown. One course with unknown
credits makes the total unknown.

Workload is information, not a check: Light / Balanced / Heavy from how many
of the term's courses sit in the school's hardest third (0-1 / 2 / 3+).

Clashes use enrolment bundles (eng review R13): a course is fully checked only
when its chosen sections have published times and include every required
companion (lab, discussion). A definite overlap reads "found" even when other
courses couldn't be checked; "none" is said only when everything was checked.
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from app.planner.facts import CourseFacts, PrereqNode, Section

# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

GRADE_SCALE = ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F")
SEASONS = {"winter": 0, "spring": 1, "summer": 2, "fall": 3, "autumn": 3}

TIMES_NOT_PUBLISHED = "class times not published"
COMPANIONS_NOT_CHECKED = "labs/discussions not checked"
SECTIONS_NOT_CHOSEN = "sections not chosen"
PREREQS_NOT_PUBLISHED = "Prerequisites not published"
NOT_VERIFIED = "Couldn't check this course"


def norm(course_id: Any) -> str:
    """``"econ  3010"`` -> ``"ECON 3010"``, the form rules and facts are matched in."""
    return " ".join(str(course_id or "").split()).upper()


def split_id(course_id: str) -> Tuple[str, Optional[int]]:
    """``"COMP SCI 300"`` -> ``("COMP SCI", 300)``; the number is None when absent."""
    match = re.match(r"^(.*?)\s*(\d{3,4})[A-Z]?$", norm(course_id))
    if not match:
        return norm(course_id), None
    return match.group(1).strip(), int(match.group(2))


def level_of(number: Optional[int]) -> Optional[int]:
    """Course level in the school's own steps: 310 -> 300, 3010 -> 3000."""
    if number is None:
        return None
    step = 100 if number < 1000 else 1000
    return number // step * step


def term_key(term: Optional[str]) -> Tuple[int, int]:
    """Sort key for labels like "Spring 2027"; unknown labels sort first."""
    words = str(term or "").lower().split()
    year = next((int(w) for w in words if w.isdigit()), 0)
    season = next((SEASONS[w] for w in words if w in SEASONS), 0)
    return (year, season)


def grade_at_least(grade: Optional[str], minimum: str) -> Optional[bool]:
    """True / False when both grades are letters on the scale, else None (unknown)."""
    if not grade:
        return None
    grade, minimum = grade.strip().upper(), minimum.strip().upper()
    if grade not in GRADE_SCALE or minimum not in GRADE_SCALE:
        return None
    return GRADE_SCALE.index(grade) <= GRADE_SCALE.index(minimum)


def _get(obj: Any, name: str, default: Any = None) -> Any:
    """Read a field from a dataclass or a dict (programs and plans arrive as either)."""
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _profile(plan: Dict[str, Any]) -> Dict[str, Any]:
    return plan.get("profile") or {}


def completed_courses(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [dict(c, id=norm(c.get("id"))) for c in _profile(plan).get("completed") or [] if c.get("id")]


def planned_courses(plan: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [dict(c, id=norm(c.get("id"))) for c in plan.get("courses") or [] if c.get("id")]


def _facts_for(facts: Dict[str, CourseFacts], course_id: str) -> Optional[CourseFacts]:
    if course_id in facts:
        return facts[course_id]
    wanted = norm(course_id)
    return next((f for key, f in facts.items() if norm(key) == wanted), None)


def _usable(fact: Optional[CourseFacts]) -> bool:
    return fact is not None and fact.known == "yes"


def _fmt(value: float) -> str:
    return f"{value:g}"


# ---------------------------------------------------------------------------
# Requirement rules
# ---------------------------------------------------------------------------


class _Candidate:
    """One course a rule could take: completed (with grade) or planned (with term)."""

    def __init__(self, course_id: str, completed: bool, grade: Optional[str], term: Optional[str]):
        self.id = course_id
        self.completed = completed
        self.grade = grade
        self.term = term


def _matches_rule(rule: Any, course_id: str) -> bool:
    kind = _get(rule, "kind")
    listed = [norm(c) for c in _get(rule, "courses") or ()]
    if norm(course_id) in [norm(c) for c in _get(rule, "exclude") or ()]:
        return False
    if kind in ("all_of", "n_of") or (kind == "credits_from" and listed):
        return norm(course_id) in listed
    # level rules, and credits_from rules described by subject and level
    subject, number = split_id(course_id)
    subjects = [norm(s) for s in _get(rule, "subjects") or ()]
    if subjects and subject not in subjects:
        return False
    level = level_of(number)
    min_level, max_level = _get(rule, "min_level"), _get(rule, "max_level")
    if (min_level is not None or max_level is not None) and level is None:
        return False
    if min_level is not None and level < min_level:
        return False
    if max_level is not None and level > max_level:
        return False
    return bool(subjects or min_level is not None or max_level is not None)


def _rule_needed(rule: Any) -> float:
    kind = _get(rule, "kind")
    if kind == "all_of":
        return len(_get(rule, "courses") or ())
    if kind == "credits_from":
        return float(_get(rule, "credits") or 0)
    return int(_get(rule, "n") or 0)


def _check_rule(
    program_id: str,
    rule: Any,
    candidates: List[_Candidate],
    used: set,
    facts: Dict[str, CourseFacts],
) -> Tuple[Dict[str, Any], List[str]]:
    """Allocate courses to one rule; returns the report entry and the ids it took."""
    kind = _get(rule, "kind")
    unit = "credits" if kind == "credits_from" else "courses"
    needed = _rule_needed(rule)
    min_grade = _get(rule, "min_grade")
    double_count = bool(_get(rule, "double_count", False))

    sure = {"completed": 0.0, "planned": 0.0}
    maybe_extra = 0.0  # credits or courses that might count (unknown grade / credit range)
    taken: List[_Candidate] = []
    reasons: List[str] = []

    for cand in candidates:
        if sure["completed"] + sure["planned"] >= needed:
            break
        if not _matches_rule(rule, cand.id) or (cand.id in used and not double_count):
            continue
        if cand.completed and min_grade:
            ok = grade_at_least(cand.grade, min_grade)
            if ok is False:
                continue  # below the minimum: does not count
            if ok is None:
                taken.append(cand)
                maybe_extra += _amount(unit, cand.id, facts)[1]
                reasons.append(f"Grade needed to check the {min_grade} minimum for {cand.id}")
                continue
        if unit == "credits" and not _credits_known(cand.id, facts):
            taken.append(cand)
            reasons.append(f"Credits unknown for {cand.id}")
            maybe_extra += float("inf")
            continue
        low, high = _amount(unit, cand.id, facts)
        taken.append(cand)
        sure["completed" if cand.completed else "planned"] += low
        maybe_extra += high - low
        if high > low:
            reasons.append(f"{cand.id} has a credit range")

    total = sure["completed"] + sure["planned"]
    if total >= needed:
        status, reason = "met", None
    elif total + maybe_extra >= needed:
        status, reason = "unknown", "; ".join(dict.fromkeys(reasons)) or None
    else:
        status, reason = "short", None
    if kind == "all_of":
        missing = [norm(c) for c in _get(rule, "courses") or () if norm(c) not in {t.id for t in taken}]
        if missing and status == "short":
            reason = "Still needs " + ", ".join(missing)

    def count(value: float) -> float:
        return int(value) if unit == "courses" else value

    entry = {
        "program_id": program_id,
        "rule_id": _get(rule, "id"),
        "title": _get(rule, "title"),
        "status": status,
        "unit": unit,
        "completed": count(sure["completed"]),
        "planned": count(sure["planned"]),
        "needed": count(needed),
        "completed_courses": [t.id for t in taken if t.completed],
        "planned_courses": [t.id for t in taken if not t.completed],
        "reason": reason,
    }
    if not double_count:
        used.update(t.id for t in taken)
    return entry, [t.id for t in taken]


def _credits_known(course_id: str, facts: Dict[str, CourseFacts]) -> bool:
    fact = _facts_for(facts, course_id)
    return _usable(fact) and fact.credits is not None


def _amount(unit: str, course_id: str, facts: Dict[str, CourseFacts]) -> Tuple[float, float]:
    """How much one course adds to a rule: 1 course, or its (min, max) credits (0, 0 unknown)."""
    if unit == "courses":
        return 1.0, 1.0
    fact = _facts_for(facts, course_id)
    if not _usable(fact) or fact.credits is None:
        return 0.0, 0.0
    return float(fact.credits[0]), float(fact.credits[1])


def check_rules(
    plan: Dict[str, Any], facts: Dict[str, CourseFacts], programs: Sequence[Any]
) -> Tuple[List[Dict[str, Any]], Dict[str, List[str]]]:
    """Report entries for every rule, and for each course the titles of the rules it fills."""
    candidates = [_Candidate(c["id"], True, c.get("grade"), c.get("term")) for c in completed_courses(plan)]
    done = {c.id for c in candidates}
    planned = sorted(planned_courses(plan), key=lambda c: term_key(c.get("term")))
    candidates += [_Candidate(c["id"], False, None, c.get("term")) for c in planned if c["id"] not in done]

    used: set = set()
    entries: List[Dict[str, Any]] = []
    fills: Dict[str, List[str]] = {}
    for program in programs:
        for rule in _get(program, "rules") or ():
            entry, taken = _check_rule(_get(program, "id"), rule, candidates, used, facts)
            entries.append(entry)
            for course_id in taken:
                fills.setdefault(course_id, []).append(_get(rule, "title"))
    return entries, fills


# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------


def _eval_prereq(
    node: PrereqNode, term: str, completed: Dict[str, Optional[str]], planned: Dict[str, str], missing: List[str]
) -> str:
    if node.kind == "course":
        course_id = norm(node.course)
        if course_id in completed:
            if node.minimum_grade:
                ok = grade_at_least(completed[course_id], node.minimum_grade)
                return "unknown" if ok is None else ("met" if ok else _miss(missing, course_id))
            return "met"
        if course_id in planned:
            before = term_key(planned[course_id]) < term_key(term)
            same = planned[course_id] == term and node.timing == "concurrent"
            if before or same:
                # A planned course has no grade yet, so a grade minimum can't be confirmed.
                return "unknown" if node.minimum_grade else "met"
        return _miss(missing, course_id)
    results = [_eval_prereq(child, term, completed, planned, missing) for child in node.children]
    if node.kind == "all":
        if "short" in results:
            return "short"
        return "unknown" if "unknown" in results else "met"
    # any
    if "met" in results or not results:
        return "met"
    return "unknown" if "unknown" in results else "short"


def _miss(missing: List[str], course_id: str) -> str:
    missing.append(course_id)
    return "short"


def check_prereqs(course_id: str, term: str, plan: Dict[str, Any], fact: Optional[CourseFacts]) -> Dict[str, Any]:
    if not _usable(fact):
        reason = (fact.unavailable_reason if fact else None) or NOT_VERIFIED
        return {"status": "unknown", "reason": reason}
    if not fact.prereq_known:
        return {"status": "unknown", "reason": PREREQS_NOT_PUBLISHED}
    if fact.prereq_tree is None:
        return {"status": "met", "reason": None}
    completed = {c["id"]: c.get("grade") for c in completed_courses(plan)}
    planned = {c["id"]: c.get("term") for c in planned_courses(plan) if c["id"] != norm(course_id)}
    missing: List[str] = []
    status = _eval_prereq(fact.prereq_tree, term, completed, planned, missing)
    if status == "met":
        return {"status": "met", "reason": None}
    if status == "short":
        return {"status": "short", "reason": "Needs " + " or ".join(dict.fromkeys(missing))}
    return {"status": "unknown", "reason": "Grade needed to check a prerequisite minimum"}


# ---------------------------------------------------------------------------
# Credits and workload
# ---------------------------------------------------------------------------


def check_credits(
    term_ids: List[str], facts: Dict[str, CourseFacts], limits: Optional[Dict[str, float]]
) -> Dict[str, Any]:
    low = high = 0.0
    unknown = []
    for course_id in term_ids:
        fact = _facts_for(facts, course_id)
        if not _usable(fact) or fact.credits is None:
            unknown.append(course_id)
            continue
        low += fact.credits[0]
        high += fact.credits[1]
    limits = dict(limits) if limits else None
    if unknown:
        return {"min": None, "max": None, "status": "unknown", "limits": limits,
                "reason": "Credits unknown for " + ", ".join(unknown)}
    result = {"min": low, "max": high, "limits": limits, "reason": None}
    if not limits:
        return {**result, "status": "unknown", "reason": "No credit limits on file for this school"}
    floor, ceiling = limits.get("min"), limits.get("max")
    if (floor is None or low >= floor) and (ceiling is None or high <= ceiling):
        return {**result, "status": "met"}
    if ceiling is not None and low > ceiling:
        return {**result, "status": "over"}
    if floor is not None and high < floor:
        return {**result, "status": "short"}
    return {**result, "status": "unknown",
            "reason": f"Credit range {_fmt(low)}-{_fmt(high)} spans the {_fmt(floor or 0)}-{_fmt(ceiling or 0)} limits"}


def difficulty(term_ids: List[str], facts: Dict[str, CourseFacts]) -> Dict[str, Any]:
    flags = [f.harder for f in (_facts_for(facts, c) for c in term_ids) if _usable(f) and f.harder is not None]
    harder = sum(1 for h in flags if h)
    label = None
    if flags:
        label = "Light" if harder <= 1 else ("Balanced" if harder == 2 else "Heavy")
    return {"label": label, "harder": harder, "graded": len(flags), "total": len(term_ids)}


# ---------------------------------------------------------------------------
# Sections and clashes
# ---------------------------------------------------------------------------


def _minutes(clock: str) -> int:
    hours, _, minutes = clock.partition(":")
    return int(hours) * 60 + int(minutes or 0)


def _chosen_bundle(course: Dict[str, Any], fact: Optional[CourseFacts]) -> Tuple[List[Section], Optional[str]]:
    """The sections this course is checked with, or a reason it can't be checked."""
    if not _usable(fact) or not fact.sections:
        return [], TIMES_NOT_PUBLISHED
    chosen_ids = course.get("sections")
    if chosen_ids:
        chosen = [s for s in fact.sections if s.id in set(chosen_ids)]
    else:
        # Nothing picked: usable only when every kind has exactly one section.
        kinds: Dict[str, List[Section]] = {}
        for section in fact.sections:
            kinds.setdefault(section.kind, []).append(section)
        if any(len(group) > 1 for group in kinds.values()):
            return [], SECTIONS_NOT_CHOSEN
        chosen = list(fact.sections)
    if not chosen:
        return [], SECTIONS_NOT_CHOSEN
    if any(s.meetings is None for s in chosen):
        return chosen, TIMES_NOT_PUBLISHED
    if not fact.bundles_known:
        return chosen, COMPANIONS_NOT_CHECKED
    required = {kind for s in chosen for kind in s.requires}
    if not required <= {s.kind for s in chosen}:
        return chosen, COMPANIONS_NOT_CHECKED
    return chosen, None


def check_schedule(
    term_courses: List[Dict[str, Any]], facts: Dict[str, CourseFacts]
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """(clashes, schedule) for the term's courses."""
    blocks: List[Dict[str, Any]] = []
    reasons: List[str] = []
    for course in term_courses:
        sections, reason = _chosen_bundle(course, _facts_for(facts, course["id"]))
        if reason:
            reasons.append(reason)
        for section in sections:
            for meeting in section.meetings or ():
                blocks.append({"course": course["id"], "section": section.id, "kind": section.kind,
                               "day": meeting.day, "start": meeting.start, "end": meeting.end})

    pairs: List[List[str]] = []
    for i, a in enumerate(blocks):
        for b in blocks[i + 1:]:
            if a["course"] == b["course"] or a["day"] != b["day"]:
                continue
            if _minutes(a["start"]) < _minutes(b["end"]) and _minutes(b["start"]) < _minutes(a["end"]):
                pair = [a["course"], b["course"]]
                if pair not in pairs and pair[::-1] not in pairs:
                    pairs.append(pair)

    # Most basic reason first: no times at all beats a missing lab.
    order = (TIMES_NOT_PUBLISHED, SECTIONS_NOT_CHOSEN, COMPANIONS_NOT_CHECKED)
    reason = next((r for r in order if r in reasons), None)
    if pairs:
        clashes = {"status": "found", "pairs": pairs, "reason": reason}
    elif reason:
        clashes = {"status": "unknown", "pairs": [], "reason": reason}
    else:
        clashes = {"status": "none", "pairs": [], "reason": None}
    published = TIMES_NOT_PUBLISHED not in reasons
    schedule = {"published": published, "reason": None if published else TIMES_NOT_PUBLISHED, "blocks": blocks}
    return clashes, schedule


# ---------------------------------------------------------------------------
# Labels and the report
# ---------------------------------------------------------------------------


def fills_labels(
    course_id: str, rule_titles: List[str], programs: Sequence[Any], fact: Optional[CourseFacts]
) -> List[str]:
    """What a course counts toward, in the words the UI and the chat must repeat."""
    labels: List[str] = []
    if not programs:
        labels.append("Requirements: unknown")
    elif rule_titles:
        labels += [f"Fills: {title}" for title in dict.fromkeys(rule_titles)]
    elif any(_get(p, "total_credits") for p in programs):
        labels.append("General elective credit")
    else:
        labels.append("Fills no listed requirement")
    gen_ed = fact.gen_ed if _usable(fact) else None
    if gen_ed is None:
        labels.append("Gen-ed: unknown")
    else:
        labels += [f"Gen-ed: {tag}" for tag in gen_ed]
    return labels


def check(
    plan: Dict[str, Any],
    facts: Dict[str, CourseFacts],
    programs: Sequence[Any],
    *,
    credit_limits: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """The full report for the plan's term; see ``CONTRACTS.md`` for the shape."""
    term = plan.get("term")
    courses = planned_courses(plan)
    term_courses = [c for c in courses if c.get("term") == term]
    term_ids = [c["id"] for c in term_courses]

    rules, fills = check_rules(plan, facts, programs)
    clashes, schedule = check_schedule(term_courses, facts)

    rows = []
    for course in term_courses:
        fact = _facts_for(facts, course["id"])
        usable = _usable(fact)
        rows.append({
            "id": course["id"],
            "title": fact.title if usable else "",
            "term": term,
            "credits": list(fact.credits) if usable and fact.credits else None,
            "harder": fact.harder if usable else None,
            "gen_ed": list(fact.gen_ed) if usable and fact.gen_ed is not None else None,
            "offered": fact.offered if usable else "unknown",
            "prereqs": check_prereqs(course["id"], term, plan, fact),
            "fills": fills_labels(course["id"], fills.get(course["id"], []), programs, fact),
        })

    as_of = next((f.as_of for f in (_facts_for(facts, c) for c in term_ids) if f and f.as_of), None)
    return {
        "term": term,
        "data_as_of": as_of,
        "credits": check_credits(term_ids, facts, credit_limits),
        "difficulty": difficulty(term_ids, facts),
        "clashes": clashes,
        "rules": rules,
        "courses": rows,
        "later": [{"id": c["id"], "term": c.get("term")} for c in courses if c.get("term") != term],
        "schedule": schedule,
    }


def facts_needed(plan: Dict[str, Any]) -> List[str]:
    """Every course id the checker reads facts for: planned and completed."""
    ids: Iterable[str] = [c["id"] for c in planned_courses(plan)] + [c["id"] for c in completed_courses(plan)]
    return list(dict.fromkeys(ids))
