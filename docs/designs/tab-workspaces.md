# Design: Every tab is its own app, with chat beside it

Status: DRAFT for /plan-design-review, 2026-10-28. Branch: undergrad-experimental. Nothing built yet.

Builds on `docs/designs/campus-pages-plan.md` (Courses, Events, Campus map, Saved) and
`docs/designs/semester-planner.md` (planner M1, built). Reverses two planner M1 decisions:
the plan in the chat's AnswerPanel slot, and the Plan toggle (design review 3A, 5A).

## What the user asked for (2026-10-28)

1. **Planning lives on the Courses page.** The main area is a planner you can drive yourself,
   like SIS or DARS. Chat is there if you want it.
2. **Chat is a panel on the right of every page.** "Ask about this" and planning chat open it
   beside the page. You never leave the page you are on.
3. **Drag and drop.** A course into the planner's term or week. Anything onto Saved. Anything into
   the chat panel, which fills the chat box with that item.
4. **Each tab is a full app.** You can get done what you came for without the chat.
   - Events: a detail view you can read.
   - Map: tap a place and see everything about it, hours and photos if they exist.
   - Courses: merge the old course detail page in. The more data the better.
5. **Show, don't tell.** People don't read much. Use the data in visual ways.

## Constraints

- Sponsor demo, local Docker, UW-Madison, UVA, CU Boulder all keep working.
- Global rule: no taglines, captions, helper sentences or "this shows…" text. Labels name things.
  Error and empty states stay minimal. This fits "show, don't tell".
- No new paid APIs or keys. Demo model keys are for the demo's own model calls only.
- Planner engine, checker, proposals, Undo and `/api/planner/*` stay as built (M1).

## Data we have, and what each page uses today

Verified 2026-10-28 by reading the code and the cached feeds, and by counting OSM tags live.

### Events

| | UW | UVA | CU |
|---|---|---|---|
| Feed | today.wisc.edu ICS | Trumba ICS | calendar.colorado.edu ICS |
| Title, start/end, location, URL, description | yes | yes | yes |
| Image | no | 188 of 200 (`IMAGE`) | no |
| Categories | no | 200 of 200 | almost every event |
| Map position (`GEO`) | no | no | 1452 of 2095 |
| Extra fields | none | `X-TRUMBA-CUSTOMFIELD`: Event Type, Audience, Cost, Sponsor, Hosted by, Room, Registration Link, Online Location | none |
| Venue matched to a map place | yes (`match_venue`) | yes | yes |

Today the page shows title, time, location, walk minutes, Directions, Add to calendar and Save.
**Not shown:** description (not even sent to the page; also cut to 400 characters by the
parser), categories, images, cost, audience, registration. **There is no detail view;** the
title links out. Calendar-grid blocks can't be clicked.

### Campus map

OSM tags on named, non-bus-stop places (live Overpass count, same query as `import_places.py`):

| Tag | UW (290) | UVA (446) | CU (169) |
|---|---|---|---|
| opening_hours | 28 | 6 | 18 |
| website | 50 | 26 | 6 |
| phone | 15 | 9 | 4 |
| wikidata | 35 | 22 | 12 |
| wikipedia | 25 | 6 | 10 |
| wikimedia_commons / image | 3 / 0 | 0 / 0 | 0 / 0 |
| wheelchair | 30 | 5 | 6 |
| cuisine | 23 | 7 | 7 |
| building:levels | 79 | 121 | 54 |
| addr:street | 199 | 147 | 121 |
| operator | 71 | 21 | 133 |
| description | 0 | 3 | 60 |

The import keeps only name, aliases, category, hours and position; it drops every other tag and
the OSM id. **Pins can't be clicked** today. A place is chosen from the list, and the panel shows
the walking route, minutes and an OpenStreetMap link.

**Photos without Yelp.** OSM itself has almost no photo tags, but places with a `wikidata` tag
(35 / 22 / 12) can use that item's image (Wikidata P18, a Wikimedia Commons file). Keyless, needs a
User-Agent and an author/licence credit. Wikipedia's summary API gives a short extract for places
with a `wikipedia` tag. That covers the well-known buildings and libraries, not most cafés.
Not yet counted: how many of those Wikidata items have an image (the count hit an Overpass 502;
retry during the eng review).

**Yelp** would add photos, ratings and hours for dining. It needs an API key and a paid plan, and its
display terms limit caching. Google Places is also paid. Neither is proposed; dining hours from each
school's dining page are a later option.

**Other data the map could show:** events at each place today (venue match), and at CU the
buildings where sections meet (FOSE `bldg`, dropped today).

### Courses

| | UW (Course Map) | UVA (theCourseForum CSV) | CU (FOSE) |
|---|---|---|---|
| Description | yes | yes | no |
| Grades | per term, all instructors pooled | per section and instructor, 5 terms (the code pools them by term) | no |
| Grade trend over terms | yes | yes (5 terms) | no |
| Sections, seats | yes, live | yes, historical | sections, no seats |
| Meeting times | no | yes (~98%) | yes |
| Rooms / buildings | no | hidden on almost all | `bldg` (dropped today) |
| Instructors | per course, with Course Map ratings | per section | per section |
| RMP | live tool exists, no page uses it | same | same |
| Prerequisites | AND/OR tree with minimum grade (planner only) | no | no |
| What comes next | yes | no | no |
| Credits, gen-ed | yes (planner only) | yes (planner only) | credits (planner only) |
| Requirement progress | planner programs | planner programs | no programs |

Two course pages exist:

- **`/courses`** (works at all three schools): search, level chips, a preview with GPA tiles,
  grade bar, prerequisite chips, sections and seats, "Often taken next", Compare. The description
  is fetched but never shown.
- **`/courses/:id`** (UW only, backend hard-wired to `_uw_source`): tabs for Overview (metric
  cards with deltas), Schedule, Prerequisites Map, Instructors (ratings) and Trends (per-term chart),
  plus a term selector. The Prerequisites Map, similar courses, credits, "offered" and RMP links are
  always empty from this backend. Chat cards and the plan panel link here.

## Proposed scope

### 1. Chat dock

- A right-hand panel on every signed-in page. It keeps one conversation as you move between pages.
- "Ask about this" opens it with the item attached to the chat box. A plan proposal shows as a card
  in the dock and as a preview in the planner.
- Desktop: a column next to the page that can be collapsed. Tablet: a drawer over the page.
  Phone: a bottom sheet above the tab bar.
- The `/chat` page stays for full-screen chat and history.

### 2. Courses: one page for finding, judging and planning a course

- Merge `/courses/:id` into `/courses`, working at all three schools. One course view with
  everything the school has, and nothing shown for data a school doesn't have.
- A Plan mode on the same page: your term, requirement checklist, credits and load, week grid,
  with the course list beside it. Search results and the course view drag into the plan.
- `/courses/:id` redirects to `/courses?selected=id`, so chat links keep working.

### 3. Events: a detail view

- Clicking any event (list, "Up next", a calendar block) opens a detail view: image, when, where
  with a small map and walk time, category chips, cost, audience, registration link, the full
  description, Add to calendar, Save, Ask, and a link to the source page.
- Category filters where the feed has categories (UVA, CU).

### 4. Map: tap a place

- Pins can be clicked. Selecting a place shows its card: photo where one exists, category, open now
  and the week's hours, walk time and route, floors, accessibility, cuisine, website and phone,
  events there today, and Save / Ask / Directions.

### 5. Drag and drop

- **Course → planner term or week:** a direct edit with Undo (chat stays propose-only).
- **Course, event or place → Saved in the rail:** saves it.
- **Course, event or place → chat dock:** attaches it to the chat box.
- Every drag has a button that does the same thing (Add to plan, Save, Ask), for keyboard,
  screen readers and phones.

### Show-don't-tell ideas, for the design review to keep or cut

- **Courses:**
  - The grade distribution as the course's signature graphic.
  - A GPA trend line over terms.
  - Seats as fill bars.
  - A section-times mini week.
  - A prerequisite tree drawn as a graph (UW).
  - "Taken next" as a flow.
  - Instructor comparison at UVA (per-instructor grades).
  - Gen-ed and requirement chips that light up for your program.
- **Events:**
  - Category colours.
  - A "now" marker on the calendar.
  - Tonight's events as pins on the campus map.
  - Free events marked (UVA Cost).
- **Map:**
  - Open-now rings on the pins.
  - A 7-day hours strip.
  - A photo header.
  - Event dots on places with something on today.

## Backend data work this implies (for the eng review)

- **Events:**
  - Parse IMAGE, CATEGORIES, GEO and the UVA custom fields.
  - Keep the full description.
  - Send the description and the new fields in `/api/events`.
- **Places:**
  - Keep website, phone, wikidata, wikipedia, wheelchair, cuisine, building:levels, addr and the OSM id.
  - Fetch the Wikidata image and credit at import time.
  - Add events at the place.
- **Catalog:**
  - Add credits, gen-ed, the per-term grade history, instructor ratings, the prerequisite tree and next courses to `/api/catalog/{id}` for every school.
  - Keep the UVA per-instructor grades.
  - Keep CU's `bldg`.
  - Stop hard-coding CU's term.
- Retire the UW-only `/api/courses/{id}` once the merged page covers it.

## Open questions for the design review

1. How the Courses page is laid out with a course list, a course view or plan, and the chat dock all
   on one screen at 1440px, 1280px, tablet and phone.
2. Browse vs Plan: two modes on one page, or the plan always visible beside the course view?
3. Whether the chat dock is open by default, and what it shows before you've asked anything.
4. What a drop target looks like while dragging, and what confirms a drop.
5. Event detail: a modal, a side panel, or a page section?
6. Map place card: where it sits over the map, and how it looks on phones.
7. Which show-don't-tell ideas earn their place on each tab.

## Design Review (plan-design-review, 2026-10-28), in progress

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/` (HTML with the app's tokens, screenshotted; the design binary needs an OpenAI key the user keeps for the demo).

### Decided with the user so far

- **Scope:** all five areas (chat dock, Courses + planning, event detail, map place card, drag and drop).
- **Round 1 (courses-a/b/c):** none chosen. The plan must not share the screen with the course view.
- **Round 2 (r2-*):** the course detail pop-up (r2-browse-modal) and the term board (r2-plan-board) were liked; the donut chart from r2-plan-audit was liked.
- **Round 3 (r3-*), direction confirmed by the user:**
  - **Two planning levels.** "My degree" is the outer view: degree progress plus a board of terms. "Open semester" on a term goes to an in-depth semester view.
  - **Courses open as a detail pop-up** (r3-course-modal, rated 4/5). It replaces the `/courses/:id` page.
  - **Dashboard feel:** dense, chart-led bentos, with deeper detail on tap so pages don't overwhelm.
  - **GPA-by-term chart:** coloured by difficulty, with a value on every point.
  - **Load as a gauge.**
  - **Rejected:** the requirements × terms grid (r3-degree-b) and the per-requirement donuts.
- **Style reference:** the user's developer-card repo (v2 branch, `docs/design/tile-design-standards.md`, `detail-modal-rework.md`) and the Apple bento skill. These guide the look; they aren't rules. What matters at a glance comes first, and nothing should be frustrating to reach.
- **Planner scope moves:** a multi-term degree board is planner milestone 2 (roadmap), brought forward by this design.

### Approved designs (rounds 4–9)

All paths are in `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/`.

- **Course detail pop-up** (`r5-course-1.png` for UW; `r5-course-2.png` for UVA, which has less data). It replaces `/courses/:id`.
  - **Black band:** code, credits and term; title, description and requirement / gen-ed chips. Then five big numbers: Avg GPA (coloured by difficulty), Got an A, D or F, Seats left, Students. Actions: Add to <term>, Save, Ask, Close.
  - **Tabs:** Grades (default), Instructors, Sections, Prerequisites, Unlocks.
    - Grades shows the average GPA by term, coloured by difficulty (green ≥ 3.4, amber, red < 3.0) with a value on every point. Below it: the grade distribution with a term picker, and grade bars per instructor.
  - **Right column:** a "Fits <term>" tile (credits before → after on the 12–18 band, then Load, Clashes, Prerequisites and requirement progress), and a prerequisite web (AND/OR inputs → course → courses it unlocks).
  - **Missing data:** the tab, tile or row is not shown. There are no "missing" or "not published" labels. At UVA there are no Prerequisites or Unlocks tabs, and a Sections tile (time, instructor GPA, Fits / Clash) takes their place.
- **My degree** (`r7-degree-1.png`), on the Courses page.
  - **Top bar:** Finish term, credits done / planned / open. Next to it, a 120-square waffle as one continuous rectangle, grouped by credit type (requirement groups, gen-ed, free electives). Each group is solid where earned, lighter where planned and dashed where open; a missing grade is hatched. A key gives counts.
  - **Terms:** columns that scroll sideways, plus a slim Past column with "See past". Each term column shows credits on the 12–18 band, a load label, courses with difficulty-coloured GPA chips and requirement tags, and "Open semester →".
  - **Undo and redo:** Material icons (`UndoRounded`, `RedoRounded`), with no text.
- **Semester view** (`r9-semester-1.png` for UVA; `r8-semester-2.png` for UW, with no week tile).
  - **Header:** breadcrumb back to My degree, previous / next term, undo and redo.
  - **Left column:** a Credits gauge with the 12–18 band, a Load gauge (Light / Balanced / Heavy, with harder / typical / easier counts), and a Degree requirements tile showing this term's gain per requirement.
  - **Main area:** wide course cards, one per row.
    - Left side of the card: code in the course's colour, GPA chip, credits, title, M–F day strip with time, instructor ★, prerequisite status.
    - Right side: section with a seats bar, requirement and gen-ed chips.
    - Hover: shows Swap section and Remove, and highlights that course's blocks in the week tile. There is no coloured card edge.
  - **Courses header:** search and "+ Add course".
  - **Week tile:** shown where the school publishes times; free time is hatched.
- **Event detail pop-up** (`r1-event-2.png` for UVA; `r1-event-3.png` for UW).
  - **Black band:** a big date block, title and category chips. Numbers: Starts in / Happening now, Time, Walk, Cost, Room.
  - **Bento:** image, About (clamped, with More), Details (event type, hosted by, room, registration), a map with walk time and Directions, a Tonight tile (where the student's class times exist), and lists of other events at the same place and in the same category.
  - **Missing data:** the tile is not shown.
- **Map place sheet** (`r1-place-2.png`). A side sheet replaces the list; the category chips and start place float on the map.
  - **Sheet contents:** a photo header with the Wikimedia credit (where Wikidata has an image), then name, category and operator. Next, a 2×2 of Walk, Open (ring), Floors and Access. Then the weekly hours with today highlighted, today's events at the place, address and website.
  - **Pinned actions:** Directions, Save, Ask, Call.
  - **Sparse place** (`r1-place-3.png`): only walk time, address and actions.

### Review decisions (passes 1–7)

**Pass 1: Information architecture (6/10 → 9/10)**

- **D3: Pop-ups leave chat usable.**
  - Course and event pop-ups and their scrim cover the page column only, between the rail and the dock. The rail and the chat dock stay live.
  - Ask keeps the pop-up open, attaches the item to the chat box and moves focus there.
  - About 860px wide at 1440. Below 1280 the right-hand tiles stack under the tabs.
- **D4: Drag sources and targets.**
  - **Semester view:** Search and "+ Add course" open a results list inline above the course cards. Rows drag into the course list.
  - **Dropping on the week tile** adds the course with the section that fits. If several fit, Swap section opens; if none fit, it opens with the clash shown. Class times are never invented.
  - **My degree:** course cards drag between term columns and onto "+" slots.
  - **Anywhere:** any course, event or place (pop-up header, card, list row, chat card) drags onto Saved in the rail and onto the chat dock.
- **D5: First-run and no-program states.**
  - **No program:** a "Program" picker takes the waffle's place.
  - **No past terms:** the Past column is hidden.
  - **Empty term:** dashed "+" slots only.
  - **Empty semester:** Credits gauge at 0, Load gauge hidden, and only Search and "+ Add course" in the course area.
  - **School with no program files (CU):** no waffle, requirement tiles or requirement chips. The term board, credits and Load stay.
  - **Default view:** Courses opens in Browse while the plan is empty, and in My degree once it has a course.
  - Mockups needed: the empty degree page and the CU degree page.
- **D6: One home for each piece of course data.**
  - **Pop-up tabs:** Grades · Instructors · Sections.
  - **Prerequisite web tile:** owns prerequisites. Its › opens the full graph, including Unlocks.
  - **Grades by instructor:** moves to the Instructors tab. The Grades tab gets a larger distribution.
  - **Big-number labels,** the same at every school: Avg GPA · Got an A · D or F · Seats left · Students. Any number a school lacks is left out.

**Pass 2: Interaction states (3/10 → 8/10).** The states are now specified but not yet drawn; see T11.

- **D7: Absent data and failed requests look different.**
  - **No data:** the tile, row or tab is not rendered.
  - **Loading:** skeletons for the black band, the big numbers and the default tab only. Secondary tiles fade in when ready, and the grid closes the gap if a tile never arrives.
  - **Broken image:** the photo or event image is dropped with no placeholder.
  - **Failed request:** "Couldn't load · Retry" in that tile or pop-up body.
  - **Failed plan edit:** the change reverts and "Couldn't save · Retry" appears.
  - **Chat:** the existing ThinkingIndicator while it answers.

| Feature | Loading | Empty | Error | Success | Partial |
|---|---|---|---|---|---|
| Course pop-up | Band + numbers + Grades tab skeleton | n/a (always a course) | "Couldn't load · Retry" in body | Full pop-up | Tabs and tiles a school lacks are not shown |
| My degree | Waffle + first term column skeleton | Program picker (D5), "+" slots | "Couldn't load · Retry" | Board | CU: no waffle or requirement chips |
| Semester view | Gauges + 2 card skeletons | Credits 0, no Load, Search + "+ Add course" | "Couldn't load · Retry"; failed edit reverts | Cards + week | UW: no week tile, no day strip |
| Event pop-up | Band skeleton | n/a | "Couldn't load · Retry" | Full bento | Image, categories, custom fields and Tonight not shown when absent |
| Place sheet | Name + walk skeleton | n/a | "Couldn't load · Retry" | Full sheet | Photo, hours, floors, access, website, phone, events not shown when absent |
| Drag and drop | — | — | Revert + "Couldn't save · Retry" | Toast "Added to <term>" + Undo | Clash / prerequisites needed / over limit shown on the card |
| Chat proposal | ThinkingIndicator | — | Existing chat error | Ghost preview (D9) | Stale card after a direct edit (D9) |

- **D8: Drag feedback.**
  - **Drag start:** valid targets get a dashed outline.
  - **Hover:** a solid outline and tint. The term header previews credits ("13 → 16").
  - **Drop:** the card settles, Undo lights up, and a toast reads "Added to Spring 2027" with Undo.
  - **Clash, missing prerequisite or over 18 credits:** the drop is allowed, and the card shows its state.
  - **Already planned:** the drop springs back and the existing card pulses.
  - **Save failure:** revert, then "Couldn't save · Retry".
  - **Escape:** cancels the drag.
- **D9: Proposals preview in the planner.**
  - **On the term the proposal touches:** incoming courses are dashed ghost cards, outgoing courses are faded and struck through, and the gauges show their after-values as ghosts.
  - **A direct edit while a proposal is pending** makes the chat card stale: Discard only, with the chat box pre-filled to re-ask.
  - **Accept from any page** applies the change without navigating, then shows a "Plan updated" toast with Undo.
  - **Undo:** Accept and direct edits share one undo / redo stack.

> From D10 on, decisions are the reviewer's recommendations, approved by the user in bulk ("approve everything you recommend", 2026-10-28).

**Pass 3: Journey and emotional arc (5/10 → 8/10)**

| Step | User does | User feels | Plan specifies |
|---|---|---|---|
| 1 | Opens Courses with no plan | Curious, unsure where to start | Browse first; My degree shows a Program picker (D5) |
| 2 | Picks a program | "It knows my major" | Waffle fills with earned credits in each group colour |
| 3 | Scans the term board | Oriented: "I finish May 2028" | Finish date, term columns, difficulty chips |
| 4 | Opens Spring 2027 | Focused on one term | Semester view with gauges, cards and week (D10 transition) |
| 5 | Drags a course in | In control | Target outlines, credit preview, toast + Undo (D8) |
| 6 | Asks chat "this feels heavy" | Helped, not overruled | Ghost preview, Accept / Discard (D9) |
| 7 | Opens a course pop-up | Confident about the choice | Band numbers, Fits tile, prerequisite web; chat still live (D3) |
| 8 | Comes back later | Trust | The plan is where they left it; scroll and term are preserved |

- **5 seconds:** the waffle and Finish date answer "am I on track".
- **5 minutes:** drag, ask and undo feel safe.
- **Long term:** the plan stays the one place the student trusts.

- **D10: Continuity.**
  - "Open semester" expands the term column into the semester view, and Back returns to the same horizontal scroll position.
  - After a drop, Accept or Undo, the affected cards and totals get a brief highlight (about 600ms, ease-out).
  - Hovering or focusing a course card highlights its week blocks.
  - Everything respects `prefers-reduced-motion` (no movement, highlight only).
  - There are no decorative entrance animations.

**Pass 4: AI slop risk (6/10 → 8/10).** Classifier: APP UI (OPERATE). Outside review flagged hard rejection #7 (stacked cards) on the semester view.

- **D11: Tighten the semester view; keep the user's layout.** The user chose wide course rows twice, so the layout stays, with these changes:
  - Course cards size to their content and never stretch to fill height.
  - The Credits and Load gauges are compact: about 150px tall each. The Degree requirements tile takes the freed height.
  - The week tile gets the space the shorter cards free up.
  - Metric tiles have no inner card-in-card borders.
- **D12: Remove remaining helper text.**
  - State labels are one or two words ("Preview", "Happening now", "Tonight").
  - Cut the school-name eyebrows ("University of Virginia", "UW–Madison") that the current pages don't have.
  - The waffle's missing-grade state is the hatch plus a count in the key, not "Grade?".
  - Cut "from Clemons Library" under the event map, and "35h free".
  - The chat box has one placeholder everywhere: the existing one.
- **D13: The "Finish" date is honest.**
  - Shown only when every requirement is planned and no grade is unknown.
  - Otherwise the slot shows the count of open requirements, in the student-life ink colour.
  - The credit total comes from the program file, never a fixed 120.

**Pass 5: Design system alignment (5/10 → 8/10).** DESIGN.md is still missing; the existing TODO stays open.

- **D14: Contrast.**
  - Coloured text always uses the `-ink` tokens: GPA values, "Heavy", course codes and chip text.
  - The bright domain colours are only for graphics (bars, gauge arcs, waffle squares, week blocks).
  - White labels sit only on ink-dark fills. For example, Directions is `--domain-campus-ink`, not `#1F9D55`.
  - Prior learning applied: domain-colors-fail-as-text (confidence 9/10, from 2026-10-27).
- **D15: New tokens.** Add to `brand-tokens.css`:
  - `--difficulty-easier|typical|harder`, each with an `-ink` and a `-tint`.
  - A 6-colour course palette, `--course-1…6`, each with an `-ink` (AA on white) and a `-tint`.
  - Gauge track and band tokens.
  - A dark band surface `--band-bg` with its own text tokens.
- **D16: Icons.**
  - The mockups' Material Symbols map to `@mui/icons-material` Rounded components, which the app already uses (UndoRounded, RedoRounded, MoreHorizRounded, SwapHorizRounded, CloseRounded, DragIndicatorRounded).
  - No icon font is added.
  - lucide-react stays wherever it's used today.

**Pass 6: Responsive and accessibility (3/10 → 8/10)**

- **D17: Chat dock by width.**
  - **≥ 1280px:** docked at 360px. It collapses to a 48px strip with the chat icon and an unread dot, and the choice is remembered.
  - **768–1279px:** collapsed by default, opening as a 400px overlay drawer without a scrim over the rail.
  - **< 768px:** the existing Ask tab opens a sheet (peek / half / full). Course and event pop-ups become full-screen pages, and Ask raises the sheet over them.
  - **Chat history:** New chat and a recent chat both replace the dock's conversation.
  - **Semester view below 1440px:** the gauges become a row of three compact tiles above the courses.
  - **My degree:** term columns are 280px minimum and scroll sideways at every width. On phones, a term column takes the full width and you swipe between terms.
- **D18: Everything you can drag, you can also do without dragging.**
  - **"Add to <term>" is a split button.** The default is the open semester, otherwise the next term; its menu lists the other terms. When the course is already planned, it reads "In Spring 2027" and the menu offers Move to… / Remove.
  - **Each card's ⋯ menu:** Move to…, Swap section, Remove.
  - **Keyboard drag:** dnd-kit with its keyboard sensor (Space lifts, arrows move, Space drops, Escape cancels).
  - **Announcements:** lift, over and drop in a polite live region.
  - **Pop-ups:** follow the WAI dialog pattern. Focus is trapped while open and returns to the trigger on close.
  - **Ask:** attaches the item without sending.
- **D19: No actions only on hover.** The ⋯ menu is always visible on cards. The Swap and Remove shortcuts also appear on focus. Every icon button has an `aria-label` and a tooltip, and Undo / Redo get disabled states.
- **D20: Saved as a drop target.**
  - **During a drag:** the Saved rail item becomes a drop zone (row outline; the bookmark fills on hover). It never navigates.
  - **On drop:** the count badge pulses up and the source's Save button switches to its saved state.
  - **Already saved:** only the badge pulses.
  - **Phone and tablet with the rail hidden:** no Saved drop target; use the Save button.
- **D21: The map uses one layout.**
  - The side sheet serves every place; a sparse place just has a short sheet.
  - Remove the header "Ask about this place" button; the sheet has Ask.
  - **On phone:** the place sheet replaces the list in the scroll area under the map.
  - The list keeps its selection and scroll position when the sheet closes.
- **D22: Text equivalents for graphics.**
  - **Waffle:** an accessible summary ("Economics B.A.: 70 earned, 44 planned, 6 open; Statistics 0 of 1") plus a visually hidden table.
  - **Prerequisite web:** a nested prerequisite list.
  - **Gauges:** `role="meter"` with values.
  - **Charts:** a hidden value list.
  - **Map pins:** mirror the list, which is the keyboard path.

**Pass 7: Unresolved decisions → resolved**

- **D23: Historical seats.** UVA seat counts carry their term ("Fall 2025"). "Fits" and "Clash" are checked only against published times for the planned term; where those don't exist, neither is shown.
- **D24: "Load" stays one word.** Its drill-down shows the inputs: the number of courses in the school's hardest third by average GPA. No longer label is added on the card.

### NOT in scope

- **Yelp, Google Places or any paid place data:** they need keys, have caching limits and cost money. Dining hours from school pages are a later option.
- **Walk times between classes:** no school publishes rooms (see `section-times-gaps`).
- **A public UW meeting-time source:** the existing TODO; the UW layouts are designed without times.
- **Dark mode for the new surfaces:** tokens are added in pairs (D15), but no dark mockups were made.
- **Motion beyond D10:** no entrance animations.

### What already exists (reuse)

- **Planner:** `PlannerContext`, `/api/planner/*`, proposals with Accept / Discard, the undo stack (it adds a redo pointer), `ProposalCard`, `CourseShortlistCard`.
- **Pages and components:**
  - `CoursesPage` search and level chips, and `CourseComparePage`.
  - The `CourseDetailPage` tabs, to be folded into the pop-up.
  - The Events views, its `.ics` export, `match_venue`, and walk times.
  - `CampusMapPage` with its Leaflet map, routing, `hours.py`, and the shared start-place picker.
  - `CampusRail`, including its phone tab bar with Ask.
  - `SaveButton`, `AppDialog`, `ThinkingIndicator`, `EnhancedChatInput` (placeholder prop), `Toast`.
- **Styles and icons:** `brand-tokens.css` (domain colours and their `-ink` / `-tint` pairs, `--font-mono`, `--focus-ring`), `@mui/icons-material`, `lucide-react`.

### TODOS.md updates

None new. The existing "Write a DESIGN.md for Campus Companion" TODO covers the design-system gap. It should now include the D15 tokens.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Effort ratios assume features take about 30× longer for a human team than for CC; the multi-term engine is architecture, at about 5×.

- [ ] **T1 (P1, human: ~3d / CC: ~2h)**: Chat dock. Make chat an app-level dock.
  - Surfaced by: D3, D17.
  - Files: `frontend/src/App.js`, new `components/ChatDock*`, `CampusRail.js`, `EnhancedChatInput.js`, `contexts/`.
  - Verify: Ask from a course pop-up keeps the pop-up open and focuses the dock at 1440. The drawer works at 1024. The sheet opens over a full-screen pop-up at 375.
- [ ] **T2 (P1, human: ~2d / CC: ~1h)**: Courses page. Add Browse / My degree / semester modes, the first-run defaults, and redirect `/courses/:id` to `/courses?selected=`.
  - Surfaced by: D5.
  - Files: `pages/CoursesPage.js`, `App.js`, `pages/CourseDetailPage.js` (retire).
  - Verify: an empty plan opens Browse, a non-empty plan opens My degree, and chat course links open the pop-up.
- [ ] **T3 (P1, human: ~3d / CC: ~2h)**: Course pop-up. Build it on the approved r5 design.
  - Surfaced by: D6, D7, D22, D23.
  - Details: band, three tabs, Fits tile, prerequisite web with a list equivalent, same labels at every school, absent and failed states.
  - Files: new `components/course/CoursePopup*`.
  - Verify: UW, UVA and CU each render with no empty tile; a forced API failure shows "Couldn't load · Retry".
- [ ] **T4 (P1, human: ~1w / CC: ~4h)**: My degree.
  - Surfaced by: D5, D13, D22.
  - Details: grouped waffle with an accessible summary, term columns, Past column, Finish rule, CU variant.
  - Depends on: the multi-term planner (planner M2); needs `/plan-eng-review`.
  - Files: new `components/planner/Degree*`, `backend/app/planner/` (roadmap).
  - Verify: the CU board shows terms with no requirement UI, and Finish is hidden while a grade is unknown.
- [ ] **T5 (P1, human: ~3d / CC: ~2h)**: Semester view.
  - Surfaced by: D10, D11, D24.
  - Details: gauges (`role=meter`), the Degree requirements tile, content-height course rows, and a week tile linked by hover and focus. Below 1440 the gauges become a row.
  - Files: new `components/planner/Semester*`.
  - Verify: there is no dead space in the cards at 1440, and the gauges sit in a row at 1280.
- [ ] **T6 (P1, human: ~3d / CC: ~2h)**: Drag and drop.
  - Surfaced by: D4, D8, D18, D20.
  - Details: dnd-kit with pointer and keyboard sensors, the named sources and targets, outlines, credit preview, toast + Undo, spring-back on duplicates, the Saved rail target, live-region announcements, the "Add to <term>" split button and "Move to…".
  - Files: `package.json`, new `components/dnd/*`, `CampusRail.js`.
  - Verify: Jest tests for the drop rules; a keyboard-only move between terms.
- [ ] **T7 (P1, human: ~2d / CC: ~1h)**: Proposals in the planner.
  - Surfaced by: D9.
  - Details: ghost cards and gauges, a stale card after a direct edit, Accept from any page with a toast, a shared undo / redo stack.
  - Files: `contexts/PlannerContext.js`, `components/planner/ProposalCard.js`, `backend/app/planner/store.py` (redo pointer).
  - Verify: dragging a course while a proposal is pending makes the card stale.
- [ ] **T8 (P1, human: ~1d / CC: ~30m)**: Tokens and contrast.
  - Surfaced by: D14, D15, D16.
  - Details: the difficulty, course palette, band and gauge tokens; coloured text through the `-ink` tokens; MUI Rounded icons.
  - Files: `frontend/src/styles/brand-tokens.css`.
  - Verify: an AA contrast check on every new text/background pair.
- [ ] **T9 (P2, human: ~2d / CC: ~1h)**: Event pop-up and data. Parse IMAGE, CATEGORIES, GEO and the Trumba custom fields, and keep the full description. Build the date-block bento pop-up.
  - Surfaced by: the approved design, D7, D12.
  - Files: `backend/app/sources/ical_events.py`, `api/routes/events.py`, `pages/EventsPage.js`.
  - Verify: a UVA event shows its image and cost; a UW event shows no empty tiles.
- [ ] **T10 (P2, human: ~2d / CC: ~1h)**: Place sheet and data.
  - Surfaced by: the approved design, D21.
  - Details:
    - Keep website, phone, wikidata, wheelchair, cuisine, levels, addr and the OSM id.
    - Fetch the Wikidata image and its credit at import time.
    - Make pins clickable and build the side sheet, including the phone version.
  - Files: `scripts/import_places.py`, `sources/places.py`, `pages/CampusMapPage.js`.
  - Verify: Alderman Library shows its photo and credit, and Monroe Hall shows a short sheet.
- [ ] **T11 (P2, human: ~1d / CC: ~30m)**: Mockups not yet drawn.
  - Surfaced by: D5, D8, D9, D17.
  - Covers: the empty and CU degree pages, the 1280 / tablet / phone dock, drag hover and failure, the proposal ghost preview.
  - Files: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/`.
  - Verify: the user approves them before T4–T7 ship.
- [ ] **T12 (P2, human: ~2d / CC: ~1h)**: Catalog data.
  - Surfaced by: the backend data section, D6, D23.
  - Details:
    - `/api/catalog/{id}` returns credits, gen-ed, per-term grade history, ratings, the prerequisite tree and next courses for every school.
    - Keep the UVA per-instructor grades and CU's `bldg`.
    - Stop hard-coding CU's term.
  - Files: `backend/app/sources/academics.py`, `csv_snapshot.py`, `tools/search_courses.py`.
  - Verify: pytest for each provider.

## Approved Mockups

| Screen | Mockup | Direction | Notes |
|---|---|---|---|
| Course pop-up (UW) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r5-course-1.png` | Black band, tabs, Fits tile, prerequisite web | D3: page column only. D6: three tabs and fixed labels |
| Course pop-up (UVA) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r5-course-2.png` | Same design with less data | No prerequisites; Sections tile |
| My degree | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r7-degree-1.png` | Waffle top bar, term columns, Past | D5 empty / CU states, D13 Finish rule |
| Semester (UVA) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r9-semester-1.png` | Gauges, requirements tile, wide course rows, week | D11: rows size to content |
| Semester (UW) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r8-semester-2.png` | No week tile | Sections per part |
| Event pop-up (UVA) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r1-event-2.png` | Date-block band + bento | D12: no "from …" caption |
| Event pop-up (UW) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r1-event-3.png` | Same with less data | Happening-now state |
| Place sheet | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r1-place-2.png` | Side sheet replacing the list | D21: one layout, no header Ask |
| Place sheet (sparse) | `/Users/macmini/.gstack/projects/NeonSeigne-CCAI-Demo/designs/tab-workspaces-20261028/r1-place-3.png` | Short version | Redraw as a short side sheet (D21) |

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | No DESIGN.md (TODO open); 5 UI areas        |
  | Step 0               | 3/10; focus: all five areas                 |
  | Pass 1  (Info Arch)  | 6/10 → 9/10 after fixes                     |
  | Pass 2  (States)     | 3/10 → 8/10 after fixes                     |
  | Pass 3  (Journey)    | 5/10 → 8/10 after fixes                     |
  | Pass 4  (AI Slop)    | 6/10 → 8/10 after fixes                     |
  | Pass 5  (Design Sys) | 5/10 → 8/10 after fixes                     |
  | Pass 6  (Responsive) | 3/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 2 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 50 generated, 9 approved                    |
  | Decisions made       | 22 added to plan (D3–D24)                   |
  | Decisions deferred   | 0                                           |
  | Overall design score | 3/10 → 8/10                                 |
  +====================================================================+
```

**Why no pass reaches 10:**
- The empty, CU, responsive, drag-state and proposal-preview layouts are specified but not drawn (T11).
- There is still no DESIGN.md.

**How the decisions were made:**
- D3–D9: decided one at a time by the user.
- D10–D24: the reviewer's recommendations, which the user approved in bulk.

### Unresolved Decisions

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | Outside review (design phase) + second review | Independent 2nd opinion | 1 | completed | Outside review: 11 findings, hard rejection #7; main review: 12 findings |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | Not run for this plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 8/10, 22 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** Outside review design phase completed with 11 findings, all folded into D3–D24. second review completed with 12 findings, all folded in.
- **CROSS-MODEL:** Outside review and main review independently agreed on:
  - pop-ups covering the dock;
  - undefined drag paths and failure states;
  - missing loading and error states;
  - dock behaviour at tablet and phone widths;
  - keyboard equivalents for drag.
  - Only Outside review raised: hard rejection #7 (stacked cards), coloured-text contrast, and data honesty (Finish, Load, historical seats).
  - Only main review raised: first-run / CU states, and the Saved drop target.
- **VERDICT:** DESIGN CLEARED. Eng review required: the plan brings planner M2 (multi-term) forward and adds dnd-kit, an app-level chat dock and new backend data fields.

NO UNRESOLVED DECISIONS
