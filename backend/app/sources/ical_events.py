"""Campus events from public iCal feeds, read in the school's timezone.

Feeds come from ``student_life.event_feeds`` in the school pack. Recurring
events (RRULE / EXDATE) are expanded only inside the requested window. Times
without a zone ("floating") are read as school-local, and the feed's own
``X-WR-TIMEZONE`` header is never trusted (CU's says "Mountain", which is not
an IANA zone). All-day events are labeled all-day instead of placed at
midnight. Titles often contain HTML entities (UVA: ``P&#233;lagie``), which
are decoded.
"""

from __future__ import annotations

import asyncio
import html
import logging
import re
import time
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import icalendar
import recurring_ical_events

from app.config import get_settings
from app.sources import cache

logger = logging.getLogger(__name__)

WINDOWS = ("today", "tonight", "tomorrow", "this_weekend", "this_week", "next_7_days")

_parsed: Dict[str, Tuple[float, icalendar.Calendar]] = {}
_lock = asyncio.Lock()


def school_zone() -> ZoneInfo:
    return ZoneInfo(get_settings().school.timezone or "UTC")


def window_bounds(window: str, now: datetime) -> Tuple[datetime, datetime]:
    """Start and end of a named window, in *now*'s timezone."""
    tz = now.tzinfo
    today = now.date()

    def at(day: date, hour: int = 0) -> datetime:
        return datetime.combine(day, dtime(hour), tzinfo=tz)

    if window == "tonight":
        return max(now, at(today, 17)), at(today + timedelta(days=1), 3)
    if window == "tomorrow":
        return at(today + timedelta(days=1)), at(today + timedelta(days=2))
    if window == "this_weekend":
        days_to_sat = (5 - today.weekday()) % 7
        start = at(today + timedelta(days=days_to_sat))
        if today.weekday() in (5, 6):  # already the weekend
            start = max(now, at(today))
        saturday = today + timedelta(days=days_to_sat) if today.weekday() < 5 else today - timedelta(days=today.weekday() - 5)
        return start, at(saturday + timedelta(days=2))
    if window == "this_week":
        return max(now, at(today)), at(today + timedelta(days=7 - today.weekday()))
    if window == "next_7_days":
        return max(now, at(today)), at(today + timedelta(days=7))
    return max(now, at(today)), at(today + timedelta(days=1))  # today


_TZID_RE = re.compile(r"(TZID[=:])([^:;\r\n]+)")


def _is_iana(name: str) -> bool:
    try:
        ZoneInfo(name)
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def normalize_timezones(text: str, school_tz: str) -> str:
    """Replace timezone names that aren't IANA zones with the school's zone.

    CU's feed uses the Windows name "Mountain Time (US & Canada)", which the
    parser cannot resolve. The school pack's timezone is authoritative.
    """
    text = re.sub(r"(?m)^X-WR-TIMEZONE:.*$", f"X-WR-TIMEZONE:{school_tz}", text)
    return _TZID_RE.sub(
        lambda m: m.group(0) if _is_iana(m.group(2).strip()) else f"{m.group(1)}{school_tz}",
        text,
    )


async def _calendar(url: str) -> icalendar.Calendar:
    refresh_minutes = get_settings().student_life.refresh_minutes
    async with _lock:
        hit = _parsed.get(url)
        if hit and time.time() - hit[0] < refresh_minutes * 60:
            return hit[1]
        text, _ = await asyncio.to_thread(cache.load_text, url, refresh_minutes / 60)
        calendar = icalendar.Calendar.from_ical(normalize_timezones(text, school_zone().key))
        _parsed[url] = (time.time(), calendar)
        return calendar


def _text(component: Any, key: str) -> str:
    value = component.get(key)
    return html.unescape(str(value)).strip() if value is not None else ""


def _localize(value: Any, tz: ZoneInfo) -> Tuple[datetime, bool]:
    """Return (aware datetime, all_day) for a DTSTART/DTEND value."""
    if isinstance(value, datetime):
        return (value.replace(tzinfo=tz) if value.tzinfo is None else value.astimezone(tz)), False
    return datetime.combine(value, dtime(0), tzinfo=tz), True


def _event(component: Any, tz: ZoneInfo, feed_name: str) -> Optional[Dict[str, Any]]:
    start_prop = component.get("DTSTART")
    if start_prop is None:
        return None
    start, all_day = _localize(start_prop.dt, tz)
    end_prop = component.get("DTEND")
    end = _localize(end_prop.dt, tz)[0] if end_prop is not None else (
        start + timedelta(days=1) if all_day else start
    )
    return {
        "title": _text(component, "SUMMARY"),
        "start": start.isoformat(),
        "end": end.isoformat(),
        "all_day": all_day,
        "location": _text(component, "LOCATION"),
        "url": _text(component, "URL"),
        "description": _text(component, "DESCRIPTION")[:400],
        "calendar": feed_name,
        "ongoing": False,
        "_start": start,
        "_end": end,
    }


async def events_between(start: datetime, end: datetime) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Events overlapping [start, end) from every configured feed.

    Returns (events sorted by start, error messages for feeds that failed).
    A failed feed is reported, not fatal, while another feed still answers.
    """
    tz = school_zone()
    events: List[Dict[str, Any]] = []
    errors: List[str] = []
    for feed in get_settings().student_life.event_feeds:
        try:
            calendar = await _calendar(feed.url)
            # Floating windows are read in the school's zone; pass naive local
            # bounds so floating events compare correctly.
            components = recurring_ical_events.of(calendar, skip_bad_series=True).between(
                start.astimezone(tz).replace(tzinfo=None), end.astimezone(tz).replace(tzinfo=None)
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Event feed %s failed: %s", feed.url, exc)
            errors.append(f"{feed.name or feed.url}: {exc}")
            continue
        for component in components:
            item = _event(component, tz, feed.name)
            if item and item["_end"] > start and item["_start"] < end:
                # Started before the window (multi-day exhibits, all-week items).
                item["ongoing"] = item["_start"] < start
                events.append(item)
    # Events that start in the window first, then ongoing ones.
    events.sort(key=lambda e: (e["ongoing"], e["_start"], e["title"]))
    seen = set()
    unique = []
    for item in events:
        key = (item["title"], item["_start"])
        if key in seen:
            continue
        seen.add(key)
        item.pop("_start"), item.pop("_end")
        unique.append(item)
    return unique, errors
