# Audit 5: My degree, the route map and the planner vs the approved mockups

Read-only audit. Nothing in the project was edited.

## Sources

- **Approved (design-system-20261029/approved.json):** "transit planner A desktop / B phone".
  - A: `transit-a.html` + `png/transit-a-uva-desktop.png`, `transit-a-uva-dark-desktop.png`
  - B: `transit-b.html` + `png/transit-b-uva-phonefull.png`, `transit-b-uva-dark-phonefull.png`
  - Shared: `system.css`, `shell.js`, `planner-data.js`
- **First run (first-run-20261029/approved.json):** variant B, the setup dialog. Files: `b1-program-v2.*`, `b-setup-dialog.*` (Completed), `b3-first-term.*`, `b-phone-completed.*`. Spec: `docs/designs/setup-dialog.md` lines 25–31.
- **Semesters board (earlier):** `tab-workspaces-20261028/r7-degree-1.png` (board-degree/approved.json). **Semester view:** `r9-semester-1.png` (UVA) and `r8-semester-2.png` (UW) (board-semester/approved.json). These come from before Home Colors. The build plan restyles them ("Semesters is today's drag-and-drop board, restyled", home-colors-build.md:84), so the Home Colors rules apply on top of them.
- **App:** `pages/CoursesPage.js`, `components/planner/degree/{DegreeBoard,RouteMap,routeModel,DegreeSummary,TermColumn,PastColumn,CourseCard,SetupDialog}.js`, `styles/{RouteMap,DegreeBoard,SemesterView,CoursesPage,components}.css`, `components/catalog/CatalogParts.js`, `backend/app/planner/degree.py`, `schools/uva/programs/econ-ba.yaml`.

Sizes: **S** is under an hour of CSS or copy. **M** is a component change or new small component. **L** is a new panel or feature, or a data contract change.

---

## 1. Page frame and navigation (where My degree lives)

| # | Mockup | App | Size |
|---|---|---|---|
| 1.1 | Rail item "Courses" is active. My degree is a view inside Courses (`transit-a.html:31` `data-tab="courses"`). | Same: `CoursesPage.js:744` renders `DegreeBoard` at `?view=degree`. **Match.** | — |
| 1.2 | A visible page title, `<h1>My degree</h1>` (`transit-a.html:35`): Unbounded 700, 28px, 23px on phone (`system.css:122,216`). | No visible title. `CoursesPage.js:738` has `<h1 className="sr-only">Courses</h1>`. | S |
| 1.3 | Title row order (`transit-a.html:34-42`): h1, program button, spacer, segmented Browse / My degree / Compare, undo, redo, primary "Add course". | `DegreeBoard.js:335-378` order: CoursesTabs (Browse / My degree / Compare N), program h2, "Catalog YYYY", Map/Semesters switch, undo, redo. Tabs come first, on the left. Map/Semesters sits in the page toolbar, not the panel header. | M |
| 1.4 | The program is a secondary `.btn`, "Economics B.A." with an `expand_more` chevron: 42px, fully round, control hairline, 700 14.5px (`transit-a.html:36`, `system.css:185`). | `DegreeBoard.js:338-343`: an `<h2>` holding a bare text button. Unbounded 22px (`DegreeBoard.css:35-42`), underlined on hover, no chevron, no border. It opens the setup dialog. 22px sits outside DESIGN's scale (page 28, section 14–16). | S |
| 1.5 | No catalog text. | Extra `<span class="dg-catalog">Catalog 2025</span>` (`DegreeBoard.js:342`, `DegreeBoard.css:58`). Under the "keep exactly the text" rule this is an extra label. It came from r7. | S |
| 1.6 | Browse / My degree / Compare is `.seg`: background `--raised`, padding 4, fully round, items 7×16 padding, 700 14px, muted; the selected item is surface + ink with a 1px shadow (`system.css:193-195`). No count on Compare. | `.cc-tabs` (`CoursesPage.css:47-88`): background **`--line`**, radius **14px** (tabs **10px**, not round), item min-height **44px**, weight **600**, and Compare shows a **count badge** (ink pill, `CatalogParts.js:66-71`). That breaks DESIGN "controls fully round" and "labels 700". | S |
| 1.7 | Undo and redo are `.btn.icon.ghost`: 42×42, **no border**, transparent (`transit-a.html:39-40`, `system.css:191-192`). | `.dg-icon-btn`: 40×40 with a **1px control border** and surface fill (`DegreeBoard.css:69-87`). Icons are Material Symbols `undo` / `redo` (icons.js:39,41). The icons match. | S |
| 1.8 | Primary **"Add course"** button: signal fill, `add` icon (`transit-a.html:41`). It shows on phone too (`transit-b-uva-phonefull.png`). | **Missing** on My degree. Add only happens through "+" slots on the Semesters board or by dragging from Browse. | M |
| 1.9 | Phone hides the segmented control, undo and redo (`.hide-phone`, `transit-a.html:27`, `transit-b.html:39`). The phone shows h1, the program button, then "Add course" on its own line. | Phone shows CoursesTabs, the program, Map/Semesters, undo and redo. No rule hides them (`DegreeBoard.css:735-742` only shrinks the program to 19px). | S |
| 1.10 | Phone breakpoint ≤700px (`system.css:208`, DESIGN.md Layout). | Route/map swap at ≤767px (`RouteMap.css:181`), the same as the app shell (`AppShell.css:34`). Systemic; flag to the shell audit. | S |
| 1.11 | — | When there is no explicit `?view=`, the app opens Browse while the plan is empty and My degree once it has a course (`CoursesPage.js:711-718`). The mockup doesn't cover this; noted for completeness. | — |

## 2. Desktop: what sits above and below the map (the known gap)

### 2a. Counts row (mockup has it; app has a waffle panel)

- **Mockup** (`transit-a.html:6-8,43,68-72`; PNG y≈90–115): a bare row, not in a panel, below the title row. `display:flex; gap:28px; align-items:baseline; margin:-6px 0 18px`. Four figures, each a number in **Unbounded 700 24px −0.03em** followed by a label in **muted 14px**, margin-left 6px:
  - `9` "credits done"
  - `8` "this term"
  - `16` "planned"
  - `1` "not placed"

  The figures are credits of done stops, credits of now stops, credits of planned (future) stops, and the **count** of open stops (`planner-data.js:42-43`). On phone they form a 2×2 grid with gap 6×16 (`transit-a.html:25`). The approved phone (B) leaves this row out and puts "9 credits done · 36 placed" in the route panel header instead (see 4.1).
- **App:** `DegreeSummary` (`DegreeBoard.js:267-271`, `DegreeSummary.js:25-139`, `DegreeBoard.css:90-232`) is a bordered 24px panel with a 3-column grid:
  1. "Finish" plus a two-line date in Unbounded 800 32px academics-ink, or "Open requirements" plus a count.
  2. A stats list: Credits X / total, Done, Planned, Open.
  3. A waffle, 8 rows of 16px squares.
  4. A key list: dot, title, "have/size · N left".

  **None of this is in mockup A or B.** It has no "this term" figure and no "not placed" figure. It shows on the Map view too, and on phone above the route. **L** (replace with the counts row, or remove from the Map view).
- **Data:** the counts can all be derived client-side. Done credits come from `degree.completed[].credits`. This-term and planned credits come from route stops by state (`routeModel.stopCredits`, `routeModel.js:152`). Not placed is `model.notPlaced` (`routeModel.js:146`). The backend needs no change.

### 2b. Route panel

| # | Mockup (`transit-a.html:44-48`) | App (`DegreeBoard.js:276-285`, `RouteMap.css:11-27`) | Size |
|---|---|---|---|
| 2.1 | `.panel`: surface, 1px line, r-xl, **shadow-rest**, overflow hidden (`system.css:179`). | `.rt-card`: same border and radius but **no box-shadow**, padding 20/20/12. | S |
| 2.2 | Header `.panel-h`: padding 18 22 8, flex. `<h2>` "Route to Spring 2029" in Unbounded 700 **16px** −0.02em. Spacer, then **`.seg` Map / Semesters inside the panel header** at the right. | `<h3>` at **17px**, margin 0 0 8. No control in the card. The Map/Semesters switch is up in the page toolbar (`DegreeBoard.js:348-355`) and uses `.cc-segmented` (`components.css:1549-1584`), which matches `.seg` in style. | S |
| 2.3 | The title term is the **last semester to graduation** (Spring 2029, from `planner-data.js:3` terms through class year 2029). | `lastTerm` = the last term in `route.terms` (`DegreeBoard.js:273`). `routeModel.spanTerms` only spans terms that hold a stop, the current term or the deadline (`routeModel.js:131-134`). With the mockup data the app would say "Route to Spring 2028". Fallback copy is "Route". | M (data: needs a graduation term from `class_year`) |
| 2.4 | Columns run through **every semester to graduation** (8 terms, including empty Fall 2028 and Spring 2029), then "Not placed". | Columns end at the last stop or deadline. **Empty future terms up to graduation are missing.** The app also adds an **"Earlier"** column when a completed course has no term (`routeModel.js:133-134`); that column isn't in the mockup. | M |
| 2.5 | `.mapwrap`: overflow-x auto, padding 4 4 12. | `.rt-scroll`: overflow-x auto, radius r-lg, no padding, plus a focus outline. | S |

### 2c. Requirements panel (mockup has it; app has nothing)

- **Mockup** (`transit-a.html:11-17,49-50,134-142`; PNG y≈618–960): grid `1.25fr 1fr`, gap 16, margin-top 16, under the route panel. Left cell: `.panel` with `.panel-h` `<h2>Requirements</h2>`, then a table, 100% wide, 14.5px.
  - Each row: `td` padding 10px 20px, border-top 1px `--rule`.
  - Left cell: a 10px round dot in the **line colour**, margin-right 10, then the rule name.
  - Right cell (`td.n`, right-aligned, nowrap): a segmented bar of `r.need` pills, each 16×8 px, radius 4, gap 3, margin-right 10, then "**X of N**".
  - Pill colours in order: done = line colour, now = `--signal`, placed (planned) = `--track`, unplaced = `--line`.
  - Rows and values exactly as the PNG shows:
    1. Introductory economics, 2 of 2
    2. Calculus I, 1 of 1
    3. Statistics, 0 of 1 (signal pill)
    4. Intermediate micro, 0 of 1 (signal pill)
    5. Intermediate macro, 0 of 1 (track pill)
    6. Econometrics, 0 of 1 (track pill)
    7. Economics electives, 0 of 4 (3 track pills + 1 line pill)
  - Phone: single column, td padding 10 16 (`transit-a.html:26,28`).
- **App:** nothing on desktop. The closest thing is the phone-only `RouteList` "Lines" section (`RouteMap.js:238-253`), which `.rt-view .rt-list {display:none}` hides above 767px (`RouteMap.css:180`). The waffle key (`DegreeSummary.js:88-109`) lists rules as "have/size" in **credits** with **course** tones, not line colours. **L.**
- **Data:** `degree.rules[]` has `title`, `unit`, `needed`, `completed`, `planned`, `completed_courses`, `planned_courses` (checker.py:245-252). Splitting now from planned needs the plan term per course, which the client has. For credit-unit rules, `needed` is in credits, so pills per credit would not match the mockup's per-course pills (decide: pill per `COURSE_CREDITS`). UVA rule titles differ from the mockup: "Intermediate microeconomics", "Intermediate macroeconomics", and two extra electives rules, "Electives at the 3000 level or above" and "Electives at the 4000 level or above" (`econ-ba.yaml:41,50,70,80`). Real data would show 9 rows, not 7.

### 2d. Selected-course detail card (mockup has it; app has nothing)

- **Mockup** (`transit-a.html:18-23,51-60`; PNG right of Requirements): `.panel.detail` in the 1fr column.
  - Band: `background: var(--band)`, colour `--on-deep`, padding 18 20 16. A `.mono` line "**ECON 3010 · 4 credits**" in Unbounded 700 .78em, `--on-deep-soft`. Under it, `<h2>` "**Intermediate Microeconomics**" at 19px, margin-top 4.
  - Then `.rows` with padding 6 20 18. Each row is flex space-between, padding 9 0, border-top 1px `--rule` (none on the first), 14.5px, label `.muted`:
    - Term: Fall 2026
    - Line: Core theory
    - Needs: `ECON 2010 · MATH 1210` (mono)
    - Opens: `ECON 4010` (mono)
    - Section: MoWe 2:00–3:15 · Troyan
  - In dark mode the band stays `#232D4B` (`--dark-band`).
- **App:** missing. Clicking a stop calls `useOpenCourse` and opens the course pop-up (`RouteMap.js:148`, `DegreeBoard.js:281`). The map has no **selected-stop state** at all. The mockup implies one: the card shows ECON 3010, the now stop. **L.**
- **Data:**
  - Code, credits, title and term come from the route model stop.
  - Line is `line.name`.
  - Needs is `edges` where `to == id`, and Opens is `edges` where `from == id`. Both are in the payload (`degree.py:248-255`), but edges only cover courses **in the plan**. "Opens" can't show a course the plan doesn't hold.
  - **Section isn't in the degree payload.** It needs the plan course's `sections` (PlannerContext.js:117-124) joined with course details (meetings and instructor; `semester/useCourseDetails.js`, `semesterData.meetingsOf`), an extra fetch per selection.
  - A credit span (`credits: [lo, hi]`) needs formatting.

## 3. The line map (SVG) in detail: `transit-a.html:74-133` vs `RouteMap.js:6-177`, `RouteMap.css:24-52`

| # | Element | Mockup | App | Size |
|---|---|---|---|---|
| 3.1 | Geometry | `COL=108`, `LEFT=136`, `TOP=52`. Rows at y=104/204/304, row step 100, `H=TOP+316`=368. Every column is the same width. | `COL_W=104`, `LABEL_W=132`, `HEAD_H=64`, `FIRST_ROW=110`, `ROW_H=100`. Columns **widen** to `stops*56+24` when one line has two or more stops in a term (`RouteMap.js:29-32`), so widths are uneven. Rows sit 6px lower. | S |
| 3.2 | Now band | `<rect>` covering the **full column**: x = column left, width = COL, y=8, height H−16, **rx 12**, fill `--tint` (`:83`). | Inset 4px each side (`left+4`, `width-8`), **rx 16** (`RouteMap.js:76-83`). | S |
| 3.3 | Term headers | Season at y=26 and year at y=42, both 12.5px. Season 500 muted, or **700 tint-ink in the now column**. The **year always stays muted 500**, even in the now column (`:86-87`). | `<text>` at y=32 with tspans at +16. The `.is-now` class turns **both** season and year tint-ink 700 (`RouteMap.js:89-93`, `RouteMap.css:30-31`). Rows sit 6px lower. | S |
| 3.4 | "Not placed" header | One line at y=34, muted 12.5 (`:89`). | y=40 (`RouteMap.js:96`). Text matches. | S |
| 3.5 | Line names | x=16, y=row+5, 14px **700 ink** in Hanken (`:114`). | x=0 inside a card with 20px padding, so the offset matches. 14px 700 ink. **Match.** | — |
| 3.6 | Track (placed stops) | Straight `<line>` from the first to the last placed stop, **stroke-width 8**, round cap, line colour (`:115`). Drawn even with one stop (a dot cap). | `<polyline>` **stroke-width 7**, round cap and join. Only drawn when a line has ≥2 stops (`RouteMap.js:136-138`, `RouteMap.css:34`). | S |
| 3.7 | Open extension | From the last placed stop to each open stop. Line colour, **stroke-width 4**, **dasharray 2 8**, round cap (`:116`). | `.rt-track-open`: **stroke 3**, **dasharray 2 6** (`RouteMap.css:35`). | S |
| 3.8 | Prereq transfers | Cubic path, `--track` 1.5px, dash 2 4. Drawn for **every** prereq pair (`:105-108`). | Same style (`RouteMap.css:38`), but **same-line edges are dropped** (`RouteMap.js:114`). The mockup data has no same-line pair, so it's unspecified; real UVA data (ECON 3010 → ECON 3020/3720 on Core theory) would lose links. | S |
| 3.9 | Done stop | Circle **r=10**, fill line colour, **stroke surface 3**, white check `M x-4 y l3 3 l5 -6`, stroke 2.2 (`:121`). | **r=9**, stroke surface **2.5** (`RouteMap.css:45`). Check path `x-4.2 y+0.2 l2.8 2.8 l5.4 -5.6`. | S |
| 3.10 | Now stop | Circle **r=12**, fill surface, stroke **signal 5** (`:122`). | **r=11**, stroke signal 5 (`RouteMap.js:160`, `.css:46`). | S |
| 3.11 | Planned stop | r=9, fill surface, stroke line colour 4. | Same. **Match.** | — |
| 3.12 | Open stop | One circle **per open stop**, r=9, surface fill, `--open` 2px, dash 3 3, sitting in the Not placed column (`:124`). | One circle **per line** with open slots, same style (`RouteMap.js:142`). Lines with several open slots collapse into one stop showing "N more". Acceptable, but different. | S |
| 3.13 | Stop codes | `<text>` in **Unbounded 700, font-size 12** (the duplicated `font-size="10"` is dropped by the HTML parser, so 12 wins), ink. Below the stop at **y+30**, or above at **y−22** (`:125-127`). | `.rt-code`: Unbounded 700 **10.5px** (`RouteMap.css:48`). Below at **y+29**, above at **y−20**. | S |
| 3.14 | Stacked stops in one term | Offset **±24** px. The **first** stop (j=0, left) goes **above** (`:100-101`). The PNG shows MATH 1210 above and ECON 2010 below. | Offset **±28** (SPREAD 56). The **second** stop (odd index, right) goes above (`RouteMap.js:44-47`). The above/below sides are swapped. | S |
| 3.15 | Grades | 12px muted, normal weight (inherits 500). Under the code at **y+45**, or **above the code (y−37) for an "up" stop** (`:128-129`). The PNG shows "B+" above MATH 1210. | 11.5px **600** at y+44. **Not drawn at all for above stops** (`RouteMap.js:165`), so a grade is lost for every second stop in a shared term. | S |
| 3.16 | Open label | "**1 more**" in **Unbounded 700 12px ink** (same element as the codes, `:126-127`). PNG: bold dark. | "N more" in **Hanken 600 12px muted** (`.rt-more`, `RouteMap.css:37`). | S |
| 3.17 | Core due marker | Vertical line at the **right edge** of the deadline column, from **y=54** to H−10. `--ink` 1.5px, dash 4 4. Label "Core due" right-aligned at x−6, y=H−14, **12px weight 600** ink (`:90-92`). | Same x. Line from **y=64** (HEAD_H) to height−12. Label at height−16, **700** (`RouteMap.js:100-112`, `.css:40-41`). Text matches. | S |
| 3.18 | Hover/focus | None drawn. | Extra r=17 ring: 25% opacity on hover, 100% on focus (`RouteMap.js:159`, `.css:50-52`). Fine for accessibility; just noting it as extra. | — |
| 3.19 | Line colours | Lines 1–3 = `--line-1..3` (UVA light #009FDF / #EF3F6B / #62BB46). | Same for the first three (`RouteMap.css:4-6`, `schools/uva/school.yaml:33-35`). Lines 4–6 fall back to `--course-4..6`. **Match.** | — |
| 3.20 | Phone behaviour of A | The A map on phone scrolls to the term before now and moves line names into the scroll (`:132-133`). | Not applicable: the approved phone design is B and the app shows `RouteList` on phone. **Match** on intent. | — |
| 3.21 | Font | `svg text {font-family: var(--font)}` (Hanken). | `.rt-map {font-family: var(--font-app)}`, which is Hanken (brand-tokens.css:10). **Match.** | — |

## 4. Phone route (B): `transit-b.html` vs `RouteList` (`RouteMap.js:183-256`, `RouteMap.css:54-177`)

| # | Mockup | App | Size |
|---|---|---|---|
| 4.1 | The route sits **inside a `.panel`** (surface, line border, r-xl, shadow), with header `.panel-h`: `<h2>`"**Your route**", spacer, muted "**9 credits done · 36 placed**" (`transit-b.html:59`). Body `.route` padding 4 14 12 on phone (`:40`). | **No panel, no heading, no counts.** `<ol class="rt-route">` sits straight on the canvas (`RouteMap.css:56`). | M |
| 4.2 | Waffle summary not present. | `DegreeSummary` renders above the route on phone (`DegreeBoard.js:381`). | (see 2a) |
| 4.3 | No Map / Semesters switch on phone. | The switch shows on phone (`DegreeBoard.js:348`). Choosing Semesters gives the full-width board columns. | S |
| 4.4 | Rail: a 6px bar centred at **22px** (`left:19px` in a 44px gutter), coloured **`--deep`** for past and now terms and **`--track`** for future terms. The first starts at 22px; the last is 22px tall (`:8-12`). | Rail 6px centred at **16px** (`left:13px`), rounded. Coloured **`--ink`** when every stop in a term is done, otherwise track (`RouteMap.css:59-70`). **Dark mode:** ink is #EEF0F4, so the app shows a near-white rail and markers, where the mockup shows deep navy (#1B2440) (`transit-b-uva-dark-phonefull.png`). | S |
| 4.5 | Past node: **22px**, fill deep, 4px surface border, 2px deep ring (`:13-14`). | `.rt-marker` **32px**, 4px ink border, ink fill with a 4px inset surface ring (`RouteMap.css:72-83`). Larger, and uses ink instead of deep. | S |
| 4.6 | Now node: **30px**, surface fill, **6px** signal border, margin 8 0 0 7 (`:15`). | 32px, **7px** signal border (`RouteMap.css:84`). | S |
| 4.7 | Future node: 22px surface with a 3px track ring. Open node: 22px with a 2px dashed `--open` border (`:16-17`). | 32px with a 4px track border, or 32px dashed (`RouteMap.css:79,85`). | S |
| 4.8 | Term state comes from the term index (past, now or future), so a past term with no stops still counts as past. | State is "done" only when the term has stops and all of them are done. Empty past terms render as planned/grey (`routeModel.js:167`). | S |
| 4.9 | Now body: tint fill, **radius 14**, padding 12 14 14, margin-bottom 14 (`:19`). | Tint, radius **r-lg 16**, padding 11 14 6, margin-top −8 (`RouteMap.css:88-93`). | S |
| 4.10 | Term heading: `<h3>` in Unbounded 700 **14px**. Gap 10, margin-bottom 6 (`:20-21`). | `<h4>` **16px** (`RouteMap.css:95`). | S |
| 4.11 | "Now" is a `.tag.now`: 24px tall, padding 0 10, tint background, tint-ink 12.5px 700 (`system.css:200-202`). | `.rt-pill.is-now`: **transparent, padding 0**, 12px (`RouteMap.css:104`). It reads the same on the tint body but is 10px narrower on each side. | S |
| 4.12 | "Core due" is a `.tag.plan`: raised background, **muted** text, 24px tall, 12.5px (`system.css:203`). | `.rt-pill`: raised background, **ink** text, padding 3 9, **12px** (`RouteMap.css:96-103`). | S |
| 4.13 | Credits "6 cr": muted **14px**, margin-left auto (`:22`). Shown for every term. | 13px. Hidden when credits are 0 (`RouteMap.js:196`). | S |
| 4.14 | Course row: grid **`18px 92px 1fr auto`** (phone **`16px 84px 1fr`**), gap 10, padding 7 0, 14.5px (`:23,41`). | grid `12px auto 1fr auto`, gap 12, **min-height 44**, 14px (`RouteMap.css:108-123`). Codes don't line up in a fixed column. Rows are taller. | S |
| 4.15 | Row dot **14px**. Done: filled. Now: surface with a **4px** signal border. Planned: 3px line-colour border. Open: dashed (`:24,69-75`). | Dot **12px**. Now has a **3px** signal border (`RouteMap.css:125-129`). | S |
| 4.16 | Code: Unbounded 700 **10.5px** (`:25`). | **12px** (`RouteMap.css:130`). | S |
| 4.17 | Title: **ink** (no colour set), ellipsis (`:26`). | **muted** (`RouteMap.css:131`). | S |
| 4.18 | Right column: the grade, or "3 cr", in muted 14px. Hidden on phone (`:27,43`), so the desktop B variant shows it. | No grade or credits column on stop rows. | S |
| 4.19 | Not placed rows: one per open stop, with code "**ECON ····**" and the slot title "**Any ECON course, 2000 or above**" (`:76,83-84`). | One row per line: the line's open rule titles joined with " · ", then a count number (`RouteMap.js:225-231`). Different words and shape. | M (data: slots carry no human title like "Any ECON course, 2000 or above") |
| 4.20 | Terms listed: the first 6 (to the deadline term) then Not placed (`:77`). | Every term in the span. | S |
| 4.21 | "Lines" is a `.panel` with `.panel-h` `<h2>` "Lines" at **16px**, body padding 4 20 18 (`:28,61`). | `.rt-lines` section with padding 18 18 6 and `<h3>` at **17px** (`RouteMap.css:135-141`). The panel has no shadow-rest. | S |
| 4.22 | Line item: padding 14 0, rule border. Name row: 700 name and a **500 muted** count "3 of 4", margin-bottom 10 (`:29-32`). | padding 12 0. `<h4>` 15px 700, count 14px muted at default weight (`RouteMap.css:142-146`). | S |
| 4.23 | Strip: 16px dots joined by **6px segments**. A segment between two done stops is in the **line colour**, others **`--line`** (`:33-35,90`). The now dot has a 4px signal border. | One continuous **4px `--track`** bar behind dots spaced with `space-between`. **No coloured done segment.** The now pip has a **3px** border (`RouteMap.css:149-177`). Phone PNG: blue fill between done Foundations stops; the app would be grey. | S |
| 4.24 | Rules caption: 13.5px muted, margin-top 8, "Introductory economics 2/2 · Calculus I 1/1 · Statistics 0/1". | 13px, margin-top 6. Same format, but with real titles (see 2c). Credit-unit rules print credits (e.g. "6/12"). | S |
| 4.25 | Desktop variant of B is a two-column layout with a 360px Lines rail (`transit-b.html:6`). Not approved for desktop. | Not built. **Match** (A is the approved desktop). | — |

## 5. Colour and token consistency across the degree surfaces

- **5.1** On one screen, the summary waffle and key and the Semesters board colour **each rule** with `--course-1..6` by rule index (`degreeFormat.js:56-59`, `DegreeBoard.css:12-18`). The map colours **each line** with `--line-1..3` (`RouteMap.css:4-6`). So Introductory economics is #2E7CF6 in the waffle and #009FDF on the map, and Calculus I is purple in the waffle but blue on the map. The mockup uses one colour per line everywhere (Requirements dots, map, phone dots, Lines strip). **M.**
- **5.2** The phone route uses `--ink` where the mockup uses `--deep` (4.4, 4.5). **S.**
- **5.3** RouteMap.css and DegreeBoard.css use role tokens only, with no hex. **OK.** SemesterView.css uses `--canvas` as a hover fill and `--ink` for primary buttons (see 7). **S.**
- **5.4** Dark mode: the now band is `--tint` (#33230F), matching the PNG. The detail band would be `--band` (#232D4B); not built. The phone route rail is wrong in dark (4.4). Panels drop their shadow in dark; the app's `.rt-card` has no shadow in either theme. **S.**

## 6. States

- **6.1** Loading: on the Map view, the app shows the **Semesters skeleton** (`TermColumnSkeleton`) plus the waffle skeleton (`DegreeBoard.js:268,288-293`), because `showMap` stays false until a degree arrives. DESIGN says "loading (the real layout in raised)", so this should be a map-shaped skeleton. **S–M.**
- **6.2** Error: "Couldn't load" + Retry (`DegreeBoard.js:286-287`). The mockup has no error state. **OK.**
- **6.3** Empty (no program or no route lines): the switch hides and the board shows (`DegreeBoard.js:207-208,348`). There is no map empty state. The mockup has none either. **OK.**
- **6.4** Selected stop: the mockup implies one (2d). The app has none. **(in 2d)**
- **6.5** "Couldn't save" InlineError is above the summary (`DegreeBoard.js:380`). **OK.**

## 7. Semesters view and Semester view (restyle debt)

### 7a. Semesters board (`?view=degree` with Semesters chosen) vs r7-degree-1 plus Home Colors rules

- **7a.1** Columns: 280px, r-xl, surface, shadow; the current term uses tint with no border (`DegreeBoard.css:257-275`). r7 marks the current term with a 1.5px ink border. Home Colors forbids coloured borders, so the tint is the correct restyle. **OK.**
- **7a.2** r7 shows a "**1 clash**" pill beside the credits band on Spring 2027. The app has **no clash indicator** on board columns (grep finds none in degree/*.js). **M.**
- **7a.3** r7 "+" slots are dashed academics-blue with a blue "+". The app uses a dashed `--open` grey, or `tint-strong` in the current column (`DegreeBoard.css:459-474`). This is a Home Colors restyle and is acceptable. **S.**
- **7a.4** Past column: r7 has only "‹ See past" at the bottom. The app adds a "**Completed**" button (`PastColumn.js:41`), from the O2 editor. That is an extra control compared with r7. **S.**
- **7a.5** "Open semester →" on every column. The primary (signal) version is on the current term (`TermColumn.js:132-138`). r7 has an ink primary on the current term; signal is the Home Colors equivalent. **OK.**
- **7a.6** Where the Map/Semesters switch sits: see 2.2. In the mockup it lives in the route panel header. Semesters has no mockup of its own in design-system-20261029. **S.**

### 7b. Semester view (`?view=semester&term=`) vs r9-semester-1 plus Home Colors. Not restyled to Home Colors.

- **7b.1** Course codes and numbers use **`--font-mono`** (system mono): `.sv-gauge-value`, `.sv-rq-value`, `.sv-result-code`, `.sv-code`, `.sv-gpa`, `.sv-cr b` (`SemesterView.css:230,303,438,517,526,534`). DESIGN says "Course codes are Unbounded 700 at about 11px. JetBrains Mono is gone." **M.**
- **7b.2** Radii are off the ramp:
  - `.sv-icon-btn` 8px, `.sv-btn` **9px**: buttons should be fully round.
  - Notices 10px.
  - `.sv-tile` **14px**: panels should be 24.
  - GPA pill 6px.
  - Rows 9/11/12px.

  See `SemesterView.css:58,84,114,145,…`. **M.**
- **7b.3** Primary button `.sv-btn.is-primary` uses an **ink** fill with surface text (`SemesterView.css:95`). DESIGN says primary is signal with on-signal text. **S.**
- **7b.4** Term title `.sv-term` is 22px at −0.01em with no display font set (`SemesterView.css:40-46`). DESIGN: page title 28px Unbounded 700 −0.03em. **S.**
- **7b.5** Icon buttons are 28px and 34px boxed (`SemesterView.css:51-75`). DESIGN: buttons are 42px. **S.**
- **7b.6** Tiles have no border or shadow-rest and sit in an 8px gap grid (`SemesterView.css:126-147`). Home Colors panels have a hairline, shadow-rest and a 16px gap. **S.**
- **7b.7** Labels "Credits", "Load", "Degree requirements", "Week" are sentence case at 13px 700 muted (`SemesterView.css:149-154`). r9 used caps eyebrows; Home Colors removed them. **OK.**
- **7b.8** Hover uses `--canvas` (`SemesterView.css:66,93`). It should be `--raised`, which `.cc-btn` uses. **S.**

## 8. First run and setup dialog vs first-run B (`b1-program-v2`, `b-setup-dialog`, `b3-first-term`, `b-phone-completed`)

Shell differences (mockup dark #111114 band, 18px radius) are pre-Home Colors. The app's `--band` and r-2xl are the correct restyle. Content differences:

| # | Mockup | App (`SetupDialog.js`, `DegreeBoard.css:570-719`) | Size |
|---|---|---|---|
| 8.1 | Step header: number circles joined by **34px × 1.5px connector lines** (`.steps .ln`, `b-setup-dialog.html:10,52`). | Steps in a wrapping `ol` with gap 6×20 and **no connectors** (`DegreeBoard.css:574-577`). | S |
| 8.2 | Done step: green circle (`--campus`) with a white ✓. Current: white circle with dark number. Others: dark grey circle with grey number. | Done: `good-tint`/`good`. Current: `signal`/`on-signal`. Others: on-deep at 14% (`DegreeBoard.css:578-590`). Acceptable restyle. | S |
| 8.3 | Width 760px (Completed, First term) and 880px (Program). | `maxWidth="md"` (900) (`SetupDialog.js:539`). | S |
| 8.4 | **Program:** the rules list header shows "Master of Public Policy" and "49 cr". Each rule row has a coloured square, the title, and **per-rule credits ("6 cr")** on the right (`b1-program-v2.png`). | Rule rows have a dot and title only. **No per-rule credits** (`SetupDialog.js:354-359`). Squares in the mockup, round dots (`.su-dot`) in the app. | S |
| 8.5 | **Program:** Catalog year is a **select** ("2026–27 ▾"). | Static text `su-catalog` (`SetupDialog.js:364-368`). | S |
| 8.6 | **Program:** Class year as a 2×2 chip grid; selected uses the ink fill. | 2×2 `su-chip`. Selected uses the deep fill, or tint-strong in dark (`DegreeBoard.css:669-685`). **OK.** | — |
| 8.7 | **Program:** no Start term. | Extra "**Start term**" select (`SetupDialog.js:392-405`). This is accepted plan scope R10 (home-colors-build.md:311), but it isn't in the approved mockup. **Note.** | — |
| 8.8 | **Program:** group labels "UNDERGRADUATE" / "GRADUATE" in caps. | Sentence-case `dg-label` (`SetupDialog.js:330`). Correct under Home Colors. **OK.** | — |
| 8.9 | **Completed (desktop):** **two columns** (`1fr 1.25fr`, gap 18). Left is a **dashed drop zone**: 1.5px dashed, r14, sunken background, an upload glyph, the "Upload transcript" primary button, "PDF · DOCX · TXT", and a **file chip with a green ✓** "transcript-fall-2026.pdf". Right is a **bordered "Found" panel**. | **Single column.** One upload row: button, formats, file name with **no ✓ and no chip**, **no drop zone** (`SetupDialog.js:410-431`, `.su-upload` `DegreeBoard.css:687-689`). | M |
| 8.10 | Found panel header: "**Found 7**" on the left and "**17 cr**" (total) on the right, on a sunken background (`b-setup-dialog.html:64`). | `<p class="su-found">Found N</p>` with **no credit total** and **no panel or header band** (`SetupDialog.js:474`). | S |
| 8.11 | Found rows: grid `20px 92px 1fr 30px 30px`. Checkbox, code (mono bold), title (soft, ellipsis), **grade as static bold text** ("A-", "IP", "—"), and **credits as a bare number** ("3"). | Checkbox, code, title, flag, then "**3 cr**" and a **Grade `<select>`** with a "Grade" placeholder (`SetupDialog.js:484-503`). Credits come before the grade, with a "cr" suffix. | S |
| 8.12 | Unmatched row: tinted background, and "**Not in catalog**" **replaces** the title, in student-life ink. Grade and credits show "—". Unchecked. | The row is tinted (`is-flagged`), and the flag text is appended **after** the title (`SetupDialog.js:488-489`). No "—" placeholders. | S |
| 8.13 | Course entry: a single "**Course code**" input as the **last row inside the Found panel** (`b-setup-dialog.html:72`). | A search input "**Course code or title**" **above** the list, with a results list and "Add" buttons (`SetupDialog.js:434-472`). Input radius 10, border `--line` (`DegreeBoard.css:540-547`). DESIGN: inputs are 16 with the control hairline. | S |
| 8.14 | Codes in the dialog: mono bold. | `.cc-code` uses `--font-mono` 13px **500** in academics-ink (`CoursesPage.css:93-99`). DESIGN violation (codes should be Unbounded 700 ~11px). | S |
| 8.15 | **First term:** term chips, then a **compact preview card**: a mini credit grid (≈10 columns of small squares, completed filled), "**17** Credits done", "**6** Open requirements", and **requirement chips**, with met ones **struck through** (`b3-first-term.png`; spec setup-dialog.md:26). | Term chips, then the **full board `DegreeSummary`** (Finish or Open requirements, Credits/Done/Planned/Open, 8-row waffle, key list) (`SetupDialog.js:520-522`). No chips and no strike-through. | M |
| 8.16 | First term footer: Back + Done. | Back + Done (no Skip on the last step) (`SetupDialog.js:566-576`). **Match.** | — |
| 8.17 | **Phone:** the band shows "**2 of 3**" with a **3-segment progress bar** (green done, white current, grey rest) and ×, then a big step title (`b-phone-completed.png`; spec :31). | The band keeps the numbered steps and **hides non-current labels with `font-size:0`** (`DegreeBoard.css:714`). There is no "2 of 3" text and no progress bar. | M |
| 8.18 | **Phone Completed:** a **full-width** "Upload transcript" button, the file line with ✓, "Found 7" and "17 cr", **two-line rows** (code over title), grade and credits on the right, a "Course code" input, and a footer of **Back, Skip, Next** with Next stretched. | Upload row as on desktop. Single-line rows. Footer: `.su-foot-end` flex and primary flex:1 (`DegreeBoard.css:717-718`). Back sits apart on the left. The layout is close, but rows aren't two-line and the button isn't full width. | S |
| 8.19 | The dialog auto-opens on first run when the plan has no program. | Auto-opens once per visit when there is no program (`DegreeBoard.js:258-265`). **Match** with `approved.json` ("remove the old chat tour"). | — |

## 9. DESIGN.md violations found in scope

1. Segmented control `.cc-tabs` is not fully round (14/10px), uses `--line` and weight 600 (1.6).
2. Section and card title sizes are off scale: program h2 22px (1.4), "Route to …" 17px (2.2), "Lines" 17px (4.21), term h4 16px (4.10). DESIGN: section titles 14–16.
3. `--font-mono` for course codes: SemesterView (7b.1) and `.cc-code` in the setup dialog (8.14). DESIGN says codes are Unbounded.
4. Semester view radii, button heights and primary colour (7b.2–7b.5).
5. Panels missing shadow-rest in light mode: `.rt-card`, `.rt-lines` (2.1, 4.21).
6. Setup inputs: radius 10 and `--line` border (8.13). DESIGN: inputs 16 with the control hairline.
7. Data colours don't keep one meaning per requirement across the summary and the map (5.1). DESIGN: "keep data colors meaning the same thing".
8. Extra visible text not in the mockup: "Catalog YYYY" (1.5), the Compare count badge (1.6).
9. Phone breakpoint 767 vs DESIGN 700 (1.10, shell-wide).

## 10. Data gaps (backend `degree.py` route payload and plan)

| Need | Payload today | Gap | Size |
|---|---|---|---|
| Counts row (done / this term / planned / not placed) | `completed[].credits`, term course credits, `route.slots[].open` | None; client-side | S |
| Requirements rows | `rules[]` with title, unit, needed, completed, planned, course ids | Per-course pills for credit rules need a convention (`COURSE_CREDITS`). Rule titles differ from the mockup. UVA has 2 extra elective rules | S |
| Detail card: code, credits, title, term, line | Route stops | None | S |
| Detail card: Needs / Opens | `route.edges` (only between courses in the plan; `degree.py:248-254`) | "Opens" can't name a course that isn't planned | M |
| Detail card: Section ("MoWe 2:00–3:15 · Troyan") | Not in the degree payload. The plan course has `sections`; meetings and instructor come from course details | An extra fetch or join per selection | M |
| Columns to graduation / "Route to <grad term>" | `profile.class_year`, `start_term` | `routeModel` doesn't extend the span to Spring of `class_year` | S |
| Not placed row text ("ECON ····", "Any ECON course, 2000 or above") | `slots[]`: program_id, rule_id, line, open | No slot description or code mask; only rule titles exist | M |
| Core due | `route.deadline` (rules, by_semester) + `start_term`/`class_year` (`routeModel.js:122-129`); UVA econ-ba has `deadline: rules [intro, micro-theory, econometrics], by_semester 6` | None | — |
| Line names | `rule.line` (UVA econ-ba: Foundations / Core theory / Electives) | None | — |
| Clash on board columns (r7) | Not in `terms[]` (credits, difficulty only) | Needs a meeting-clash count per term | M |

---

## Top 15 gaps (in priority order)

1. **L**: Desktop Requirements panel missing: 7 rule rows with a line-colour dot, segmented pills (done / now / placed / open) and "X of N" (transit-a.html:50,134-142).
2. **L**: Desktop selected-course detail card missing: band "ECON 3010 · 4 credits" / "Intermediate Microeconomics", rows Term, Line, Needs, Opens, Section. No selected-stop state exists, and the Section data isn't in the degree payload (transit-a.html:51-60).
3. **L**: Counts row "9 credits done · 8 this term · 16 planned · 1 not placed" (Unbounded 24px figures) is replaced by the DegreeSummary waffle panel, which also shows on the Map view and on phone (DegreeBoard.js:267-271).
4. **M**: Title row: no visible h1 "My degree", and no primary "Add course". The program is an h2 text link, not a chevron button. Tabs come first instead of after the spacer. Extra "Catalog YYYY" (DegreeBoard.js:335-378, CoursesPage.js:738).
5. **M**: Map/Semesters switch sits in the page toolbar instead of the route panel header, and it shows on phone where approved B has none (DegreeBoard.js:348).
6. **M**: Map columns stop at the last stop or deadline instead of running to graduation, so the title reads "Route to <last stop term>" not "Route to Spring 2029". An extra "Earlier" column can appear (routeModel.js:131-134).
7. **M**: Phone route isn't in a panel and has no "Your route" header or "9 credits done · 36 placed" (RouteMap.js:186-236).
8. **M**: The same requirement gets different colours: course-1..6 per rule in the waffle and board vs line-1..3 per line on the map (degreeFormat.js:56, RouteMap.css:4-6).
9. **M**: Setup Completed step is a single column with no dashed drop zone or ✓ file chip, no "Found N · 17 cr" panel header, a grade `<select>` instead of a grade value, and the search input sits above the list instead of a "Course code" row at the bottom (SetupDialog.js:409-506).
10. **M**: Setup First-term preview uses the full board DegreeSummary instead of the compact grid + "Credits done" / "Open requirements" + struck-through requirement chips (SetupDialog.js:520-522).
11. **M**: Setup phone band has no "2 of 3" text or 3-segment progress bar; labels are hidden with font-size 0 (DegreeBoard.css:714).
12. **M**: Semester view isn't restyled to Home Colors: system mono codes, 8–14px radii, an ink primary button, a 22px non-Unbounded title, 28/34px icon buttons (SemesterView.css:40-147,230-534).
13. **S**: Map stop details: codes 10.5px instead of 12px; stacked stops place the second (not the first) above; grades dropped for above stops; "N more" in Hanken muted instead of Unbounded ink; done r9/2.5 instead of r10/3; now r11 instead of r12 (RouteMap.js:44-47,160-166, RouteMap.css:37,45,48).
14. **S**: Map strokes and band: track 7 instead of 8, open dash 3px "2 6" instead of 4px "2 8", now band inset 4px with rx16 instead of a full column with rx12, the year in the now column tinted, due line starting at y64 instead of y54 with a 700 label instead of 600 (RouteMap.js:76-112, RouteMap.css:30-41).
15. **S**: Phone route styling: the rail and done markers use ink instead of deep (near-white in dark mode); markers are 32px instead of 22/30; rows use a 12px dot with muted titles and 12px codes instead of a 14px dot, ink titles and 10.5px codes in a fixed 84/92px code column; the Lines strip has no line-colour segments between done stops (RouteMap.css:58-177).
