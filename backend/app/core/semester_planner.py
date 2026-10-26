"""Semester planner: requirements matching, difficulty scoring, and pack building."""

from __future__ import annotations

import json
import logging
import re
import uuid
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any, AsyncIterator, Callable, Dict, List, Optional, Set, Tuple

from app.tools import _uw_source

logger = logging.getLogger(__name__)

MAJORS_DIR = Path(__file__).resolve().parents[2] / "data" / "majors"

_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 /&-]{1,80}$")

GENED_KEYWORDS = ("gened", "gen-ed", "gen ed", "breadth", "communication", "comm ")


def sanitize_course_identifier(identifier: str) -> str:
    """Convert a displayed course identifier (``COMP SCI 300``) to a CDN key."""
    value = " ".join(identifier.strip().split())
    if not _IDENTIFIER_RE.fullmatch(value):
        raise ValueError("Invalid course identifier")

    match = re.fullmatch(r"(.+?)\s*(\d+[A-Za-z]?)", value)
    if not match:
        raise ValueError("Course identifier must end with a course number")

    subjects, number = match.groups()
    subject_parts = [
        re.sub(r"[^A-Za-z0-9]", "", part).upper()
        for part in re.split(r"[/&]", subjects)
    ]
    subject_parts = [part for part in subject_parts if part]
    if not subject_parts:
        raise ValueError("Course identifier must include a subject")
    return "_".join([*subject_parts, number.upper()])


CHALLENGE_LIMITS = {
    "light": {"max_hard": 1, "target_credits": (12, 14), "label": "Light"},
    "balanced": {"max_hard": 2, "target_credits": (12, 16), "label": "Balanced"},
    "intense": {"max_hard": 3, "target_credits": (14, 18), "label": "Intense"},
}

COURSE_ID_RE = re.compile(
    r"\b([A-Z][A-Z &/\-]{0,24}?)\s+(\d{3}[A-Z]?)\b",
    re.IGNORECASE,
)

GRADE_POINTS = {
    "A": 4.0,
    "AB": 3.5,
    "B": 3.0,
    "BC": 2.5,
    "C": 2.0,
    "D": 1.0,
    "F": 0.0,
}

# In-memory plan store for the demo session lifecycle.
_plans: Dict[str, Dict[str, Any]] = {}


def _normalize_course(identifier: str) -> str:
    return " ".join((identifier or "").split()).upper()


def _course_key(identifier: str) -> str:
    try:
        return sanitize_course_identifier(_normalize_course(identifier))
    except Exception:
        return re.sub(r"[^A-Z0-9]", "", _normalize_course(identifier))


def _subject_token(identifier: str) -> str:
    parts = _normalize_course(identifier).rsplit(" ", 1)
    return parts[0] if parts else ""


def infer_category(req: Dict[str, Any]) -> str:
    rid = (req.get("requirement_id") or req.get("id") or "").lower()
    title = (req.get("title") or "").lower()
    blob = f"{rid} {title}"
    if any(k in blob for k in GENED_KEYWORDS):
        return "gened"
    rule = req.get("rule") or "all_of"
    if rule == "n_of":
        return "elective"
    return "core"


def list_programs() -> Dict[str, Any]:
    index_path = MAJORS_DIR / "index.json"
    with index_path.open(encoding="utf-8") as fh:
        index = json.load(fh)
    programs = []
    for entry in index.get("programs") or []:
        programs.append(
            {
                "id": entry["id"],
                "name": entry["name"],
                "type": entry["type"],
                "college": entry.get("college", ""),
            }
        )
    return {
        "programs": programs,
        "disclaimer": index.get("disclaimer", ""),
    }


def load_program(program_id: str) -> Dict[str, Any]:
    index_path = MAJORS_DIR / "index.json"
    with index_path.open(encoding="utf-8") as fh:
        index = json.load(fh)
    match = next((p for p in index.get("programs") or [] if p["id"] == program_id), None)
    if not match:
        raise KeyError(f"Unknown program: {program_id}")
    with (MAJORS_DIR / match["file"]).open(encoding="utf-8") as fh:
        return json.load(fh)


def get_plan(plan_id: str) -> Optional[Dict[str, Any]]:
    return _plans.get(plan_id)


def save_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    plan_id = plan["plan_id"]
    _plans[plan_id] = plan
    return plan


def create_plan_shell(
    *,
    major_id: str,
    certificate_ids: List[str],
    year: str,
    transcript_text: str = "",
    transcript_filename: str = "",
) -> Dict[str, Any]:
    major = load_program(major_id)
    if major.get("type") != "major":
        raise ValueError("major_id must reference a major program")
    certs = []
    for cert_id in certificate_ids or []:
        cert = load_program(cert_id)
        if cert.get("type") != "certificate":
            raise ValueError(f"{cert_id} is not a certificate")
        certs.append(cert)

    plan = {
        "plan_id": str(uuid.uuid4()),
        "status": "created",
        "progress": {"stage": "created", "percent": 0, "message": "Plan created"},
        "profile": {
            "major_id": major_id,
            "major_name": major.get("name"),
            "certificate_ids": list(certificate_ids or []),
            "certificate_names": [c.get("name") for c in certs],
            "year": year,
        },
        "transcript": {
            "filename": transcript_filename,
            "raw_text": transcript_text,
            "courses_completed": [],
            "cumulative_gpa": None,
            "credits_earned": 0,
        },
        "requirements_status": {"satisfied": [], "remaining": [], "in_progress": []},
        "requirements_projection": {"satisfied": [], "remaining": [], "in_progress": []},
        "challenge": "balanced",
        "options": [],
        "selected_option_id": None,
        "chat_history": [],
        "disclaimer": (
            "Curated demo requirements — not an official UW–Madison DARS degree audit."
        ),
        "_programs": {"major": major, "certificates": certs},
    }
    return save_plan(plan)


def parse_transcript_regex(text: str) -> Dict[str, Any]:
    """Best-effort transcript parse without an LLM."""
    courses: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    gpa_match = re.search(
        r"(?:cumulative|overall|cum)\s*gpa[:\s]+([0-4](?:\.\d{1,3})?)",
        text or "",
        re.IGNORECASE,
    )
    cumulative_gpa = float(gpa_match.group(1)) if gpa_match else None

    for match in COURSE_ID_RE.finditer(text or ""):
        subject = re.sub(r"\s+", " ", match.group(1).strip().upper())
        number = match.group(2).upper()
        identifier = f"{subject} {number}"
        key = _course_key(identifier)
        if key in seen:
            continue
        seen.add(key)

        line_start = (text or "").rfind("\n", 0, match.start()) + 1
        line_end = (text or "").find("\n", match.end())
        if line_end < 0:
            line_end = len(text or "")
        line = (text or "")[line_start:line_end]
        grade_match = re.search(
            r"\b(A|AB|B|BC|C|D|F|S|CR|P)\b",
            line[match.end() - line_start :],
            re.IGNORECASE,
        )
        grade = grade_match.group(1).upper() if grade_match else None
        credits_match = re.search(r"\b([1-5](?:\.\d)?)\s*(?:cr|credits?)?\b", line, re.IGNORECASE)
        credits = float(credits_match.group(1)) if credits_match else 3.0

        courses.append(
            {
                "identifier": identifier,
                "title": "",
                "grade": grade,
                "credits": credits,
                "term": "",
            }
        )

    credits_earned = round(sum(c.get("credits") or 0 for c in courses), 1)
    if cumulative_gpa is None:
        weighted = 0.0
        graded_credits = 0.0
        for course in courses:
            pts = GRADE_POINTS.get((course.get("grade") or "").upper())
            if pts is None:
                continue
            cr = float(course.get("credits") or 0)
            weighted += pts * cr
            graded_credits += cr
        if graded_credits:
            cumulative_gpa = round(weighted / graded_credits, 3)

    return {
        "courses_completed": courses,
        "cumulative_gpa": cumulative_gpa,
        "credits_earned": credits_earned,
    }


async def parse_transcript_with_llm(text: str, llm_generate: Optional[Callable] = None) -> Dict[str, Any]:
    """Use LLM structured extract when available; fall back to regex."""
    fallback = parse_transcript_regex(text)
    if not llm_generate or not (text or "").strip():
        return fallback

    prompt = (
        "Extract completed college courses from this transcript. "
        "Return ONLY valid JSON with keys: courses_completed (array of "
        "{identifier, title, grade, credits, term}), cumulative_gpa (number or null), "
        "credits_earned (number). Course identifiers like 'COMP SCI 300'.\n\n"
        f"TRANSCRIPT:\n{(text or '')[:12000]}"
    )
    try:
        raw = await llm_generate(
            system_prompt="You extract structured academic transcript data as JSON only.",
            context=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=2000,
            response_mime_type="application/json",
        )
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
        courses = data.get("courses_completed") or []
        if not courses:
            return fallback
        normalized = []
        for course in courses:
            ident = _normalize_course(course.get("identifier") or "")
            if not ident:
                continue
            normalized.append(
                {
                    "identifier": ident,
                    "title": course.get("title") or "",
                    "grade": (course.get("grade") or None),
                    "credits": float(course.get("credits") or 3),
                    "term": course.get("term") or "",
                }
            )
        return {
            "courses_completed": normalized,
            "cumulative_gpa": data.get("cumulative_gpa"),
            "credits_earned": data.get("credits_earned")
            or round(sum(c["credits"] for c in normalized), 1),
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM transcript parse failed; using regex fallback: %s", exc)
        return fallback


def match_requirements(
    programs: List[Dict[str, Any]], completed_identifiers: List[str]
) -> Dict[str, Any]:
    completed_keys = {_course_key(c) for c in completed_identifiers}
    satisfied: List[Dict[str, Any]] = []
    remaining: List[Dict[str, Any]] = []

    for program in programs:
        for req in program.get("requirements") or []:
            courses = [_normalize_course(c) for c in (req.get("courses") or [])]
            matched = [c for c in courses if _course_key(c) in completed_keys]
            rule = req.get("rule") or "all_of"
            needed = len(courses) if rule == "all_of" else int(req.get("n") or 1)
            done = len(matched) if rule == "all_of" else min(len(matched), needed)
            category = infer_category({**req, "requirement_id": req.get("id")})
            entry = {
                "program_id": program.get("id"),
                "program_name": program.get("name"),
                "program_type": program.get("type") or "major",
                "requirement_id": req.get("id"),
                "title": req.get("title"),
                "rule": rule,
                "needed": needed,
                "completed_count": done,
                "matched_courses": matched,
                "candidate_courses": courses,
                "category": category,
            }
            if done >= needed:
                satisfied.append(entry)
            else:
                leftover = [c for c in courses if _course_key(c) not in completed_keys]
                entry["remaining_courses"] = leftover
                remaining.append(entry)

    return {"satisfied": satisfied, "remaining": remaining, "in_progress": []}


def project_requirements_with_plan(
    requirements_status: Dict[str, Any],
    selected_course_ids: List[str],
) -> Dict[str, Any]:
    """Recompute requirement groups as if selected semester courses were completed."""
    planned_keys = {_course_key(c) for c in selected_course_ids if c}
    satisfied: List[Dict[str, Any]] = []
    remaining: List[Dict[str, Any]] = []
    newly_satisfied: List[Dict[str, Any]] = []

    all_groups = list(requirements_status.get("satisfied") or []) + list(
        requirements_status.get("remaining") or []
    )
    for group in all_groups:
        entry = deepcopy(group)
        candidates = [_normalize_course(c) for c in (entry.get("candidate_courses") or [])]
        already = {_course_key(c) for c in (entry.get("matched_courses") or [])}
        planned_hits = [
            c for c in candidates if _course_key(c) in planned_keys and _course_key(c) not in already
        ]
        matched = list(entry.get("matched_courses") or []) + planned_hits
        # Deduplicate while preserving order
        seen = set()
        deduped = []
        for c in matched:
            k = _course_key(c)
            if k in seen:
                continue
            seen.add(k)
            deduped.append(c)
        matched = deduped
        needed = int(entry.get("needed") or 1)
        rule = entry.get("rule") or "all_of"
        if rule == "all_of":
            done = len(matched)
        else:
            done = min(len(matched), needed)
        was_satisfied = int(entry.get("completed_count") or 0) >= needed
        entry["matched_courses"] = matched
        entry["completed_count"] = done
        entry["planned_courses"] = planned_hits
        entry["projected_satisfied"] = done >= needed
        leftover = [c for c in candidates if _course_key(c) not in {_course_key(m) for m in matched}]
        entry["remaining_courses"] = leftover
        if done >= needed:
            satisfied.append(entry)
            if not was_satisfied:
                newly_satisfied.append(entry)
        else:
            remaining.append(entry)

    return {
        "satisfied": satisfied,
        "remaining": remaining,
        "in_progress": newly_satisfied,
        "newly_satisfied": newly_satisfied,
    }


def refresh_projection(plan: Dict[str, Any]) -> None:
    option = _find_selected_option(plan)
    selected_ids = [
        c.get("identifier") for c in ((option or {}).get("courses") or []) if c.get("identifier")
    ]
    plan["requirements_projection"] = project_requirements_with_plan(
        plan.get("requirements_status") or {}, selected_ids
    )


def _a_rate_from_distribution(distribution: Dict[str, Any], total: int) -> Optional[float]:
    if not total:
        return None
    a_count = distribution.get("a") or 0
    return round((a_count * 100.0) / total, 2)


def classify_difficulty(avg_gpa: Optional[float], a_rate: Optional[float]) -> str:
    """Map GPA + A-rate into easy / medium / hard.

    Easy requires both avg GPA > 3.5 and A-rate > 70%. Missing metrics are never easy.
    """
    if avg_gpa is not None and a_rate is not None and avg_gpa > 3.5 and a_rate > 70:
        return "easy"

    gpa = avg_gpa if avg_gpa is not None else 3.0
    rate = a_rate if a_rate is not None else 25.0
    gpa_hard = max(0.0, min(1.0, (3.6 - gpa) / 1.6))
    rate_hard = max(0.0, min(1.0, (40.0 - rate) / 40.0))
    score = 0.55 * gpa_hard + 0.45 * rate_hard
    if score >= 0.62:
        return "hard"
    return "medium"


def difficulty_score(avg_gpa: Optional[float], a_rate: Optional[float]) -> float:
    if avg_gpa is not None and a_rate is not None and avg_gpa > 3.5 and a_rate > 70:
        return 0.1
    gpa = avg_gpa if avg_gpa is not None else 3.0
    rate = a_rate if a_rate is not None else 25.0
    gpa_hard = max(0.0, min(1.0, (3.6 - gpa) / 1.6))
    rate_hard = max(0.0, min(1.0, (40.0 - rate) / 40.0))
    return round(0.55 * gpa_hard + 0.45 * rate_hard, 3)


async def enrich_course_candidate(
    identifier: str,
    *,
    reason: str,
    priority: int,
    completed_keys: Set[str],
    program_id: str = "",
    program_name: str = "",
    program_type: str = "major",
    requirement_id: str = "",
    requirement_title: str = "",
    category: str = "core",
) -> Optional[Dict[str, Any]]:
    ident = _normalize_course(identifier)
    avg_gpa = None
    a_rate = None
    title = ""
    prereq_ok = True
    prereq_text = ""

    try:
        grades = await _uw_source.course_grades(course_identifier=ident)
        cumulative = grades.get("cumulative") or {}
        avg_gpa = cumulative.get("average_gpa")
        a_rate = _a_rate_from_distribution(
            cumulative.get("distribution") or {}, cumulative.get("total") or 0
        )
        display = grades.get("course_identifier")
        if display:
            ident = display
    except Exception as exc:  # noqa: BLE001
        logger.debug("Grade enrich failed for %s: %s", ident, exc)

    try:
        prereq = await _uw_source.prerequisites(course_identifier=ident)
        title = prereq.get("title") or title
        prereq_text = prereq.get("prereq_text") or ""
        missing = []
        for item in prereq.get("prerequisites") or []:
            pref = item.get("identifier") or ""
            if pref and _course_key(pref) not in completed_keys:
                missing.append(pref)
        if missing and len(missing) == len(prereq.get("prerequisites") or []):
            prereq_ok = False
        if prereq.get("prerequisites") and any(
            _course_key(i.get("identifier") or "") in completed_keys
            for i in prereq.get("prerequisites") or []
        ):
            prereq_ok = True
        if not prereq.get("has_prerequisites"):
            prereq_ok = True
    except Exception as exc:  # noqa: BLE001
        logger.debug("Prereq enrich failed for %s: %s", ident, exc)

    if not prereq_ok:
        return None

    diff = classify_difficulty(avg_gpa, a_rate)
    return {
        "identifier": ident,
        "title": title,
        "credits": 3,
        "difficulty": diff,
        "difficulty_score": difficulty_score(avg_gpa, a_rate),
        "avg_gpa": avg_gpa,
        "a_rate": a_rate,
        "prereq_text": prereq_text,
        "reason": reason,
        "priority": priority,
        "program_id": program_id,
        "program_name": program_name,
        "program_type": program_type,
        "requirement_id": requirement_id,
        "requirement_title": requirement_title,
        "category": category,
    }


def _fallback_candidate(course: str, rem: Dict[str, Any], priority: int) -> Dict[str, Any]:
    return {
        "identifier": _normalize_course(course),
        "title": "",
        "credits": 3,
        "difficulty": "medium",
        "difficulty_score": 0.45,
        "avg_gpa": None,
        "a_rate": None,
        "prereq_text": "",
        "reason": f"Remaining requirement: {rem.get('title')}",
        "priority": priority,
        "program_id": rem.get("program_id") or "",
        "program_name": rem.get("program_name") or "",
        "program_type": rem.get("program_type") or "major",
        "requirement_id": rem.get("requirement_id") or "",
        "requirement_title": rem.get("title") or "",
        "category": rem.get("category") or infer_category(rem),
    }


async def build_candidate_pool(
    requirements_status: Dict[str, Any],
    completed_identifiers: List[str],
) -> List[Dict[str, Any]]:
    completed_keys = {_course_key(c) for c in completed_identifiers}
    pool: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    async def _add(course: str, rem: Dict[str, Any], priority: int, reason: str):
        key = _course_key(course)
        if key in seen or key in completed_keys:
            return
        seen.add(key)
        category = rem.get("category") or infer_category(rem)
        candidate = await enrich_course_candidate(
            course,
            reason=reason,
            priority=priority,
            completed_keys=completed_keys,
            program_id=rem.get("program_id") or "",
            program_name=rem.get("program_name") or "",
            program_type=rem.get("program_type") or "major",
            requirement_id=rem.get("requirement_id") or "",
            requirement_title=rem.get("title") or "",
            category=category,
        )
        if candidate:
            pool.append(candidate)

    for rem in requirements_status.get("remaining") or []:
        for course in rem.get("remaining_courses") or []:
            await _add(
                course,
                rem,
                1,
                f"Remaining requirement: {rem.get('title')} ({rem.get('program_name')})",
            )

    for rem in requirements_status.get("remaining") or []:
        for course in (rem.get("candidate_courses") or [])[:8]:
            await _add(
                course,
                rem,
                2,
                f"Elective option for {rem.get('title')} ({rem.get('program_name')})",
            )

    pool.sort(
        key=lambda c: (
            0 if c.get("program_type") == "major" else 1,
            c.get("priority", 9),
            c.get("difficulty_score", 0.5),
        )
    )
    if pool:
        return pool

    for rem in requirements_status.get("remaining") or []:
        for course in rem.get("remaining_courses") or []:
            key = _course_key(course)
            if key in seen or key in completed_keys:
                continue
            seen.add(key)
            pool.append(_fallback_candidate(course, rem, 1))
    return pool


def _can_add(
    course: Dict[str, Any],
    *,
    used: Set[str],
    credits: float,
    hard_count: int,
    max_cr: float,
    max_hard: int,
) -> bool:
    key = _course_key(course["identifier"])
    if key in used:
        return False
    cr = float(course.get("credits") or 3)
    if credits + cr > max_cr:
        return False
    if course.get("difficulty") == "hard" and hard_count >= max_hard:
        return False
    return True


def _append_course(
    selected: List[Dict[str, Any]],
    course: Dict[str, Any],
    used: Set[str],
) -> Tuple[float, int]:
    selected.append(course)
    used.add(_course_key(course["identifier"]))
    credits = sum(float(c.get("credits") or 3) for c in selected)
    hard_count = sum(1 for c in selected if c.get("difficulty") == "hard")
    return credits, hard_count


def _program_order(pool: List[Dict[str, Any]]) -> List[str]:
    majors = []
    certs = []
    seen = set()
    for c in pool:
        pid = c.get("program_id") or ""
        if not pid or pid in seen:
            continue
        seen.add(pid)
        if c.get("program_type") == "certificate":
            certs.append(pid)
        else:
            majors.append(pid)
    return majors + certs


def _pack_core(
    pool: List[Dict[str, Any]],
    *,
    challenge: str,
    avoid: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    """Round-robin across programs for a balanced major/certificate load."""
    limits = CHALLENGE_LIMITS[challenge]
    min_cr, max_cr = limits["target_credits"]
    max_hard = limits["max_hard"]
    avoid = avoid or set()

    by_program: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for c in pool:
        if _course_key(c["identifier"]) in avoid:
            continue
        # Prefer remaining/core for on-track packs
        if c.get("category") == "gened" and c.get("priority", 1) > 1:
            continue
        by_program[c.get("program_id") or "unknown"].append(c)

    for pid in by_program:
        by_program[pid].sort(
            key=lambda c: (
                0 if c.get("category") == "core" else 1 if c.get("category") == "elective" else 2,
                c.get("priority", 9),
                c.get("difficulty_score", 0.5),
            )
        )

    order = [pid for pid in _program_order(pool) if pid in by_program] or list(by_program.keys())
    selected: List[Dict[str, Any]] = []
    used: Set[str] = set()
    credits = 0.0
    hard_count = 0
    pointers = {pid: 0 for pid in order}

    # Round-robin until credit target
    progress = True
    while progress and credits < min_cr:
        progress = False
        for pid in order:
            idx = pointers[pid]
            rows = by_program[pid]
            while idx < len(rows):
                course = rows[idx]
                idx += 1
                if not _can_add(
                    course,
                    used=used,
                    credits=credits,
                    hard_count=hard_count,
                    max_cr=max_cr,
                    max_hard=max_hard,
                ):
                    continue
                credits, hard_count = _append_course(selected, course, used)
                progress = True
                break
            pointers[pid] = idx
            if credits >= max_cr:
                break

    # Fill remaining seats preferring under-represented programs
    if credits < min_cr:
        program_credits = defaultdict(float)
        for c in selected:
            program_credits[c.get("program_id") or ""] += float(c.get("credits") or 3)
        fill = sorted(
            [c for c in pool if _course_key(c["identifier"]) not in avoid],
            key=lambda c: (
                program_credits.get(c.get("program_id") or "", 0),
                c.get("priority", 9),
                c.get("difficulty_score", 0.5),
            ),
        )
        for course in fill:
            if not _can_add(
                course,
                used=used,
                credits=credits,
                hard_count=hard_count,
                max_cr=max_cr,
                max_hard=max_hard,
            ):
                continue
            credits, hard_count = _append_course(selected, course, used)
            if credits >= min_cr and len(selected) >= 4:
                break

    if not selected:
        return [], 0.0
    avg = round(sum(c.get("difficulty_score") or 0.5 for c in selected) / len(selected), 3)
    return selected, avg


def _pack_gened(
    pool: List[Dict[str, Any]],
    *,
    challenge: str,
    avoid: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    limits = CHALLENGE_LIMITS[challenge]
    min_cr, max_cr = limits["target_credits"]
    max_hard = min(limits["max_hard"], 1)
    avoid = avoid or set()

    gened = [
        c
        for c in pool
        if c.get("category") == "gened" and _course_key(c["identifier"]) not in avoid
    ]
    soft = [
        c
        for c in pool
        if c.get("difficulty") != "hard" and _course_key(c["identifier"]) not in avoid
    ]
    ordered = gened + [c for c in soft if c not in gened] + [
        c for c in pool if c not in gened and c not in soft and _course_key(c["identifier"]) not in avoid
    ]

    selected: List[Dict[str, Any]] = []
    used: Set[str] = set()
    credits = 0.0
    hard_count = 0
    for course in ordered:
        if not _can_add(
            course,
            used=used,
            credits=credits,
            hard_count=hard_count,
            max_cr=max_cr,
            max_hard=max_hard,
        ):
            continue
        credits, hard_count = _append_course(selected, course, used)
        if credits >= min_cr and (
            sum(1 for c in selected if c.get("category") == "gened") >= 2 or len(selected) >= 4
        ):
            break

    if not selected:
        return [], 0.0
    avg = round(sum(c.get("difficulty_score") or 0.5 for c in selected) / len(selected), 3)
    return selected, avg


def _pack_explore(
    pool: List[Dict[str, Any]],
    *,
    challenge: str,
    avoid: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    limits = CHALLENGE_LIMITS[challenge]
    min_cr, max_cr = limits["target_credits"]
    max_hard = 1
    avoid = avoid or set()

    electives = [
        c
        for c in pool
        if c.get("category") == "elective" and _course_key(c["identifier"]) not in avoid
    ]
    others = [
        c
        for c in pool
        if c.get("difficulty") != "hard" and _course_key(c["identifier"]) not in avoid and c not in electives
    ]
    ordered = sorted(
        electives + others,
        key=lambda c: (0 if c.get("category") == "elective" else 1, c.get("difficulty_score", 0.5)),
    )

    selected: List[Dict[str, Any]] = []
    used: Set[str] = set()
    subjects: Set[str] = set()
    credits = 0.0
    hard_count = 0

    for course in ordered:
        subj = _subject_token(course["identifier"])
        # Prefer subject diversity
        if subj in subjects and len(subjects) < 3 and credits < min_cr:
            # skip same-subject until we have breadth, then allow
            continue
        if not _can_add(
            course,
            used=used,
            credits=credits,
            hard_count=hard_count,
            max_cr=max_cr,
            max_hard=max_hard,
        ):
            continue
        credits, hard_count = _append_course(selected, course, used)
        subjects.add(subj)
        if credits >= min_cr and len(selected) >= 4:
            break

    # Relax diversity if under-filled
    if credits < min_cr:
        for course in ordered:
            if not _can_add(
                course,
                used=used,
                credits=credits,
                hard_count=hard_count,
                max_cr=max_cr,
                max_hard=max_hard,
            ):
                continue
            credits, hard_count = _append_course(selected, course, used)
            if credits >= min_cr:
                break

    if not selected:
        return [], 0.0
    avg = round(sum(c.get("difficulty_score") or 0.5 for c in selected) / len(selected), 3)
    return selected, avg


def _pack_courses(
    pool: List[Dict[str, Any]],
    *,
    challenge: str,
    strategy: str,
    avoid: Optional[Set[str]] = None,
) -> Tuple[List[Dict[str, Any]], float]:
    if strategy == "gened":
        return _pack_gened(pool, challenge=challenge, avoid=avoid)
    if strategy == "explore":
        return _pack_explore(pool, challenge=challenge, avoid=avoid)
    return _pack_core(pool, challenge=challenge, avoid=avoid)


def build_options(pool: List[Dict[str, Any]], challenge: str = "balanced") -> List[Dict[str, Any]]:
    strategies = [
        ("opt_core", "On-track core", "core"),
        ("opt_gened", "Gen-ed heavy", "gened"),
        ("opt_explore", "Explore electives", "explore"),
    ]
    options = []
    used_across: Set[str] = set()
    for opt_id, label, strategy in strategies:
        # Softly discourage recycling the exact same set; allow shared courses.
        courses, score = _pack_courses(
            pool, challenge=challenge, strategy=strategy, avoid=set()
        )
        if not courses:
            continue
        # If overlap with prior packs is total, try avoiding the prior primary courses
        course_keys = {_course_key(c["identifier"]) for c in courses}
        if used_across and course_keys.issubset(used_across):
            courses, score = _pack_courses(
                pool, challenge=challenge, strategy=strategy, avoid=used_across
            )
            if not courses:
                courses, score = _pack_courses(pool, challenge=challenge, strategy=strategy)
        if not courses:
            continue
        used_across.update(_course_key(c["identifier"]) for c in courses)
        options.append(
            {
                "id": opt_id,
                "label": label,
                "strategy": strategy,
                "source": "heuristic",
                "courses": courses,
                "challenge_score": score,
                "total_credits": round(
                    sum(float(c.get("credits") or 3) for c in courses), 1
                ),
                "hard_count": sum(1 for c in courses if c.get("difficulty") == "hard"),
            }
        )
    return options


def _validate_llm_pack(
    course_ids: List[str],
    pool_by_key: Dict[str, Dict[str, Any]],
    *,
    challenge: str,
    strategy: str,
) -> Optional[List[Dict[str, Any]]]:
    limits = CHALLENGE_LIMITS[challenge]
    min_cr, max_cr = limits["target_credits"]
    max_hard = limits["max_hard"]
    if strategy == "gened":
        max_hard = min(max_hard, 1)
    if strategy == "explore":
        max_hard = 1

    courses: List[Dict[str, Any]] = []
    used: Set[str] = set()
    for ident in course_ids or []:
        key = _course_key(ident)
        course = pool_by_key.get(key)
        if not course or key in used:
            continue
        courses.append(deepcopy(course))
        used.add(key)

    if len(courses) < 3:
        return None
    credits = sum(float(c.get("credits") or 3) for c in courses)
    hard = sum(1 for c in courses if c.get("difficulty") == "hard")
    if credits < min_cr - 1 or credits > max_cr + 2:
        return None
    if hard > max_hard:
        return None
    if strategy == "core":
        programs = {c.get("program_id") for c in courses if c.get("program_id")}
        pool_programs = {c.get("program_id") for c in pool_by_key.values() if c.get("program_id")}
        if len(pool_programs) >= 2 and len(programs) < 2:
            return None
    if strategy == "gened":
        if not any(c.get("category") == "gened" for c in courses):
            # Accept if at least half are easy/medium non-hard breadth-ish
            if sum(1 for c in courses if c.get("difficulty") != "hard") < 2:
                return None
    return courses


async def refine_options_with_llm(
    *,
    profile: Dict[str, Any],
    requirements_status: Dict[str, Any],
    pool: List[Dict[str, Any]],
    draft_options: List[Dict[str, Any]],
    challenge: str,
    llm_generate: Optional[Callable],
) -> List[Dict[str, Any]]:
    if not llm_generate or not pool or not draft_options:
        return draft_options

    compact_pool = [
        {
            "identifier": c["identifier"],
            "difficulty": c.get("difficulty"),
            "avg_gpa": c.get("avg_gpa"),
            "a_rate": c.get("a_rate"),
            "program_id": c.get("program_id"),
            "program_type": c.get("program_type"),
            "category": c.get("category"),
            "credits": c.get("credits", 3),
        }
        for c in pool[:60]
    ]
    remaining = [
        {
            "program_id": r.get("program_id"),
            "title": r.get("title"),
            "category": r.get("category"),
            "needed": r.get("needed"),
            "completed_count": r.get("completed_count"),
        }
        for r in (requirements_status.get("remaining") or [])[:30]
    ]
    draft = {
        o["id"]: [c["identifier"] for c in o.get("courses") or []] for o in draft_options
    }

    prompt = (
        "You are a UW–Madison academic planner. Refine three semester packs.\n"
        "Rules: 12-16 credits; at most 2 hard courses (1 for gened/explore); "
        "easy only if GPA>3.5 and A-rate>70. "
        "On-track core must balance MAJOR and CERTIFICATE courses when both have remaining work. "
        "Gen-ed heavy should emphasize gened/breadth. Explore electives should diversify subjects.\n"
        "Return ONLY JSON: "
        '{"opt_core":{"courses":["ID"],"reasons":{"ID":"..."}},'
        '"opt_gened":{...},"opt_explore":{...}}\n'
        f"Profile: {json.dumps(profile)}\n"
        f"Remaining: {json.dumps(remaining)}\n"
        f"Candidates: {json.dumps(compact_pool)}\n"
        f"Draft: {json.dumps(draft)}\n"
    )
    try:
        raw = await llm_generate(
            system_prompt="Return valid JSON only for semester course packs.",
            context=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1600,
            response_mime_type="application/json",
        )
        cleaned = (raw or "").strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        data = json.loads(cleaned)
    except Exception as exc:  # noqa: BLE001
        logger.warning("LLM pack refine failed; keeping heuristic packs: %s", exc)
        return draft_options

    pool_by_key = {_course_key(c["identifier"]): c for c in pool}
    meta = {
        "opt_core": ("On-track core", "core"),
        "opt_gened": ("Gen-ed heavy", "gened"),
        "opt_explore": ("Explore electives", "explore"),
    }
    refined: List[Dict[str, Any]] = []
    for opt_id, (label, strategy) in meta.items():
        payload = data.get(opt_id) or {}
        ids = payload.get("courses") or []
        reasons = payload.get("reasons") or {}
        courses = _validate_llm_pack(ids, pool_by_key, challenge=challenge, strategy=strategy)
        if not courses:
            # fall back to matching draft option
            draft_opt = next((o for o in draft_options if o["id"] == opt_id), None)
            if draft_opt:
                refined.append(draft_opt)
            continue
        for course in courses:
            reason = reasons.get(course["identifier"])
            if reason:
                course["reason"] = reason
        refined.append(
            {
                "id": opt_id,
                "label": label,
                "strategy": strategy,
                "source": "llm",
                "courses": courses,
                "challenge_score": round(
                    sum(c.get("difficulty_score") or 0.5 for c in courses) / len(courses), 3
                ),
                "total_credits": round(sum(float(c.get("credits") or 3) for c in courses), 1),
                "hard_count": sum(1 for c in courses if c.get("difficulty") == "hard"),
            }
        )

    return refined if refined else draft_options


async def generate_plan(
    plan_id: str,
    *,
    llm_generate: Optional[Callable] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """Run the full pipeline, yielding progress events, then final plan."""
    plan = get_plan(plan_id)
    if not plan:
        raise KeyError(f"Plan not found: {plan_id}")

    def _set_progress(stage: str, percent: int, message: str) -> Dict[str, Any]:
        plan["status"] = "generating"
        plan["progress"] = {"stage": stage, "percent": percent, "message": message}
        save_plan(plan)
        return {
            "type": "progress",
            "stage": stage,
            "percent": percent,
            "message": message,
        }

    yield _set_progress("parsing_transcript", 10, "Parsing transcript…")
    parsed = await parse_transcript_with_llm(
        plan["transcript"].get("raw_text") or "", llm_generate=llm_generate
    )
    plan["transcript"].update(
        {
            "courses_completed": parsed.get("courses_completed") or [],
            "cumulative_gpa": parsed.get("cumulative_gpa"),
            "credits_earned": parsed.get("credits_earned") or 0,
        }
    )
    save_plan(plan)

    yield _set_progress("matching_requirements", 35, "Matching degree requirements…")
    programs = [plan["_programs"]["major"]] + list(plan["_programs"].get("certificates") or [])
    completed = [
        c.get("identifier") for c in plan["transcript"]["courses_completed"] if c.get("identifier")
    ]
    plan["requirements_status"] = match_requirements(programs, completed)
    save_plan(plan)

    yield _set_progress("scoring_difficulty", 55, "Scoring course difficulty (GPA & A-rate)…")
    pool = await build_candidate_pool(plan["requirements_status"], completed)
    plan["_candidate_pool"] = pool
    save_plan(plan)

    yield _set_progress("building_packs", 75, "Building balanced semester options…")
    challenge = plan.get("challenge") or "balanced"
    options = build_options(pool, challenge=challenge)

    yield _set_progress("building_packs", 88, "Refining packs with the academic advisor model…")
    options = await refine_options_with_llm(
        profile=plan.get("profile") or {},
        requirements_status=plan.get("requirements_status") or {},
        pool=pool,
        draft_options=options,
        challenge=challenge,
        llm_generate=llm_generate,
    )
    plan["options"] = options
    plan["selected_option_id"] = options[0]["id"] if options else None
    refresh_projection(plan)
    plan["status"] = "ready"
    plan["progress"] = {
        "stage": "done",
        "percent": 100,
        "message": "Semester plan ready",
    }
    save_plan(plan)

    yield {
        "type": "done",
        "stage": "done",
        "percent": 100,
        "message": "Semester plan ready",
        "plan": public_plan(plan),
    }


def public_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    """Strip internal fields before returning to clients."""
    out = deepcopy(plan)
    out.pop("_programs", None)
    # Expose a compact candidate list for add/swap UI
    pool = out.pop("_candidate_pool", None) or []
    out["candidates"] = [
        {
            "identifier": c.get("identifier"),
            "title": c.get("title"),
            "credits": c.get("credits"),
            "difficulty": c.get("difficulty"),
            "avg_gpa": c.get("avg_gpa"),
            "a_rate": c.get("a_rate"),
            "program_id": c.get("program_id"),
            "program_name": c.get("program_name"),
            "program_type": c.get("program_type"),
            "requirement_id": c.get("requirement_id"),
            "requirement_title": c.get("requirement_title"),
            "category": c.get("category"),
            "reason": c.get("reason"),
        }
        for c in pool
    ]
    if "transcript" in out:
        out["transcript"] = {
            k: v for k, v in out["transcript"].items() if k != "raw_text"
        }
    return out


def format_plan_context(plan: Dict[str, Any], *, max_candidates: int = 20) -> str:
    """Compact text block for chat tool / advisor context."""
    profile = plan.get("profile") or {}
    selected = _find_selected_option(plan)
    courses = (selected or {}).get("courses") or []
    remaining = (plan.get("requirements_projection") or plan.get("requirements_status") or {}).get(
        "remaining"
    ) or []
    options = plan.get("options") or []
    candidates = plan.get("_candidate_pool") or []

    lines = [
        "ACTIVE SEMESTER PLAN (Plan my Semester skill is enabled):",
        f"plan_id: {plan.get('plan_id')}",
        f"Major: {profile.get('major_name') or profile.get('major_id') or '—'}",
        f"Year: {profile.get('year') or '—'}",
        f"Challenge: {plan.get('challenge') or 'balanced'}",
        f"Selected option: {(selected or {}).get('label') or plan.get('selected_option_id') or '—'}",
        f"Total credits: {(selected or {}).get('total_credits', '—')}",
        "Courses in selected schedule:",
    ]
    if courses:
        for c in courses:
            lines.append(
                f"  - {c.get('identifier')}"
                f"{(' — ' + c['title']) if c.get('title') else ''}"
                f" ({c.get('credits', 3)} cr, {c.get('difficulty') or 'medium'})"
            )
    else:
        lines.append("  (none)")

    if options:
        lines.append("Available options:")
        for opt in options:
            mark = "*" if opt.get("id") == plan.get("selected_option_id") else "-"
            lines.append(f"  {mark} {opt.get('id')}: {opt.get('label')}")

    if remaining:
        lines.append("Open requirement groups (sample):")
        for req in remaining[:8]:
            lines.append(
                f"  - {req.get('title') or req.get('requirement_id')} "
                f"[{req.get('program_name') or req.get('program_id') or ''}]"
            )

    if candidates:
        lines.append(f"Candidate courses for add/swap (up to {max_candidates}):")
        for c in candidates[:max_candidates]:
            lines.append(
                f"  - {c.get('identifier')}"
                f"{(' — ' + c['title']) if c.get('title') else ''}"
            )

    lines.append(
        "When the student asks to change this schedule, call the "
        "update_semester_plan tool (add / remove / replace / select_option)."
    )
    return "\n".join(lines)


def select_option(plan_id: str, option_id: str) -> Dict[str, Any]:
    plan = get_plan(plan_id)
    if not plan:
        raise KeyError("Plan not found")
    if not any(o["id"] == option_id for o in plan.get("options") or []):
        raise ValueError("Unknown option_id")
    plan["selected_option_id"] = option_id
    refresh_projection(plan)
    save_plan(plan)
    return public_plan(plan)


def _find_selected_option(plan: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    selected = plan.get("selected_option_id")
    for opt in plan.get("options") or []:
        if opt.get("id") == selected:
            return opt
    return None


def apply_plan_patch(plan: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and apply add/remove/replace course operations on the selected option."""
    option = _find_selected_option(plan)
    if not option:
        return plan

    courses = list(option.get("courses") or [])
    pool = {_course_key(c["identifier"]): c for c in (plan.get("_candidate_pool") or [])}
    for c in courses:
        pool[_course_key(c["identifier"])] = c

    challenge = plan.get("challenge") or "balanced"
    max_hard = CHALLENGE_LIMITS[challenge]["max_hard"]
    _, max_cr = CHALLENGE_LIMITS[challenge]["target_credits"]

    def hard_count(rows):
        return sum(1 for r in rows if r.get("difficulty") == "hard")

    def total_credits(rows):
        return sum(float(r.get("credits") or 3) for r in rows)

    for rem in patch.get("remove") or []:
        key = _course_key(rem)
        courses = [c for c in courses if _course_key(c["identifier"]) != key]

    for add in patch.get("add") or []:
        if isinstance(add, str):
            key = _course_key(add)
            course = pool.get(key)
            if not course:
                course = {
                    "identifier": _normalize_course(add),
                    "title": "",
                    "credits": 3,
                    "difficulty": "medium",
                    "difficulty_score": 0.5,
                    "avg_gpa": None,
                    "a_rate": None,
                    "reason": "Added via advisor",
                    "priority": 2,
                    "category": "elective",
                }
        else:
            course = add
            key = _course_key(course.get("identifier") or "")
        if not key:
            continue
        if any(_course_key(c["identifier"]) == key for c in courses):
            continue
        trial = courses + [course]
        if hard_count(trial) > max_hard:
            continue
        if total_credits(trial) > max_cr + 2:
            continue
        courses.append(course)

    for repl in patch.get("replace") or []:
        old = _course_key(repl.get("old") or "")
        new_ident = repl.get("new") or ""
        new_key = _course_key(new_ident)
        if not old or not new_key:
            continue
        courses = [c for c in courses if _course_key(c["identifier"]) != old]
        course = pool.get(new_key) or {
            "identifier": _normalize_course(new_ident),
            "title": "",
            "credits": 3,
            "difficulty": "medium",
            "difficulty_score": 0.5,
            "avg_gpa": None,
            "a_rate": None,
            "reason": "Swapped via advisor",
            "priority": 2,
            "category": "elective",
        }
        trial = courses + [course]
        if hard_count(trial) > max_hard or total_credits(trial) > max_cr + 2:
            continue
        courses.append(course)

    option["courses"] = courses
    option["total_credits"] = round(total_credits(courses), 1)
    option["hard_count"] = hard_count(courses)
    if courses:
        option["challenge_score"] = round(
            sum(c.get("difficulty_score") or 0.5 for c in courses) / len(courses), 3
        )
    refresh_projection(plan)
    save_plan(plan)
    return plan


def mutate_courses(
    plan_id: str,
    *,
    action: str,
    identifier: str = "",
    old: str = "",
    new: str = "",
) -> Dict[str, Any]:
    plan = get_plan(plan_id)
    if not plan:
        raise KeyError("Plan not found")
    action = (action or "").lower().strip()
    if action == "remove":
        if not identifier:
            raise ValueError("identifier required for remove")
        apply_plan_patch(plan, {"remove": [identifier]})
    elif action == "add":
        if not identifier:
            raise ValueError("identifier required for add")
        apply_plan_patch(plan, {"add": [identifier]})
    elif action == "replace":
        if not old or not new:
            raise ValueError("old and new required for replace")
        apply_plan_patch(plan, {"replace": [{"old": old, "new": new}]})
    else:
        raise ValueError("action must be remove, add, or replace")
    return public_plan(plan)


def list_candidates(plan_id: str, q: str = "") -> List[Dict[str, Any]]:
    plan = get_plan(plan_id)
    if not plan:
        raise KeyError("Plan not found")
    pool = plan.get("_candidate_pool") or []
    query = (q or "").strip().upper()
    rows = []
    for c in pool:
        if query and query not in (c.get("identifier") or "").upper() and query not in (
            c.get("title") or ""
        ).upper():
            continue
        rows.append(
            {
                "identifier": c.get("identifier"),
                "title": c.get("title"),
                "credits": c.get("credits"),
                "difficulty": c.get("difficulty"),
                "avg_gpa": c.get("avg_gpa"),
                "a_rate": c.get("a_rate"),
                "program_id": c.get("program_id"),
                "program_name": c.get("program_name"),
                "category": c.get("category"),
                "requirement_title": c.get("requirement_title"),
            }
        )
    return rows


async def chat_with_plan(
    plan_id: str,
    message: str,
    *,
    llm_generate: Optional[Callable] = None,
) -> Dict[str, Any]:
    plan = get_plan(plan_id)
    if not plan:
        raise KeyError("Plan not found")

    public = public_plan(plan)
    system = (
        "You are a UW–Madison undergraduate academic advisor helping refine a semester plan. "
        "Balance major and certificate courses. When you want to change courses, end your reply "
        "with a JSON block like:\n"
        "```plan_patch\n"
        '{"add":["COURSE"],"remove":["COURSE"],"replace":[{"old":"A","new":"B"}]}\n'
        "```\n"
        "Only suggest courses that make sense for remaining requirements and a balanced load "
        "(at most 2 hard classes). Keep conversational advice concise."
    )
    context = [
        {
            "role": "user",
            "content": f"AcademicPlanJSON:\n{json.dumps(public, indent=2)}\n\nStudent message: {message}",
        }
    ]

    reply = (
        "I can help refine this schedule. Tell me which course you'd like to swap, "
        "or whether you want more electives versus core requirements."
    )
    if llm_generate:
        try:
            reply = await llm_generate(
                system_prompt=system,
                context=context,
                temperature=0.4,
                max_tokens=900,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Planner chat LLM failed: %s", exc)

    patch = None
    patch_match = re.search(r"```plan_patch\s*(\{.*?\})\s*```", reply, re.DOTALL)
    if not patch_match:
        patch_match = re.search(r"(\{\s*\"(?:add|remove|replace)\"[\s\S]*\})", reply)
    if patch_match:
        try:
            patch = json.loads(patch_match.group(1))
            plan = apply_plan_patch(plan, patch)
            reply = re.sub(r"```plan_patch[\s\S]*?```", "", reply).strip()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Invalid plan_patch ignored: %s", exc)
            patch = None

    plan.setdefault("chat_history", []).append({"role": "user", "content": message})
    plan.setdefault("chat_history", []).append(
        {"role": "assistant", "content": reply, "plan_patch": patch}
    )
    save_plan(plan)
    return {"reply": reply, "plan_patch": patch, "plan": public_plan(plan)}
