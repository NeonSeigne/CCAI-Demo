# Feed inventory

Public data sources for each school pack, probed 2026-10-26 with plain requests
(no browser spoofing, no cookies). Milestone 1 domains: academics, student life,
campus.

| School | Domain | Source type | URL | Result |
|---|---|---|---|---|
| CU Boulder | academics | `fose` | `https://classes.colorado.edu/api/?page=fose&route=search` | in use today (`search_courses`) |
| CU Boulder | student life | `ical` | `https://calendar.colorado.edu/calendar.ics` | 200, 2.4 MB, 1925 events, 376 all-day, 0 RRULE |
| CU Boulder | student life | Localist JSON (alt.) | `https://calendar.colorado.edu/api/2/events` | 200 |
| CU Boulder | campus | OSM | way 46226108, `boundary=administrative` ("Main Campus") | found; not tagged `amenity=university` |
| UW-Madison | academics | `uw_coursemap` | `https://uwcourses.com/courses/<SUBJ>_<NUM>.json`, `/search.json?q=` | 200; `static.uwcourses.com` and `search.uwcourses.com` no longer resolve |
| UW-Madison | student life | `ical` | `https://today.wisc.edu/events.ics` | 200, 20 events, 2 RRULE, `TZID:America/Chicago` |
| UW-Madison | campus | OSM | relation 7144092, `amenity=university` | found |
| UVA | academics | `csv_snapshot` | theCourseForum2 repo `semester_data/csv/2026_fall.csv`, `grade_data/csv/*.csv` | 200; Fall file last updated 2026-09-03 |
| UVA | student life | `ical` | `https://www.trumba.com/calendars/university-of-virginia-events.ics` | 200, 200 events, 2 RRULE, 4 all-day |
| UVA | campus | OSM | `amenity=university` relation | found |
| UVA | academics (blocked) | HoosList | `https://hooslist.virginia.edu/` | 403 Cloudflare challenge on every path |

## Notes for implementation

- CU's iCal header says `X-WR-TIMEZONE:Mountain`, which is not an IANA zone. The
  iCal helper must use the school pack's `timezone` (`America/Denver`), never the
  feed's header.
- CU's feed is large (2.4 MB): cache the parsed calendar and expand only the
  requested window.
- UW's `events.ics` returns only the next 20 events. Check for paging before
  relying on it for "this weekend" questions.
- `import_places.py` must accept a campus boundary tagged
  `boundary=administrative` (CU) as well as `amenity=university` (UW, UVA).
- Dining and transit were not probed (deferred to milestone 2).
