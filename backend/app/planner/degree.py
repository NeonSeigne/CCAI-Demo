"""The degree board: every planned term at once, plus the program's progress.

Pure code over the plan, per-term course facts and the student's program
files (eng review R12). Each planned course is read with the facts of its
own term; completed courses with the facts of the plan's term. One
``checker.check`` per term gives that term's credits and load; requirement
rules span all terms, so they are reported once. Shape: ``CONTRACTS.md``,
"Degree board".
"""

from __future__ import annotations

from typing import Any, Callable, Dict, List, Optional, Sequence

from app.planner import checker
from app.planner.facts import CourseFacts


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
    }
