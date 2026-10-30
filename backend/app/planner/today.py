"""'Your classes today' (home-colors alignment R12).

Shown only on a weekday between a term's first and last day of classes, as
the school pack's ``planner.term_dates`` gives them from the official
academic calendar; hidden when the dates are missing. No holiday handling.
Today's meetings are the plan's chosen sections in that term that meet on
today's weekday, in start order.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Mapping, Optional, Tuple

DAY_CODES = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")


def term_for_day(term_dates: Mapping[str, Any], today: date) -> Tuple[Optional[str], Optional[str]]:
    """``(term, None)`` when ``today`` is a weekday inside a term's first and
    last day of classes, else ``(None, reason)``: ``"no_term_dates"`` (no
    term has both dates), ``"weekend"`` or ``"outside_term"``."""
    spans = [(term, d.first_day, d.last_day) for term, d in term_dates.items() if d.first_day and d.last_day]
    if not spans:
        return None, "no_term_dates"
    if today.weekday() >= 5:
        return None, "weekend"
    for term, first, last in spans:
        if first <= today <= last:
            return term, None
    return None, "outside_term"


def meetings_today(report: Dict[str, Any], today: date) -> Dict[str, Any]:
    """``{meetings, unscheduled}`` from a term's check report: blocks on
    today's weekday with the course title, and the term's courses that have
    no meeting times in the week (sections not chosen, times unpublished)."""
    code = DAY_CODES[today.weekday()]
    titles = {c["id"]: c.get("title") or None for c in report.get("courses") or []}
    blocks = (report.get("schedule") or {}).get("blocks") or []
    meetings = sorted(
        ({"course": b["course"], "title": titles.get(b["course"]), "section": b.get("section"),
          "kind": b.get("kind"), "start": b["start"], "end": b["end"]}
         for b in blocks if b.get("day") == code),
        key=lambda m: (m["start"], m["course"]),
    )
    with_times = {b["course"] for b in blocks}
    unscheduled: List[str] = [c for c in titles if c not in with_times]
    return {"meetings": meetings, "unscheduled": unscheduled}
