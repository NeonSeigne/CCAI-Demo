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

Beyond the basics an event may carry ``image_url`` (``IMAGE``, or Trumba's
"Event image" custom field; http/https only), ``categories``, ``geo``
(``{lat, lon}``) and, from UVA's ``X-TRUMBA-CUSTOMFIELD`` properties,
``details`` (event type, audience, cost, sponsor, host, room, registration and
online links). Each is parsed on its own: a malformed value drops only that
field, and a field the feed lacks is left out. ``description`` is the full
text, HTML stripped, with its line breaks kept.
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


_BREAK_RE = re.compile(r"(?i)<br\s*/?>|</p\s*>|</div\s*>|</li\s*>")


def _description(component: Any) -> str:
    """Full DESCRIPTION as plain text: HTML stripped, entities decoded, line
    breaks (``\\n`` and ``<br>``) kept, runs of spaces and blank lines collapsed."""
    value = component.get("DESCRIPTION")
    if value is None:
        return ""
    text = html.unescape(_TAG_RE.sub(" ", _BREAK_RE.sub("\n", str(value))))
    lines = [" ".join(line.split()) for line in text.splitlines()]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _web_url(value: Any) -> Optional[str]:
    url = str(value or "").strip()
    parts = urlsplit(url)
    if parts.scheme in ("http", "https") and parts.netloc and not any(c.isspace() for c in url):
        return url
    return None


def _ical_unescape(text: str) -> str:
    """Undo iCal TEXT escaping (``\\,`` ``\\;`` ``\\n`` ``\\\\``) on a raw value."""
    return re.sub(r"\\([\\,;nN])", lambda m: "\n" if m.group(1) in "nN" else m.group(1), text)


_HREF_RE = re.compile(r"""href\s*=\s*["']([^"']+)["']""", re.I)


def _link(raw: str) -> Optional[str]:
    """The URL in a custom field: the first ``href``, else the bare text."""
    match = _HREF_RE.search(raw)
    return _web_url(html.unescape(match.group(1)) if match else html.unescape(_TAG_RE.sub(" ", raw)).strip())


def _as_list(value: Any) -> List[Any]:
    if value is None:
        return []
    return value if isinstance(value, list) else [value]


# Trumba custom-field NAME → details key. Values that only point elsewhere are
# placeholders, not data.
_TRUMBA_FIELDS = {
    "event type": "event_type",
    "audience": "audience",
    "audience type": "audience",
    "cost": "cost",
    "sponsor": "sponsor",
    "sponsors": "sponsor",
    "hosted by": "hosted_by",
    "room": "room",
    "registration link": "registration_url",
    "online location": "online_url",
}
_LINK_FIELDS = {"registration_url", "online_url"}
_PLACEHOLDERS = {"", "n/a", "na", "none", "tbd", "tba", "see event details for more info"}


def _custom_fields(component: Any) -> List[Tuple[str, str, str]]:
    """(NAME, TYPE, raw value) of each ``X-TRUMBA-CUSTOMFIELD``."""
    out = []
    for prop in _as_list(component.get("X-TRUMBA-CUSTOMFIELD")):
        params = getattr(prop, "params", {}) or {}
        name = str(params.get("NAME") or "").strip()
        if name:
            out.append((name, str(params.get("TYPE") or ""), _ical_unescape(str(prop))))
    return out


def _image_url(component: Any) -> Optional[str]:
    for prop in _as_list(component.get("IMAGE")):
        url = _web_url(prop)
        if url:
            return url
    for name, _, raw in _custom_fields(component):
        if name.lower() == "event image":
            url = _link(raw)
            if url:
                return url
    return None


def _categories(component: Any) -> Optional[List[str]]:
    names: List[str] = []
    for prop in _as_list(component.get("CATEGORIES")):
        cats = getattr(prop, "cats", None)
        for cat in cats if cats is not None else str(prop).split(","):
            name = " ".join(html.unescape(_TAG_RE.sub(" ", str(cat))).split())
            if name and name not in names:
                names.append(name)
    return names or None


def _geo(component: Any) -> Optional[Dict[str, float]]:
    prop = component.get("GEO")
    if prop is None:
        return None
    lat, lon = (float(prop.latitude), float(prop.longitude)) if hasattr(prop, "latitude") else (
        float(x) for x in str(prop).split(";")
    )
    if not (-90 <= lat <= 90 and -180 <= lon <= 180) or (lat == 0 and lon == 0):
        return None
    return {"lat": lat, "lon": lon}


def _details(component: Any) -> Optional[Dict[str, str]]:
    """UVA's Trumba custom fields, by their NAME parameter. "Event Type" also
    appears as a template name (``TYPE=number``, "Default Template"), skipped."""
    details: Dict[str, str] = {}
    for name, kind, raw in _custom_fields(component):
        key = _TRUMBA_FIELDS.get(name.lower())
        if not key or key in details or (key == "event_type" and kind.lower() == "number"):
            continue
        try:
            if key in _LINK_FIELDS:
                value = _link(raw)
            else:
                value = " ".join(html.unescape(_TAG_RE.sub(" ", raw)).split())
                if key == "audience":
                    value = ", ".join(p.strip() for p in value.split(",") if p.strip())
                if value.lower().rstrip(".") in _PLACEHOLDERS:
                    value = None
        except Exception:  # noqa: BLE001 — one bad field, not the event
            value = None
        if value:
            details[key] = value
    return details or None


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
    item: Dict[str, Any] = {
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
        "description": _description(component),
        "calendar": feed_name,
        "ongoing": False,
        "_start": start,
        "_end": end,
    }
    for key, parse in (
        ("image_url", _image_url),
        ("categories", _categories),
        ("geo", _geo),
        ("details", _details),
    ):
        try:
            value = parse(component)
        except Exception:  # noqa: BLE001 — a malformed field drops only that field
            value = None
        if value:
            item[key] = value
    return item


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
