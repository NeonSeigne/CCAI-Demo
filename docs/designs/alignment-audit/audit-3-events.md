# Audit 3: Events page + event detail vs approved mockups

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` — `events.html`, `event-detail.html`, `system.css`, `components.css`, `shell.js`, `schooldata.js`, PNGs `png/events-*`, `png/event-detail-*`.
UW: `events-uw-*-uwva-*` PNGs are byte-identical to the plain `events-uw-*` PNGs (md5), so option A is the plain UW render. `uwv` is only set as `body[data-uwv]` in shell.js:13 and no CSS reads it, so A and B differ only in that B is a different render.
App: `frontend/src/pages/EventsPage.js`, `styles/EventsPage.css`, `components/events/EventPopup.js`, `styles/Popups.css`, `components/popup/PopupParts.js`, `components/ChatDock.js` + `styles/ChatDock.css`, `components/SaveButton.js` + `styles/SaveButton.css`, backend `backend/app/api/routes/events.py`, `backend/app/sources/ical_events.py`.
Live check: the app running at localhost:3000 (CU, signed in), at 1440x900 light and 390x844 dark, with the pop-up open.

Size: S = CSS or text tweak, M = component change, L = new data or structural work.

Note: `components/catalog/*` (CampusPageShell, CatalogParts, catalogFormat) are **not used** by Events or EventPopup. They are imported only by Courses, Compare, CoursePopup, DegreeBoard and SetupDialog, so they're out of scope for this screen.

---

## A. Events page — header

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| A1 | **Extra school-name line above the H1.** The mockup has the bare "Events" title. The app adds a muted "University of Colorado Boulder" line (`campus-kicker`). This is an eyebrow above a heading, which DESIGN.md:200–201 and the "no added text" rule both rule out. | events.html:51 `.titlerow > h1` | EventsPage.js:930 `<p className="campus-kicker">{school}</p>`; CampusHome.css:46 | S |
| A2 | The title row in the mockup is `display:flex; gap:12px; margin-bottom:20px` with a spacer, and the seg sits on the H1 baseline row. The app uses a wrapping `space-between` row inside a column with `gap:10px`. Desktop looks close, but the H1 sits lower because of the A1 line. | system.css `.titlerow` | EventsPage.css:27–35 | S |
| A3 | **Phone: the segmented control should be hidden.** The mockup uses `.titlerow .seg {display:none}` at ≤700px. The app shows it full-width (`.ev-tabs {width:100%}`), which adds a 44px band and pushes content down. | events.html:20 | EventsPage.css:664–665 | S |
| A4 | Seg active thumb shadow: the mockup uses `0 1px 3px rgba(20,23,31,.12)` in both themes. The app uses `var(--shadow-rest)`, which is fainter (`0 1px 2px .05`) and `none` in dark, so the dark thumb has no lift. | system.css `.seg a.on` | EventsPage.css:73 | S |
| A5 | Seg item height: mockup padding is 7px 16px (~35px). App `min-height:36px`. Negligible. | system.css `.seg a` | EventsPage.css:55–57 | S |
| A6 | "Starting from" line: the mockup puts it 12px under the title (title margin 20 + `.from` margin −8). In the app it sits 10px under the H1 inside `.ev-header`. Content matches: near_me icon, "Starting from", **place**, "·", underlined "Change". | events.html:6–7,52 | EventsPage.js:634–649 | S |
| A7 | **Phone: "Change" wraps to its own line.** `.ev-link-btn` has `min-height:36px` and `padding 0 4px`, and the row is `flex-wrap`. In the mockup "Change" stays on the same line (uva phone PNG). | events-uva-phonefull.png | EventsPage.css:76–102 | S |
| A8 | The "Change" link in the mockup is plain inline text (`.from a`), with no 36px box, so line height matches the label. | events.html:7 | EventsPage.css:88 | S |

## B. Events page — chips and search

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| B1 | **Extra chip.** The mockup has 5 chips: Today, Tonight, Tomorrow, This weekend, Next 7 days. The app has 6 and adds **"This week"**. | events.html:53 | utils/eventWindows.js:9–15 (WINDOWS) | S (product call) |
| B2 | Chip styling (36px, 0 16px, 14px/700, control border, active = deep, dark active = tint-strong) **matches**. | system.css `.chip` | EventsPage.css:154–180 | — |
| B3 | Spacing: the mockup stacks chips → 14px → search → 18px → lead. The app's `.ev-controls` gap is 14px and the outer column gap is 16px before the panel, then the results head (C1) is inserted before Next up. | events.html:8–10 | EventsPage.css:15–20,145–150 | S |
| B4 | Search: 42px, r-full, control border, faint icon, max 360px, phone full-width — **matches**. The app input is 15px Hanken; the mockup placeholder inherits 15px. OK. | events.html:9–10 | EventsPage.css:182–211 | — |
| B5 | Phone chips scroll edge-to-edge with `margin-right:-16px` — matches. The app also adds `padding-right:16px` (fine). | events.html:21 | EventsPage.css:667 | — |

## C. Events page — results head (not in mockup)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| C1 | **Extra "Today" H2 row with "Times in Mountain Time"** sits between the search and Next up. The mockup has neither; the timezone line is helper text (the text rule, DESIGN.md:201). On phone it takes two lines ("Today" / "Times in…"). In Calendar view the same row carries the prev/next arrows, so keep it for Calendar only. | events.html:55 (lead follows the search directly) | EventsPage.js:1002–1027; EventsPage.css:218–228,670 | S |
| C2 | **Extra footnote** at the page bottom: "From {sources} · Add to calendar downloads an .ics file for Google, Apple or Outlook Calendar". This is helper text the mockup doesn't have. | — | EventsPage.js:1046–1050 | S |
| C3 | "Listed through … Later events aren't published yet." is an extra line, but it's a data-state message (allowed when it existed before; check). | — | EventsPage.js:711–718 | S |

## D. Events page — Next up banner (`.lead` vs `.ev-feature`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| D1 | **Extra actions.** The mockup has one button, "Add to calendar" (mark-bg / mark-ink). The app adds an outlined **"Directions"** button and a **Save** icon. On phone the Save icon wraps onto its own row (seen live). | events.html:55–56 | EventsPage.js:226–230 | S |
| D2 | **Time format.** Mockup: "Next up · 12:00 to 1:00 PM" (start without meridiem, "to"). App: "4:30 PM – 6:30 PM" (en dash, both meridiems). The pop-up already has the drop-meridiem logic (EventPopup.js:300–304). | events.html:55 | EventsPage.js:120–125 (`featureWhen` → `formatEventRange`) | S |
| D3 | Layout: the mockup uses `grid 1fr auto; align-items:center` and drops to one column on phone, with the **button full-width** (uva phone PNG: the orange button spans the card). The app uses flex-wrap; on phone the button keeps its natural width with Directions beside it. | events.html:11,24 | EventsPage.css:335–347,396 | S |
| D4 | Phone padding: the mockup keeps 20px. App 18px. | events.html:24 | EventsPage.css:671 | S |
| D5 | The walk pill on the band uses `rgba(255,255,255,.14)` in the mockup. The app uses `--band-raised` (.10). | events.html:14 | EventsPage.css:381–385; brand-tokens.css:52 | S |
| D6 | Title: mockup `h2` 20px, `margin 6px 0 10px`. App `h3` 20px, `margin 0 0 4px` with a column `gap:6px`, so it ends up 6px above / ~10px below. Close. Heading level differs (h2 vs h3); not visible. | events.html:13 | EventsPage.css:368–375 | S |
| D7 | Extra state: a signal-coloured "Happening now" / "Starts in N min" tag pill in the kicker. Not in the mockup (the mockup shows no live state on the lead). OK as a state, but flag it. | — | EventsPage.js:213; EventsPage.css:359–366 | S |
| D8 | When the event has no walk minutes, the app shows a `location_on` + place line. The mockup always shows the walk pill. That's a data fallback; fine. | — | EventsPage.js:218–222 | — |

## E. Events page — day panel and rows

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| E1 | **Row titles render at 16px / weight 400 instead of 15px / 700.** `.ev-title-btn {font: inherit}` comes after `.ev-title {font-weight:700}` and resets the weight. The body is also 16px/400 in the app versus 15px/500 in the mockup. Confirmed live: computed `.ev-row .ev-title` = 16px / 400. This is the biggest visual miss on the list. | components.css:22 `.evt .what b {font-weight:700}`; system.css body 15px/500 | EventsPage.css:417–426 | S |
| E2 | **Domain dot is always `--life` (orange).** The mockup colours it by kind: academics blue, life orange (UVA life = gold), campus green. The app hard-codes `background: var(--life)`, and the backend has **no kind field** (see H1). | components.css:40–41 `.kd.{life,academics,campus}` | EventsPage.js:246; EventsPage.css:324–332 | L (data) / S (CSS once data exists) |
| E3 | Dot spacing: mockup `.kd` has margin-right 2px plus a 4px flex gap (~6px total). App margin-right 6px. Same. Mockup phone dot alignment `vertical-align:-2px`. OK. | components.css:23,40 | EventsPage.css:329 | — |
| E4 | **Start time shows the meridiem.** Mockup: "12:00" with "to 1:00 PM" under it. App: "5:00 PM" with "to 6:00 PM" under it. This duplicates PM and widens the column (76px is tight for "12:00 PM" at Unbounded 14px). | events.html:44 | EventsPage.js:240 (`formatEventTime`) | S |
| E5 | **"All day" rows** set Unbounded 14px "All day" in the time column, and several stack at the top of the panel (live CU data: 5 of the first 5 rows). The mockup has no all-day state. Needs a design call (e.g. a smaller muted "All day", or an all-day group). | — | EventsPage.js:137–140,236 | M |
| E6 | Row padding: mockup `12px 20px`. App `10px 14px 10px 20px` with `min-height:56px`. The right edge is 6px tighter, so the action icons sit closer to the panel border. | components.css:17–18 | EventsPage.css:463–471 | S |
| E7 | **Column misalignment.** The mockup grid is `76px 1fr auto auto` with every row carrying walk + 3 actions. In the app, when walk minutes or place_id are missing, `WalkTime` / `DirectionsLink` return null and the auto columns shrink per row, so the action icons stair-step (seen live: all-day rows with no walk pill and no Directions). Reserve the slots, or use fixed-width columns. | components.css:17 | EventsPage.js:147,158,249–254; EventsPage.css:465 | S |
| E8 | "0 min" walk pill shows when the event is at the start place (live: Staff Council Coat Drive at UMC). The mockup never shows 0. Consider "Here", or hiding it. | — | EventsPage.js:147–151 | S |
| E9 | Action icons: the mockup uses 38px hit circles, 21px icons, gap 2px, muted. The app uses `.ev-icon-btn` 40px and `.ev-save` 40px. Close. Save icon: the app's SaveButton uses `Bookmark size={18}` versus the mockup's 21px bookmark. | components.css:28–29 | EventsPage.css:289–308; SaveButton.js:64 | S |
| E10 | The **SaveButton base radius is 10px**, which is off DESIGN.md's radius ramp (8/12/16/24/32/full) and against "buttons fully round". On Events it's overridden to r-full by `.ev-save`, but anywhere without the override is square-ish. Hover uses `--canvas` instead of `--raised`. | system.css radius ramp | SaveButton.css:10,16 | S |
| E11 | Day heading text: mockup "Today · Oct 29". App "Today · Thu, Oct 29" (weekday added). | events.html:57 | EventsPage.js:263–265 | S |
| E12 | Day heading padding: mockup `14px 20px 6px`. App `16px 20px 6px`. | events.html:16 | EventsPage.css:441 | S |
| E13 | Place text: the mockup shows the building name ("Center for Community"). The app shows the raw feed LOCATION ("Center for Community, Abrams Lounge (third floor)", "University Memorial Center (UMC), Near elevators on 2nd Floor"). The mockup's place is the matched venue name. | events.html:45 | EventsPage.js:246 (`event.location`) | M (use matched place name when `place_id` resolves; room into detail) |
| E14 | Phone row: mockup `58px` time column at 700px from events.html:25, overridden by components.css:94 `64px … !important`. App 64px. Matches. The phone title clamps to 2 lines — matches. Phone actions hidden — matches. | components.css:94 | EventsPage.css:673–684 | — |
| E15 | Phone breakpoint: the mockup and DESIGN.md:169 use **≤700px**. The app uses **≤767px** (EventsPage.css:661, `usePhone` EventsPage.js:45). Widths 701–767 get the phone layout in the app but the tablet layout in the spec. | system.css @media 700 | EventsPage.css:661; EventsPage.js:45 | S |
| E16 | Content width: the mockup main padding is `28px 36px 40px` and fills the column. The app's `.campus-main` padding-left is 24px (live) and `.ev-column` is capped at 1120px. Left gutter: 24 vs 36. | system.css `.main` | CampusHome.css:39–44; EventsPage.css:13–22 | S |
| E17 | Mockup with-dock shell: `240px 1fr 360px`. The app at 1440 matches (dock 360). | system.css `.app.with-dock` | ChatDock.css:25 | — |

## F. Ask dock on Events

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| F1 | **Header icons differ.** Mockup: `open_in_full` (expand to chat) + `right_panel_close` (collapse). App: `add_comment` (New chat) + `keyboard_tab` (Collapse). The expand-to-full-chat action is missing. | events.html:32 | ChatDock.js:172–189 | S–M |
| F2 | **Placeholder text.** Mockup: "Ask about these events" (page-scoped). App: "Ask about courses, events or places" (the global `chatPlaceholder`). | events.html:37 | ChatDock.js:205; utils/messageGroups.js:40 | S |
| F3 | Composer row: the mockup has `+` and the signal send only. The app's compact EnhancedChatInput also shows a **mic** button (live). | events.html:37 | EnhancedChatInput (compact) | S |
| F4 | Message styling: the mockup user bubble is tint/tint-ink 600 at r-lg, and the answer is a `--raised` r-lg bubble (`.dockmsg`). The app renders chat-page components (`.user-message`, AdvisorCarousel) with no raised answer bubble. | events.html:17–18 | DockConversation.js:38–55; ChatDock.css:136–145 | M |
| F5 | Dock header padding: mockup `16px 16px 10px`. App `16px 12px 10px 18px`. | components.css:71 | ChatDock.css:92 | S |
| F6 | Dock composer: mockup `margin:12px; padding 12px 10px 10px 16px; border control; no shadow; radius 32`. App wrapper `8px 12px 12px` plus the box with the same inner padding. Close. | components.css:75–76 | ChatDock.css:147–160 | S |
| F7 | Empty state: the app dock is blank on a fresh session (live). The mockup shows a conversation and has no empty-state spec. If there should be starters, ask first (no added helper text). | — | DockConversation.js | — |
| F8 | Breakpoints: DESIGN.md:167–168 says docked at **≥1100px** and drawer 701–1099. The app docks at **≥1280px** and uses a drawer at 768–1279 (ChatDockContext.js:17–18). At 1100–1279 the spec shows the dock but the app shows the 52px strip. | DESIGN.md:167–169 | contexts/ChatDockContext.js:17–18 | S |
| F9 | Phone: the mockup phonefull PNG shows the dock *under* the page. That's a **mockup bug** (components.css `.dock {display:flex}` loads after system.css's phone `display:none`). The app's phone sheet is correct; don't copy it. | components.css:70 vs system.css phone block | — | — |

## G. Event detail pop-up

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| G1 | **Eyebrow content.** Mockup: `● {Kind} · {Host}`, e.g. "Academics · Hoos Hacking", with the kind-coloured dot. App: `● {event.calendar}`, the feed name ("CU Boulder Events Calendar", "UVA Events Calendar", "UW–Madison Today"), always an orange `--life` dot. There's no kind and no host. | event-detail.html:64 | EventPopup.js:322–325; Popups.css:674–676 | L (data) |
| G2 | **Extra category chips** under the title ("Exhibit", etc.). Not in the mockup. | event-detail.html:64 | EventPopup.js:327–331; Popups.css:107–126 | S |
| G3 | **Extra drag grip** (⋮⋮) left of the date block. Not in the mockup (a D4/D19 product decision; flag). | event-detail.html:63 | EventPopup.js:319; Popups.css:250–267 | S |
| G4 | **Tiles.** Mockup: always 4, Starts in (signal) · Time · Walk · Cost; phone 2×2. App: built from data, so live CU all-day showed **3 tiles: Time "All day", Walk, Room** (Room = full location string, truncated "Center for Community,…"). Starts in is missing for all-day/ongoing, and Cost appears only when `details.cost` exists (UVA only). The extra 5th "Room" tile (location) isn't in the mockup; the mockup puts Room in Details. On phone, 3 tiles leave an orphan. | event-detail.html:65–66 | EventPopup.js:297–310 | M |
| G5 | Live state: the mockup shows "Starts in **Now**" in signal for a live event (CU). The app switches to "**Ends in** 38 min" plus a separate "Happening now" pill in the eyebrow. | event-detail.html:58,65 | EventPopup.js:62–70,298,323 | S |
| G6 | Countdown format: mockup "2 h 40 m". App "2h 40m". | event-detail.html:58 | EventPopup.js:53–59 | S |
| G7 | Tile value weight: mockup `.dtile b` is Unbounded **600** 16px. App `.pop-number-value` is **700** (16px via `.ep` override). | components.css:119 | Popups.css:226–233,693–699 | S |
| G8 | Live tile colour: mockup `color: var(--signal)`. App `color-mix(signal, on-deep 25%)`, a paler orange/gold. | event-detail.html:17 | Popups.css:701 | S |
| G9 | Tile value overflow: mockup is one line with ellipsis. App is 2-line clamp, `overflow-wrap:anywhere`. | components.css:119 | Popups.css:693–699 | S |
| G10 | Tile grid: mockup `repeat(4,1fr)`. App `auto-fit minmax(120px,1fr)`, which flows to 3 or 5 as data varies. | components.css:116 | Popups.css:207–212 | S |
| G11 | Close button: mockup 38px with `rgba(255,255,255,.12)`. App 38px with `--band-raised` (.10). Mockup icon `close` 20px; app X 18. | event-detail.html:15 | Popups.css:171–185; EventPopup.js:250 | S |
| G12 | Dialog width: mockup 760px. App `min(800px, 100vw−32)` (live 776px). | event-detail.html:7 | Popups.css:27 | S |
| G13 | **Scrim scope.** The mockup scrim is `position:fixed; inset:0` and dims rail + page, with the dialog centred in the viewport. The app's backdrop covers only the page column (live: left 240, width 840) and the dialog is centred in that column, so the rail and dock stay bright. (Intentional D3 per the AppShell comment, but a visible difference.) | event-detail.html:6 | EventsPage.js:1065–1073; AppShell.js:20–22 | M (decision) |
| G14 | Body spacing: mockup `.body2` padding `6px 4px 0`, with `.sect` `14px 20px 4px` (so the first heading is ~20px below the band, gap 4px between columns, and columns at 24px gutters). App `.pop-body` 20px 24px 12px **plus** `.ep-body` padding-top 20px (so ~40px below the band), column gap 28px, section gap 20px. The app is noticeably airier. | event-detail.html:18; components.css:127 | Popups.css:298,703–710 | S |
| G15 | Section heading: mockup `.sect h3` 13.5px. App `.pop-tile-title` 14px. | components.css:128 | Popups.css:332–339 | S |
| G16 | **Details rows differ.** Mockup: Place, Room, Hosted by (in that order). App: Event type, Hosted by, Room, Registration, Event page. **No "Place" row.** Room and host exist only for UVA (Trumba). For CU/UW, Details shows only "Event page · Open". | event-detail.html:69 | EventPopup.js:112–147 | M |
| G17 | **About weight**: mockup 15px/1.6 at the body weight of 500. App 15px/1.6 at **400** (global body weight 400 vs 500). Applies to all running text. | system.css body | Popups.css:716 (inherits 400) | S (global) |
| G18 | About clamp: the app clamps at 8 lines with More/Less. Not in the mockup. Fine as an affordance. | — | EventPopup.js:95–110 | — |
| G19 | **Extra image** tile above About when `image_url` exists (UVA). Not in the mockup. | — | EventPopup.js:339–343 | S (decision) |
| G20 | **Map**: mockup 170px r-lg, signal pin with surface ring, "© OpenStreetMap" chip. The app has the same plus an **extra venue-name pill** overlaid top-left (live: "Center for Community, Abrams Lounge (third floor)" covering a third of the map). | event-detail.html:70,78; components.css:110–113 | EventPopup.js:160; Popups.css:742–753 | S |
| G21 | Map is missing when there's no place match or geo. The mockup always shows it. Data fallback; fine. | — | EventPopup.js:153 | — |
| G22 | **"Also at {place}" rows differ.** Mockup row: `54px` Unbounded 13px time | **title** / "to {end}". App row: a small date block (day + month) | **title** / "Thu · 6:00 PM" | chevron. The source also differs: the mockup lists today's events at the place, the app the next 7 days. | event-detail.html:23–26,71 | EventPopup.js:166–195; Popups.css:757–778 | M |
| G23 | **"Also at" empty state missing.** The mockup shows `event_busy` + "Nothing else today" when there are none. The app hides the whole section (live CU: no Where/Also-at list at all). | event-detail.html:71; components.css:129 | EventPopup.js:167 | S |
| G24 | **Extra "More in {category}" list.** Not in the mockup. | — | EventPopup.js:355–360 | S (decision) |
| G25 | **Footer button label.** Mockup "**Ask about this**". App "**Ask**". | event-detail.html:73 | EventPopup.js:376 | S |
| G26 | Footer padding: mockup `16px 24px 22px`. App `8px 24px 22px`. | event-detail.html:27 | Popups.css:199–204 | S |
| G27 | Footer order matches (Add to calendar primary · Directions · Ask · bookmark icon). The Save icon button is 42px, round, control border — matches. Its icon is 18px vs the mockup's 20px. | event-detail.html:73 | EventPopup.js:363–393; Popups.css:187–195 | S |
| G28 | Directions shows only when `place_id` is set. The mockup always shows it. Data-driven; fine. | — | EventPopup.js:369 | — |
| G29 | Phone sheet: mockup `max-height:94vh`, top radius 32, the phone header visible behind the scrim. App `max-height:calc(100dvh − 24px)`, so the sheet nearly covers the phone header (live). Mockup band H2 18px — app matches (Popups.css:1079). Phone tiles 2 columns — matches. Phone primary button flex:1 — matches. | event-detail.html:30–37 | components.css:1726–1733; Popups.css:1076–1085 | S |
| G30 | Mockup band padding `22px 24px 20px` — matches. Phone band: app `18px 16px 16px`; the mockup keeps 22/24/20 on phone. | event-detail.html:8 | Popups.css:31–36,1078 | S |
| G31 | Date block (64px, r-lg, .1 white, 12.5px month/weekday, 26px day) — **matches**. | event-detail.html:10–12 | Popups.css:638–659 | — |

## H. Data gaps (backend vs mockup)

Backend list fields (`api/routes/events.py:28–30`): `id, title, start, end, all_day, location, url, description, calendar, ongoing`, plus optional `image_url, categories, geo, details`, plus `place_id` and `walk_minutes` added by `_decorate` (events.py:55–79) when the location matches a place and an origin is set. `details` keys come only from UVA Trumba custom fields (`sources/ical_events.py:211–222`: event_type, audience, cost, sponsor, hosted_by, room, registration_url, online_url).

| # | Mockup shows | Backend | Impact | Size |
|---|---|---|---|---|
| H1 | **Kind** (Student life / Academics / Campus) as the coloured dot on rows and the eyebrow label | **None.** Only free-form `categories` (and for CU/UW those may be feed tags) | E2, G1. Every dot is orange and there's no kind label. Needs a category→kind map per school, or a classifier. | L |
| H2 | **Host** in the eyebrow and Details | `details.hosted_by` / `sponsor`, **UVA only** | G1, G16. CU and UW show no host. | M–L |
| H3 | **Room** separate from Place | `details.room`, UVA only. CU/UW pack the room into `location` | E13, G4, G16 | M (split location on comma, or use the matched place name) |
| H4 | **Place** as a clean building name | `location` raw string. The matched place exists via `place_id` but its name isn't returned on list rows | E13, G16 (no Place row). Return `place_name` with `place_id`. | S–M |
| H5 | **Cost** ("Free") | `details.cost`, UVA only | G4 (tile missing for CU/UW) | M |
| H6 | **Walk minutes** | Present only when the location matches a place **and** an origin is set (events.py:55–79) | Rows without the pill stair-step (E7). The Next up fallback works. | — |
| H7 | "Starts in" for live events | Derivable client-side | G5 | S |
| H8 | "Also at" = same place **today** | Client builds it from `next_7_days` | G22 | S |
| H9 | Images | `image_url` exists (UVA, Trumba) but the mockup has none | G19 (extra) | — |
| H10 | Dock "lists food" answer | No food flag in event data. The answer relies on the LLM reading the description. | F (content only) | — |

## I. Light vs dark

| # | Difference | Size |
|---|---|---|
| I1 | Chips, seg, panel, walk pill and band all use the same tokens as the mockup in dark. The CU dark lead is `#000` in both. | — |
| I2 | Seg thumb has no shadow in dark (A4: `--shadow-rest` = none in dark; the mockup keeps rgba .12). | S |
| I3 | Walk pill on the band: .10 vs .14 white (D5). Lower contrast on dark bands (UW dark `#3B1A1C`). | S |
| I4 | Domain dot: in UVA dark the mockup's `--life` is `#E9C13A` (gold). The app uses `--life` too, so the colour matches, but academics/campus blue/green never appear (E2). | (see E2) |

## J. Shell items seen on Events (outside this lane, noted for completeness)

- The phone header shows the school's full name truncated ("University of Col…"). The mockup shows the mark + "Campus Companion" + toggle, with no settings icon (shell.js:36). The app adds a sliders icon.
- The rail adds a "New chat" button and sign-out/settings icons. The mockup user row shows only "Pierce" + a settings gear.

---

## Top 15 gaps (by visual impact)

1. E1 — Row titles are 16px/400 instead of 15px/700. `.ev-title-btn {font:inherit}` wipes the bold (EventsPage.css:419–426). S
2. E2/H1 — Domain dot is always orange. There's no event "kind" in the backend, so the academics/campus colours never show (EventsPage.css:331; events.py:28). L
3. G1/H1/H2 — The pop-up eyebrow shows the feed name ("CU Boulder Events Calendar") instead of "Kind · Host" (EventPopup.js:324). L
4. A1 — Extra school-name eyebrow above the "Events" H1; DESIGN.md:200 violation (EventsPage.js:930). S
5. C1/C2 — Extra "Today / Times in Mountain Time" row and an .ics helper footnote; helper text not in the mockup (EventsPage.js:1002–1027, 1046–1050). S
6. D1 — The Next up banner adds Directions + Save. The mockup has only "Add to calendar"; on phone the Save wraps alone (EventsPage.js:226–230). S
7. D2/E4 — Time format: the app shows "4:30 PM – 6:30 PM" and "5:00 PM" starts; the mockup uses "12:00 to 1:00 PM" and a meridiem-less start "12:00" (EventsPage.js:120–125, 240). S
8. G4 — Pop-up tiles vary 3–5 with an extra "Room" (raw location) tile. The mockup is a fixed Starts in · Time · Walk · Cost (EventPopup.js:297–310). M
9. G16/H3/H4 — Details lacks the "Place" row; Room and Host exist only for UVA. CU/UW Details shows only "Event page" (EventPopup.js:112–147). M
10. E7 — Missing walk/directions per row collapses the auto columns, so the action icons stair-step (EventsPage.js:249–254). S
11. A3/E15 — Phone: the segmented control should be hidden (≤700); the app shows it full-width and uses a 767px breakpoint (EventsPage.css:661–665). S
12. F1/F2/F3 — Dock: wrong header icons (new chat/keyboard_tab vs open_in_full/right_panel_close), global placeholder instead of "Ask about these events", extra mic (ChatDock.js:172–205). S–M
13. G22/G23/G24 — "Also at" rows use a date block, chevron and 7-day scope instead of time / title / "to end" for today. The "Nothing else today" empty state is missing, and there's an extra "More in {category}" list (EventPopup.js:166–195, 349–360). M
14. G25/G5/G6 — Text: "Ask" should be "Ask about this"; live shows "Ends in" plus a "Happening now" pill instead of "Starts in Now"; "2h 40m" should be "2 h 40 m" (EventPopup.js:53–70, 376). S
15. G14/G20/G2/G3 — Pop-up body ~20px too airy (double top padding), venue pill overlaid on the mini map, extra category chips and drag grip in the band (Popups.css:298, 703–710, 742–753; EventPopup.js:319, 327–331). S
