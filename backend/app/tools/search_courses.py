"""
search_courses tool — live query against CU Boulder's FOSE class-search API.

Exposes TOOL_DEFINITION (OpenAI tool format) and an execute() coroutine
that the tool-calling loop dispatches to.

NOTE: This tool is specific to the CU Boulder / FOSE catalog platform
(``classes.colorado.edu``), including its term-code and response formats.
It is NOT generic across schools. For a non-CU deployment, set
``tools.search_courses.enabled: false`` in that school's config (or override
``catalog`` to a non-FOSE value to get a graceful "unsupported" response).
"""

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import httpx
from app.tools import BROWSER_UA
from app.config import get_settings

logger = logging.getLogger(__name__)

FOSE_SEARCH_URL = "https://classes.colorado.edu/api/?page=fose&route=search"
CLASSES_BASE_URL = "https://classes.colorado.edu"


def default_semester() -> str:
    """The FOSE term read when none is given: the term students plan for now
    (``academics.next_term``, from the school's ``planner.terms``)."""
    from app.sources import academics

    return academics.next_term()


TOOL_DEFINITION: Dict[str, Any] = {
    "type": "function",
    "function": {
        "name": "search_courses",
        "description": (
            "Search the CU Boulder (FOSE) course catalog for classes in a "
            "given subject, optionally filtered by course number and semester. "
            "Only available for CU Boulder deployments. "
            "Returns a list of matching sections with title, instructor, "
            "schedule, and location."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": (
                        "Department / subject code, e.g. 'CSCI', 'MATH', 'PHYS'."
                    ),
                },
                "course_number": {
                    "type": "string",
                    "description": (
                        "Catalog number to filter on, e.g. '1300'. "
                        "Omit to return all courses in the subject."
                    ),
                },
                "semester": {
                    "type": "string",
                    "description": (
                        "Semester name, e.g. 'Spring 2027', 'Fall 2026'. "
                        "Defaults to the next term students plan for."
                    ),
                },
            },
            "required": ["subject"],
        },
    },
}

def _term_to_srcdb(term: str) -> str:
    """Convert 'Spring 2026' to '2261', 'Fall 2025' to '2257', etc.

    CU Boulder's FOSE API uses a 4-digit code: literal '2', the last
    two digits of the year, and a season digit (1=Spring, 4=Summer, 7=Fall).
    """
    term_lower = term.lower()
    ym = re.search(r"20(\d{2})", term)
    yy = ym.group(1) if ym else "26"
    if "spring" in term_lower:
        return f"2{yy}1"
    if "summer" in term_lower:
        return f"2{yy}4"
    if "fall" in term_lower:
        return f"2{yy}7"
    return f"2{yy}1"


def _parse_schedule(meets: str) -> Dict[str, str]:
    """Parse 'MWF 10:00am-10:50am' into structured fields."""
    if not meets:
        return {"days": "", "start_time": "", "end_time": "", "raw": ""}

    day_match = re.match(r"([A-Za-z]+)", meets)
    days = day_match.group(1) if day_match else ""

    time_match = re.search(
        r"(\d{1,2}:\d{2}\s*[ap]m)\s*-\s*(\d{1,2}:\d{2}\s*[ap]m)", meets, re.I
    )
    start = time_match.group(1).strip() if time_match else ""
    end = time_match.group(2).strip() if time_match else ""

    return {"days": days, "start_time": start, "end_time": end, "raw": meets}


def row_to_course(item: Dict[str, Any], term: str) -> Optional[Dict[str, Any]]:
    """Convert a FOSE result row to a lightweight course dict.
    Returns None for rows that should be skipped (recitations, cancelled sections, etc.).
    """
    schd = item.get("schd", "")
    if schd and schd not in ("LEC", "SEM", ""):
        return None
    if item.get("isCancelled"):
        return None

    code = item.get("code", "").strip()
    if not code:
        code = (
            f"{item.get('subject', '')} "
            f"{item.get('catalog_nbr', item.get('catalogNbr', ''))}"
        ).strip()

    return {
        "course_code": code,
        "title": item.get("title", ""),
        "section": item.get("no", "") or item.get("section", ""),
        "instructor": item.get("instr", "") or item.get("instructor", "Staff"),
        "schedule": _parse_schedule(item.get("meets", "") or ""),
        "location": item.get("bldg", item.get("location", "")),
        "semester": term,
    }


async def fose_search(subject: str, semester: str = "") -> List[Dict[str, Any]]:
    """Every lecture/seminar section FOSE lists for ``subject`` in ``semester``.

    Raises ``RuntimeError`` when FOSE can't be reached or answers non-200, so
    an outage is never mistaken for a subject with no classes.
    """
    semester = semester or default_semester()
    results = await _fose_results(subject, semester)
    return [row for row in (row_to_course(item, semester) for item in results) if row]


# Planner reads of whole subjects, kept briefly so one plan check asks once.
PLANNER_TTL_SECONDS = 15 * 60
_planner_cache: Dict[Tuple[str, str], Tuple[float, List[Dict[str, Any]]]] = {}


async def fose_sections(subject: str, semester: str) -> List[Dict[str, Any]]:
    """Every uncancelled FOSE row for ``subject`` in ``semester``, all types.

    Unlike ``fose_search`` this keeps recitations and labs and FOSE's own
    fields (``schd``, ``crn``, ``meetingTimes``, ``cart_opts``), for the
    planner. Cached for ``PLANNER_TTL_SECONDS``; raises ``RuntimeError`` like
    ``fose_search``.
    """
    key = (subject.upper().strip(), _term_to_srcdb(semester))
    hit = _planner_cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    rows = [item for item in await _fose_results(subject, semester) if not item.get("isCancelled")]
    _planner_cache[key] = (time.monotonic() + PLANNER_TTL_SECONDS, rows)
    return rows


async def _fose_results(subject: str, semester: str) -> List[Dict[str, Any]]:
    """FOSE's raw result rows for one subject and term."""
    subject = subject.upper().strip()
    payload = {
        "other": {"srcdb": _term_to_srcdb(semester)},
        "criteria": [{"field": "subject", "value": subject}],
    }
    headers = {
        "User-Agent": BROWSER_UA,
        "Content-Type": "application/json",
        "Referer": CLASSES_BASE_URL,
        "Origin": CLASSES_BASE_URL,
    }
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(FOSE_SEARCH_URL, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise RuntimeError(f"CU class search unavailable: {exc}") from exc
    if resp.status_code != 200:
        logger.warning("FOSE API returned %s for %s", resp.status_code, subject)
        raise RuntimeError(f"CU class search error {resp.status_code}")
    body = resp.json()
    return body.get("results", body.get("data", [])) or []


async def execute(
    *,
    name: str = "",
    subject: str,
    course_number: str = "",
    semester: str = "",
) -> Dict[str, Any]:
    """Query the CU Boulder FOSE API and return matching courses.

    The 'name' kwarg is passed by the dispatch loop and ignored here.
    Returns {"courses": [...], "query": {...}}.

    This tool only supports the CU Boulder / FOSE catalog. If a deployment
    configures a different ``catalog``, it returns a graceful empty result
    rather than querying the wrong school's data.
    """
    tool_cfg = get_settings().tools.get_tool_config("search_courses")
    catalog = (tool_cfg.get("catalog") or "cu_fose").strip().lower()
    if catalog != "cu_fose":
        logger.info(
            "search_courses is CU/FOSE-only but catalog=%r; returning empty result",
            catalog,
        )
        return {
            "courses": [],
            "error": (
                "Course search is only available for CU Boulder (FOSE) "
                "deployments and is not configured for this school."
            ),
            "query": {"subject": subject, "semester": semester},
        }

    subject = subject.upper().strip()
    semester = semester or default_semester()
    try:
        courses = await fose_search(subject, semester)
    except Exception as exc:
        logger.error("FOSE API error for %s: %s", subject, exc)
        return {"courses": [], "error": str(exc), "query": {"subject": subject, "semester": semester}}

    if course_number:
        cn = course_number.strip()
        courses = [c for c in courses if cn in c["course_code"]]

    max_results = tool_cfg.get("max_results", 20)

    total = len(courses)
    truncated = total > max_results
    courses = courses[:max_results]

    return {
        "courses": courses,
        "total_results": total,
        "truncated": truncated,
        "query": {
            "subject": subject,
            "course_number": course_number or None,
            "semester": semester,
        },
    }
