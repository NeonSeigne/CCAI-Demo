# Plan: Courses, Events, Campus map and Saved pages

Status: draft for /plan-eng-review, 2026-10-27. Branch: undergrad-experimental. Nothing built yet.

Builds on `docs/designs/campus-companion-school-packs.md` (milestone 1: academics, student life and
campus domains; school packs for UW-Madison, UVA and CU Boulder).

Approved mockups (design-shotgun, 2026-10-27), in
`~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/campus-pages-20261027/`:

| Page | Approved | Mockup |
|---|---|---|
| Courses | list + preview with prerequisites; Browse / Compare toggle into side-by-side compare | `courses-C2.png`, `courses-D2.png` |
| Events | "Up next" default, List and Calendar views; Add to calendar (.ics) on every event | `events-C2.png` (+ `events-variant-B.png` for the calendar view) |
| Campus map | "Near you": current spot, map with real walking route, category tiles, 3 places + See more; Ask button top right | `map-D2.png` |
| Saved | user-named collections; items saved from pages and from chat answer cards land in Unsorted | `saved-variant-D.png` |

## What each school can serve today

| School | Academics source | Search | Grades | Sections/seats | Prereqs / next | Events feed | Places |
|---|---|---|---|---|---|---|---|
| UW-Madison | `uw_coursemap` (live) | yes | yes | yes | yes | today.wisc.edu, 20 events (today only) | 318 |
| UVA | `csv_snapshot` (theCourseForum, as of 2026-09-03) | yes | yes | yes, historical | no | Trumba, ~127 over 14 days | yes |
| CU Boulder | FOSE `search_courses` tool only (term fixed to Spring 2026) | subject code only | no | sections yes, seats no (correction, outside voice O5) | no | calendar.colorado.edu, ~274 over 14 days | yes |

## Pages and routes (frontend)

- `/courses` (Browse) and `/courses/compare?ids=A,B` (Compare, up to 4). `/courses/:id` detail page stays.
- `/events?view=next|list|calendar&window=today|tonight|this_weekend|next_7_days`
- `/map?from=<place>&category=<cat>&to=<place>`
- `/saved?collection=<id>`
- `CampusRail` gains the nav links Ask, Courses, Events, Campus map, Saved (with count). Every
  page uses the rail and the same page header.

## Backend endpoints (all signed-in, no LLM)

1. **Course search** `GET /api/catalog/search?q=&level=&open_only=&limit=` (R1) returns
   `{courses: [{identifier, title, gpa?, seats_open?}], capabilities, source, as_of?}`. Dispatches on
   the school's academics provider (`academics.get_provider()`); CU uses the FOSE search.
2. **Course summary** `GET /api/catalog/{id}` (R1) returns latest-term grades, next-term sections,
   prerequisites and next courses, each present only when the school's source has it. Used by the
   preview panel and Compare.
3. **Events** `GET /api/events?window=&q=&from=` returns events with a stable `id`
   (hash of calendar + title + start) and, with `from`, walking minutes to the venue.
4. **Places** `GET /api/places?category=&q=&from=&limit=` returns places with a stable `id`, sorted by
   distance from `from`, plus category counts for the tiles.
5. **Walking route** `GET /api/route?from=<place id>&to=<place id>` returns
   `{geometry, distance_m, minutes, source}` from the OSRM foot profile at
   `routing.openstreetmap.de` (no key).
6. **Saved** `GET/POST/DELETE /api/saved` and `GET/POST/PATCH/DELETE /api/saved/collections`, stored in
   Mongo collections `saved_items` and `saved_collections` keyed by user. Items have
   `kind: course|event|place`, a `key` (course identifier, event id, place id), a `display_name` (and event start)
   captured at save time for fallback display (design 18A), and one `collection_id`; none means Unsorted (design 19A).

## Frontend pieces

- Pages: `CoursesPage`, `CourseComparePage`, `EventsPage`, `CampusMapPage`, `SavedPage` with CSS.
- Shared: page header, `SaveButton` (used on page rows and on chat `EventListCard`, `PlaceCard`,
  `CourseAnswerCard`), `utils/ics.js` (moved out of `EventListCard`), a small API client.
- Map: drawn with a map library and OpenStreetMap tiles, route line from endpoint 5.

## Out of scope

- Transit, dining, health (milestone 2 per the design doc).
- theCourseForum review data (needs written permission).
- Turn-by-turn text (most campus paths are unnamed); the page links to OpenStreetMap instead.

## Eng Review (plan-eng-review, 2026-10-27)

Target: docs/designs/campus-pages-plan.md (draft above, written in this review session at the user's
request: "Draft the build plan"). Review notes below amend the plan; implementation has not started.

### Scope Challenge A: assessment

**What already solves each sub-problem**
- Course data: `academics.get_provider()` (backend/app/sources/academics.py:16) returns `_uw_source` or
  `csv_snapshot`, both exposing `search_courses`, `course_grades`, `course_sections`, `prerequisites`,
  `next_courses`. CU has no provider; its course search is the FOSE `search_courses` tool
  (backend/app/tools/search_courses.py:23).
- Course detail: `GET /api/courses/{course_identifier:path}` (backend/app/api/routes/courses.py:209), UW only
  (`links_to_course_pages()`, academics.py:29).
- Events: `ical_events.events_between()` and `window_bounds()` (backend/app/sources/ical_events.py:155, :42);
  `GET /api/campus/today` (backend/app/api/routes/campus.py:20) already wraps them.
- Places: `places.search()`, `distance_m()`, `public()` (backend/app/sources/places.py:133-158);
  `find_place` tool ranks by distance (backend/app/tools/find_place.py:58).
- .ics export: `createEventIcs` + download in frontend/src/components/visuals/EventListCard.js:63-97.
- Disk cache with stale-on-failure: backend/app/sources/cache.py:136 `load_text`.
- Mongo access and indexes: backend/app/core/database.py:65 `create_indexes`, per-school database name.

**Complexity check** [estimated from the plan]: about 30 backend+frontend source files changed or added
(backend 10: courses.py, 4 new route modules, routes/__init__.py, sources/routing.py, database.py,
uw-madison/school.yaml, a saved model; frontend 20: 5 pages, 5 CSS, App.js, CampusRail.js, SaveButton,
utils/ics.js, api client, map component, 3 chat cards, package.json) plus tests. New services: 2 (walking
route client, saved store). The complexity gate trips (8+ files, 2+ new services).

**Search check** (WebSearch; Aside not installed)
- [Layer 1] Map: react-leaflet 5 + Leaflet 1.9 is the React 19 line (frontend uses react ^19.1.0,
  frontend/package.json:19). OSM standard tiles allow light use with "© OpenStreetMap contributors"
  attribution and an identifying User-Agent; heavy use is forbidden and can be blocked without notice.
- [Layer 1] Routing: routing.openstreetmap.de (FOSSGIS OSRM) asks for an identifying User-Agent and
  ODbL + OSRM attribution and blocks clients that affect stability. Prior learning applied:
  keyless-walking-routes (8/10) and nominatim-user-agent (9/10).

**TODOS cross-reference:** no TODOS.md in the repo; nothing blocks the plan.

### Scope Challenge findings

1. [CRITICAL] (confidence: 9/10) backend/app/api/routes/courses.py:209 — `@router.get("/{course_identifier:path}")`
   on prefix `/courses` matches `/api/courses/search` and `/api/courses/X/summary`, so planned endpoints 1 and 2
   would be served by the detail handler (course "search" not found). New routes must be declared before
   the catch-all or live under another path, with a test.
2. [CRITICAL] (confidence: 9/10) schools/uw-madison/school.yaml:23 — `url: "https://today.wisc.edu/events.ics"`
   returns only the next 20 events, all today [measured: events_between over 14 days = 20, all 2026-10-27].
   UW's List, Calendar and "Next 7 days" would be empty after today. `events.ics?limit=200` returns 200
   events over Oct 27-30 [measured: curl]. UVA ~127 and CU ~274 over 14 days [measured].
3. [INFORMATIONAL] (confidence: 9/10) backend/app/sources/ical_events.py:183 — events carry no UID; dedupe key is
   `(item["title"], item["_start"])`. Saving and .ics need the planned stable id; the chat .ics UID
   (EventListCard.js:79, start + title) should use the same id.
4. [INFORMATIONAL] (confidence: 9/10) backend/app/tools/events_search.py:53 — `limit = ... get("max_results", 15)`
   caps the tool at 15; the Events endpoint must call `events_between` directly, as campus.py does.
5. [INFORMATIONAL] (confidence: 9/10) backend/app/sources/places.py:155 — `public()` returns name/aliases/category/
   lat/lon/hours with no id. Route and Saved need a stable place id (planned).
6. [INFORMATIONAL] (confidence: 8/10) per-school capabilities — CU has no grades/prereqs, UVA has no
   prereqs/next and only historical seats (design doc, "Post-review change: UVA academics source"). The plan
   returns `capabilities` but does not say what the pages show for a missing one. Related: R7 in the
   school-packs review (unsupported domain falls through) is still deferred.

### Scope record
feature answers: none asked (no cuts proposed; the user explicitly requested all four pages, 2026-10-27);
structure: D1 = A) Original arrangement, user answer to D1, 2026-10-27; accepted scope: all four pages as
drafted, backend in separate modules (courses.py extended; new events.py, places.py, route.py, saved.py,
models/saved.py, sources/routing.py; routes/__init__.py, database.py, schools/uw-madison/school.yaml),
frontend 5 pages incl. a separate CourseComparePage, one CSS per page, shared SaveButton, utils/ics.js,
api client, map component, 3 chat cards, package.json; pending remedies: findings 1, 2, 6 (R1-R3 below).
Scope Challenge result: scope accepted as-is.
Findings 3, 4, 5: no question needed; the drafted plan already commits to a stable event id, calling
`events_between` directly, and a stable place id. Recorded as plan requirements.

## Decision ledger

### R1: Keeping new course routes away from the detail catch-all
Finding: #1, CRITICAL, confidence 9/10, backend/app/api/routes/courses.py:209, reviewer: plan-eng-review
Plan baseline: original proposal, endpoints `GET /api/courses/search` and `GET /api/courses/{id}/summary` (plan, Backend endpoints 1-2).
Runtime evidence: courses.py:22 `router = APIRouter(prefix="/courses", tags=["courses"])` and :209 `@router.get("/{course_identifier:path}")`; a `:path` converter matches "search" and "X/summary". Static read.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 route placement | planned paths collide with catch-all | keep `/api/courses/search` and `/api/courses/{id}/summary`, declared in courses.py above the catch-all; route test asserts both reach their handlers and `/api/courses/COMP SCI 300` still reaches the detail page | move to `/api/catalog/search` and `/api/catalog/{id}`, a new prefix; same route test |
| R2 UW feed | pending | pending | pending |
| R3 missing capability | pending | pending | pending |
Question D2:
D2 — Where do the new course endpoints live so the course detail route doesn't swallow them?
Project/branch/task: undergrad-experimental, Courses page endpoints.
ELI10: The course detail page uses a "match anything after /api/courses/" rule (courses.py:209). The plan adds /api/courses/search and /api/courses/{id}/summary, which that rule would grab first, so the Courses page would get "course not found". Either declare the new routes above the catch-all in the same file, or give them their own prefix.
Stakes if we pick wrong: route order is invisible; a later edit that moves a handler below the catch-all silently breaks search unless a test pins it.
Recommendation: A because the URLs stay grouped under courses and one route test pins the order; both options get that test.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Declare above the catch-all (recommended)
  ✅ URLs stay /api/courses/..., matching the existing detail endpoint and page
  ❌ Correctness depends on declaration order, protected only by the route test
B) New /api/catalog prefix
  ✅ No ordering dependency at all; the paths can never collide with the detail route
  ❌ Course data now lives under two prefixes, /api/courses and /api/catalog
Net: same fix and test; A keeps one URL family, B removes the ordering rule.
Header: Course routes
Options:
A) Above catch-all (recommended)
Keep /api/courses/search and /api/courses/{id}/summary, declared in courses.py above the detail catch-all; a route test checks both handlers and that /api/courses/COMP SCI 300 still reaches the detail page. Human ~1 hr / CC ~5 min.
B) New /api/catalog prefix
Move them to /api/catalog/search and /api/catalog/{id}; same route test. Human ~1 hr / CC ~5 min.

State: approved
Actual answer: B) New /api/catalog prefix, user answer to D2, 2026-10-27
Accepted scope: course search and summary move to `GET /api/catalog/search` and `GET /api/catalog/{id}` (new prefix, its own router); a route test checks both handlers and that `/api/courses/COMP SCI 300` still reaches the course detail page. Plan endpoints 1-2 amended.
History: none

### R2: How far ahead UW's events reach
Finding: #2, CRITICAL, confidence 9/10, schools/uw-madison/school.yaml:23, reviewer: plan-eng-review
Plan baseline: original proposal, `GET /api/events?window=` over the configured feeds (plan, Backend endpoint 3); Calendar view approved by the user on the Events board.
Runtime evidence: `events.ics` returns 20 events, all today; `?limit=200` returns 200 events Oct 27-30; `?limit=500` and `?limit=1000` still return 200 (server cap); `?limit=200&page=2` returns Oct 30-Nov 5; per-day `.ics` caps at 20. Live probes 2026-10-27.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 route placement | approved B (D2) | approved B | approved B | approved B |
| R2 UW feed reach | 20 events, today only | feed config gains `pages: 2`; fetch `?limit=200&page=1..2` (~9 days), each page cached like a feed, merged with the existing title+start dedupe; every school's List/Calendar shows "Listed through <last date>" when its feed ends inside the window; tests for paging, merge, label | `?limit=200`, one request (~4 days) + the same "Listed through" label and test | keep 20 events; label only |
| R3 missing capability | pending | pending | pending | pending |
Question D14:
D14 — How far ahead should UW's Events page reach?
Project/branch/task: undergrad-experimental, Events page (List, Calendar, Next 7 days).
ELI10: UW's event feed only returns the next 20 events, which is just today. So for UW the Calendar view and "Next 7 days" would be blank after today. The feed accepts ?limit=200 (about 4 days, it won't go higher) and pages (page 2 covers Oct 30 to Nov 5). UVA and CU feeds already cover two weeks.
Stakes if we pick wrong: the Calendar you asked for looks broken at UW, or students think nothing is on later this week.
Recommendation: A because two cached requests cover about 9 days, enough for the week view, and the label is honest where any feed runs out.
Completeness: A=9/10, B=7/10, C=3/10
Pros / cons:
A) Two pages of 200 (recommended)
  ✅ About 9 days of UW events, so the week Calendar and Next 7 days fill in
  ❌ Two upstream requests per refresh instead of one, and a paging config field
B) One request with limit=200
  ✅ One-line config change; covers today plus about three more days
  ❌ The second half of the week Calendar is still empty at UW
C) Keep today only, add a label
  ✅ No change to fetching; the page states plainly how far the list goes
  ❌ UW's Calendar view is effectively a one-day view
Net: A fills the week for one extra cached request; B is half a week; C admits the gap.
Header: UW events reach
Options:
A) Two pages of 200 (recommended)
Feed config gains pages: 2; fetch ?limit=200&page=1..2 (~9 days), cache each page, merge with the existing dedupe; all schools show "Listed through <date>" when a feed ends inside the window. Tests: paging, merge, label. Human ~3 hr / CC ~15 min.
B) One request, limit=200
Change the UW feed URL to ?limit=200 (~4 days) and add the same "Listed through <date>" label and test. Human ~1 hr / CC ~5 min.
C) Today only + label
Keep the 20-event feed; show "Listed through <date>" so the empty days are explained. Human ~1 hr / CC ~5 min.

State: approved
Actual answer: A) Two pages of 200 (recommended), user answer to D14, 2026-10-27
Accepted scope: feed config gains `pages: 2`; UW fetches `?limit=200&page=1..2` (~9 days), each page cached like a feed and merged with the existing title+start dedupe; every school's List and Calendar show "Listed through <last date>" when its feed ends inside the window. Tests: paging, merge, label.
History: 2026-10-27 asked as D3, answered "Lets circle back to this after the design. Leave it for now" (deferred). Reopened by the user's navigation answer "Discuss events now"; same brief re-sent as D14. D14 not answered: the user asked instead "How do we get events as of now?" (answered in chat, 2026-10-27); still pending.

### R3: What a page shows when a school's source lacks a capability
Finding: #6, INFORMATIONAL, confidence 8/10, backend/app/sources/academics.py:3-7 ("A provider that lacks a capability returns an error result for it"), reviewer: plan-eng-review
Plan baseline: original proposal, catalog responses carry `capabilities` and sections are "present only when the school's source has it" (plan, Backend endpoints 1-2).
Runtime evidence: csv_snapshot.py:260 `prerequisites` and :269 `next_courses` return error results (UVA); CU has no provider, only FOSE search + sections (search_courses.py:23); UVA seats are historical as of 2026-09-03 (design doc, UVA source). Static read.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 route placement | approved B (D2) | approved B | approved B |
| R2 UW feed reach | deferred (D3) | deferred | deferred |
| R3 missing capability display | unspecified | the section stays in place with one line "Not available for <school> (<source name>)"; snapshot data shows "As of <date>" and seats read as historical; Compare rows show the same line; one frontend test per state (missing, snapshot, present) | the section is hidden when missing; snapshot label kept; same tests minus the missing-line case |
Question D4:
D4 — When a school's data source can't answer part of a course page, what should students see?
Project/branch/task: undergrad-experimental, Courses page and Compare at UVA and CU.
ELI10: Not every school has every piece. CU has no grade data, and UVA has no prerequisites and only old (Sept 3) seat counts. The plan returns which pieces each school has, but doesn't say what the page shows when one is missing. Option A keeps the section and says plainly it's not available here. Option B hides it.
Stakes if we pick wrong: hidden sections make CU look broken next to UW in a demo; empty boxes with no explanation look like a bug.
Recommendation: A because an explicit line is honest and keeps layouts identical across schools, which matters when you demo two schools side by side.
Completeness: A=9/10, B=7/10
Pros / cons:
A) Say "Not available for <school>" (recommended)
  ✅ Same layout at every school, and students know the gap is the source, not a bug
  ❌ CU's preview shows two or three "not available" lines, which reads sparse
B) Hide missing sections
  ✅ Each school's page shows only what it really has, so it looks tidy
  ❌ Pages differ by school and a student can't tell missing data from a load failure
Net: A explains gaps and keeps one layout; B looks cleaner but hides why.
Header: Missing data
Options:
A) Say it's not available (recommended)
Keep each section; show "Not available for <school> (<source>)" when missing, "As of <date>" on snapshot data, seats read as historical; Compare rows the same. Tests: missing, snapshot, present. Human ~2 hr / CC ~10 min.
B) Hide missing sections
Hide a section the school's source lacks; keep the "As of <date>" snapshot label. Tests: snapshot, present. Human ~1.5 hr / CC ~8 min.

State: approved
Actual answer: A) Say it's not available (recommended), user answer to D4, 2026-10-27
Accepted scope: every Courses preview and Compare section stays in place; a capability the school's source lacks shows "Not available for <school> (<source name>)"; snapshot data shows "As of <date>" and seats read as historical. Frontend tests for the missing, snapshot and present states.
History: none

Scope Challenge C dispositions: R1 approved (D2 = B), R2 deferred by the user (D3, revisit after the design), R3 approved (D4 = A). Findings 3-5 carried as plan requirements.

### Section 1: Architecture

```
Browser pages ──► /api/catalog/{search,id} ──► academics provider (UW live, UVA snapshot) | FOSE (CU)
             ├──► /api/events ───────────────► ical_events.events_between (feeds, disk cache)
             ├──► /api/places ───────────────► places.search / distance_m (places.geojson)
             ├──► /api/route ────────────────► sources/routing.py ─► routing.openstreetmap.de (5s, UA, disk cache)
             ├──► /api/saved[/collections] ──► Mongo saved_items, saved_collections (user_id scoped)
             └──► OSM tile server (browser, attribution)
Chat cards (EventListCard, PlaceCard, CourseAnswerCard) ──► SaveButton ──► /api/saved
```

Two shapes for the new stores (design-twice):
- Saved store. Shape 1 (plan): two collections, items reference collections by id. Shape 2: one
  `saved_collections` collection whose documents embed items. Shape 1 keeps one owner per item (an item in
  two collections is one document; Unsorted is "no collection ids") and a unique (user_id, kind, key) index
  makes save idempotent. Shape 2 duplicates an item across collections (red flag 5, split ownership). Pick: shape 1.
- Routing client. Shape 1 (plan): `sources/routing.py` owns the OSRM URL, User-Agent, timeout and cache;
  `/api/route` only maps place ids to coordinates. Shape 2: the route handler calls OSRM itself. Shape 1
  hides all upstream policy behind `walking_route(a, b)`. Pick: shape 1.
Red flags screened: information leakage risk if the frontend builds OSRM URLs (avoided, server only); hand-synced
list risk for capability names between catalog response and pages (derive the page sections from the
response's `capabilities`, never a second hard-coded list).

Findings:
7. [INFORMATIONAL] (confidence: 8/10) plan, Backend endpoint 5 — the route endpoint names OSRM but no failure
   behavior; routing.openstreetmap.de can block or time out (FOSSGIS usage terms). Decision R4.
8. [INFORMATIONAL] (confidence: 8/10) plan, Backend endpoint 6 — saved items store only `kind` + `key`. Events
   leave the feed after they end (events_between only returns the window) and UVA data is a snapshot, so a
   saved event or course may no longer resolve. Decision R5.
9. [CRITICAL] (confidence: 9/10) plan, Backend endpoint 6 — `DELETE /api/saved/{id}` and collection edits must
   filter on the token's user id, not only the document id (backend/app/api/routes/chat_sessions.py uses
   `get_current_active_user`). Required: every saved query includes `user_id`; test that user B cannot read,
   delete or file user A's items. Carried as required proof of the approved Saved feature, no question.
10. [INFORMATIONAL] (confidence: 9/10) OSM tile policy requires "© OpenStreetMap contributors" on the map and an
   identifying User-Agent for server calls; route results also credit OSRM. Carried as required proof, no question.

### R4: What the map does when the walking-route service fails
Finding: #7, INFORMATIONAL, confidence 8/10, plan Backend endpoint 5, reviewer: plan-eng-review
Plan baseline: original proposal, route from the OSRM foot profile at routing.openstreetmap.de.
Runtime evidence: live probe 2026-10-27 returned 200 with 159 points; FOSSGIS terms allow blocking without notice (search check). Failure behavior unknown (not built).
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 route placement | approved B (D2) | approved B | approved B |
| R2 UW feed reach | deferred (D3) | deferred | deferred |
| R3 missing capability | approved A (D4) | approved A | approved A |
| R4 route failure | unspecified | `sources/routing.py`: 5s timeout, identifying User-Agent, routes cached on disk 30 days keyed by place-id pair; on failure or no route, return the straight-line estimate with `source: "straight_line"` and the page labels it "Straight-line estimate"; tests: success, timeout, cached, fallback label | same client and cache; on failure return 503 and the page shows "Walking route unavailable" with no time |
Question D5:
D5 — If the free walking-route service is down, what should the map show?
Project/branch/task: undergrad-experimental, Campus map "Near you" page.
ELI10: Real walking routes come from a free OpenStreetMap route service that can be slow, down, or block us without warning. Either the page falls back to today's straight-line guess, clearly labeled, or it shows "route unavailable". Both versions cache routes for 30 days, so repeat lookups don't hit the service.
Stakes if we pick wrong: the map page goes blank mid-demo, or students trust a straight-line time that is off by 30-60% (790 m vs 1,218 m to Union South).
Recommendation: A because the page always shows a time, and the label stops it being mistaken for a real route.
Completeness: A=9/10, B=8/10
Pros / cons:
A) Fall back to labeled straight line (recommended)
  ✅ The page always shows a walking time, even when the route service is down
  ❌ The fallback time can be well off: 10 min shown vs 16 min real to Union South
B) Show "route unavailable"
  ✅ Students never see a time that isn't a real walking route
  ❌ The map's main number disappears whenever the free service is down
Net: A keeps a labeled estimate; B shows nothing rather than a rough number.
Header: Route fallback
Options:
A) Labeled straight line (recommended)
sources/routing.py with 5s timeout, identifying User-Agent, 30-day disk cache per place pair; on failure return the straight-line estimate marked source "straight_line" and label it on the page. Tests: success, timeout, cached, fallback label. Human ~3 hr / CC ~15 min.
B) Show route unavailable
Same client and cache; on failure return 503 and show "Walking route unavailable" with no time. Tests: success, timeout, cached, unavailable message. Human ~3 hr / CC ~15 min.

State: approved
Actual answer: B) Show route unavailable, user answer to D5, 2026-10-27
Accepted scope: `sources/routing.py` with 5s timeout, identifying User-Agent and a 30-day disk cache per place-id pair; on failure or no route `/api/route` returns 503 and the page shows "Walking route unavailable" with no time. Tests: success, timeout, cached, unavailable message.
History: none

### R5: What a saved item keeps
Finding: #8, INFORMATIONAL, confidence 8/10, plan Backend endpoint 6, reviewer: plan-eng-review
Plan baseline: original proposal, items store `kind`, `key` and collection ids.
Runtime evidence: events_between (ical_events.py:155) returns only events overlapping the requested window, so a past event is no longer returned; UVA course data is a dated snapshot (design doc). Static read.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 route placement | approved B (D2) | approved B | approved B |
| R2 UW feed reach | deferred (D3) | deferred | deferred |
| R3 missing capability | approved A (D4) | approved A | approved A |
| R4 route failure | approved B (D5) | approved B | approved B |
| R5 saved item content | kind + key only | item also stores a display snapshot taken at save time (course: code, title, GPA, term; event: title, start, end, location, url; place: name, category, lat, lon) plus `saved_at`; Saved page renders from the snapshot and marks ended events "Ended"; tests: render after the event leaves the feed, ended label | kind + key only; Saved page looks each item up live; an item that no longer resolves shows "No longer listed" with a Remove button; tests: resolved, unresolved |
Question D6:
D6 — What should a saved item remember?
Project/branch/task: undergrad-experimental, Saved collections.
ELI10: When a student saves an event, course or place, we can store just its id and look it up again later, or also store a copy of what they saw (title, time, place). Events drop out of the feed once they're over, and UVA's course data is a dated snapshot, so ids alone can stop resolving.
Stakes if we pick wrong: saved events turn into "No longer listed" rows a day later, or a saved copy shows details the school has since changed.
Recommendation: A because Saved should show what the student saved even after the event ends; the page loads with no upstream calls.
Completeness: A=9/10, B=7/10
Pros / cons:
A) Store a snapshot (recommended)
  ✅ Saved events still show their title, time and place after the feed drops them
  ❌ A snapshot can go stale if the school edits the event after it was saved
B) Store the id only
  ✅ Always shows the current details for anything the source still lists
  ❌ Past events and dropped courses become "No longer listed" rows
Net: A keeps what was saved; B stays current but loses anything that leaves the feed.
Header: Saved content
Options:
A) Store a snapshot (recommended)
Each item stores display fields captured at save time plus saved_at; Saved renders from them and marks ended events "Ended". Tests: renders after the event leaves the feed; ended label. Human ~2 hr / CC ~10 min.
B) Store the id only
Items keep kind + key; Saved looks each up live; unresolved items show "No longer listed" with Remove. Tests: resolved, unresolved. Human ~3 hr / CC ~15 min.

State: approved
Actual answer: B) Store the id only, user answer to D6, 2026-10-27
Accepted scope: saved items keep kind + key + collection ids + saved_at only; the Saved page resolves each item live (course via the catalog, event by id within its start day's window, place by id); an item that no longer resolves shows "No longer listed" with a Remove button. Tests: resolved, unresolved.
History: 2026-10-27 amended by the design review (18A, user answer): items also store `display_name` (and event start) at save time, used only when the live lookup cannot resolve the item (Past group, "No longer listed"); live data still wins. Design 19A: one `collection_id` per item.

Section 1 dispositions: #7 approved as R4 (D5 = B); #8 approved as R5 (D6 = B); #9 and #10 carried as required proof of approved features.

### Section 2: Code quality

11. [INFORMATIONAL] (confidence: 9/10) backend/app/tools/course_search.py:71-88 — `if not (subject or course_number or keyword): return {... "error": "Provide at least one of ..."}`
    and the provider call with its error dict already exist. The plan's catalog search "dispatches on
    the provider" directly, a second way to do one task (red flag 6). Required: `/api/catalog/search` calls
    `course_search.execute` (UW, UVA) and `search_courses.execute` (CU), turning their `error` into a 502 body.
    Reuse ladder rung 1, same behavior, no question.
12. [INFORMATIONAL] (confidence: 8/10) backend/app/tools/search_courses.py:130-135 — `subject: str` is required at CU
    (FOSE), so free text like "calculus" cannot search CU. The catalog endpoint parses `q` into subject /
    number / keyword (as `normalize_identifier`, _uw_source.py:54); at CU a keyword-only query returns a
    400 with "Search CU courses by subject code, e.g. CSCI". Edge case, carried as requirement with a test.
13. [INFORMATIONAL] (confidence: 9/10) the Courses page has no defined state before a search: `course_search`
    returns an error for an empty query (:71). Decision R6.
14. [INFORMATIONAL] (confidence: 9/10) backend/app/sources/ical_events.py:140 — event dicts are built in `_event`;
    the stable event id is computed there (one owner), not in events.py, so chat cards and pages share it.
    frontend EventListCard.js:79 `UID:${icsStamp(event.start)}-${icsText(event.title)...}` switches to the id
    when moved into utils/ics.js. Carried as requirement.
Shared-code rubric: a `places.nearest()` helper for find_place.py:79-81 and /api/places was considered and
rejected: the shared code is one `sorted(pool, key=distance)` line; savings ~1 line, below the bar.

### R6: What the Courses page shows before a search
Finding: #13, INFORMATIONAL, confidence 9/10, backend/app/tools/course_search.py:71, reviewer: plan-eng-review
Plan baseline: original proposal; the approved mockup (courses-C2.png) shows results for a typed query only.
Runtime evidence: an empty query returns {"courses": [], "error": "Provide at least one of: subject, course_number, keyword."} (course_search.py:71-76). Static read.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1-R5 | approved / deferred as recorded | unchanged | unchanged |
| R6 empty Courses state | unspecified | list the courses named in the school's `homepage.starters` academics prompts plus the student's saved courses, under "Start with"; the first is selected in the preview; test: starters list renders, saved courses appear | search box with a one-line hint and two example codes from the school pack; preview panel empty with "Pick a course to see grades and seats"; test: hint renders |
Question D7:
D7 — What should the Courses page show before the student searches?
Project/branch/task: undergrad-experimental, Courses page.
ELI10: The course data sources can't list "all courses", they need a search term. So when the page first opens, there's nothing to show unless we pick something. Option A pre-fills a short "Start with" list (the courses your home page already suggests, plus anything the student saved) and previews the first one. Option B shows an empty search box with a hint.
Stakes if we pick wrong: a blank page on first visit looks broken in a demo; a pre-filled list could feel random if the starters are stale.
Recommendation: A because the page opens with real grades and seats on screen, using data the school pack already lists.
Completeness: A=9/10, B=7/10
Pros / cons:
A) "Start with" list (recommended)
  ✅ The page opens with a real course previewed, so the layout makes sense instantly
  ❌ Depends on homepage.starters naming courses; schools without them get only saved ones
B) Empty search with a hint
  ✅ Nothing is fetched until the student types, so the page loads instantly
  ❌ First visit shows an empty list and an empty preview panel
Net: A opens on real data from the school pack; B opens blank but simple.
Header: Courses start
Options:
A) "Start with" list (recommended)
Show courses named in the school's homepage.starters academics prompts plus the student's saved courses under "Start with", first one previewed. Tests: starters list, saved courses. Human ~2 hr / CC ~10 min.
B) Empty search with a hint
Search box with a one-line hint and two example codes from the school pack; preview says "Pick a course to see grades and seats". Test: hint renders. Human ~1 hr / CC ~5 min.

State: approved
Actual answer: A) "Start with" list (recommended), user answer to D7, 2026-10-27
Accepted scope: before a search, the Courses page lists the courses named in the school's homepage.starters academics prompts plus the student's saved courses under "Start with", with the first previewed. Tests: starters list renders; saved courses appear.
History: none

Section 2 dispositions: #11, #12, #14 carried as requirements (reuse / edge case / single owner); #13 approved as R6 (D7 = A); places.nearest extraction rejected (below the savings bar).

### Section 3: Tests

Frameworks: backend pytest (`backend/.venv/bin/python -m pytest backend/app/tests/unit`), frontend Jest via
react-scripts (`CI=true npx react-scripts test --watchAll=false`). No E2E framework in the repo.

```
CODE PATHS                                              USER FLOWS
[+] /api/catalog/search (R1)                            [+] Courses
  ├── [GAP] UW query → course_search                      ├── [GAP] open page → "Start with" list, first previewed (R6)
  ├── [GAP] UVA snapshot → "as of" carried               ├── [GAP] tick 2 → Compare → side by side
  ├── [GAP] CU keyword-only → 400 hint (#12)              ├── [GAP] CU preview shows "Not available" lines (R3)
  ├── [GAP] upstream error → 502                          └── [GAP] /api/courses/COMP SCI 300 detail still works (R1)
  └── [GAP] route order: detail page unaffected (R1)    [+] Events
[+] /api/catalog/{id}                                     ├── [GAP] Up next / List / Calendar switch, window filter
  ├── [GAP] capabilities present/missing/snapshot (R3)    ├── [GAP] Add to calendar downloads one-event .ics with event id
  └── [GAP] unknown course → 404                          └── [GAP] UW after today: empty days (R2 deferred, today only)
[+] /api/events                                         [+] Campus map
  ├── [GAP] window bounds, q filter, from → walk min      ├── [GAP] pick place → route line + time
  └── [GAP] stable id identical across two fetches (#14)  ├── [GAP] route service down → "Walking route unavailable" (R4)
[+] /api/places                                           └── [GAP] category tile → 3 + See more
  ├── [GAP] category counts, distance sort, bad category [+] Saved
  └── [GAP] stable place id                               ├── [GAP] save from page row and from chat card → Unsorted
[+] /api/route (R4)                                       ├── [GAP] create, rename, delete collection; item stays saved
  ├── [GAP] success, cached, timeout → 503, unknown id    ├── [GAP] double-click Save → one item (unique index)
[+] /api/saved (R5, #9)                                   ├── [GAP] item no longer resolves → "No longer listed" (R5)
  ├── [GAP] save idempotent, delete, file, unfile         └── [GAP] [→E2E] user B cannot see or delete user A's items (#9)
  ├── [GAP] resolve live: course / event / place / gone
  └── [GAP] cross-user access → 404
[+] Existing behavior at risk (REGRESSION)
  ├── [★★★ TESTED] .ics one event, escaped text — CampusCards.test.js:72 (UID changes, R7)
  ├── [★★  TESTED] event card calendar export — CampusCards.test.js:55
  ├── [★★★ TESTED] course detail route 400/404/502 — test_courses_api.py:87-104
  ├── [★★  TESTED] events_between windows — test_events.py
  └── [GAP]        CampusRail recent chats / New chat (no test; ChatPage.test.js:28 mocks it)

COVERAGE: 4/34 paths tested (12%) | Code paths: 3/22 | User flows: 1/12 [measured: grep of existing tests]
QUALITY: ★★★:2 ★★:2 ★:0 | GAPS: 30 (1 E2E)
LLM integration: none; these endpoints make no LLM calls, no eval needed.
```

Every GAP above is required proof of an approved feature or decision (plan features, R1, R3-R6, #9, #12, #14)
and is added to the plan without a further question. Test files follow the existing names:
`backend/app/tests/unit/test_catalog_api.py`, `test_events_api.py`, `test_places_api.py`, `test_route_api.py`,
`test_saved_api.py`; `frontend/src/pages/*.test.js`, `frontend/src/utils/ics.test.js`,
`frontend/src/components/CampusRail.test.js`. Tests made obsolete: the .ics test at CampusCards.test.js:72 moves
to `utils/ics.test.js` (same assertions plus the UID).

### R7: Regression contract for code the plan changes
Finding: REGRESSION RULE, CRITICAL, confidence 9/10, frontend/src/components/visuals/EventListCard.js:63-97, frontend/src/components/CampusRail.js, backend/app/sources/ical_events.py:140, backend/app/api/routes/courses.py:209, reviewer: plan-eng-review
Plan baseline: plan moves `createEventIcs` to utils/ics.js, adds nav and a Saved count to CampusRail, adds `id` to every event dict, adds SaveButton to three chat cards; R1 adds a new router beside the course detail route.
Runtime evidence: existing tests CampusCards.test.js:55, :72; test_courses_api.py:87-104; test_events.py; no CampusRail test. Static read.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1-R6 | as recorded | unchanged | unchanged |
| R7 regression contract | none | preserve: .ics has one VEVENT, escaped text, DATE values for all-day, same filename; event card shows Directions/Details as today; course detail 400/404/502 unchanged; `campus/today` and `events_search` output unchanged apart from the new `id`; CampusRail keeps New chat, Recent (6) and All chats. Intentional changes: .ics UID = event id; rail gains 5 nav links and a Saved count; chat cards gain a Save button. Acceptance: existing tests in CampusCards.test.js, test_courses_api.py, test_events.py, test_campus_cards.py pass unchanged except the moved .ics test (UID assertion updated); new CampusRail.test.js covers nav + Recent + New chat | contract A plus, before commit, a /qa browser pass over the five pages and one chat answer card at UW and UVA, findings fixed or listed |
Question D8:
D8 — How should the existing behavior this plan touches be protected?
Project/branch/task: undergrad-experimental, regression cover for the four-page build.
ELI10: Building the pages changes code that already works: the chat event card's "Add to calendar" file moves to a shared helper, the left rail gets new links, chat cards get a Save button, and every event gets an id. The contract below says what must stay exactly the same, what intentionally changes, and which tests prove it. Option B adds a real-browser check of every page before committing.
Stakes if we pick wrong: the chat's calendar download or the rail's recent chats break quietly while the new pages look fine.
Recommendation: A because it pins every at-risk behavior with tests that run in CI; B's browser pass is worth it but can run as /qa after the build.
Completeness: A=8/10, B=10/10
Pros / cons:
A) Unit and route contract (recommended)
  ✅ Every at-risk behavior has an automated test that runs on each change
  ❌ Nothing checks the pages in a real browser before commit
B) Contract plus a /qa browser pass
  ✅ Also catches layout and click-through breaks at UW and UVA before commit
  ❌ Adds a browser run of five pages at two schools to the build (~30 min CC)
Net: A automates the contract; B adds a one-off browser check on top.
Header: Regression cover
Options:
A) Unit and route contract (recommended)
Preserve: .ics content and filename, event card buttons, course detail 400/404/502, campus/today and events_search output apart from the new id, rail New chat/Recent/All chats. Intentional: .ics UID = event id; rail nav + Saved count; Save on chat cards. Existing tests pass unchanged except the moved .ics test; new CampusRail.test.js. Human ~3 hr / CC ~15 min.
B) Contract plus /qa pass
Everything in A, plus a /qa browser pass over the five pages and one chat answer card at UW and UVA before commit, with findings fixed or listed. Human ~5 hr / CC ~45 min.

State: approved
Actual answer: B) Contract plus /qa pass, user answer to D8, 2026-10-27
Accepted scope: contract A (preserve .ics content and filename, event card buttons, course detail 400/404/502, campus/today and events_search output apart from the new id, rail New chat/Recent/All chats; intentional: .ics UID = event id, rail nav + Saved count, Save on chat cards; existing tests pass unchanged except the moved .ics test; new CampusRail.test.js) plus a /qa browser pass over the five pages and one chat answer card at UW and UVA before commit, findings fixed or listed.
History: none

Section 3 dispositions: R7 approved (D8 = B). All GAP rows are required proof of approved features and decisions.
Test Plan Artifact: ~/.gstack/projects/NeonSeigne-CCAI-Demo/macmini-undergrad-experimental-eng-review-test-plan-20261027-154402.md

### Section 4: Performance

15. [INFORMATIONAL] (confidence: 8/10) plan Backend endpoint 1 + backend/app/tools/_uw_source.py:274-280 —
    `for row in rows[:5]: data = await _get_course(row["identifier"])` hydrates up to 5 courses per UW search
    (5 upstream calls on a cold cache, cached after). A search-as-you-type box would repeat this per keystroke.
    Required: the Courses search box waits 300 ms after typing stops and cancels superseded requests. Carried as
    requirement with a test.
16. [INFORMATIONAL] (confidence: 8/10) R5 (live lookup) — the Saved page resolves every item on each visit:
    courses cost one cached-or-upstream call each, events one feed window per distinct start day (feeds cached
    15 min), places are in memory. Scale: tens of items per student [estimated]. A slow or failed lookup is not
    the same as an item that is gone. Decision R8.
17. [INFORMATIONAL] (confidence: 8/10) approved map mockup (map-D2.png) shows a route-based walking time on every
    list row ("0.4 km walk"); with the per-pair route client that is one OSRM call per row (3, then more on See
    more) per spot change. Decision R9.

### R8: Saved page lookups that fail or are slow
Finding: #16, INFORMATIONAL, confidence 8/10, plan Backend endpoint 6 + R5, reviewer: plan-eng-review
Plan baseline: R5 approved (D6 = B): live lookup; an item that no longer resolves shows "No longer listed" with Remove.
Runtime evidence: lookups not built; upstream course calls can fail (test_courses_api.py:98 maps outages to 502). Unknown latency.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1-R7 | as recorded | unchanged | unchanged |
| R5 not-found behavior | approved: "No longer listed" + Remove | unchanged | unchanged |
| R8 lookup failure | unspecified | items resolve concurrently, 5s each; a timeout or upstream error shows "Couldn't check right now" with the saved kind and key, no Remove prompt, and a Retry; only a confirmed not-found shows "No longer listed"; tests: timeout, upstream error, not found | items resolve concurrently, 5s each; any failure, including a timeout, shows "No longer listed" |
Question D9:
D9 — On the Saved page, what if looking up an item fails or is slow?
Project/branch/task: undergrad-experimental, Saved collections (live lookup, R5).
ELI10: You chose to store only the id and look each saved item up when the page opens. Sometimes the lookup itself fails (UW's course site is down, a feed times out). That's different from the item really being gone. Option A shows "Couldn't check right now" with a Retry for failures and keeps "No longer listed" for items confirmed gone. Option B treats every failure as gone.
Stakes if we pick wrong: a student sees their saved courses marked "No longer listed" during a short outage and removes them.
Recommendation: A because a temporary outage should never look like the item disappeared.
Completeness: A=9/10, B=6/10
Pros / cons:
A) Separate "couldn't check" state (recommended)
  ✅ A short outage never tells students their saved items are gone
  ❌ One more row state and message to build and test
B) Treat failures as gone
  ✅ Only two row states: shown, or "No longer listed"
  ❌ Students may remove good items during an outage
Net: A adds a retryable state; B is simpler but misreports outages.
Header: Lookup failures
Options:
A) "Couldn't check" + Retry (recommended)
Resolve items concurrently, 5s each; timeout or upstream error shows "Couldn't check right now" with Retry; only a confirmed not-found shows "No longer listed". Tests: timeout, upstream error, not found. Human ~2 hr / CC ~10 min.
B) Treat failures as gone
Resolve concurrently, 5s each; any failure shows "No longer listed" with Remove. Tests: timeout, not found. Human ~1 hr / CC ~5 min.

State: approved
Actual answer: A) "Couldn't check" + Retry (recommended), user answer to D9, 2026-10-27
Accepted scope: Saved items resolve concurrently with a 5s limit each; a timeout or upstream error shows "Couldn't check right now" with Retry; only a confirmed not-found shows "No longer listed" with Remove. Tests: timeout, upstream error, not found.
History: none

### R9: Walking times on every map list row
Finding: #17, INFORMATIONAL, confidence 8/10, approved mockup map-D2.png + plan Backend endpoint 5, reviewer: plan-eng-review
Plan baseline: approved design shows route-based minutes and km on each list row; R4 approved per-pair route client with 30-day cache and "Walking route unavailable" on failure.
Runtime evidence: live probe 2026-10-27 of `routing.openstreetmap.de/routed-foot/table/v1/foot/...?sources=0` returned one response with minutes [0, 5, 2, 16] and metres [0, 412, 178, 1176] for College Library to Memorial, Geography and Steenbock libraries, matching the per-pair routes.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1-R8 | as recorded | unchanged | unchanged |
| R4 route failure | approved B (D5) | unchanged; list rows also show no time on failure | unchanged |
| R9 list row times | one route call per row | `sources/routing.py` gains `walking_table(origin, places)`: one OSRM table call per spot + list (max 25 places), cached 30 days per pair; the full route line is fetched only for the selected place; on failure rows show no time, per R4; tests: one upstream call for N rows, cache reuse, failure | list rows show straight-line distance labeled "straight line"; only the selected place gets a real route and time; tests: label, selected route |
Question D10:
D10 — How should the map list get a walking time for every place?
Project/branch/task: undergrad-experimental, Campus map "Near you" list.
ELI10: The approved map design shows a real walking time on every row in the list. Asking the free route service once per row means 3 to 25 requests each time a student changes spot or category. The same service has a "table" mode that returns all the times in one request (tested: 5, 2 and 16 min, the same as separate routes). Option B skips that and shows straight-line distance on rows, with a real route only for the place you tap.
Stakes if we pick wrong: many requests can get the app blocked by the free service; straight-line rows disagree with the route time shown above them.
Recommendation: A because one request gives the real times the design shows, at the lowest load on the free service.
Completeness: A=9/10, B=7/10
Pros / cons:
A) One table request (recommended)
  ✅ Every row shows a real walking time from one request per spot change
  ❌ A second route-client function to build, cache and test
B) Straight line on rows
  ✅ No extra upstream calls for the list at all
  ❌ Rows say "0.2 km straight line" while the selected place shows a longer real route
Net: A matches the design with one call; B uses no calls but mixes two kinds of distance.
Header: List walk times
Options:
A) One table request (recommended)
sources/routing.py gains walking_table(origin, places): one OSRM table call per spot and list (max 25), cached 30 days per pair; full route line only for the selected place; rows show no time on failure (R4). Tests: one call for N rows, cache reuse, failure. Human ~2 hr / CC ~10 min.
B) Straight line on rows
Rows show straight-line distance labeled "straight line"; only the selected place gets a real route and time. Tests: label, selected route. Human ~1 hr / CC ~5 min.

State: approved
Actual answer: A) One table request (recommended), user answer to D10, 2026-10-27
Accepted scope: `sources/routing.py` gains `walking_table(origin, places)`: one OSRM table call per spot and list (max 25 places), cached 30 days per pair; the full route line is fetched only for the selected place; on failure rows show no time (R4). Tests: one upstream call for N rows, cache reuse, failure.
History: none

Section 4 dispositions: #15 carried as requirement (300 ms debounce + cancel); #16 approved as R8 (D9 = A); #17 approved as R9 (D10 = A).

### Outside Voice

Running the outside voice automatically (standard step).
Outside review, plan-review phase, completed: 8 findings (5 High, 3 Medium), recommendation "Revise the
source and identity contracts before building the pages". Each was checked against code:

| # | Outside review finding | Verified evidence | Confidence | Disposition |
|---|---|---|---|---|
| O1 | saved event lookup needs the date the hash hides | plan R5 scope "event by id within its start day's window" vs id = hash(calendar+title+start) | 9/10 | required for approved R5: the event key carries its start date; carried, no question |
| O2 | outages look like deletions | _uw_source.py:131-132 `_fetch_json(..., optional=True)` returns None on RequestError/5xx, then `FileNotFoundError`; search_courses.py:183-185 non-200 returns empty success | 8/10 | changes the R7 regression contract; decision R11 |
| O3 | ids never reach chat cards | visuals.py:151 and :172 whitelist keys without `id` | 9/10 | required for approved Save on chat cards: add `id` to both whitelists; older saved chat cards without ids show no Save button; carried, no question |
| O4 | tool reuse can't filter level/open seats | course_search.py:62-63 `max_results` and truncation at :90-91; no level/open_only params | 8/10 | reopens Code quality #11; decision R12 |
| O5 | CU capabilities overstated | search_courses.py:135 `semester: str = "Spring 2026"`; `_row_to_course` has no enrollment fields | 8/10 | factual correction to the school table (CU: subject search, Spring 2026 sections, no seats); R3 display covers it; no question |
| O6 | hash id changes on edits | feeds carry UIDs: `UID:226193@calendar.wisc.edu`, `UID:tag:localist.com\,2008:EventInstance_...` (live 2026-10-27) | 9/10 | decision R10 |
| O7 | event venues need matching for walk minutes | ical_events.py:145 `location` is free text; improved_orchestrator.py:162 `event_venues` + school-packs R5 alias match already exist | 7/10 | carried: reuse the chat venue match; no match shows "Walk time unavailable" (approved mockup events-C2); test |
| O8 | multi-day all-day .ics loses its end | EventListCard.js:82 `...(timed && event.end ? [DTEND...] : [])` | 9/10 | changes the R7 contract; decision R13 |

Cross-model tension: none on facts; The main review's Code quality #11 (reuse course_search) is contradicted by O4 and reopened as R12.

### R10: What identifies an event
Finding: O6, Medium, confidence 9/10, backend/app/sources/ical_events.py:140 + plan Backend endpoint 3, reviewer: Outside voice, confirmed
Plan baseline: plan "stable id (hash of calendar + title + start)"; R5 approved live lookup within the start day's window; O1 (carried) requires the key to carry the start date.
Runtime evidence: UW and CU feeds publish UIDs (live probe); `_event` (ical_events.py:131-153) does not read UID or RECURRENCE-ID today.
Comparison grid:
| Choice | Current | A) Apply | B) Keep | C) Investigate | D) Defer |
|---|---|---|---|---|---|
| R1-R9 | as recorded | unchanged | unchanged | unchanged | unchanged |
| R10 event id | hash(calendar+title+start) | `<start date>:<UID>` plus `RECURRENCE-ID` for repeating events; feeds without a UID fall back to `<start date>:hash(calendar+title+start)`; the .ics UID reuses the feed UID; tests: UID kept after a title edit, recurring instances distinct, no-UID fallback | `<start date>:hash(calendar+title+start)`; an edited title or time orphans saved items | check UVA's Trumba feed for UIDs and recurrence ids (one probe), then return here; id stays pending | keep the hash for now; decide later; id stays pending |
Question D16:
D16 — What should identify an event for saving and calendar export?
Project/branch/task: undergrad-experimental, event ids for Saved and Add to calendar.
ELI10: The plan makes an event's id from its title and start time. If the school fixes a typo or moves the time, the id changes, so a student's saved event turns into "No longer listed" and a re-downloaded calendar file creates a duplicate. The UW and CU feeds already give every event its own permanent id (UID). Option A uses that, with the start date in front so the Saved page knows which day to look up.
Stakes if we pick wrong: saved events vanish after small edits, and calendars collect duplicates.
Recommendation: A because the feed's own UID survives edits; the fallback covers feeds without one.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Use the feed's UID (recommended)
  ✅ Saved events and calendar files survive title and time edits by the school
  ❌ Repeating events need RECURRENCE-ID handling to keep each instance distinct
B) Keep the title+time hash
  ✅ Works the same for every feed with no UID handling at all
  ❌ Any edit to an event's title or time orphans saves and duplicates calendar entries
C) Check UVA's feed first
  ✅ One probe confirms whether all three schools publish UIDs before choosing
  ❌ Delays the decision; the id stays undecided until it returns
D) Defer
  ✅ Lets the build start on other parts without settling event identity
  ❌ Saved events and .ics both depend on the id, so they wait too
Net: A survives edits at the cost of recurrence handling; B is simpler but brittle.
Header: Event id
Options:
A) Apply: use feed UID
Id = <start date>:<UID>(+RECURRENCE-ID); no-UID feeds fall back to <start date>:hash(calendar+title+start); .ics UID reuses the feed UID. Tests: UID kept after title edit, recurring instances distinct, fallback. Human ~2 hr / CC ~10 min.
B) Keep: title+time hash
Id = <start date>:hash(calendar+title+start); edits to title or time orphan saved items and duplicate calendar entries.
C) Investigate UVA first
Probe UVA's Trumba feed for UID and RECURRENCE-ID, then return to this question; the id stays pending.
D) Defer this change
Keep the hash wording in the plan and leave R10 unresolved; Saved events and .ics stay blocked on it.

State: approved
Actual answer: A) Apply: use feed UID, user answer to D16, 2026-10-27
Accepted scope: event id = `<start date>:<UID>` (RECURRENCE-ID appended if a feed sends one); feeds without a UID fall back to `<start date>:hash(calendar+title+start)`; computed once in `ical_events._event`; the .ics UID reuses the feed UID. Tests: id kept after a title edit, repeating dates distinct, no-UID fallback.
History: 2026-10-27 asked as D11, answered "Lets talk about events altogether after this working change. SO defer." Reopened in the events discussion ("Discuss events now"); same brief re-sent as D15. D15 answered C) Investigate UVA first, 2026-10-27. Investigation (live curl, 2026-10-27): UVA Trumba 200 events / 200 UID / 0 duplicate UIDs / 2 RRULE / 0 RECURRENCE-ID; UW limit=200: 200 / 200 / 0 / 2 / 0; CU Localist 1,934 / 1,934 / 0 / 0 / 0. Every event at every school has a unique UID; repeating events share a UID across dates, so the start date in the id separates them. Re-asked as D16 with this evidence.

### R13: Multi-day all-day events in .ics exports
Finding: O8, Medium, confidence 9/10, frontend/src/components/visuals/EventListCard.js:82, reviewer: Outside voice, confirmed
Plan baseline: R7 approved contract preserves .ics content (one VEVENT, escaped text, DATE values for all-day); R10 approved: .ics UID reuses the feed UID.
Runtime evidence: `...(timed && event.end ? [`DTEND:${icsStamp(event.end)}`] : [])` emits no DTEND for all-day events, so calendar apps treat a multi-day exhibit as one day. Feeds: UVA 4 all-day events, CU 34 over 14 days [measured]. Static read.
Comparison grid:
| Choice | Current | A) Apply | B) Keep | C) Investigate | D) Defer |
|---|---|---|---|---|---|
| R1-R12 | as recorded | unchanged | unchanged | unchanged | unchanged |
| R7 .ics contract | preserve today's output | unchanged except: all-day events also emit `DTEND;VALUE=DATE` (day after the last day, as iCalendar requires) | unchanged | unchanged | unchanged |
| R13 all-day end | no DTEND | emit `DTEND;VALUE=DATE:<last day + 1>` for all-day events; tests: one-day all-day (DTEND next day), three-day exhibit, timed unchanged | single-day exports for multi-day events | count multi-day all-day events across the three feeds, then return; pending | leave as is; pending |
Question D17:
D17 — Should "Add to calendar" keep multi-day all-day events at their full length?
Project/branch/task: undergrad-experimental, .ics export on the Events page and chat cards.
ELI10: Some campus events run all day for several days, like an exhibit from Monday to Friday. The current calendar file leaves out the end date for all-day events, so a student's calendar shows only Monday. The fix adds the end date the way calendar apps expect. It changes the file the chat already produces, which the regression contract had promised to keep identical.
Stakes if we pick wrong: students add a week-long exhibit and their calendar shows it for one day.
Recommendation: A because it's a one-line fix with clear tests, and the moved helper is the right moment to make it.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Add the end date (recommended)
  ✅ Multi-day all-day events show their full span in Google, Apple and Outlook calendars
  ❌ Changes the chat's existing .ics output, an intentional change to the R7 contract
B) Keep today's output
  ✅ The calendar file stays byte-for-byte what the chat produces today
  ❌ Week-long events import as a single day
C) Count them first
  ✅ Shows how many multi-day all-day events the three feeds really have
  ❌ The fix is one line either way; this only delays it
D) Defer
  ✅ No change to the .ics helper in this build
  ❌ The known wrong export stays in both chat and the Events page
Net: A fixes a real export bug at the cost of changing the .ics contract slightly.
Header: All-day .ics
Options:
A) Apply: add DTEND
All-day events emit DTEND;VALUE=DATE for the day after the last day; timed events unchanged. Tests: one-day all-day, three-day exhibit, timed unchanged. Human ~1 hr / CC ~5 min.
B) Keep current output
No DTEND for all-day events; multi-day events import as one day.
C) Count them first
Count multi-day all-day events in the three feeds, then return; R13 stays pending.
D) Defer this change
Leave the .ics output as is; R13 stays unresolved.

State: approved
Actual answer: A) Apply: add DTEND, user answer to D17, 2026-10-27
Accepted scope: all-day events in the shared .ics helper emit `DTEND;VALUE=DATE` for the day after the last day (intentional change to the R7 contract); timed events unchanged. Tests: one-day all-day, three-day exhibit, timed unchanged.
History: 2026-10-27 deferred without a question, with the events discussion (D11). Asked as D17 in that discussion.

### R11: Telling a course outage from a missing course
Finding: O2, High, confidence 8/10, backend/app/tools/_uw_source.py:131-132 and backend/app/tools/search_courses.py:183-185, reviewer: Outside voice, confirmed
Plan baseline: R8 approved (D9 = A): only a confirmed not-found shows "No longer listed"; failures show "Couldn't check right now". R7 approved contract: course detail 400/404/502 unchanged.
Runtime evidence: `_get_course` calls `_fetch_json(..., optional=True)`, which returns None on network errors and 5xx (:79-91), then raises `FileNotFoundError` (:162), so an outage reads as 404. FOSE non-200 returns `{"courses": []}` with no error (:183-185). Static read.
Comparison grid:
| Choice | Current | A) Apply | B) Keep | C) Investigate | D) Defer |
|---|---|---|---|---|---|
| R1-R9, R10, R13 | as recorded | unchanged | unchanged | unchanged | unchanged |
| R8 lookup failure | approved A (D9) | unchanged | unchanged, but outages still reach students as "No longer listed" | unchanged | unchanged |
| R11 outage semantics | outage → not found (UW), empty success (CU) | `_get_course` raises `RuntimeError` when any upstream fetch failed and nothing matched; FOSE non-200 returns an `error`; course detail page returns 502, not 404, during an outage (intentional R7 change); Saved shows "Couldn't check right now"; tests: 5xx → 502 at detail, 5xx → couldn't check in Saved, real 404 → not found, FOSE 503 → error | no source change; R8's distinction works only for errors that already raise | read the 4 optional-fetch call sites in _uw_source.py and list which callers rely on None, then return; stays pending | leave source semantics; R8's guarantee holds only partially |
Question D12:
D12 — Should the course sources stop turning outages into "not found"?
Project/branch/task: undergrad-experimental, Saved lookups (R8) and the course detail page.
ELI10: You chose that a saved course only shows "No longer listed" when it's really gone. But today, if UW's course site is down, our UW client reports "not found", and CU's search reports "no results" instead of an error. So R8 can't tell the difference yet. Fixing the client makes outages show up as outages everywhere, including the course detail page, which will say "service unavailable" instead of "course not found" during an outage.
Stakes if we pick wrong: during a UW outage, students see every saved course as gone and the detail page says the course doesn't exist.
Recommendation: A because R8's promise depends on it, and the detail page message becomes accurate too.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Fix outage reporting (recommended)
  ✅ Saved and the course detail page both tell outages apart from missing courses
  ❌ Changes shared chat-tool code, so chat course answers also start reporting outages
B) Keep today's behavior
  ✅ No change to the shared UW and CU clients the chat already depends on
  ❌ R8 cannot work as approved; outages still show "No longer listed"
C) Investigate callers first
  ✅ Confirms which of the 4 optional fetches rely on "None means skip" before changing them
  ❌ Leaves R8's guarantee unbacked until the investigation returns
D) Defer
  ✅ Keeps the build moving on other pages without touching shared clients
  ❌ R8 ships only partly working, with outages misreported
Net: A makes R8 real and changes shared client errors; B leaves R8 hollow.
Header: Outage errors
Options:
A) Apply: report outages
_get_course raises RuntimeError when a fetch failed and nothing matched; FOSE non-200 returns an error; course detail returns 502 not 404 during outages (intentional R7 change). Tests: detail 5xx→502, Saved couldn't-check, real 404, FOSE 503. Human ~3 hr / CC ~15 min.
B) Keep current semantics
No change to _uw_source.py or search_courses.py; R8's distinction applies only to errors that already raise.
C) Investigate callers first
Read the 4 optional-fetch call sites in _uw_source.py, list which rely on None, then return here; R11 stays pending.
D) Defer this change
Leave source error semantics as they are and keep R11 unresolved; R8 works only partially.

State: approved
Actual answer: A) Apply: report outages, user answer to D12, 2026-10-27
Accepted scope: `_get_course` raises `RuntimeError` when any upstream fetch failed and nothing matched; FOSE non-200 returns an `error`; the course detail page returns 502, not 404, during an outage (intentional change to the R7 contract); Saved shows "Couldn't check right now". Tests: detail 5xx → 502, Saved couldn't-check, real 404 → not found, FOSE 503 → error.
History: none

### R12: Where course search filters run
Finding: O4, High, confidence 8/10, backend/app/tools/course_search.py:62-63, :90-91, reviewer: Outside voice, confirmed; reopens Code quality #11 (main review)
Plan baseline: plan endpoint 1 `?q=&level=&open_only=&limit=`; approved mockup courses-C2 shows "Any level" and "Seats open" chips; Code quality #11 (carried, not user-approved) required reusing `course_search.execute`.
Runtime evidence: `max_results = tool_cfg.get("max_results", 20)` and `rows = rows[:max_results]`; no level/open_only parameters; UW search rows carry no seats (_uw_source.py:257-266), UVA rows come from the sections CSV with Enrollment/EnrollmentLimit, CU rows have no seats (O5). Static read.
Comparison grid:
| Choice | Current | A) Apply | B) Keep | C) Investigate | D) Defer |
|---|---|---|---|---|---|
| R1-R11, R13 | as recorded | unchanged | unchanged | unchanged | unchanged |
| R3 missing capability | approved A (D4) | unchanged | unchanged | unchanged | unchanged |
| R12 search filters | #11: reuse course_search, filters after its truncation | one shared `search_catalog(q, level, open_only, limit)` beside the providers; the chat tool and `/api/catalog/search` both call it, filters run before truncation; level works at every school (from the course number); "Seats open" works where search rows carry seats (UVA, historical) and elsewhere shows "Not available for <school>" per R3; tests: level filter, open_only at UVA, open_only unavailable at UW/CU, limit after filtering | #11 as carried: reuse the tool and drop the level and Seats open chips from the page | measure UW search sizes for common queries ("comp sci", "math") to see if truncation matters, then return; stays pending | leave #11 and the chips as drafted; R12 unresolved |
Question D13:
D13 — How should the Courses page's level and "Seats open" filters work?
Project/branch/task: undergrad-experimental, Courses search.
ELI10: Your approved Courses design has "Any level" and "Seats open" filter chips. I had planned to reuse the chat's course-search tool, but it cuts results to 20 before any filter could run, so a filter would miss courses past the first 20. Also only UVA's search results include seat counts (and those are from September). Option A makes one shared search function that filters first and keeps the chat tool on it too. Option B drops the two chips.
Stakes if we pick wrong: "Seats open" quietly hides real matches, or the page loses filters your design shows.
Recommendation: A because the chips stay and work correctly, and chat and page share one search.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) One shared search (recommended)
  ✅ Filters see every match, and chat and the page can never disagree on results
  ❌ Touches the chat tool's search path, so its tests must be rerun and kept green
B) Drop the two chips
  ✅ Reuses the chat tool unchanged; nothing shared is touched
  ❌ The page loses the level and Seats open filters from the approved design
C) Measure first
  ✅ Shows whether common searches actually exceed 20 results before changing code
  ❌ Leaves the search design undecided until it returns
D) Defer
  ✅ Lets the build start elsewhere and settle search later
  ❌ The Courses page can't be finished until search is decided
Net: A keeps the designed filters with one search; B is simpler but cuts them.
Header: Search filters
Options:
A) Apply: one shared search
search_catalog(q, level, open_only, limit) beside the providers, used by the chat tool and /api/catalog/search; filters before truncation; level everywhere; Seats open at UVA (historical), "Not available" elsewhere (R3). Tests: level, open_only UVA, unavailable UW/CU, limit after filtering. Human ~3 hr / CC ~15 min.
B) Keep: reuse tool, drop chips
Catalog search reuses course_search unchanged; the page drops the Any level and Seats open chips.
C) Measure UW results first
Count UW search results for common queries to see if the 20 cap matters, then return; R12 stays pending.
D) Defer this change
Leave the drafted search and chips as they are; R12 stays unresolved.

State: approved
Actual answer: A) Apply: one shared search, user answer to D13, 2026-10-27
Accepted scope: one shared `search_catalog(q, level, open_only, limit)` beside the providers, used by the chat `course_search` tool and `/api/catalog/search`; filters run before truncation; level works at every school; "Seats open" works at UVA (historical seats) and shows "Not available for <school>" at UW and CU (R3). Tests: level filter, open_only at UVA, open_only unavailable at UW/CU, limit after filtering; existing course_search tool tests stay green. Supersedes Code quality #11 (reuse course_search unchanged).
History: 2026-10-27 design review 25A (user answer): the Seats-open chip reads "Had open seats (Sep 3)" at UVA and is hidden at UW and CU instead of showing "Not available". Earlier: Code quality #11 (main review, carried without a question) required reusing `course_search.execute`; reopened by Outside review O4 and replaced by this answer.

Outside voice dispositions: O1, O3, O5, O7 carried (required or factual); O2 approved as R11 (D12 = A); O4 approved as R12 (D13 = A); O6 approved as R10 (D16 = A, after a UVA investigation); O8 approved as R13 (D17 = A).

Approval readiness: PASS for approved IDs R1 (D2), R2 (D14), R3 (D4), R4 (D5), R5 (D6), R6 (D7), R7 (D8, amended by R11 D12 and R13 D17), R8 (D9), R9 (D10), R10 (D16), R11 (D12), R12 (D13), R13 (D17); structure D1 = A. No unresolved decisions. (Re-checked after the events discussion, 2026-10-27.)

## Eng Review Output

### Reality rows
- premise-table: 14 premises checked, all with receipts. Verified: course detail catch-all (courses.py:209), UW feed 20 events/today only and ?limit=200 / page=2 reach (live curl), UVA 127 and CU 274 events over 14 days (live events_between), no event UID read (ical_events.py:131-153), events_search cap 15 (events_search.py:53), places without id (places.py:155), .ics builder in EventListCard.js:63-97, course_search empty-query error (course_search.py:71), UW outage → not found (_uw_source.py:131,162), FOSE non-200 empty success (search_courses.py:183), CU Spring 2026 default (search_courses.py:135), card whitelists (visuals.py:151,172), OSRM route and table (live probe), react 19 (frontend/package.json:19). unverified=0.
- already-done: `git fetch origin dev`; `git log origin/dev --since=2026-10-27` returned 0 commits; no overlap on campus.py, courses.py, CampusRail.js, EventListCard.js, database.py, App.js.
- surface-check: routes checked against courses.py:22/209 and api/routes/__init__.py:22-23; OSRM `route` and `table` endpoints and today.wisc.edu `limit`/`page` params probed live; react-leaflet 5 / Leaflet 1.9 for React 19 (search check).
- binding-decisions: branch decisions honored (M1 domains, per-domain routing, sources/ provider abstraction only for academics). `sources/routing.py` is a helper module like the existing `sources/ical_events.py` and `sources/places.py`, not a new provider type, so it does not reintroduce the overruled source-type layer.
- numbers: 53 backend tests in course/event/place/card files and 10 frontend card tests [measured: grep]; 20 / 200 / ~9-day UW events [measured: curl]; ~30 source files [estimated]; 4 optional fetches [measured: grep]; walking minutes 5/2/16 [measured: OSRM table].
- deferred-asks: no linked issue; pass.
- pr-count: no `.gstack/ship-policy.json`; default one PR for this wave.
REALITY: premise-table pass 14 premises verified, unverified=0 backend/app/api/routes/courses.py:209
REALITY: already-done pass 0 commits on origin/dev since 2026-10-27 backend/app/api/routes/campus.py:20
REALITY: surface-check pass routes and upstream params probed backend/app/api/routes/__init__.py:22
REALITY: binding-decisions pass M1 and sources decisions honored backend/app/sources/academics.py:13
REALITY: numbers pass counts tagged measured/estimated backend/app/tests/unit/test_courses_api.py:31
REALITY: deferred-asks pass no linked issue docs/designs/campus-pages-plan.md:1
REALITY: pr-count pass one PR, no ship policy docs/designs/campus-pages-plan.md:1

### NOT in scope
- Transit, dining and health pages: milestone 2 per the school-packs design doc (D1 there).
- theCourseForum review data: needs written permission (school-packs design doc).
- Turn-by-turn route text: most campus paths are unnamed; the map links to OpenStreetMap.
- Extracting `places.nearest()`: rejected in Code quality, savings about one line.

### What already exists
- `academics.get_provider()` and provider coroutines: reused under the new shared `search_catalog` (R12) and the catalog summary.
- `course_search` / `search_courses` tools: moved onto `search_catalog` (R12) rather than duplicated.
- `ical_events.events_between` / `window_bounds`: reused by `/api/events` (#4).
- `places.search` / `distance_m` / `public`: reused by `/api/places`; place id added at `public()` (#5).
- `sources/cache.py` disk cache: reused for route and table caching (R4, R9).
- `EventListCard` `.ics` builder: moved to `utils/ics.js` with the same output (R7).
- Chat venue matching (`improved_orchestrator.event_venues` + alias match): reused for event walking minutes (O7).
- `get_current_active_user`, `create_indexes`: reused for the saved store (#9).

### Failure modes
| Path | Realistic failure | Test / handling | User sees |
|---|---|---|---|
| /api/catalog | UW Course Map 5xx | R11 raises, 502, tested | "Couldn't load courses" |
| /api/catalog (CU) | keyword-only query | #12 400 with hint, tested | subject-code hint |
| /api/route | FOSSGIS blocks or times out | R4 503, cached routes still served, tested | "Walking route unavailable" |
| /api/places list | OSRM table fails | R9 rows show no time, tested | places without times |
| /api/events (UW) | a feed page fails or the feed ends early | R2 two cached pages, stale-on-failure, "Listed through <date>" label, tested | dates covered are stated |
| Saved lookup | upstream outage | R8 + R11 "Couldn't check right now", tested | clear, retryable |
| Saved event | school edits the event title/time | R10 feed-UID id survives edits, tested | event still listed |
| .ics export | multi-day all-day event | R13 DTEND as DATE, tested | full span in the calendar |
| Saved isolation | query missing user_id | #9 cross-user test | 404 |

**Critical gaps (0):** both earlier gaps (UW empty days, one-day multi-day exports) are closed by R2 (D14) and R13 (D17).

### Worktree parallelization strategy
| Step | Modules touched | Depends on |
|------|----------------|------------|
| 1. Catalog search + summary + outage semantics (R1, R3, R11, R12) | backend/app/api/routes/, backend/app/sources/, backend/app/tools/ | — |
| 2. Events, places, route endpoints + routing client (R4, R9, O7) | backend/app/api/routes/, backend/app/sources/ | — |
| 3. Saved store + live resolve (R5, R8, #9) | backend/app/api/routes/, backend/app/core/ | 1, 2 (resolvers) |
| 4. Frontend shell: rail, routes, api client, SaveButton, utils/ics.js, card ids (R7, O3) | frontend/src/components/, frontend/src/utils/, backend/app/api/visuals.py | — |
| 5. Pages: Courses + Compare, Events, Campus map, Saved | frontend/src/pages/, frontend/src/styles/ | 1, 2, 3, 4, 7 |
| 7. Events: UW paging, feed-UID ids, Listed-through label, all-day DTEND (R2, R10, R13) | backend/app/sources/, backend/app/config, schools/, frontend/src/utils/ | 4 (utils/ics.js) |
| 6. /qa pass at UW and UVA (R7) | — | 5 |

Parallel lanes: Lane A: 1 → 3 (backend routes) / Lane B: 2 → 7 backend part (backend sources) / Lane C: 4 → 7 ics part (frontend shared).
Execution order: launch A, B and C in parallel; step 3 waits for 1 and 2; merge all; then 5; then 6.
Conflict flags: steps 1, 2 and 3 all register routers in backend/app/api/routes/__init__.py; steps 1 and 2 both add files under backend/app/sources/. Coordinate the `__init__.py` edit.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific
finding above.
Effort ratio assumption: features ~30x, tests ~50x, bug fix with regression ~20x.

- [ ] **T1 (P1, human: ~1 day / CC: ~30 min)** — catalog — `/api/catalog/search` and `/api/catalog/{id}` on a shared `search_catalog`, with capabilities and starters
  - Surfaced by: R1 (D2), R3 (D4), R6 (D7), R12 (D13), Code quality #12
  - Files: backend/app/api/routes/catalog.py, backend/app/api/routes/__init__.py, backend/app/sources/academics.py, backend/app/tools/course_search.py, backend/app/tests/unit/test_catalog_api.py
  - Verify: route test (detail page unaffected), level / open_only / limit tests, CU hint test; existing test_course_search_tool.py green
- [ ] **T2 (P1, human: ~4 hr / CC: ~15 min)** — course sources — report outages instead of not-found
  - Surfaced by: R11 (D12), Outside review O2
  - Files: backend/app/tools/_uw_source.py, backend/app/tools/search_courses.py, backend/app/tests/unit/test_courses_api.py, backend/app/tests/unit/test_uw_course_tools.py
  - Verify: detail 5xx → 502, real 404 → 404, FOSE 503 → error
- [ ] **T3 (P1, human: ~1.5 days / CC: ~40 min)** — campus — `/api/events`, `/api/places`, `/api/route` and `sources/routing.py` (route + table)
  - Surfaced by: R4 (D5), R9 (D10), Scope #4, #5, Architecture #10, Outside review O7
  - Files: backend/app/api/routes/events.py, places.py, route.py, backend/app/sources/routing.py, backend/app/sources/places.py, tests test_events_api.py, test_places_api.py, test_route_api.py
  - Verify: window/q/from tests, place id, route success/cached/timeout → 503, one table call for N rows, OSRM User-Agent set.
- [ ] **T4 (P1, human: ~1 day / CC: ~30 min)** — saved — Mongo `saved_items` / `saved_collections`, idempotent save, live resolve
  - Surfaced by: R5 (D6), R8 (D9), Architecture #9
  - Files: backend/app/api/routes/saved.py, backend/app/models/saved.py, backend/app/core/database.py, backend/app/tests/unit/test_saved_api.py
  - Verify: unique index, cross-user 404, resolved / not found / couldn't check
- [ ] **T5 (P1, human: ~1 day / CC: ~30 min)** — frontend shell — rail nav + Saved count, routes, api client, SaveButton, utils/ics.js, ids on chat cards
  - Surfaced by: R7 (D8), Outside review O3, Code quality #14
  - Files: frontend/src/components/CampusRail.js, frontend/src/App.js, frontend/src/utils/ics.js, frontend/src/components/SaveButton.js, frontend/src/components/visuals/EventListCard.js, PlaceCard.js, CourseAnswerCard.js, backend/app/api/visuals.py, tests CampusRail.test.js, utils/ics.test.js
  - Verify: CampusCards.test.js unchanged except the moved .ics test; rail keeps New chat / Recent / All chats
- [ ] **T6 (P1, human: ~3 days / CC: ~1.5 hr)** — pages — Courses + Compare, Events, Campus map (react-leaflet 5, OSM attribution), Saved, one CSS each
  - Surfaced by: D1 (original arrangement), R3, R4, R6, R8, R9, Performance #15
  - Files: frontend/src/pages/CoursesPage.js, CourseComparePage.js, EventsPage.js, CampusMapPage.js, SavedPage.js, matching CSS, frontend/package.json, page tests
  - Verify: page tests for each approved state; 300 ms search debounce
- [ ] **T7 (P1, human: ~4 hr / CC: ~30 min)** — QA — /qa browser pass over the five pages and one chat card at UW and UVA before commit
  - Surfaced by: R7 (D8)
  - Files: none (report)
  - Verify: /qa report with findings fixed or listed
- [ ] **T8 (P1, human: ~1 day / CC: ~30 min)** — events — UW paging, feed-UID event ids, "Listed through" label, all-day DTEND
  - Surfaced by: R2 (D14), R10 (D16), R13 (D17), Outside review O1, O6, O8
  - Files: backend/app/config.py, schools/uw-madison/school.yaml, backend/app/sources/ical_events.py, frontend/src/utils/ics.js, backend/app/tests/unit/test_events.py, frontend/src/utils/ics.test.js
  - Verify: paging + merge, id kept after a title edit, repeating dates distinct, no-UID fallback, one-day and three-day all-day .ics, label when a feed ends early

### Unresolved decisions that may bite you later
None. R2, R10 and R13 were settled in the events discussion (D14, D16, D17).

### Completion summary
- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 4 issues found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 30 gaps identified
- Performance Review: 3 issues found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user (no TODOS.md; no deferrals remain)
- Failure modes: 0 critical gaps flagged (2 closed by D14 and D17)
- Unresolved decisions: 0 in this review (3 deferred, then settled in the events discussion)
- Outside voice: Outside review, completed, 8 findings (5 High, 3 Medium); 4 approved (R10, R11, R12, R13), 4 carried
- Parallelization: 3 lanes, 3 parallel / 3 sequential
- Lake Score: 1/8 (D8 picked a 10/10 option out of 8 scored answers; D14 picked a 9/10 option)

## Design Review (plan-design-review, 2026-10-27)

Target: docs/designs/campus-pages-plan.md against the approved mockups in
`~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/campus-pages-20261027/` (courses-C2, courses-D2, events-C2,
events-variant-B, map-D2, saved-variant-D). No DESIGN.md; `frontend/src/styles/brand-tokens.css` is the working
system. New mockups not generated (the designer needs an OpenAI key; user preference keeps keys out of design tooling).
Classification: APP UI (OPERATE) on every page. Step 0 rating: 5/10.

Outside voices: Outside review design critique, completed, 12 findings (10 High, 2 Medium); main review
subagent completeness review, completed. Litmus consensus: each-section-one-job FAIL, cards-necessary FAIL
(Compare, Events, Saved), motion unspecified; Outside review hard rejections #1 (Events, Saved card grids) and #7 (Saved
stacked cards).

### Design decisions


**Pass 1, Information architecture: 6/10 → 9/10.** Every page now has one first thing; Compare's row emphasis is left to Pass 7.

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 1 | 1A: Events opens with one wide "Next up" feature row (title, time, place, walk time, Add to calendar, Save); following events are list rows under the window heading. Replaces the three equal cards of events-C2. |
| 2 | 2A: Unsorted is always the first entry in Saved, shows its count, and is selected by default when it has items; otherwise the most recently used collection is selected. |
| 3 | 3A: Saved is a left collection list (~240px: Unsorted, collections with counts, New collection) beside the selected collection's items (name, Rename, Compare for courses). Replaces the tile row of saved-variant-D. |
| 4 | 4A: Courses keeps the Browse / Compare switch with the ticked count at all times; the "N courses ticked · Compare them" bar appears only with 2-4 ticked and is the page's one primary button. |
| 5 | 5A: The map page is titled "Campus map"; its panel reads "Starting from <place>" with Change, or "Choose a starting point" before one is set. |
| 6 | 6A: On load the map selects the nearest place in the selected category that is open now (nearest overall when hours are unknown), labelled "Nearest open <category>", with its row highlighted and route drawn; clicking another row replaces it. |
| 7 | 7A: The map's title-bar Ask button is outlined (white, `--line` border); with a place selected it reads "Ask about this route" and opens a new chat prefilled "How do I get from <start> to <place>?". |
| 8 | 8A: One date window drives Up next, List and Calendar: chips above the results, a heading naming the window ("Tonight", "This weekend", "Oct 27 – Nov 2"), search kept across views, Calendar week arrows move the same window, campus time zone shown. |

```
Courses   [title + Browse|Compare(n)] → search + filters → result list (✓ to tick) │ preview: code/title → metric strip → grades → seats → prereqs/next
                                         └ "N ticked · Compare them" (2-4 ticked only)
Events    [title + Up next|List|Calendar] → window chips + search → heading = window → Next up feature → rows / week grid
Map       [title "Campus map" + Ask (outlined)] → Starting from <place> · Change │ map + route → category filters → 3 nearest rows + See more
Saved     [title] → collection list (Unsorted first, collections, New) │ selected collection items
```


**Pass 2, Interaction states: 3/10 → 9/10.** Every page region now has loading, empty, error, success and partial behaviour.

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 9 | 9A: per-region placeholders sized like the content, shown after 300 ms; each region loads independently. |
| 10 | 10A: specific empty copy plus one action per case (table below). |
| 11 | 11A: a failed region shows "Couldn't load <what> from <source>" + Retry while header, filters and search stay usable; cached data stays with "As of <time>". The rail's failed recent-chats request shows "Couldn't load chats · Retry" instead of the empty line (fixes CampusRail.js:31). |
| 12 | 12A: Save is one tap to Unsorted: bookmark fills at once, message "Saved to Unsorted · Move · Undo" for 5 s; tapping again unsaves with "Removed · Undo"; on failure the bookmark reverts with "Couldn't save · Retry"; rail count updates; same on chat cards. |
| 13 | 13A: Next up shows the next event in the window, dated when not today ("Tomorrow 9:00 AM"); the orange tag only for "Happening now" or within 15 min; an empty window uses the 10A empty state. |

```
  FEATURE           | LOADING (9A)            | EMPTY (10A)                                   | ERROR (11A)                         | SUCCESS                         | PARTIAL
  ------------------|-------------------------|-----------------------------------------------|-------------------------------------|---------------------------------|------------------------------------------
  Courses list      | 5 placeholder rows      | 'No courses match "<q>"' + Clear filters      | Couldn't load courses from <source> | rows, first previewed (R6)      | snapshot rows say "As of <date>" (R3)
  Course preview    | metric strip + bar      | —                                             | inline in preview + Retry           | grades, seats, prereqs, next    | "Not available for <school> (<source>)" (R3)
  Compare           | column placeholders     | <2 ticked: "Tick at least 2 courses" + Back   | failed column only + Retry          | side-by-side rows               | per-row "Not available" (R3)
  Events            | Next up + 5 rows        | "Nothing listed for <window>" + Listed-through + Try Next 7 days | Couldn't load events from <feed> | Next up + rows / grid  | "Listed through <date>" (R2); walk time blank if no place match (O7)
  Map list          | grey map + 3 rows ('–') | "No <category> on the campus map" + Show all  | Couldn't load places + Retry        | nearest open selected (6A)      | rows without times if table fails (R9)
  Map route         | line placeholder        | —                                             | "Walking route unavailable" (R4)    | route + minutes + metres        | tiles fail: list still works
  Saved             | per-item placeholders   | "Nothing saved yet. Use the bookmark on any course, event or place, here or in chat." | Couldn't load saved items + Retry | items resolve live (R5) | "Couldn't check right now" / "No longer listed" (R8)
  New collection    | —                       | "Empty. Move items here from Unsorted."       | —                                   | —                               | —
  Save button       | fills at once           | —                                             | reverts + "Couldn't save · Retry"   | "Saved to Unsorted · Move · Undo" | —
  Rail recent chats | existing                | "Your chats will show up here."               | "Couldn't load chats · Retry"       | existing                        | —
```


**Pass 3, User journey: 4/10 → 9/10.** Chat, pages and Saved now hand off to each other with context.

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 14 | 14A: chat cards link into pages with context: event card "See all on Events" → `/events?window=&q=`; place card "Open on map" → `/map?from=&to=`; course card "Open in Courses" → `/courses?selected=`. |
| 15 | 15A: every Ask button opens a new chat prefilled (not sent): course "Tell me about <code> <title>: how hard is it and what should I know?"; Compare "Compare <codes> for difficulty and workload."; map (7A) "How do I get from <start> to <place>?". |
| 16 | 16A: one starting place per student, shared by Events and Map, saved on the account; default from a new school-pack field `campus.default_origin`; "Change" opens a place-search popover (Escape closes); no GPS. |
| 17 | 17A: Saved rows per kind: course (code, title, GPA line, seats tag, Course page), event (date/time, title, place, walk time, Add to calendar), place (name, hours, walk time, Directions); ended events go to a collapsed "Past" group with "Clear past" (unsaves them). |
| 18 | 18A: saved items also store `display_name` (+ event start) for display when the live lookup fails; amends eng-review R5. |
| 19 | 19A: each item has one home (Unsorted or one collection); row menu "Move to…" (+ New collection) and "Remove" (unsave, "Removed · Undo"); deleting a collection asks to confirm and moves its items to Unsorted. |

```
  STEP | USER DOES                                   | USER FEELS                 | PLAN SPECIFIES?
  -----|---------------------------------------------|----------------------------|--------------------------------------------
  1    | Asks chat "what's on tonight?"              | curious, short on time     | yes: event card with times and walk minutes
  2    | Taps Save on one event in the card          | wants to keep it           | 12A: bookmark fills, "Saved to Unsorted · Move · Undo"
  3    | Taps "See all on Events"                    | wants more options         | 14A: /events?window=tonight, heading "Tonight"
  4    | Scans Next up + list, changes start         | in control                 | 1A, 8A, 13A, 16A: Next up, one window, shared start
  5    | Opens Campus map from an event's place      | wants to get there         | 5A, 6A, R4, R9: "Starting from", route, minutes
  6    | Opens Saved later that week                 | planning                   | 2A, 3A, 17A: Unsorted first, actionable rows
  7    | Moves items into "This week"                | organised                  | 19A: Move to…, one home per item
  8    | Comes back after the event                  | tidy                       | 17A, 18A: event moved to Past, still named
```
Time horizons: 5 s, each page's first thing is obvious (Pass 1); 5 min, save, move, walk and add-to-calendar all work in one or two taps; long term, Saved stays tidy because ended events step aside.


**Pass 4, AI-slop risk (OPERATE / app UI): 6/10 → 8/10.** Outside review hard rejections #1 and #7 cleared by 1A and 3A. Remaining
below 10: the course preview keeps three stat tiles (user's choice, 21B), a mild dashboard-tile pattern.

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 20 | 20A: Calendar has seven equal day columns; today marked by a tinted header and the now-line; up to 3 lanes per time slot, then "+N more" opening that hour's events as a list; all-day row shows 2 chips + "+N more" that expands the row; blocks at least 24px tall, titles on 2 lines. |
| 21 | 21B (user changed from 21A mid-question: "keep what we decided on, not one metric strip"): keep the three approved stat tiles; each shows "Not available" when the school's source lacks it (R3). |
| 22 | 22A: three motion moments only: route line draws from start to place (240 ms ease-out), Save bookmark fills (150 ms), course preview cross-fades on a new selection (150 ms); all skipped under `prefers-reduced-motion`; nothing else animates. |

Litmus after fixes: brand in first screen YES (rail brand + school name); one anchor per page YES (Courses preview, Events Next up, Map route, Saved items list; Compare uses its column headers); headline-scannable YES (8A headings name the window); one job per section YES (4A removed the duplicate Compare entry); cards necessary MOSTLY (course tiles kept by choice); motion purposeful YES (22A); premium without shadows YES (borders and tints only).


**Pass 5, Design-system fit: 5/10 → 8/10.** No DESIGN.md; brand-tokens.css is the system. Contrast measured
(WCAG, normal text 4.5:1): --domain-campus #1F9D55 on white 3.49, --domain-student-life #E8730C on its tint 2.68,
--domain-academics #2E7CF6 on white 3.94 (all fail as text); their -ink tokens 6.57 / 6.45 / 6.57 (pass).
Remaining below 10: no DESIGN.md (typography scale and spacing still live only in page CSS).

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 23 | 23A: coloured text uses `--domain-*-ink` (walk times campus-ink, "Starts in" tags student-life-ink on tint, course codes academics-ink); bright `--domain-*` only for dots, bars, pins, route lines and the now-line. |
| 24 | 24A: brand-tokens.css gains `--focus-ring` (2px `--ink`, 2px offset), `--error-ink` #B42318 (measured 6.57:1 on white, 5.75:1 on `--error-tint`), `--error-tint` #FDECEA, `--selection` (academics tint); new page CSS uses `var()` only, no hex; `::selection` and `:focus-visible` themed on every new page. |
| 25 | 25A: no page-level term kicker (kicker = school only); each figure names its term or date: grades "Spring 2026 · 486 students"; seats "Fall 2026 lectures" (UW, live), "Spring 2026 sections, seats not published" (CU), "Fall 2026 · as of Sep 3" (UVA); UVA filter chip "Had open seats (Sep 3)"; the chip is hidden at UW and CU (amends R12's "Not available" chip at UW/CU); Compare rows name their term. |


**Pass 6, Phones and accessibility: 1/10 → 9/10.** Below 10 only until checked on a real device and with a screen reader (T7 /qa).

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 26 | 26A: under 768px a slim top header (brand mark, school, settings) and a 56px bottom tab bar with 5 labelled icons (Ask, Courses, Events, Map, Saved with count), current tab `aria-current`; recent chats move to the top of the Ask (home) page. |
| 27 | 27A: Courses list full width, course preview opens as its own screen with "Back to results" (search, ticks and scroll kept), ticked bar sticks to the bottom; Compare 2 columns with sticky row labels, swipe for more; Events Next up + list, Calendar becomes a one-day agenda with day arrows; Map start + map (40% height) on top, filters scroll sideways, list below; Saved collection picker dropdown above items. Test at 320, 390, 768px and 200% text. |
| 28 | 28A: 44x44px hit areas; course row labels its checkbox; item-specific button names with `aria-pressed` on Save; skip link and landmarks; focus to the page H1 on route change; Browse/Compare and Up next/List/Calendar are tablists; grade bars have a text list; map `aria-hidden` with the place list as equivalent; calendar exposed as a list of days; Compare is a real table with row/column headers; async results announced politely; "Starts in" never live-updates; chat event card date readable (fixes EventListCard.js:117). |

```
  VIEWPORT   | NAV                         | COURSES                    | EVENTS                       | MAP                          | SAVED
  -----------|-----------------------------|----------------------------|------------------------------|------------------------------|---------------------------
  >=1024px   | left rail (248px)           | list 360px + preview       | Next up + rows / 7-day grid  | panel + map, list below      | collection list + items
  768-1023px | left rail (collapsible)     | list + preview (narrower)  | as desktop, grid 7 equal cols| panel above map              | collection list + items
  <768px     | top header + bottom tab bar | list → preview screen      | Next up + rows / day agenda  | start, map 40%, chips, list  | dropdown + items
```


**Pass 7, Unresolved design decisions: 3 resolved, 0 deferred.**

| # | Decision (user answer, 2026-10-27) |
|---|---|
| 29 | 29A: ticked courses persist across searches as removable chips above the list; previewed row = academics-tint highlight, ticked = checked box (both can apply); at 4 ticked the remaining boxes disable with "Compare up to 4"; removing a chip returns focus to the next chip or the search box. |
| 30 | 30A: Compare marks no "better" values; rows show values and term labels only; the footer Ask (15A) is where students get a judgement. |
| 31 | 31A: clicking or pressing Enter on a map row selects it (highlight, route redraw, panel update); rows keep only Save; the panel's "Open in OpenStreetMap" (new tab, external-link icon) is the only way out. "Directions" on Events rows and saved places opens the Campus map routed to that place. |

Checked, no question needed:
- Map category tiles "Dining" and "Bus stops" use places.geojson categories (sources/places.py:24 CATEGORIES); they show places, not the deferred dining/transit domains, so there is no scope conflict.
- "Taught by", all-terms GPA and "Open until" in the mockups have data: course_instructors (course_sections), cumulative average_gpa (course_grades) and place `hours`. "Open until" and 6A's "open now" require parsing OSM opening_hours strings ("Mo-Fr 08:00-21:45"); unparseable or missing hours read "Hours not listed" and count as unknown for 6A.
- Post-pass mockup update: none generated in this review (designer needs an OpenAI key), so nothing to regenerate. The approved mockups now differ from decisions 1A, 3A, 5A, 7A, 20A and 31A; this table is the source of truth where they differ.

### Design NOT in scope
- Geolocation ("Use my location"): declined in 16A; start is chosen by search.
- DESIGN.md: added to TODOS.md (P2), not this build.
- New mockups for the changed layouts: not generated (no designer key); decisions above govern.

### Design: what already exists
- brand-tokens.css colour, font and shadow tokens, including the passing `--domain-*-ink` shades (23A).
- Focus-visible styles in CampusHome.css:22, CampusRail.css:176, ChatFrame.css:26 (unified by `--focus-ring`, 24A).
- EventListCard calendar export and online-event rule (no Directions on online events, FINDING-004), kept.
- CampusRail brand, school and recent chats, reused; phone tab bar (26A) replaces the stacked rail at <768px.

### Design implementation tasks
- [ ] **D1 (P1, human: ~4 hr / CC: ~15 min)** — tokens + a11y base — `--focus-ring`, `--error-ink`, `--error-tint`, `--selection`; -ink text rule; skip link, landmarks, H1 focus on route change, tablists, 44px hit areas
  - Surfaced by: 23A, 24A, 28A
  - Files: frontend/src/styles/brand-tokens.css, new page CSS, frontend/src/App.js
  - Verify: contrast checks in tests or /qa; keyboard-only pass
- [ ] **D2 (P1, human: ~1 day / CC: ~30 min)** — phone shell — top header + 56px bottom tab bar under 768px; recent chats on the Ask page
  - Surfaced by: 26A
  - Files: frontend/src/components/CampusRail.js, CampusRail.css, a new BottomTabs component, HomePage.js
  - Verify: 320/390/768px screenshots in /qa
- [ ] **D3 (P1, human: ~1 day / CC: ~30 min)** — Courses + Compare behaviour — bar at 2-4 ticked, persistent tick chips, per-figure term labels, UVA "Had open seats (Sep 3)", Compare table with no winner marking, phone preview screen and 2-column Compare
  - Surfaced by: 4A, 21B, 25A, 27A, 29A, 30A
  - Files: frontend/src/pages/CoursesPage.js, CourseComparePage.js and CSS
  - Verify: page tests for ticks across searches, cap at 4, labels per school
- [ ] **D4 (P1, human: ~1 day / CC: ~30 min)** — Events — Next up feature row, one window across views, dated Next up, equal-column calendar with 3 lanes and +N more, phone day agenda
  - Surfaced by: 1A, 8A, 13A, 20A, 27A
  - Files: frontend/src/pages/EventsPage.js and CSS
  - Verify: tests for window heading, view switch keeps window and search, +N more
- [ ] **D5 (P1, human: ~1 day / CC: ~40 min)** — Campus map + shared start — "Campus map" / "Starting from", nearest-open default, outlined Ask with route prompt, row selects, per-account start with school default, opening-hours parsing
  - Surfaced by: 5A, 6A, 7A, 16A, 31A, Pass 7 hours check
  - Files: frontend/src/pages/CampusMapPage.js, backend/app/config.py (`campus.default_origin`), schools/*/school.yaml, backend saved/user preference storage, backend/app/sources/places.py (hours)
  - Verify: default selection test, open-now with known/unknown hours, start shared with Events
- [ ] **D6 (P1, human: ~1 day / CC: ~30 min)** — Saved — Unsorted first, collection list beside items, row per kind, Past group, Move to / Remove with Undo, delete-collection confirm, display_name fallback, one collection_id
  - Surfaced by: 2A, 3A, 17A, 18A, 19A
  - Files: frontend/src/pages/SavedPage.js and CSS, backend/app/api/routes/saved.py, backend/app/models/saved.py
  - Verify: tests for Unsorted default, Past grouping, fallback label, move and remove
- [ ] **D7 (P1, human: ~1 day / CC: ~30 min)** — states — placeholders after 300 ms, empty copy per case, inline errors with Retry, Save feedback and undo, rail "Couldn't load chats"
  - Surfaced by: 9A, 10A, 11A, 12A
  - Files: all new pages, frontend/src/components/SaveButton.js, CampusRail.js
  - Verify: state tests per page (loading, empty, error); CampusRail.test.js failure case
- [ ] **D8 (P1, human: ~4 hr / CC: ~20 min)** — journeys + motion — chat card context links, prefilled Ask prompts, three motion moments with reduced-motion
  - Surfaced by: 14A, 15A, 22A
  - Files: frontend/src/components/visuals/EventListCard.js, PlaceCard.js, CourseAnswerCard.js, page Ask buttons, CSS
  - Verify: link URLs carry context; prompts prefilled, not sent; reduced-motion disables all three
- [ ] **D9 (P1, human: ~3 hr / CC: ~30 min)** — design QA — /design-review and /qa at 320, 390, 768 and 1440px plus a screen-reader pass, at UW, UVA and CU
  - Surfaced by: Pass 6, 27A, 28A
  - Files: none (report)
  - Verify: /design-review report with findings fixed or listed

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | no DESIGN.md (brand-tokens.css used); UI scope: 5 pages + rail + 3 chat cards |
  | Step 0               | 5/10 initial; all 7 dimensions                |
  | Pass 1  (Info Arch)  | 6/10 → 9/10 after fixes                      |
  | Pass 2  (States)     | 3/10 → 9/10 after fixes                      |
  | Pass 3  (Journey)    | 4/10 → 9/10 after fixes                      |
  | Pass 4  (AI Slop)    | 6/10 → 8/10 after fixes                      |
  | Pass 5  (Design Sys) | 5/10 → 8/10 after fixes                      |
  | Pass 6  (Responsive) | 1/10 → 9/10 after fixes                      |
  | Pass 7  (Decisions)  | 3 resolved, 0 deferred                        |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (3 items)                             |
  | What already exists  | written                                       |
  | TODOS.md updates     | 1 item proposed (DESIGN.md, added)            |
  | Approved Mockups     | 0 generated (no designer key), 6 prior approved used as reference |
  | Decisions made       | 31 added to plan                              |
  | Decisions deferred   | 0                                             |
  | Overall design score | 1/10 → 8/10                                   |
  +====================================================================+
```
Plan is design-complete (every rated pass 8+). Run /design-review after implementation for visual QA.
Outside voices: Outside review design critique completed (12 findings); second review completed. Both fed Passes 1-6.

### Unresolved design decisions
None.

## Eng Review: design delta (plan-eng-review, 2026-10-27, run 2)

Target: docs/designs/campus-pages-plan.md, backend scope added by the design review (16A, 18A, 19A, 6A + Pass 7
hours, 25A, 14A, 15A). Earlier eng decisions R1-R13 stand unless amended below.

### Scope Challenge A: delta assessment
**What already solves each piece**
- 15A prefilled Ask: ChatPage already prefills without sending when given `pendingPrompt` and no `autoSend`
  (frontend/src/pages/ChatPage.js:395-396). Reuse; no chat change.
- 14A chat-card links: events_search already returns `query: {when, keyword}` (backend/app/tools/events_search.py:55, :81);
  visuals._events_specs (backend/app/api/visuals.py:140-156) drops it. Pass it through with the ids (O3).
- 16A per-account start: `PUT /me/advisor-preferences` (backend/app/api/routes/preferences.py:51) is the pattern for a
  per-user field on `users`; the Mongo database is per school (`mongodb.database_name`), so a stored place id is per school.
- 6A / Pass 7 hours: places carry raw OSM `hours` strings; no parser exists (backend/requirements.txt has none).

**Measured** (schools/*/places.geojson, 2026-10-27): places with hours: UW 25/318, UVA 5/445, CU 16/171. By category,
libraries UW 2/7, UVA 0/8, CU has no `library` category; dining UW 12/26, UVA 3/9, CU 13/15. Formats seen include
`24/7`, `PH off`, past-midnight ranges (`Fr-Sa 07:00-01:00`), comma lists and split ranges (`07:30-09:30,10:30-21:00`).

**Complexity check** [estimated]: 9 files (config.py, 3 school.yaml, models/user.py, routes/preferences.py,
sources/places.py, api/visuals.py, requirements.txt if a parser library is added) and 1 new component (hours parser).
The gate trips (8+ files).

### Delta findings
D-1. [INFORMATIONAL] (confidence: 9/10) design 6A + places data — "Nearest open <category>" is rarely knowable (hours on
     1-8% of places; none for UVA libraries; CU has no libraries). 6A's own fallback ("nearest overall when hours are
     unknown") cannot carry the word "open". Factual correction, no behaviour change: the label reads "Nearest open
     <category>" only when the chosen place has parseable hours and is open; otherwise "Nearest <category>".
D-2. [INFORMATIONAL] (confidence: 8/10) hours parsing approach undecided (no parser in the repo). Decision R14.
D-3. [INFORMATIONAL] (confidence: 9/10) map default category: the approved mockup selects Libraries, but CU has no
     library places (schools/cu-boulder/places.geojson). Decision R15.
D-4. [INFORMATIONAL] (confidence: 9/10) backend/app/models/user.py:64-79 `class User` has no start-place field. 16A needs
     `campus_origin: Optional[str]` (place id) plus `GET/PUT /me/campus-origin` validating the id against places, and
     `campus.default_origin` in CampusConfig (config.py:357) validated at startup to name a real place. Required
     implementation of approved 16A; carried.
D-5. [INFORMATIONAL] (confidence: 9/10) 19A one home per item: `saved_items.collection_id` (null = Unsorted); "Move to"
     is a PATCH that checks the target collection belongs to the same user (Architecture #9); deleting a collection
     sets its items' `collection_id` to null in one `update_many`. 18A adds `display_name` and `event_start`. Required
     implementation of approved 18A/19A; carried.
D-6. [INFORMATIONAL] (confidence: 9/10) 25A hides the seats chip at UW/CU: the catalog response's `capabilities`
     gains `seat_filter: true|false` (true only for UVA snapshot); the page derives the chip from it, never a hard-coded
     school list. Carried.
D-7. [INFORMATIONAL] (confidence: 9/10) 14A: visuals event spec gains `query` from the tool result; place spec already
     carries `from`; course spec carries the identifier. Intentional change to the R7 card contract (adds a field);
     CampusCards tests updated. Carried.


### Delta scope record
feature answers: none asked (design decisions already approved by the user); structure: D18 = A) Original arrangement,
user answer, 2026-10-27; accepted scope: new `backend/app/sources/hours.py` (opening-hours parsing) and
`backend/app/api/routes/origin.py` (`GET/PUT /me/campus-origin`, registered in routes/__init__.py), `campus_origin` on User,
`campus.default_origin` in CampusConfig and the three school packs, saved model fields (D-5), catalog `seat_filter`
capability (D-6), event spec `query` (D-7); 11 files. pending remedies: R14, R15. Scope Challenge result: scope accepted as-is.
D-1 recorded as a factual correction to 6A's label (no behaviour change).


### Delta decisions
| ID | Finding | Answer (user, 2026-10-27) | Accepted scope |
|---|---|---|---|
| R14 | D-2 hours parsing | D19 = B) Small parser (recommended) | `sources/hours.py` parses day lists/ranges, multiple time ranges, past-midnight ranges, `24/7`, `off`/`closed`, in the school timezone; anything else (PH, seasons, comments) is unknown; table test over all 42 distinct strings from the three packs; parsed once when places load. |
| R15 | D-3 map default category | D20 = A) School-pack default (recommended) | CampusConfig gains `default_category` (UW library, UVA library, CU dining); startup fails when it names a category with no places; tests: CU opens on Dining, empty-category pack rejected. |

### Delta review sections
- Architecture: start place lives on `users` in the per-school database; `PUT /me/campus-origin` rejects unknown place ids (400)
  and is user-scoped by the token like advisor-preferences; `campus.default_origin` and `default_category` are validated
  at startup with the school pack (fail fast, like timezone). No new external calls. No issues needing a decision.
- Code quality: hours parsing has one owner (`sources/hours.py`), used by places (open-now, "Open until") only. No issues.
- Tests (required proof of approved decisions, no question): hours table test (42 strings, open/closed/unknown at fixed
  times incl. past midnight); origin GET default / PUT valid / PUT unknown id 400 / cross-school isolation; config
  validation for default_origin and default_category; saved Move (own collection only), delete collection → Unsorted,
  display_name fallback; catalog `seat_filter` true only for UVA; event card spec carries `query`; 6A label "Nearest open"
  only when parsed hours say open.
- Performance: hours parsed once per places load (318-445 places), not per request. No issues.


### Delta outside voice
Outside review, plan-review phase, completed: 5 findings (1 High, 4 Medium). Checked; all carried as
required implementation of already-approved decisions (no behaviour choice):
| # | Finding | Evidence | Carried requirement |
|---|---|---|---|
| DO1 | Move and collection delete can interleave, leaving `collection_id` pointing at a deleted collection | 19A delete = `update_many` after the collection delete; a concurrent Move validated earlier | items whose `collection_id` has no matching collection for the user are listed under Unsorted; test the interleaving |
| DO2 | chat place card loses the origin id | backend/app/api/visuals.py:167 `{k: origin.get(k) for k in ("name", "lat", "lon")}` | add `id` to the `from` whitelist so 14A's `/map?from=` is exact |
| DO3 | `event_start` cannot tell an ended multi-day event | 18A stores start only | also store `event_end`; Past uses the known end; "Clear past" never touches an event without a known past end |
| DO4 | nearest-open picked after truncation; all-closed case undefined | 6A + places endpoint sorts and limits | pick nearest-open across the whole category before limiting; if none is known open, pick nearest overall labelled "Nearest <category>" (D-1) |
| DO5 | saved start place can vanish after a places refresh | 16A validates on PUT and default at startup only | `GET /me/campus-origin` resolves the stored id and falls back to `campus.default_origin` when it no longer exists; test |

Delta approval readiness: PASS for D18 (structure A), R14 (D19 = B), R15 (D20 = A); D-1, D-4..D-7 and DO1-DO5 carried as required implementation of approved design decisions. No unresolved decisions.

### Delta implementation tasks
- [ ] **T9 (P1, human: ~1 day / CC: ~40 min)** — start place + hours — `routes/origin.py` (GET with fallback, PUT validated), `campus_origin` on User, `campus.default_origin` and `default_category` in config and the three packs, `sources/hours.py` small parser
  - Surfaced by: 16A, D-4, R14 (D19), R15 (D20), DO4, DO5
  - Files: backend/app/api/routes/origin.py, backend/app/api/routes/__init__.py, backend/app/models/user.py, backend/app/config.py, schools/*/school.yaml, backend/app/sources/hours.py, backend/app/sources/places.py
  - Verify: hours table test (42 strings), origin tests (default, set, unknown id 400, vanished id fallback), config rejects empty default category, CU opens on Dining
- [ ] **T10 (P1, human: ~4 hr / CC: ~15 min)** — saved + cards delta — `display_name`, `event_start`, `event_end`, single `collection_id`, dangling-collection fallback, catalog `seat_filter`, event spec `query`, place spec `from.id`
  - Surfaced by: 18A, 19A, 25A, 14A, D-5, D-6, D-7, DO1, DO2, DO3
  - Files: backend/app/models/saved.py, backend/app/api/routes/saved.py, backend/app/api/routes/catalog.py, backend/app/api/visuals.py, tests
  - Verify: move/delete interleaving, Past only with known end, seat_filter true only at UVA, card specs carry query and from.id

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | Outside review via `/plan-eng-review` and `/plan-design-review` | Independent 2nd opinion | 4 | completed | eng: 8 + 5 (delta) findings, all approved or carried; design: 12 findings |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 4 | ISSUES OPEN (PLAN) | 48 issues, 0 critical gaps (41 + 7 delta, all mapped to T1-T10) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score: 1/10 → 8/10, 31 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** Outside review: plan-review phase completed twice (8 findings, then 5 on the design delta); design phase completed (12 findings). second review completed.
- **CROSS-MODEL:** on the delta main review and Outside review agreed on every checked fact; Outside review added 5 contract gaps (concurrency, ids, end times, selection before truncation, vanished start place), all carried.
- **VERDICT:** DESIGN CLEARED. Eng review: all decisions approved, 0 critical gaps; status stays ISSUES OPEN because the findings are mapped build work (T1-T10), not yet built. Ready to implement.

NO UNRESOLVED DECISIONS
