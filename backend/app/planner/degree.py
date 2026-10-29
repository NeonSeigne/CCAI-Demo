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
rule reuses is listed in that group but adds no credits there. A completed
course's credits saved from a transcript row come before the catalog's
(setup-dialog R10). Finish is
given only when every program says ``complete: true`` and nothing is open.
"""

from __future__ import annotations

import math
from typing import Any, Callable, Dict, List, Optional, Sequence

from app.planner import checker
from app.planner.facts import CourseFacts, PrereqNode

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


def saved_credits(plan: Dict[str, Any]) -> Dict[str, float]:
    """``{id: credits}`` for completed courses saved with credits (R10)."""
    return {c["id"]: float(c["credits"]) for c in checker.completed_courses(plan)
            if isinstance(c.get("credits"), (int, float)) and not isinstance(c.get("credits"), bool)}


def _completed_rows(plan: Dict[str, Any], facts: Dict[str, CourseFacts]) -> List[Dict[str, Any]]:
    rows = []
    saved = saved_credits(plan)
    for course in checker.completed_courses(plan):
        fact = facts.get(course["id"])
        if course["id"] in saved:
            credits = [saved[course["id"]], saved[course["id"]]]
        else:
            credits = list(fact.credits) if _usable(fact) and fact.credits else None
        rows.append({
            "id": course["id"],
            "title": fact.title if _usable(fact) else "",
            "credits": credits,
            "grade": course.get("grade"),
            "term": course.get("term"),
        })
    return rows


def _credit_value(course_id: str, facts: Dict[str, CourseFacts], saved: Optional[Dict[str, float]] = None) -> float:
    if saved and course_id in saved:
        return saved[course_id]
    fact = facts.get(course_id)
    return float(fact.credits[0]) if _usable(fact) and fact.credits else COURSE_CREDITS


def _group(
    title: str, earned: float, planned: float, open_: float, unknown_grade: int, unknown_grade_credits: float,
    **ids: Any,
) -> Dict[str, Any]:
    """``unknown_grade`` / ``unknown_grade_credits``: the group's own earned
    courses with no grade on record (not ones counted by an earlier group)."""
    return {**ids, "title": title, "size": earned + planned + open_, "earned": earned, "planned": planned,
            "open": open_, "unknown_grade": unknown_grade,
            "unknown_grade_credits": min(earned, unknown_grade_credits)}


def _rule_group(
    rule: Dict[str, Any], facts: Dict[str, CourseFacts], grades: Dict[str, Any], counted: set,
    saved: Dict[str, float],
) -> Dict[str, Any]:
    """One rule's group. A course an earlier group already counted is listed
    (``courses``, ``counted_elsewhere``) but adds no credits, so credits are
    counted once across the waffle; ``counted`` collects the ids used."""
    done, planned = rule["completed_courses"], rule["planned_courses"]
    taken = done + planned
    earned = sum(_credit_value(c, facts, saved) for c in done if c not in counted)
    planning = sum(_credit_value(c, facts) for c in planned if c not in counted)
    if rule["unit"] == "credits":
        open_ = max(0.0, float(rule["needed"]) - sum(_credit_value(c, facts, saved) for c in done)
                    - sum(_credit_value(c, facts) for c in planned))
    else:
        open_ = max(0, rule["needed"] - len(taken)) * COURSE_CREDITS
    shared = [c for c in taken if c in counted]
    ungraded = [c for c in done if c not in counted and grades.get(c) is None]
    counted.update(taken)
    return _group(rule["title"], earned, planning, open_, len(ungraded),
                  sum(_credit_value(c, facts, saved) for c in ungraded),
                  program_id=rule["program_id"], rule_id=rule["rule_id"], status=rule["status"],
                  courses=taken, counted_elsewhere=shared)


def _other_group(
    plan: Dict[str, Any], facts: Dict[str, CourseFacts], grades: Dict[str, Any], counted: set,
    total: float, groups: List[Dict[str, Any]], saved: Dict[str, float],
) -> Dict[str, Any]:
    """"Other credit": ``total`` minus the distinct rule credits and the rules'
    open credits (never negative), filled by courses no rule took."""
    size = max(0.0, total - sum(g["size"] for g in groups))
    done = [c for c in grades if c not in counted]
    rest = [c["id"] for c in checker.planned_courses(plan) if c["id"] not in counted and c["id"] not in grades]
    earned = min(size, sum(_credit_value(c, facts, saved) for c in done))
    planned = min(size - earned, sum(_credit_value(c, facts) for c in rest))
    ungraded = [c for c in done if grades[c] is None]
    return _group(OTHER_CREDIT, earned, planned, size - earned - planned,
                  len(ungraded), sum(_credit_value(c, facts, saved) for c in ungraded),
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
    saved = saved_credits(plan)
    groups = [_rule_group(rule, facts, grades, counted, saved) for rule in rules]
    totals = [getattr(p, "total_credits", None) for p in programs if getattr(p, "total_credits", None)]
    total = max(totals) if totals else None
    if total is not None:
        groups.append(_other_group(plan, facts, grades, counted, float(total), groups, saved))
    complete = bool(programs) and all(bool(getattr(p, "complete", False)) for p in programs)
    everything_planned = total is not None and all(g["open"] == 0 for g in groups) \
        and all(r["status"] == "met" for r in rules)
    terms = [c.get("term") for c in checker.planned_courses(plan) if c.get("term")]
    finish = max(terms, key=checker.term_key) if complete and everything_planned and terms else None
    return {"total_credits": total, "complete": complete, "groups": groups, "finish": finish}


def _prereq_ids(node: Optional[PrereqNode]) -> List[str]:
    """Every course a prerequisite tree names, AND and OR alike."""
    if node is None:
        return []
    if node.kind == "course":
        return [checker.norm(node.course)] if node.course else []
    return [c for child in node.children for c in _prereq_ids(child)]


def _open_slots(rule: Dict[str, Any]) -> int:
    """Courses the rule still needs that the plan hasn't chosen: a credits
    rule counts its open credits in ``COURSE_CREDITS`` courses."""
    left = max(0.0, float(rule["needed"]) - float(rule["completed"]) - float(rule["planned"]))
    return math.ceil(left / COURSE_CREDITS) if rule["unit"] == "credits" else int(left)


def route(
    plan: Dict[str, Any], facts: Dict[str, CourseFacts], programs: Sequence[Any], rules: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """The My degree route map's data (R2, R9): requirement lines, the
    deadline, each rule's unchosen slots and the prerequisite links between
    courses in the plan."""
    line_of: Dict[tuple, str] = {}
    lines: List[Dict[str, Any]] = []
    deadline = None
    for program in programs:
        program_id = checker._get(program, "id")
        for rule in checker._get(program, "rules") or ():
            rule_id = checker._get(rule, "id")
            name = checker._get(rule, "line") or checker._get(rule, "title")
            line = next((l for l in lines if l["program_id"] == program_id and l["name"] == name), None)
            if line is None:
                line = {"program_id": program_id, "name": name, "rule_ids": []}
                lines.append(line)
            line["rule_ids"].append(rule_id)
            line_of[(program_id, rule_id)] = name
        found = checker._get(program, "deadline")
        if found is not None and deadline is None:
            deadline = {"program_id": program_id, "rule_ids": list(checker._get(found, "rules")),
                        "by_semester": checker._get(found, "by_semester")}
    slots = [{"program_id": r["program_id"], "rule_id": r["rule_id"],
              "line": line_of.get((r["program_id"], r["rule_id"]), r["title"]), "open": _open_slots(r)}
             for r in rules if _open_slots(r) > 0]
    in_plan = [c["id"] for c in checker.completed_courses(plan)] + \
              [checker.norm(c["id"]) for c in checker.planned_courses(plan)]
    present = set(in_plan)
    edges = []
    for course_id in dict.fromkeys(in_plan):
        fact = facts.get(course_id)
        needs = _prereq_ids(fact.prereq_tree) if _usable(fact) else []
        edges += [{"from": p, "to": course_id} for p in dict.fromkeys(needs) if p in present and p != course_id]
    return {"lines": lines, "deadline": deadline, "slots": slots, "edges": edges}


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
        "route": route(plan, facts, programs, rules),
    }
