# Audit 4: Campus map + course pop-up vs approved mockups

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (`map.html`, `course-popup.html`, `components.css`, `system.css`; PNGs `png/map-*`, `png/course-popup-*`).
App: `frontend/src` (paths below are relative to it). Read-only code audit plus the mockup PNGs. I did not inspect the live app because it needs a sign-in, so render details come from reading the CSS and JS.

Sizes: **S** = a few lines of CSS or copy. **M** = a component or layout change in one file pair. **L** = a structural rework or a backend/data change.

---

## 1. Map page: desktop layout and side column

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 1.1 | **Extra kicker above the title.** The app shows the school name ("University of Virginia") above "Campus map". The mockup has only the h1. This is added text, against the "no added text" rule and DESIGN.md "labels only". | map.html:88 `<h1>Campus map</h1>` | pages/CampusMapPage.js:588 `<p className="campus-kicker">{school}</p>` | S |
| 1.2 | **Extra "Walking route" panel.** The app adds "Starting from **X** · Change", a start picker popover, "Walking to X", big green minutes, "N m along paths", an "Open in OpenStreetMap" button, plus loading and error states. The mockup has no route panel; walk time appears only in the rows and the card's Walk tile. | map.html:88-91 (h1 → search → chips → list) | CampusMapPage.js:287-357, 592-608; CampusMapPage.css:36-229 | L (product decision: keep, move into card, or drop) |
| 1.3 | **Element order.** Mockup: h1, search, chips, list. App: kicker, h1, **route panel**, search, chips, list, **footnote**. | map.html:88-91 | CampusMapPage.js:587-720 | M (follows 1.2) |
| 1.4 | **Extra footnote sentence.** The app shows "Places and walking routes from OpenStreetMap. Map data © OpenStreetMap contributors[. route attribution]" under the list. The mockup has only the small "© OpenStreetMap" pill on the map. This is a helper sentence (DESIGN.md Don'ts). | components.css:113 `.osm` | CampusMapPage.js:714-720; CampusMapPage.css:419-425 | S |
| 1.5 | **Chip set and labels.** Mockup: four fixed chips, **All** (apps), **Dining** (restaurant), **Study** (local_library), **Rec** (fitness_center). App: chips built from data, with labels "All places", "Libraries", "Dining", "Academic buildings", "Housing", "Recreation", "Bus stops", "Health", "Arts", "Landmarks", "Other places". | map.html:90 | CampusMapPage.js:30-43, 553-559, 623-637 | M |
| 1.6 | **Extra count on every chip.** The app adds a count to each chip (`.map-chip-count`, 12.5px, 70% opacity). The mockup chips have no counts. | map.html:90 | CampusMapPage.js:634; CampusMapPage.css:295 | S |
| 1.7 | **Chip icon fills when on.** The app fills the active chip's icon (`filled={chip.id === category}`). The mockup "All" chip's icon stays outlined (`.ms` FILL 0). DESIGN.md says "filled when active", so the mockup and the spec disagree. Flag it to the user rather than change it. | system.css `.ms` FILL 0; map-uva-desktop.png | CampusMapPage.js:632 | S |
| 1.8 | **Row subtitle text.** Mockup: the category name ("Academic", "Dining", "Landmark"). App: an hours line ("Open until 11:00 PM", "Closed now", "Hours not listed"). | map.html:91 `span.k ${kindName}` | CampusMapPage.js:685 `hoursLine(...)` | S |
| 1.9 | **Walk column.** Mockup: one line, "1 min", or **"Here"** for the start place. App: two lines, "7 min" plus "560 m walk". For the start place the app shows **"Your starting place"** (muted 12px) instead of "Here" (green 800). | map.html:91 `.w` | CampusMapPage.js:687-698; CampusMapPage.css:371-382 | S |
| 1.10 | **Extra Save button on every row.** The app puts a bookmark button on each row; the mockup rows have three columns (icon, text, walk) and nothing else. | map.html:13 `grid-template-columns: 36px 1fr auto` | CampusMapPage.js:700; CampusMapPage.css:311-316, 384 | S-M |
| 1.11 | **Row count and "See more".** The mockup lists 8 places with no "more" control. The app shows the 3 nearest plus the selected one, then a **"See N more {plural}"** button. | map.html:91 `slice(0, 8)` | CampusMapPage.js:25 `NEAREST_SHOWN = 3`, 548-551, 705-709 | S |
| 1.12 | **Row padding.** Mockup row padding is 10px 14px with no right control. App: 10px 8px 10px 14px, plus `padding-right: 6px` on the li around the save button, and min-height 60px. | map.html:13 | CampusMapPage.css:311-337 | S |
| 1.13 | **Selected-row icon fills.** The app fills the selected row's icon; the mockup keeps it outlined on the signal circle. | map.html:17 | CampusMapPage.js:681 | S |
| 1.14 | **Side column scrolls with the page.** Mockup `.side` is `overflow:hidden` inside a 100vh grid. In the app the page scrolls and the map is `position: sticky`. Looks the same until the list overflows. | map.html:6-7 | CampusMapPage.css:11-25, 428-433 | S (note only) |
| 1.15 | **Column width.** Mockup is a fixed 360px. App is `minmax(300px, 360px)`. Same at desktop widths. | map.html:6 | CampusMapPage.css:13 | none |

## 2. Map canvas: tiles, markers, controls

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 2.1 | **Place card closed on load.** The mockup's default desktop state has the start place selected **and its card open**. The app selects the backend `suggested` place (nearest open place, never the start) and leaves the card closed (`sheetOpen=false`) until a row or pin is clicked. | map.html:76 (card always rendered) | CampusMapPage.js:385, 452-454, 527-530 | M |
| 2.2 | **Selected pin can sit under the card.** The mockup offsets the map centre to `cx: 0.36` so the selected pin sits clear of the 380px card. The app calls `fitBounds(points, padding 40)` or `setView(point, 17)`, which centres the pin, so it can land under the card. | map.html:65 | CampusMapPage.js:116-132 | M |
| 2.3 | **Zoom.** Mockup: a fixed zoom 17. App: initial zoom 16, then fit to the start, selection and route (max 17). | map.html:65 | CampusMapPage.js:122-124, 161 | S |
| 2.4 | **Extra Leaflet zoom control.** The app shows the +/- control (restyled) at top-left on desktop and phone. The mockup has none, and on phone the floating search pill takes that spot. | — | CampusMapPage.js:158-165 (default `zoomControl`); CampusMapPage.css:515-526 | S |
| 2.5 | **Attribution text.** Mockup: "© OpenStreetMap" pill. App: Leaflet's default prefix, "🇺🇦 Leaflet \| © OpenStreetMap contributors". The pill styling matches (CampusMapPage.css:504-511). | components.css:113; map.html:48 | CampusMapPage.js:22, 164 (no `prefix={false}` / `attributionControl.setPrefix`) | S |
| 2.6 | **Start marker looks different.** Mockup `.you`: an 18px dot in #2F7CF6 with a 3px **white** border and a **6px halo** `rgba(47,124,246,.22)`. App: a Leaflet CircleMarker r=7 with a `--surface` stroke (dark grey in dark mode, not white), fill `--academics` (#2F5BEA light / **#7EA1FF dark**), and **no halo**. | components.css:112 | CampusMapPage.js:194; CampusMapPage.css:481-486 | S |
| 2.7 | **Extra route line.** The app draws the walking route as a green 5px polyline with a draw-in animation. The mockup has no route line. | — | CampusMapPage.js:182-192; CampusMapPage.css:489-502 | S (keep or drop with 1.2) |
| 2.8 | **Pin shadow too heavy.** Mockup pins use `0 2px 6px rgba(0,0,0,.25)`. App pins use `var(--shadow-float)` (12px/32px blur). The selected pin's outer shadow also differs: mockup `0 4px 12px rgba(0,0,0,.3)`, app `--shadow-float`. | components.css:106, 110 | CampusMapPage.css:461, 475 | S |
| 2.9 | **Default pin colour.** Mockup `.pin` defaults to `--ink` (academic is `--muted`). The app defaults every pin to `--muted`, so housing, transit and other come out muted instead of ink. The app also tints **arts** with `--life` (the mockup has no arts style). | components.css:106-109 | CampusMapPage.css:460, 465-470 | S |
| 2.10 | **Pin icon weight.** Mockup pin icon: FILL 1, **wght 600**, opsz 20. App: `.ms.ms-fill` gives FILL 1, **wght 500**, opsz 24, so the glyphs are lighter. | components.css:107 | CampusMapPage.js:72; index.css:72-74 | S |
| 2.11 | **Dark tile filter.** Matches: `invert(1) hue-rotate(180deg) brightness(.82) contrast(.9) saturate(.6)`. The rule is duplicated globally in Popups.css:793-796, which also hits `.leaflet-tile-pane`. Harmless. | components.css:104 | CampusMapPage.css:450-452 | none |
| 2.12 | **Pin sizes.** Match: 34px, and 46px when selected; icons 19px and 24px; selected pin has a 5px surface ring. | components.css:105-111 | CampusMapPage.js:69; CampusMapPage.css:455-478 | none |

## 3. Place card (desktop) and PlaceSheet

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 3.1 | **Kind line wording.** Mockup: a specific building type, "Academic building", "Library", "Student union". App: the category label "Academic", "Library", "Dining", plus " · {operator}" when OSM has one. **Data gap:** places carry no building type (see 9.1). | map.html:76 `${PD.kind}` | components/map/PlaceSheet.js:48-59, 283-293 | S (UI) / M (data) |
| 3.2 | **Extra drag grip before the name.** The app puts a drag-handle button (`DragGrip`) before the place name. The mockup has none. | map.html:76 | PlaceSheet.js:294-297; Popups.css:250-268 | S |
| 3.3 | **"Open until" tile.** Mockup: label **"Open until"**, value "11 PM" (Unbounded 16px). App: label **"Open"**, value **"Open"/"Closed"**, and a sub-line **"until 11:00 pm"** (lowercase, with minutes). This is a different structure and different words. | map.html:77 | PlaceSheet.js:108-119; Popups.css:938-945 | S |
| 3.4 | **Extra distance on the Walk tile.** The app adds a sub-line under the walk time ("560 m"). The mockup shows only "7 min". | map.html:77 | PlaceSheet.js:104 | S |
| 3.5 | **Tile grid.** Mockup: fixed `.9fr 1.5fr .8fr .9fr`. App: `repeat(auto-fit, minmax(64px, 1fr))`, so the tiles are equal width and "Open until" gets cramped. | map.html:28 | Popups.css:906-911 | S |
| 3.6 | **Tile value weight.** Mockup `.dtile b` is weight **600**. App `.ps-tile-value` and `.ps-open strong` are **700**. | components.css:119 | Popups.css:925-945 | S |
| 3.7 | **Access tile.** Mockup: the Material `accessible` icon only, 20px, in `--on-deep`. App: the same icon at **22px**, with the word "Limited" added for limited access and the word "No" for none. | map.html:77 | PlaceSheet.js:129-145; Popups.css:947 | S |
| 3.8 | **Today heading.** Mockup: **"Today here"**. App: **"Today"** plus a count badge. | map.html:78 | PlaceSheet.js:176-178 | S |
| 3.9 | **No "Today" empty state.** The mockup always shows the Today section, with `event_busy` and **"Nothing listed today"** when it's empty (map-cu-dark-desktop.png). The app hides the whole section when there are no events. DESIGN.md "States" requires the empty state. | map.html:78 `.empty`; components.css:129 | PlaceSheet.js:173 `if (!events.length) return null` | S |
| 3.10 | **Today rows.** Mockup: a 54px time column ("6:00", Unbounded 13px), a bold title, and a muted **"to 7:30 PM"** line. App: a 64px time column ("6:00 pm", lowercase, with meridiem), the title, and a **chevron**; **no end time**. | map.html:30-34, 78 | PlaceSheet.js:180-195; Popups.css:993-1016 | S |
| 3.11 | **Hours labels and time format.** Mockup: "Mon–Thu", **"Friday", "Saturday", "Sunday"**; times "7 AM – 11 PM", "Noon", "Midnight". App: short day names ("Fri", "Sat", "Sun"), lowercase times with minutes ("7:30 am – 2 am"), no Noon or Midnight. The table styling matches. | map.html:13-15 (PD.hours), 79 | utils/osmHours.js:10, 37-99 | S |
| 3.12 | **Extra photo, credit and links.** The app adds a photo with its Commons credit, an address line and a website link. The mockup has none. They show only when the data exists. | — | PlaceSheet.js:78-95, 301, 304-315 | S (keep or drop) |
| 3.13 | **Action row.** Mockup: **[Directions]** (primary, `directions_walk`), then **[Ask]** (secondary pill with `forum` icon **and the word "Ask"**), then **[bookmark]** icon button. App: [Directions] then **Save icon, then Ask as an icon-only button**, then **Call** icon when there's a phone number. The order is wrong, Ask has lost its label, and Call is extra. | map.html:80 | PlaceSheet.js:318-352 | S |
| 3.14 | **Close button.** Mockup: background `rgba(255,255,255,.12)`. App: `--band-raised` at .10. Size and position match (36px, 14/14). | map.html:27 | Popups.css:848-864 | S |
| 3.15 | **Content spacing.** Mockup sections are separate blocks with `padding: 14px 20px 4px`. App `.ps-content` is a flex column with `padding: 16px 20px 4px; gap: 16px`. Vertical rhythm is slightly looser. | components.css:127 | Popups.css:968 | S |
| 3.16 | **Card frame.** Width 380, top/right 20, radius 32 and float shadow all match. Difference: the app card has `max-height: calc(100% - 40px)` with an internal scroll and actions pinned outside the scroll; the mockup card is a single non-scrolling block. Fine. | map.html:23 | CampusMapPage.css:529-539; Popups.css:826-837 | none |

## 4. Map page on phone (390px)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 4.1 | **Phone layout differs.** Mockup at ≤700px: **the side column is hidden** (no h1, no chips, no list). It shows a full-width **420px map** with a **floating search pill** (shadow-float) at top 16/14/16, and the place sheet **in flow under the map, overlapping it by -28px**. App at ≤767px: h1, search, a horizontal chip row, a **360px** map, the route panel, the list and the footnote, stacked. | map.html:35-43, 47; map-uva-phonefull.png | CampusMapPage.css:550-574 | L |
| 4.2 | **Sheet missing on phone load.** The mockup shows the sheet for the selected place on load. The app shows it only after a tap. | map.html:76 | CampusMapPage.js:739 | M |
| 4.3 | **Sheet covers the tab bar.** The mockup sheet is static, with no shadow and top radius 32; it scrolls with the page, **under the tab bar** (tab bar z5, sheet z4). The app sheet is **`position: fixed` bottom, max-height 78vh, z-index 1300**, so it covers the tab bar (z-index 50) and keeps `--shadow-float`. | map.html:39 | CampusMapPage.css:576-590; CampusRail.css:346 | M |
| 4.4 | **Grab handle colour.** Mockup grab handle: `rgba(255,255,255,.35)`. App `.ps-grab` uses `--band-line` (.12), which is nearly invisible on the band. | map.html:40 | Popups.css:866-873 | S |
| 4.5 | **Breakpoint.** Mockup and DESIGN.md switch to phone at **≤700px**. The app's map and pop-ups switch at **≤767px** (shell-wide, CampusRail.css:303). Tablets from 701 to 767px get the phone layout. | system.css `@media (max-width:700px)`; DESIGN.md Layout | CampusMapPage.css:550; Popups.css:1069 | M (shell-wide) |
| 4.6 | **Phone chips.** The app keeps a horizontal chip scroller on phone; the mockup has no chips on phone. | map.html:37 | CampusMapPage.css:563-570 | S (follows 4.1) |

## 5. Course pop-up: dialog shell

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 5.1 | **Width and layout.** Mockup: a **640px** single-column dialog with max-height 86vh. App: **min(1000px, 100vw-32px)** with a two-column body (main plus a **320px side column**) at ≥1280px. | course-popup.html:12 | styles/Popups.css:20-25, 406-419 | L |
| 5.2 | **Scrim stops at the rail.** The mockup scrim covers the full viewport, rail included (rail dimmed in course-popup-*-desktop.png). The app scrim stops at the rail and dock (AppDialog insets; design decision D3, eng R10/R15). | course-popup.html:11 | components/AppDialog.js:66-101 | none (intentional; note only) |
| 5.3 | **Phone sheet height.** The mockup sheet has `max-height: 92vh`. The app uses `calc(100dvh - 24px)`. Radius 32/32/0/0 matches, and neither has a grab handle. | course-popup.html:28 | styles/components.css:1727-1734 | S |
| 5.4 | **Close button.** Mockup: 36px, colour **`--on-deep-soft`**, background .12, at top/right **14**. App `.pop-icon-btn`: **38px**, colour **`--on-deep`**, background `--band-raised` (.10), at top/right **16**. | course-popup.html:16 | Popups.css:136, 171-185 | S |

## 6. Course pop-up: band

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 6.1 | **Stat set and labels.** Mockup has exactly 3 tiles: **[GPA · "Average GPA · Typical"] [Rating · "Rating of 5"] [Seats · "Seats open"]**. App has up to 5: **"Avg GPA · Fa 25"**, **"Got an A"**, **"D or F"**, **"Seats left[ · term]"**, **"Students · term"**. **The rating tile is missing** (see 9.2). DESIGN.md Components: "three stat tiles: average GPA colored by difficulty, rating, seats". | course-popup.html:46; components.css:48-52 | components/course/CoursePopup.js:81-121 | M (UI) + M (rating data) |
| 6.2 | **Label is above the number; mockup has it below.** In the mockup the **number comes first** (21px Unbounded) and the label sits under it. The app renders the **label first** and the number under it. | components.css:50-51; course-popup PNGs | CoursePopup.js:72-79 | S |
| 6.3 | **Difficulty word in the wrong place.** Mockup puts it in the label: "Average GPA · Typical". App puts it after the number as small text: "3.31 Typical", with the term in the label. | course-popup.html:46 | CoursePopup.js:90-93 | S |
| 6.4 | **Extra "of {capacity}" on seats.** The app's seats value reads "84 of 120". The mockup shows just "84". | course-popup.html:46 | CoursePopup.js:107-110 | S |
| 6.5 | **Stat number size.** Mockup `.stats b` is **21px**/700 at -0.02em. App `.pop-number-value` is **19px** at -0.03em. Labels: mockup 13px, app 12.5px/600. | components.css:50-51 | Popups.css:224-234 | S |
| 6.6 | **Difficulty colours on the band.** Mockup: easier **#7FDCA4**, typical **#F5B36E**, harder **#FF8F87** (equal to the dark difficulty tokens). App: `--band-easier-text` **#3DD07A**, `--band-typical-text` **#F59E4C**, `--band-harder-text` **#F97066**, plus extra `--band-a-text` and `--band-df-text`. | components.css:52 | styles/brand-tokens.css:54-58; Popups.css:243-247 | S |
| 6.7 | **Phone stat grid.** Mockup keeps 3 columns on phone (labels wrap, course-popup-uva-dark-phone.png). The app switches to **2 columns** on phone, so 5 tiles take 3 rows. | components.css:48 | Popups.css:1074 | S |
| 6.8 | **Extra term in the eyebrow.** Mockup: "COMP SCI 400 · 3 credits". App appends the plan term: "COMP SCI 400 · 3 credits · Spring 2027". | course-popup.html:45 | CoursePopup.js:164 | S |
| 6.9 | **Extra description.** The app adds the course description, clamped to 2 lines with a **"More"/"Less"** toggle. The mockup band has none. | course-popup.html:45-46 | CoursePopup.js:185, 53-67; Popups.css:73-103 | S |
| 6.10 | **Extra requirement chips.** The app adds requirement and gen-ed chips ("Comp Sci B.S. · Core"). The mockup has none. | — | CoursePopup.js:166-169, 189-195; CoursePopupHost.js:15-25 | S |
| 6.11 | **Extra drag grip.** The app puts a drag grip before the code and title. The mockup has none. | — | CoursePopup.js:171-176 | S |
| 6.12 | **Band padding and title.** Mockup band padding 20px 22px 18px; title 22px with `margin: 3px 0 14px`. App padding 22px 24px 20px; the stats sit `margin-top: 18px` below the title. On phone the app shrinks the title to **18px**; the mockup keeps 22px. | course-popup.html:14-15; components.css:47 | Popups.css:31-36, 63-71, 207-212, 1071-1072 | S |
| 6.13 | **Skeleton tile count.** The loading skeleton shows **5** stat tiles; the mockup layout has 3. | — | CoursePopup.js:203-209 | S |

## 7. Course pop-up: body

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 7.1 | **Tabs instead of sections.** The mockup stacks headed sections in one column, in this order: **Grades → Sections → Prerequisites**. The app has a **segmented tab bar (Grades / Instructors N / Sections N)** in the main column, with **Fits {term}** and **Prerequisites/Unlocks** tiles in a side column (stacked under the tabs below 1280px). | course-popup.html:47-50 | CoursePopup.js:617-745, 747-773; Popups.css:358-385, 406-419 | L |
| 7.2 | **Extra GPA-by-term chart.** The Grades tab adds an "Average GPA by term" line chart with an Easier/Typical/Harder legend. Not in the mockup. | — | CoursePopup.js:219-286 | M (keep or drop) |
| 7.3 | **Grade bars.** Mockup: bars **72px** tall, gap 6, radius **4px 4px 0 0**, **all bars `--raised`** except the top one in `--signal`, letter labels under them, **no percentages**, heading "Grades". App: bars **150px** tall, radius **`--r-sm` (8px)**, other bars **`--tint-strong`** (school tint, not neutral), a **% label above every bar**, and a **term toggle (Fa 25 / All terms)**. | course-popup.html:19-22, 47-48 | CoursePopup.js:291-340; Popups.css:467-498 | S-M |
| 7.4 | **Grade buckets come from data.** Mockup buckets: A, AB, B, BC, C, **D/F**. The app shows each key as it comes (e.g. D and F apart, plus "OTHER"). Data-dependent. | course-popup.html:48 | components/catalog/catalogFormat.js:100-111 | S |
| 7.5 | **Section row layout.** Mockup row: a 4-column grid, **[44px code "001" in Unbounded 11px muted] [meeting time] [instructor, muted] [seat tag]**, padding 11px 18px, a full-bleed rule. App row: a bold **"LEC 001 · TR 11:00-12:15"** line, a seats pill, a sub-line **"Instructor · Building"**, a **seat-fill bar** and **"enrolled of capacity"** text. | components.css:53-56; course-popup.html:49 | CoursePopup.js:409-441; Popups.css:538-573 | M |
| 7.6 | **Seat tag words and states.** Mockup: **"84 seats"** (done/green) or **"4 waiting"** (now/tint). App: **"84 left"**, "84 open" (historical) or "Full", always green. **No waitlist state** (see 9.3). | course-popup.html:49 | catalogFormat.js:146-150; Popups.css:551-560 | S (+M data) |
| 7.7 | **Prerequisites as a graph, not tags.** Mockup: a row of **plain tags** (`.tag.plan`, `--raised` background, `--muted` text, Unbounded 11px, 28px tall, round), one per course code. App: a **layered SVG PrereqGraph** in a canvas-coloured well, a **chevron "Full graph" button** with a full-graph view, and an **"Unlocks"** fallback heading. The graph is also missing the student's done/this-term states, because `states` isn't passed. | course-popup.html:23-24, 50 | CoursePopup.js:548-573, 690-710; Popups.css:612-625; course/PrereqGraph.js:261 | M (decision: the build plan made the graph for chat cards; the pop-up mockup shows tags) |
| 7.8 | **Extra panels.** The app adds a **Fits {term}** tile (credits before→after, a 12–18 band meter, Load, Clashes, Prerequisites, rule progress) and an **Instructors** tab (bars, students, ★ rating, GPA). Neither is in the mockup. | — | CoursePopup.js:452-546, 354-404 | M (keep or drop) |
| 7.9 | **Body padding and section headings.** Mockup `.body` padding 6px 4px 4px, with h4 margins 14px 18px 4px. App `.pop-body` padding 16px 24px 12px, and section headings are `.pop-tile-title` 14px (same font). | course-popup.html:17-18 | Popups.css:298, 332-339 | S |

## 8. Course pop-up: footer

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 8.1 | **Footer buttons.** Mockup: **[+ Add to plan]** (primary), **[⇄ Compare]** (secondary, `compare_arrows`), **[bookmark]** (42px icon). App: **[+ Add to {term}]**, shown only when a plan term is loaded and the course isn't already planned; **[Ask]** (`forum`); then the SaveButton. **Compare is missing** and **Ask is extra**. | course-popup.html:51 | CoursePopup.js:132-157 | S-M |
| 8.2 | **Footer padding.** Mockup 12px 18px 16px; app 8px 24px 22px (8px 16px 20px on phone). On phone the app stretches the primary button (`flex: 1`); the mockup keeps it at its natural width (course-popup-uva-dark-phone.png). | components.css:57 | Popups.css:199-204, 1076-1077 | S |

## 9. Data gaps (backend payloads)

| # | Gap | Evidence | Size |
|---|---|---|---|
| 9.1 | **No building type for places.** The card's kind line needs "Academic building" / "Student union". Places have only `category`; `DETAIL_FIELDS` has no OSM `building=` or `amenity` type. | backend/app/sources/places.py:31, 35-38 | M |
| 9.2 | **No course-level rating.** "Rating of 5" needs one. Ratings come only per instructor from `/catalog/ratings/{id}` (`ratings[]`, RMP or coursemap). The course summary has no rating, so it would need a mean of the instructor ratings or a new field. | backend/app/api/routes/catalog.py:106-120; backend/app/sources/ratings.py:167-198; frontend CoursePopup.js:601 | M |
| 9.3 | **No waitlist for the "N waiting" tag.** Waitlist exists only as `waitlist_at_snapshot` in the CSV snapshot source and isn't in section rows. | backend/app/sources/csv_snapshot.py:391 | M |
| 9.4 | **Today rows lack the end time.** "to 7:30 PM" needs `event.end`. The events payload very likely has `end` (not checked); PlaceSheet just doesn't render it. | PlaceSheet.js:180-185 | S |
| 9.5 | **"Here" walk value.** Both sides have what they need: the API returns `walk_minutes: 0` / `distance_m: 0` for the start place. Only the label differs (1.9). | backend/app/api/routes/places.py:39-52 | none |

## 10. How the pop-up opens (CoursesPage / CourseComparePage)

| # | Difference | Size |
|---|---|---|
| 10.1 | **Opening path.** Mockup implies clicking a course row opens the pop-up over the list. In the app a row click opens the **inline preview pane** (`openPreview`), and the pop-up opens only from that pane's **"Details"** button. | pages/CoursesPage.js:534-543, 158-161, 471 — M (product decision) |
| 10.2 | **Compare page never opens the pop-up.** CourseComparePage has no `useOpenCourse` and no route into the pop-up. The mockup's in-pop-up "Compare" action (8.1) also has no counterpart. | pages/CourseComparePage.js (no openCourse) — S-M |

## 11. Light and dark notes

- **Map dark:** the tile filter matches (2.11). The start dot turns `#7EA1FF` in dark (2.6), where the mockup stays `#2F7CF6` with a white border. The selected-chip dark style (`--tint-strong` / `--tint-ink`) matches.
- **Pop-up dark:** non-top grade bars use `--tint-strong` (UVA dark `#5A3712`, brown); the mockup's are neutral `--raised` `#23272F`. The band difficulty colours differ (6.6). The band itself uses `--band` in both apps.
- **Place card dark:** matches (band, tiles at white .1, hours). The grab handle is too faint in both modes (4.4).

## 12. DESIGN.md and the no-added-text rule violations found

1. **Added kicker above "Campus map".** the "no added text" rule and DESIGN.md "labels only" (1.1). CampusMapPage.js:588.
2. **Helper sentences:** the map footnote (1.4, CampusMapPage.js:714-720) and "Choose a starting point to see the walk." (CampusMapPage.js:342). DESIGN.md: "Don't … add helper sentences."
3. **Missing empty state** for the place card's Today section. DESIGN.md States: "every panel has empty ('Nothing listed today' with an icon)" (3.9).
4. **Pop-up band has 5 stat tiles, not 3.** DESIGN.md Components: "three stat tiles: average GPA colored by difficulty, rating, seats" (6.1).
5. **Phone breakpoint at 767px, not ≤700px** (DESIGN.md Layout) (4.5).
6. **Grade bars use the school tint (`--tint-strong`) for data bars.** DESIGN.md says school colour belongs on the frame and the one primary action; the mockup uses neutral `--raised` (7.3).
7. **Lowercase "am/pm"** in the place card (3.3, 3.10, 3.11) doesn't match the mockup's "11 PM" and "7 AM – 11 PM" style. Not a written DESIGN.md rule, but a visible inconsistency with Events, which use uppercase.
8. No hex in components; the tokens are used correctly. The band text hexes live in brand-tokens.css, which is allowed, but their values differ from the mockup (6.6).

## 13. Top-15 priority list

1. 4.1 Phone map layout (map-first, floating search, sheet under the map, no list): **L**
2. 7.1 Pop-up body is tabs plus a side column; the mockup is one column of Grades → Sections → Prerequisites: **L**
3. 5.1 Pop-up width 1000px with two columns vs 640px single column: **L**
4. 6.1 / 6.2 Band stats: 5 tiles, label above the number, no "Rating of 5"; mockup has 3 tiles with the number above the label: **M**
5. 1.2 Extra Walking-route panel (Starting from / Change / Walking to / Open in OSM) not in the mockup: **L**
6. 2.1 / 4.2 Place card closed on load; the mockup shows it open for the selected place: **M**
7. 8.1 Footer: Compare missing, Ask extra, "Add to {term}" instead of "Add to plan": **S-M**
8. 7.7 Prerequisites drawn as an SVG graph; the mockup uses plain code tags: **M**
9. 7.3 Grade bars: 150px, % labels, school-tint bars, term toggle; mockup is 72px, no labels, neutral bars: **S-M**
10. 7.5 / 7.6 Section rows: stacked layout with seat bar and "N left"; mockup is a 4-column row with "N seats" / "N waiting": **M**
11. 3.13 Place card actions: Ask is icon-only and comes after Save, Call is extra; mockup is Directions, Ask (labelled), bookmark: **S**
12. 3.9 / 3.8 / 3.10 Today section: no "Nothing listed today" empty state, "Today" vs "Today here", no end time: **S**
13. 1.5 / 1.6 / 1.8 / 1.9 List chips and rows: data-driven labels with counts, hours instead of kind, extra distance line, "Your starting place" instead of "Here": **M**
14. 4.3 Phone place sheet is fixed at z 1300 over the tab bar with a float shadow; mockup sheet is in flow under the tab bar: **M**
15. 1.1 / 1.4 Added kicker and footnote sentence (DESIGN.md and the no-added-text rule text rules): **S**

Also notable: start dot (2.6), Leaflet zoom control and attribution prefix (2.4, 2.5), "Open until" tile wording (3.3), band difficulty colours (6.6), and the data gaps 9.1–9.3.
