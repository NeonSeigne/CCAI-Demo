"""A small OpenStreetMap ``opening_hours`` parser for "open now" and "open until".

Only the common subset is understood: day lists and ranges (``Mo-Fr``,
``Sa,Su``), several time ranges per rule (``07:30-09:30,10:30-21:00``),
ranges past midnight (``Fr-Sa 07:00-01:00``, ``12:00-00:00``), ``24/7`` and
``off`` / ``closed``. Rules are separated by ``;`` (or ``, `` before a day),
and a later rule replaces an earlier one for the days it names, as in OSM.

Anything else (public holidays ``PH``, months or dates, ``unknown``, quoted
comments) makes the whole string unknown: :func:`parse` returns ``None`` and
the page says "Hours not listed" rather than guessing. Times are read in the
school's timezone; pass a timezone-aware ``now`` in that zone.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, time as dtime, timedelta
from typing import Dict, List, Optional, Tuple

DAYS = ("Mo", "Tu", "We", "Th", "Fr", "Sa", "Su")
_DAY = r"(?:Mo|Tu|We|Th|Fr|Sa|Su)"
_DAY_SELECTOR = re.compile(rf"^{_DAY}(?:-{_DAY})?(?:,{_DAY}(?:-{_DAY})?)*$")
_TIME = r"(?:[01]\d|2[0-4]):[0-5]\d"
_TIME_RANGE = re.compile(rf"^({_TIME})\s*-\s*({_TIME})$")
_RULE_SPLIT = re.compile(rf"\s*;\s*|,\s+(?={_DAY}\b)")
_DAY_MINUTES = 24 * 60

Interval = Tuple[int, int]  # minutes from the day's midnight; end may pass 24:00


@dataclass
class Schedule:
    always: bool = False
    # Weekday (0 = Monday) to opening intervals; a missing day is closed.
    days: Dict[int, List[Interval]] = field(default_factory=dict)


def _minutes(text: str) -> int:
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def _days(selector: str) -> Optional[List[int]]:
    if not _DAY_SELECTOR.match(selector):
        return None
    days: List[int] = []
    for part in selector.split(","):
        first, _, last = part.partition("-")
        start = DAYS.index(first)
        end = DAYS.index(last) if last else start
        # Wraps over the week: "Su-Th", "Fr-Mo".
        span = (end - start) % 7
        days.extend((start + i) % 7 for i in range(span + 1))
    return days


def _times(text: str) -> Optional[List[Interval]]:
    if text.lower() in ("off", "closed"):
        return []
    intervals: List[Interval] = []
    for part in text.split(","):
        match = _TIME_RANGE.match(part.strip())
        if not match:
            return None
        start, end = _minutes(match.group(1)), _minutes(match.group(2))
        if start >= _DAY_MINUTES:
            return None
        if end <= start:  # past midnight; "12:00-00:00" ends at midnight
            end += _DAY_MINUTES
        intervals.append((start, end))
    return intervals


def parse(text: Optional[str]) -> Optional[Schedule]:
    """Parse an opening_hours string; ``None`` when missing or not understood."""
    text = (text or "").strip()
    if not text:
        return None
    if text == "24/7":
        return Schedule(always=True)
    schedule = Schedule()
    for rule in _RULE_SPLIT.split(text):
        rule = rule.strip()
        if not rule:
            continue
        selector, _, rest = rule.partition(" ")
        days = _days(selector)
        if days is None:  # no day selector: the rule covers every day
            days, rest = list(range(7)), rule
        intervals = _times(rest.strip())
        if intervals is None:
            return None
        for day in days:
            schedule.days[day] = list(intervals)
    return schedule


def _open_interval(schedule: Schedule, now: datetime) -> Optional[Tuple[datetime, datetime]]:
    """The opening interval containing *now*, as datetimes, if any."""
    midnight = datetime.combine(now.date(), dtime(0), tzinfo=now.tzinfo)
    for offset in (0, -1):  # today's intervals, then yesterday's past-midnight ones
        base = midnight + timedelta(days=offset)
        for start, end in schedule.days.get((now.weekday() + offset) % 7, []):
            opens, closes = base + timedelta(minutes=start), base + timedelta(minutes=end)
            if opens <= now < closes:
                return opens, closes
    return None


def status(schedule: Optional[Schedule], now: datetime) -> Tuple[Optional[bool], Optional[datetime]]:
    """Return ``(open_now, open_until)``.

    ``open_now`` is ``None`` when the hours are unknown. ``open_until`` is set
    only while open and not ``24/7``; back-to-back ranges (``11:00-24:00``
    then ``00:00-02:00``) are followed to the real closing time.
    """
    if schedule is None:
        return None, None
    if schedule.always:
        return True, None
    found = _open_interval(schedule, now)
    if not found:
        return False, None
    closes = found[1]
    for _ in range(7):  # follow ranges that start exactly when this one ends
        following = _open_interval(schedule, closes)
        if not following or following[1] <= closes:
            break
        closes = following[1]
    return True, closes
