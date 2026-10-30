# Phase 10 pixel check

The `feat/alignment` build (f9ae87a) checked against the approved mockups. Fixes are on `alignment-phase10`.

**Inputs**
- App captures: `~/.gstack/projects/NeonSeigne-CCAI-Demo/screens/final/`, named `<screen>-<school>-<theme>-<width>.png`.
- Mockups: `designs/design-system-20261029/png/` and `designs/phase9-20261030/png/`. The `-desktop` files are 1440 wide and the `-phone` files are 390.
- Schools: cu, uw and uva.
- Widths: 390 and 1440 compared with the mockups; 900 and 1280 checked for broken layouts (Q17, Q18).

Status for each item:
- **fixed**: changed in code on this branch.
- **intended**: a decided difference (R1, R2/Q16, R8/Q14, R11, Q1/Q21, Q2, Q3, Q15, D7) or the dock rule Q18.
- **data**: caused by the data (names, counts, times, events, missing feeds, Place `type` null).
- **open**: not changed; the reason is given.

Captures were checked by reading the CSS against the mockup CSS. They were not retaken.

## Whole app (shell)

| # | Difference | Images | Status |
|---|---|---|---|
| SH1 | Every 390 capture is 896px tall, not 844. The phone header (52px) sits above a page that already has a 100vh floor, so a strip of canvas shows under the tab bar. Fix: `AppShell.css`, the page sets its floor to 100vh − 52px on phones. | `ask-home-cu-light-390.png`, `events-cu-light-390.png` | fixed |
| SH2 | Send is grey (raised) at rest. Every mockup shows the signal fill, the empty composer included. Fix: `Composer.css`; disabled keeps the fill and the not-allowed cursor. | `ask-home-*-1440.png`, `ask-chat-*-1440.png` | fixed |
| SH3 | The theme's `MuiBackdrop` override puts a scrim behind every MUI Menu, so a menu dims the page and the rail on desktop (and breaks R1). Fix: `theme/schoolTheme.js`; invisible backdrops stay clear from 701px. | `menu-course-uva-light-1440.png` | fixed |
| SH4 | Headings take the body's 1.5 line height; the mockup sets 1.12 (`system.css` h1–h3). Home's "Next up" header is 5px taller and Saved's title 4px. Fix: `index.css` h1–h4. | `ask-home-cu-light-1440.png`, `saved-uw-light-1440.png` | fixed |
| SH5 | The UVA rail subtitle reads "UVA"; the mockup has "University of Virginia". The rail shows the school's `short_name`. The mockup's own CU and UW names are the short forms ("CU Boulder", "UW–Madison"). | `events-uva-light-1440.png` | data |

## Ask home (`ask-home.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| AH1 | The placeholder uses curly quotes; the mockup uses straight ones (`Try "…"`). | `ask-home-{cu,uw,uva}-light-{390,1440}.png` | fixed |
| AH2 | The composer is about 7px taller (114 vs 107). The textarea has 2px padding and a 26px floor, and there's a 1px transparent border. Now: no padding, a 25.5px floor, and the focus edge drawn as an outline. | `ask-home-cu-light-1440.png` | fixed |
| AH3 | Phone panel header and "All events today" are inset 16px; the mockup uses 22px and 20px. The phone rule now only narrows the rows. | `ask-home-cu-light-390.png` vs `ask-home-cu-phone.png` | fixed |
| AH4 | "Nothing listed today"; no "Your classes today" or "Saved" panels. | `ask-home-cu-light-1440.png` | data (D7) |

## Ask chat (`ask-chat.html`, `chat-campus.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| AC1 | About 40px from the question bubble to the answer text (mockup 20px), and 30px from the text to the first card (mockup 14px). Markdown paragraphs had the browser's top margin plus an inline 0.75rem bottom margin. | `ask-chat-cu-light-1440.png`, `ask-chat-uw-dark-390.png` | fixed |
| AC2 | No rule under the event card's heading. The head's bottom padding is 2px; the mockup's `.vh` has 6px. | `ask-chat-cu-light-1440.png` vs `chat-campus-cu-desktop.png` | fixed |
| AC3 | The event time column is 84px; the mockup's is 76px. Real start times carry "12:30 PM" in the display face, and the mockup times have no AM/PM. | `ask-chat-cu-light-1440.png` | data |
| AC4 | At 390 the answer actions wrap, and thumbs-down drops to its own line. Copy and the thumbs now wrap as one group. | `ask-chat-cu-light-390.png` | fixed |
| AC5 | An extra "Sources" disclosure above the meta row. | `ask-chat-cu-light-1440.png` | open |
| AC6 | The chat event card has no walk pill, bookmark or type dot. The place card has no Directions and no Access tile. UVA landed on Home because the account has no chats. | `ask-chat-cu-*`, `ask-chat-uva-*` | data |

AC5 is left open because the disclosure carries the OpenStreetMap and feed credits.

## Saved (phase9 `saved.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| SV1 | With the dock open, rows keep the desktop four-column grid. At 1440 the title is cut to "Programmi…" and the meta takes four lines. At 1280 the title disappears, the tag overlaps the meta, and the actions are clipped. A container query on the list now switches to the tablet row below 620px. | `saved-uw-light-1440.png`, `saved-uw-light-1280.png` | fixed |
| SV2 | "Your starting place" wraps inside the walk pill at 900 and 1280. | `saved-uw-light-900.png` | fixed |
| SV3 | Phone rows show the row's own icon (open-in-new or directions) as well as ⋯; the mockup shows only ⋯. The row's action now leads the ⋯ menu on phones. | `saved-uw-dark-390.png` vs `phase9/png/saved-uw-dark-closed-phone.png` | fixed |
| SV4 | Phone Compare is 42px tall; the mockup's is 38px. | `saved-uw-dark-390.png` | fixed |
| SV5 | Rows show text for missing data: "Hours not listed" and "Walk time unavailable". The start place reads "Your starting place" where the campus wording is "Here". Missing lines are now left out (D7). | `saved-uw-light-1440.png` | fixed |
| SV6 | CU Saved is empty. | `saved-cu-light-1440.png` | data |
| SV7 | The dock shows on Saved from 1280. | `saved-uw-light-1440.png` | intended (Q18) |

## Events (`events.html`; UW option A)

| # | Difference | Images | Status |
|---|---|---|---|
| EV1 | Six window chips; the mockup has five. "This week" is extra and pushes "Next 7 days" to a second line at 900 and 1280. It stays a valid `?window=` value. | `events-cu-light-1440.png`, `events-cu-light-900.png` | fixed |
| EV2 | No rule between the day heading and the first row. | `events-cu-light-1440.png` | fixed |
| EV3 | The place line is clipped without an ellipsis (it was a flex box). | `events-cu-light-390.png`, `events-cu-light-900.png` | fixed |
| EV4 | The phone "Add to calendar" in the Next up banner is centred; the mockup's is left-aligned. | `events-cu-light-390.png` vs `events-cu-phone.png` | fixed |
| EV5 | Search to banner is 16px (mockup 18px); banner to day panel is 14px (mockup 16px). | `events-cu-light-1440.png` | fixed |
| EV6 | Row actions are 40px with centres 42px apart; the mockup's are 38px and 2px apart. | `events-cu-light-1440.png` | fixed |
| EV7 | The kicker spaces its "·" with 6px gaps; the mockup has "Next up · 12:00 to 1:00 PM" as plain text. | `events-cu-light-1440.png` | fixed |
| EV8 | "Starting from … ·" ends line 1 and "Change" sits alone on line 2. The dot and Change now wrap together (Q3). | `events-cu-light-390.png` | fixed |
| EV9 | UW has no events today and CU has two. | `events-uw-*`, `events-cu-*` | data |

## Event detail (`event-detail.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| ED1 | With no map and no "Also at", the empty right column still takes half the body. | `event-detail-cu-light-1440.png`, `event-detail-cu-light-900.png` | fixed |
| ED2 | The pop-up is 776px wide; the mockup's is 760. The medium size now caps at 760. | `event-detail-cu-light-1440.png` | fixed |
| ED3 | Band tiles are 60px tall; the mockup's are 66 (the value's line height is 1.15, the mockup's 1.5). | `event-detail-cu-light-1440.png` | fixed |
| ED4 | A light rim shows at the band's rounded top corners. The paper is now band-coloured under the band. | `event-detail-cu-light-1440.png`, `event-detail-cu-dark-1440.png` | fixed |
| ED5 | On phones the primary button doesn't stretch. The stretch rule is in place. With no Directions, line 1 is Add + Ask with about 4px to spare, so there's nothing to fill. | `event-detail-cu-light-390.png` | data |
| ED6 | The Close fill is 10% white; the mockup's `.x` is 12%. | `event-detail-cu-light-1440.png` | fixed |
| ED7 | The phone sheet tops out 24px from the top; the mockup uses `max-height: 94vh`. | `event-detail-uva-dark-390.png` vs `event-detail-uva-dark-phone.png` | fixed |
| ED8 | No UW capture (no events today). | — | data |

## Map and place card (`map.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| MP1 | Tiles stop part-way across the column. Leaflet kept its first size after the dock closed. A ResizeObserver now calls `invalidateSize`. | `map-cu-light-1440.png`, `map-cu-light-1280.png`, `map-place-cu-light-1440.png` | fixed |
| MP2 | On phones the place card covers the tab bar (z-index 500 in the flow). | `map-cu-light-390.png`, `map-place-cu-light-390.png` | fixed |
| MP3 | At 900 the card column is about 248px. Tile labels wrap, the Access tile is clipped, "Ask" is cut, and Save is pushed out. The list column is now 260–300px, and tiles and actions wrap with one-line labels. | `map-cu-light-900.png` | fixed |
| MP4 | A lone place tile takes 90% of the band (flex-grow 0.9). | `map-place-uva-light-1440.png` | fixed |
| MP5 | In "Starting from … · Change", Change wraps alone after the dot. | `map-cu-light-1440.png`, `map-cu-light-900.png` | fixed |
| MP6 | Attribution reads "© OpenStreetMap contributors"; the mockup shows "© OpenStreetMap". | `map-cu-light-1440.png` | open |
| MP7 | No place type eyebrow; hours grouping. | `map-place-*` | data |
| MP8 | "Instructor rating"; empty tiles hidden. | `map-place-*`, `course-popup-*` | intended (Q15, D7) |

MP6 is left open because the longer wording is the attribution the OpenStreetMap licence asks for.

## Courses, Browse (phase9 `courses-browse.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| CB1 | With no grades, three tiles show a clipped "Not availa…". The tiles are now left out (D7); the Grades line still says why. | `courses-browse-cu-light-1440.png` | fixed |
| CB2 | At 900 the preview is about 280px. "Ask about it" wraps on three lines, and tile values are cut. Buttons now keep one line, actions wrap, and tiles stack in a narrow preview. | `courses-browse-uw-light-900.png` | fixed |
| CB3 | UVA's "Lecture 001" overruns the 64px code column into the seat bar. Types are shortened to the mockup's codes (LEC, DIS, LAB…), and the column clips with an ellipsis. | `courses-browse-uva-dark-1440.png` | fixed |
| CB4 | Phone rows keep code and title on one cut line; the mockup stacks the code above the title. | `courses-browse-cu-light-390.png` vs `courses-browse-cu-phone.png` | fixed |

## Course pop-up (`course-popup.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| CP1 | Section times show the feed's raw text ("mowe 2:00pm - 3:15pm (08/25/2026 - …)", "MWF 9:05-9:55a"). Parsed meeting times are now preferred. Where a school sends no parsed times, the raw text remains. | `course-popup-uva-light-1440.png`, `course-popup-cu-light-1440.png` | fixed / data |
| CP2 | Every section is listed (10+ at UW, 8+ at UVA), so the actions scroll out of view. The pop-up now lists up to four lectures, with "+N more sections" (as Browse does). | `course-popup-uw-light-1440.png`, `course-popup-uva-light-1440.png` | fixed |
| CP3 | Rail and dock stay undimmed behind the pop-up. | `course-popup-*-1440.png` | intended (R1) |
| CP4 | UVA has four grade bars, dated neutral seat tags and no Seats tile. | `course-popup-uva-*` | intended (R11, R8/Q14) |
| CP5 | CU has no grades or seats; UW has no meeting times; UW's prerequisite text is ragged; one row reads "100 of 90" seats. | `course-popup-cu-*`, `course-popup-uw-*` | data |

## My degree: map (`transit-a.html` desktop, `transit-b.html` phone) and Semesters

| # | Difference | Images | Status |
|---|---|---|---|
| DG1 | The title row sits 12px lower and 4px further left. My degree kept the old `.cc-page-main` padding; it now has the system's 28px 36px 40px at each width. | `degree-map-*-1440.png` vs `transit-a-uva-desktop.png` | fixed |
| DG2 | The route map is clipped at 1440 and 1280 ("Not place", "5 more"). Nine 108px columns need 1120px, and the panel has about 1068px. Columns now narrow to fit (down to 84px) before the map scrolls. | `degree-map-cu-light-1440.png`, `degree-map-cu-light-1280.png` | fixed |
| DG3 | Phone "Add course" is right-aligned; the mockup puts it left, under the title. | `degree-map-*-390.png` vs `transit-b-uva-phone.png` | fixed |
| DG4 | Phone line cards use the display face for line names; the mockup uses the body face at 700. | `degree-map-uva-light-390.png` vs `transit-b-uva-phonefull.png` | fixed |
| DG5 | On Semesters the waffle floats halfway down the summary panel when the key is long. | `degree-semesters-cu-dark-1280.png` | fixed |
| DG6 | The Map/Semesters switch sits in a different place on each view. | `degree-semesters-*-1440.png` vs `degree-map-*-1440.png` | open |
| DG7 | The phone Semesters board opens on the empty Past column. | `degree-semesters-uva-dark-390.png` | open |
| DG8 | Course codes on the map are Unbounded 12/700; the mockup PNG shows the body face because its SVG CSS overrides the attribute. Phone counts are 2×2, with the switch under the title. | `degree-map-*` | intended (plan 8.2, 8.3, Q2) |
| DG9 | The waffle on Semesters. | `degree-semesters-*` | intended (R2/Q16) |
| DG10 | Current term Spring 2027; codes "····" under Not placed; long UW "Opens" list; detail card shows only Term and Line. | `degree-*` | data (D7) |

DG6 and DG7 are left open because neither has a mockup; both are layout calls for the owner.

## Menus (`menus.html`)

| # | Difference | Images | Status |
|---|---|---|---|
| MN1 | Course card ⋯ menus are plain MUI menus. They are 220px (mockup 260px), have no 21px icons, show a grey MUI focus row instead of `--raised`, and have no grab handle on phones. Both cards now use the system `Menu`/`MenuItem`. | `menu-course-uva-light-1440.png`, `menu-course-uva-dark-390.png` | fixed |
| MN2 | The menu dims the page on desktop (see SH3). | `menu-course-uva-light-1440.png` | fixed |
| MN3 | No menu-chat capture: the script clicked `[aria-label="More options"]`, but the rebuilt chat header's button is labelled "More". `scripts/screens.py` now clicks `.chat-head [aria-label="More"]`. | — | fixed |
| MN4 | No menu-course capture at CU (no planned courses). | — | data |

## Hit areas at 390px (design Q19)

All of these keep their drawn size; only the hit area grows.

| # | Control | Was | Status |
|---|---|---|---|
| H1 | Save in pop-up footers and the place card (map, map-place, event-detail, course-popup) | 42×42 | fixed |
| H2 | Course preview Save | 42×42 | fixed |
| H3 | Composer Voice input, Send, Add documents (ask-chat, ask-home) | 40×40 | fixed |
| H4 | Event pop-up Close (and every band Close) | 38×38 | fixed |
| H5 | Saved row "Directions to…" and "Course page for…" | 40×40, overlapping the ⋯ hit area at gap 0 | fixed |
| H6 | Theme toggle Light and Dark stops (every page) | 32×26 | open (height only) |

For H5, the gap is now 4px, and on phones these icons move into the ⋯ menu (SV3).

H6 is only partly fixed. Each stop is now 44px tall. The three stops share the 102px phone track, so the middle stop can't be 44px wide without widening the toggle; it would need a 132px track (44 × 3).

## Capture notes (not counted)

- The ask-chat full-page captures are scrolled to the newest message. That pulls the fixed rail, the phone header and the off-screen skip link into the picture.
- Full-page captures longer than 900px stop the fixed rail, dock and tab bar at 900px.

Both come from how the screenshots are taken, not from the app.

## Counts

Rows marked "fixed / data" count once as fixed.

| | Screen rows | Hit-area rows |
|---|---|---|
| Listed | 70 | 6 |
| Fixed | 48 | 5 |
| Intended | 6 | 0 |
| Data | 12 | 0 |
| Open | 4 (AC5, MP6, DG6, DG7) | 1 (H6, height only) |
