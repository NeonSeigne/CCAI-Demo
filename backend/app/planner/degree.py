"""The degree board: every planned term at once, plus the program's progress.

Pure code over the plan, per-term course facts and the student's program
files (eng review R12). Each planned course is read with the facts of its
own term; completed courses with the facts of the plan's term. One
``checker.check`` per term gives that term's credits and load; requirement
rules span all terms, so they are reported once. Shape: ``CONTRACTS.md``,
"Degree board".

The waffle (eng review R14) claims only what the program files encode: one
group per rule, sized in credits by the rule, plus one "Other credit" group
filling up to ``total_credits``. A course-count rule is sized by the credits
of the courses it took plus ``COURSE_CREDITS`` per course still needed.
Each course's credits count in one group only: a course a ``double_count``
rule reuses is listed in that group but adds no credits there. Finish is
given only when every program says ``complete: true`` and nothing is open.
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Sequence

from app.planner import checker
from app.planner.facts import CourseFacts

# Credits counted for a course whose credits are unknown, or not yet chosen.
COURSE_CREDITS = 3.0
OTHER_CREDIT = "Other credit"


def planned_terms(plan: Dict[str, Any]) -> List[str]:
    """The plan's term and every term with a planned course, in term order."""
    terms = [plan["term"]] + [c.get("term") for c in checker.planned_courses(plan) if c.get("term")]
    return sorted(dict.fromkeys(terms), key=checker.term_key)


def facts_wanted(plan: Dict[str, Any]) -> Dict[str, List[str]]:
    """``{term: ids}``: each planned course in its term, completed ones in the plan's term."""
    wanted: Dict[str, List[str]] = {term: [] for term in planned_terms(plan)}
    for course in checker.planned_courses(plan):
        wanted[course.get("term") or plan["term"]].append(course["id"])
    wanted[plan["term"]] += [c["id"] for c in checker.completed_courses(plan)]
    return {term: list(dict.fromkeys(ids)) for term, ids in wanted.items()}


def _merged(plan: Dict[str, Any], by_term: Dict[str, Dict[str, CourseFacts]]) -> Dict[str, CourseFacts]:
    """One facts table: each course keyed to the facts of the term it sits in."""
    merged = dict(by_term.get(plan["term"]) or {})
    for course in checker.planned_courses(plan):
        fact = (by_term.get(course.get("term")) or {}).get(course["id"])
        if fact is not None:
            merged[course["id"]] = fact
    return merged


def _usable(fact: Optional[CourseFacts]) -> bool:
    return fact is not None and fact.known == "yes"


def _course_row(row: Dict[str, Any], fact: Optional[CourseFacts], fills: List[str]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "credits": row["credits"],
        "avg_gpa": fact.avg_gpa if _usable(fact) else None,
        "harder": row["harder"],
        "offered": row["offered"],
        "requirements": list(dict.fromkeys(fills)),
        "gen_ed": row["gen_ed"],
    }


def _term_entry(
    plan: Dict[str, Any],
    term: str,
    facts: Dict[str, CourseFacts],
    programs: Sequence[Any],
    fills: Dict[str, List[str]],
    credit_limits: Optional[Dict[str, float]],
    covered: bool,
) -> Dict[str, Any]:
    report = checker.check(dict(plan, term=term), facts, programs, credit_limits=credit_limits)
    return {
        "term": term,
        "covered": covered,
        "credits": report["credits"],
        "difficulty": report["difficulty"],
        "courses": [_course_row(r, facts.get(r["id"]), fills.get(r["id"], [])) for r in report["courses"]],
    }


def _completed_rows(plan: Dict[str, Any], facts: Dict[str, CourseFacts]) -> List[Dict[str, Any]]:
    rows = []
    for course in checker.completed_courses(plan):
        fact = facts.get(course["id"])
        rows.append({
            "id": course["id"],
            "title": fact.title if _usable(fact) else "",
            "credits": list(fact.credits) if _usable(fact) and fact.credits else None,
            "grade": course.get("grade"),
            "term": course.get("term"),
        })
    return rows


def _credit_value(course_id: str, facts: Dict[str, CourseFacts]) -> float:
    fact = facts.get(course_id)
    return float(fact.credits[0]) if _usable(fact) and fact.credits else COURSE_CREDITS


def _group(title: str, earned: float, planned: float, open_: float, unknown_grade: int, **ids: Any) -> Dict[str, Any]:
    return {**ids, "title": title, "size": earned + planned + open_, "earned": earned, "planned": planned,
            "open": open_, "unknown_grade": unknown_grade}


def _rule_group(
    rule: Dict[str, Any], facts: Dict[str, CourseFacts], grades: Dict[str, Any], counted: set
) -> Dict[str, Any]:
    """One rule's group. A course an earlier group already counted is listed
    (``courses``, ``counted_elsewhere``) but adds no credits, so credits are
    counted once across the waffle; ``counted`` collects the ids used."""
    done, planned = rule["completed_courses"], rule["planned_courses"]
    taken = done + planned
    earned = sum(_credit_value(c, facts) for c in done if c not in counted)
    planning = sum(_credit_value(c, facts) for c in planned if c not in counted)
    if rule["unit"] == "credits":
        open_ = max(0.0, float(rule["needed"]) - sum(_credit_value(c, facts) for c in taken))
    else:
        open_ = max(0, rule["needed"] - len(taken)) * COURSE_CREDITS
    shared = [c for c in taken if c in counted]
    counted.update(taken)
    return _group(rule["title"], earned, planning, open_, sum(1 for c in done if grades.get(c) is None),
                  program_id=rule["program_id"], rule_id=rule["rule_id"], status=rule["status"],
                  courses=taken, counted_elsewhere=shared)


def _other_group(
    plan: Dict[str, Any], facts: Dict[str, CourseFacts], grades: Dict[str, Any], counted: set,
    total: float, groups: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """"Other credit": ``total`` minus the distinct rule credits and the rules'
    open credits (never negative), filled by courses no rule took."""
    size = max(0.0, total - sum(g["size"] for g in groups))
    done = [c for c in grades if c not in counted]
    rest = [c["id"] for c in checker.planned_courses(plan) if c["id"] not in counted and c["id"] not in grades]
    earned = min(size, sum(_credit_value(c, facts) for c in done))
    planned = min(size - earned, sum(_credit_value(c, facts) for c in rest))
    return _group(OTHER_CREDIT, earned, planned, size - earned - planned,
                  sum(1 for c in done if grades[c] is None),
                  program_id=None, rule_id=None, status=None, courses=done + rest, counted_elsewhere=[])


def waffle(
    plan: Dict[str, Any], facts: Dict[str, CourseFacts], programs: Sequence[Any], rules: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """``{total_credits, complete, groups, finish}`` for the degree waffle (R14).

    Group sizes sum to ``total_credits`` (when the rules fit inside it), and
    each course's credits count in one group only.
    """
    grades = {c["id"]: c.get("grade") for c in checker.completed_courses(plan)}
    counted: set = set()
    groups = [_rule_group(rule, facts, grades, counted) for rule in rules]
    totals = [getattr(p, "total_credits", None) for p in programs if getattr(p, "total_credits", None)]
    total = max(totals) if totals else None
    if total is not None:
        groups.append(_other_group(plan, facts, grades, counted, float(total), groups))
    complete = bool(programs) and all(bool(getattr(p, "complete", False)) for p in programs)
    everything_planned = total is not None and all(g["open"] == 0 for g in groups) \
        and all(r["status"] == "met" for r in rules)
    terms = [c.get("term") for c in checker.planned_courses(plan) if c.get("term")]
    finish = max(terms, key=checker.term_key) if complete and everything_planned and terms else None
    return {"total_credits": total, "complete": complete, "groups": groups, "finish": finish}


def board(
    plan: Dict[str, Any],
    by_term: Dict[str, Dict[str, CourseFacts]],
    programs: Sequence[Any],
    *,
    credit_limits: Optional[Dict[str, float]] = None,
    covered: Callable[[str], bool] = lambda term: True,
) -> Dict[str, Any]:
    """The ``/api/planner/degree`` body for ``plan``."""
    facts = _merged(plan, by_term)
    rules, fills = checker.check_rules(plan, facts, programs)
    return {
        "revision": plan["revision"],
        "term": plan["term"],
        "terms": [_term_entry(plan, t, facts, programs, fills, credit_limits, covered(t))
                  for t in planned_terms(plan)],
        "completed": _completed_rows(plan, facts),
        "rules": rules,
        "waffle": waffle(plan, facts, programs, rules),
    }
