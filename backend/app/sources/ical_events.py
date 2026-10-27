"""Campus events from public iCal feeds, read in the school's timezone.

Feeds come from ``student_life.event_feeds`` in the school pack. Recurring
events (RRULE / EXDATE) are expanded only inside the requested window. Times
without a zone ("floating") are read as school-local, and the feed's own
``X-WR-TIMEZONE`` header is never trusted (CU's says "Mountain", which is not
an IANA zone). All-day events are labeled all-day instead of placed at
midnight. Titles often contain HTML entities (UVA: ``P&#233;lagie``), which
are decoded.

A feed with ``pages: N`` is read as N pages (``limit=200&page=1..N``), each
downloaded and cached like a feed of its own, then merged with the usual
title + start dedupe. Each event carries a stable ``id``:
``<start date>:<UID>`` (plus the RECURRENCE-ID for an instance of a repeating
event), or ``<start date>:<hash>`` when the feed gives no UID. The date lets
Saved look an event up again within its start day.
"""

from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import re
import time
from datetime import date, datetime, time as dtime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import icalendar
import recurring_ical_events

from app.config import EventFeedConfig, get_settings
from app.sources import cache

logger = logging.getLogger(__name__)

WINDOWS = ("today", "tonight", "tomorrow", "this_weekend", "this_week", "next_7_days")

_parsed: Dict[str, Tuple[float, icalendar.Calendar]] = {}
# One lock per feed, so a slow feed never blocks the others.
_locks: Dict[str, asyncio.Lock] = {}


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


def _load_calendar(url: str, refresh_minutes: float, school_tz: str) -> icalendar.Calendar:
    text, _ = cache.load_text(url, refresh_minutes / 60)
    return icalendar.Calendar.from_ical(normalize_timezones(text, school_tz))


async def _calendar(url: str) -> icalendar.Calendar:
    refresh_minutes = get_settings().student_life.refresh_minutes
    async with _locks.setdefault(url, asyncio.Lock()):
        hit = _parsed.get(url)
        if hit and time.time() - hit[0] < refresh_minutes * 60:
            return hit[1]
        # Download and parse off the event loop: CU's feed is about 2.4 MB.
        calendar = await asyncio.to_thread(_load_calendar, url, refresh_minutes, school_zone().key)
        _parsed[url] = (time.time(), calendar)
        return calendar


PAGE_LIMIT = 200


def feed_urls(feed: EventFeedConfig) -> List[str]:
    """The URL of each page of *feed* (just its URL when it has one page)."""
    if feed.pages <= 1:
        return [feed.url]
    parts = urlsplit(feed.url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("limit", str(PAGE_LIMIT))
    urls = []
    for page in range(1, feed.pages + 1):
        query["page"] = str(page)
        urls.append(urlunsplit(parts._replace(query=urlencode(query))))
    return urls


def _expand(calendar: icalendar.Calendar, start: datetime, end: datetime) -> List[Any]:
    return list(recurring_ical_events.of(calendar, skip_bad_series=True).between(start, end))


def _repeating_uids(calendar: icalendar.Calendar) -> set:
    """UIDs of repeating series. The expander stamps a RECURRENCE-ID on every
    occurrence, one-off events included, so ids use it only for these."""
    return {
        str(c.get("UID")).strip()
        for c in calendar.walk("VEVENT")
        if c.get("UID") and (c.get("RRULE") or c.get("RDATE") or c.get("RECURRENCE-ID"))
    }


_TAG_RE = re.compile(r"<[^>]+>")


def _text(component: Any, key: str) -> str:
    """Plain text of a property: HTML tags dropped, entities decoded."""
    value = component.get(key)
    if value is None:
        return ""
    return " ".join(html.unescape(_TAG_RE.sub(" ", str(value))).split())


def _localize(value: Any, tz: ZoneInfo) -> Tuple[datetime, bool]:
    """Return (aware datetime, all_day) for a DTSTART/DTEND value."""
    if isinstance(value, datetime):
        return (value.replace(tzinfo=tz) if value.tzinfo is None else value.astimezone(tz)), False
    return datetime.combine(value, dtime(0), tzinfo=tz), True


def _recurrence_key(value: Any, tz: ZoneInfo) -> str:
    if isinstance(value, datetime):
        local = value.replace(tzinfo=tz) if value.tzinfo is None else value.astimezone(tz)
        return local.strftime("%Y%m%dT%H%M%S")
    return value.strftime("%Y%m%d")


def event_id(
    component: Any, start: datetime, title: str, feed_name: str, tz: ZoneInfo, repeating: bool = False
) -> str:
    """``<start date>:<UID>``, plus ``:<RECURRENCE-ID>`` for an instance of a
    *repeating* series; ``<start date>:<hash>`` when there is no UID."""
    day = start.date().isoformat()
    uid = str(component.get("UID") or "").strip()
    if not uid:
        digest = hashlib.sha1(f"{feed_name}|{title}|{start.isoformat()}".encode("utf-8")).hexdigest()
        return f"{day}:{digest[:16]}"
    recurrence = component.get("RECURRENCE-ID")
    if repeating and recurrence is not None:
        return f"{day}:{uid}:{_recurrence_key(recurrence.dt, tz)}"
    return f"{day}:{uid}"


def _event(
    component: Any, tz: ZoneInfo, feed_name: str, repeating_uids: Optional[set] = None
) -> Optional[Dict[str, Any]]:
    start_prop = component.get("DTSTART")
    if start_prop is None:
        return None
    start, all_day = _localize(start_prop.dt, tz)
    end_prop = component.get("DTEND")
    end = _localize(end_prop.dt, tz)[0] if end_prop is not None else (
        start + timedelta(days=1) if all_day else start
    )
    title = _text(component, "SUMMARY")
    return {
        "id": event_id(
            component, start, title, feed_name, tz,
            repeating=str(component.get("UID") or "").strip() in (repeating_uids or set()),
        ),
        "title": title,
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
    pages = [(feed, url) for feed in get_settings().student_life.event_feeds for url in feed_urls(feed)]
    for feed, url in pages:
        try:
            calendar = await _calendar(url)
            # Floating windows are read in the school's zone; pass naive local
            # bounds so floating events compare correctly.
            components = await asyncio.to_thread(
                _expand,
                calendar,
                start.astimezone(tz).replace(tzinfo=None),
                end.astimezone(tz).replace(tzinfo=None),
            )
            repeating = _repeating_uids(calendar)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Event feed %s failed: %s", url, exc)
            errors.append(f"{feed.name or feed.url}: {exc}")
            continue
        for component in components:
            item = _event(component, tz, feed.name, repeating)
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


def _last_start(calendar: icalendar.Calendar, tz: ZoneInfo) -> Optional[date]:
    """Start date of the latest one-off event in a feed (repeating ones are
    skipped: an RRULE says nothing about how far the feed was published)."""
    latest = None
    for component in calendar.walk("VEVENT"):
        start = component.get("DTSTART")
        if start is None or component.get("RRULE") is not None:
            continue
        day = _localize(start.dt, tz)[0].date()
        latest = day if latest is None or day > latest else latest
    return latest


async def listed_through() -> Optional[str]:
    """Latest date any configured feed lists an event on (YYYY-MM-DD), so a
    page can say "Listed through <date>" when a feed ends inside its window."""
    tz = school_zone()
    latest = None
    for feed in get_settings().student_life.event_feeds:
        for url in feed_urls(feed):
            try:
                day = _last_start(await _calendar(url), tz)
            except Exception:  # noqa: BLE001 — already reported by events_between
                continue
            if day and (latest is None or day > latest):
                latest = day
    return latest.isoformat() if latest else None
