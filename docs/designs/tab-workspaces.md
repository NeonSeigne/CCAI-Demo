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

## Eng Review (plan-eng-review, 2026-10-28)

Target: `docs/designs/tab-workspaces.md` (this file). Report file: this file.

### Scope record

- **Feature answers:** none asked; no cuts proposed.
- **Structure:** A, "Original arrangement" (D1, user answer, 2026-10-28; the user declined the recommended smaller arrangement).
- **Accepted scope:**
  - All five areas as designed: about 12 new modules and about 35 files `[estimated]`.
  - Separate pop-up systems for course, event and place.
  - Separate planner endpoints per screen.
- **Pending remedies:** R1–R7.
- **Scope Challenge result:** scope accepted as-is (MODE: FULL_REVIEW).

### Scope Challenge findings

1. `[CRITICAL] (confidence: 9/10) frontend/src/pages/ChatPage.js:37` — `const [messages, setMessages] = useState([]);` Every piece of chat state (messages, session id, streaming at `:450`) is local to ChatPage. A dock that "keeps one conversation as you move between pages" cannot share it. → R1
2. `[CRITICAL] (confidence: 9/10) backend/app/planner/store.py:20` — "At most one is pending: a new one replaces the old". The pop-up's "Fits" tile and the planner preview have no endpoint that doesn't save. Using `POST /api/planner/proposals` would silently replace a pending chat proposal. → R2
3. `[CRITICAL] (confidence: 8/10) docs/designs/tab-workspaces.md:250` — "a Tonight tile (where the student's class times exist)". The plan stores future terms (`store.new_plan(..., term)`) and completed courses without sections, so nothing records the student's classes today. → R3
4. `[INFORMATIONAL] (confidence: 9/10) backend/app/planner/store.py:18` — "There is no redo." The approved design adds a redo button (D16, r7-degree-1). → R4
5. `[INFORMATIONAL] (confidence: 8/10) frontend/package.json:7` — no drag-and-drop library. D18 requires keyboard dragging and touch support. → R5
6. `[INFORMATIONAL] (confidence: 8/10) frontend/src/App.js:93` — `path="/courses/:courseIdentifier"` (CourseDetailPage, UW-only `/api/courses`) remains a second course-detail path once the pop-up exists. → R6
7. `[INFORMATIONAL] (confidence: 8/10) backend/app/sources/ical_events.py:213` — `"description": _text(component, "DESCRIPTION")[:400]`. The event pop-up's About tile needs the full text. Folded into T9 (approved design scope); no question.
8. `[INFORMATIONAL] (confidence: 7/10) scripts/import_places.py` — the planned Wikidata photos need the author and licence of each Commons file for the credit line. → R7

### Architecture (Section 1)

```
 App.js providers:  Auth ─ Saved ─ Planner ─ Chat (new, R1) ─ Toast
                                                  │
  ┌──────────────┬──────────────┬─────────────┬──┴──────────┬─────────────┐
  CampusRail     CoursesPage    EventsPage    CampusMapPage  ChatDock (new)
  (Saved drop)   Browse│Degree│  (event       (place sheet)  ChatPage (full)
                 Semester       pop-up)
       │              │              │              │              │
  /api/saved    /api/catalog/*  /api/events   /api/places    /chat-stream
                /api/planner/*  (+image, categories, geo, custom fields, full description)
                  + /degree (new, every term)
                  + /preview (new, R2, no write)
                  + /redo    (new, R4)
  Course pop-up (?course=ID): /api/catalog/{id} + course_facts + /api/planner/preview
  dnd-kit (R5): sources → targets (D4): results→list, card→term, any→Saved|ChatDock
```

- **Design-twice:**
  - **Chat state:** a provider plus two views (picked, R1) versus ChatPage reused in the dock (rejected). The provider hides session, stream and retry behind `useChat()`: `{messages, send, attach, newChat, openSession}`.
  - **Pop-ups:** one shell (smaller arrangement, declined in D1) versus three systems (chosen).
- **Red flags:**
  - **Split ownership:** `ChatPage.js` owns chat state today; R1 fixes it.
  - **Two ways to do one task:** the course detail page and the preview; R6 fixes it.
  - **Hand-synced list:** the event and place partial-state rules exist only in this doc. Each pop-up maps a missing field to "not rendered" in one function per surface.
- **Production failure per new path:**
  - **Degree endpoint:** a provider times out for one term, and that term's courses come back "unavailable". The board shows unknown credits for that term, not zeros (D7).
  - **Preview:** a 409 when the plan revision moved. The Fits tile refetches once, then shows "Couldn't load · Retry".
  - **Redo:** refused, shown as "Couldn't save".
  - **Chat stream:** drops while on another page. The dock shows the existing error, and the page stays usable.
  - **Wikimedia at import:** rate-limited, so those photos are skipped. A rerun fills them in.

Findings: R8 (where the course pop-up can open) and R9 (attachment format) below.

### Code quality (Section 2)

- `[INFORMATIONAL] (confidence: 9/10) frontend/src/components/AppDialog.js:8` — `const inset = Math.max(0, Number(leftInset) || 0);`. AppDialog already offsets its scrim from the left for the rail. D3 needs the same offset on the right for the dock, so the three pop-ups can share it. → R10
- `[INFORMATIONAL] (confidence: 8/10) frontend/src/pages/ChatPage.js` (1,282 lines) and `EventsPage.js` (1,025 lines) — large files that the plan grows. R1 shrinks ChatPage. The event pop-up should be a new component, not more of EventsPage. This is covered by the original arrangement, so no question.

### Test review (Section 3)

Framework: Jest + React Testing Library (frontend, CRA); pytest (backend, `backend/.venv/bin/python -m pytest`).

```
CODE PATHS                                          USER FLOWS
[+] ChatProvider (new, R1)                          [+] Ask from a course pop-up
  ├── send / stream / error   [GAP] (4 tests today)   ├── [GAP] [→E2E] pop-up stays open, chip in dock
  ├── session switch / new    [GAP]                   └── [GAP] navigate mid-stream keeps reply
  └── attach item             [GAP]
[+] /api/planner/preview (R2)                       [+] Drag course → term
  ├── diff == proposal diff   [GAP]                   ├── [GAP] keyboard lift/move/drop
  └── no write, proposal kept [GAP]                   ├── [GAP] duplicate springs back
[+] /api/planner/redo (R4)                          │   └── [GAP] save fails → revert + toast
  ├── redo after undo         [GAP]                 [+] Degree board
  ├── cleared by new edit     [GAP]                   ├── [GAP] CU: no requirement UI
  └── refused / 409           [GAP]                   └── [GAP] empty plan → Program picker
[+] /api/planner/degree                             [+] Course pop-up per school
  ├── per-term credits/load   [GAP]                   ├── [GAP] UW / UVA / CU no empty tiles
  └── provider timeout term   [GAP]                   └── [GAP] API fail → Couldn't load · Retry
[+] ical_events new fields    [GAP]                 [+] Place sheet
[+] import_places photo/meta  [GAP]                   ├── [GAP] rich vs sparse place
[+] /courses/:id redirect R6  [GAP]                   └── [GAP] pin click selects list row
[★★ TESTED] planner edits/undo (test_planner_store_api.py)
[★★ TESTED] Events views (EventsPage.test.js, 20)   [★★ TESTED] Map list (CampusMapPage.test.js, 13)
COVERAGE: 2/24 paths tested (8%) | GAPS: 22 (1 E2E)
```

- **Regression risk:** the R1 refactor moves the chat logic behind `/chat`. That page has 4 tests today, which don't pin streaming, session switching or advisor replies. → R11 (regression contract)

### Performance (Section 4)

- `[INFORMATIONAL] (confidence: 8/10) backend/app/planner/service.py:77` — `return await load_facts(list(ids), term, provider=facts_provider)`. Facts are loaded for one term per call, with a 6s budget (`facts.py:97`). A degree board with 3–4 planned terms loaded term by term could take up to 18–24s `[estimated]` when a provider is slow. Scale: about 5 courses per term × 3–4 terms, so 15–20 provider calls per board load. → R12

## Decision ledger

### R1: Where chat state lives so the dock keeps one conversation
Finding: 1, CRITICAL, 9/10, frontend/src/pages/ChatPage.js:37
Plan baseline: D17 (chat dock on every page, one conversation); no owner chosen
Runtime evidence: chat state and streaming live only inside ChatPage (`ChatPage.js:37-82`, `:450`)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 owner of chat state | ChatPage local | new app-level ChatProvider; ChatPage and ChatDock are two views of it | ChatPage rendered inside the dock in a compact mode |
| R2–R7 | pending | pending | pending |
State: approved
Actual answer: A, "ChatProvider" (D2, user answer, 2026-10-28)
Accepted scope: Move session, messages and streaming from `ChatPage.js` into an app-level `ChatProvider`. ChatPage and the new ChatDock both read from it. Tests cover the provider and keep the existing ChatPage tests passing.
History: none

### R2: A preview that never saves
Finding: 2, CRITICAL, 9/10, backend/app/planner/store.py:20
Plan baseline: D9 (ghost preview), pop-up "Fits" tile; no endpoint chosen
Runtime evidence: `put_proposal` replaces the pending proposal (`store.py:229`)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R2 preview path | none | new `POST /api/planner/preview {ops}` returns the diff from `edits.diff`; nothing stored | Fits computed in the browser from the report |
State: approved
Actual answer: A, "preview endpoint" (D3, user answer, 2026-10-28)
Accepted scope: Add `POST /api/planner/preview {ops, expected_revision}`. It returns the same diff a proposal would, writes nothing, and leaves any pending proposal untouched. The browser caches it by the normalized ops payload and plan revision (corrected after Outside review's outside-voice finding 5: a per-course key mixed up previews for different terms and sections; this fixes a bug in the accepted scope and changes no approved behavior). Tests: the preview leaves the pending proposal and the revision unchanged, and its diff equals the diff of the equivalent proposal.
History: none

### R3: Tonight tile data source
Finding: 3, CRITICAL, 8/10, docs/designs/tab-workspaces.md:250
Plan baseline: approved r1-event-2 (Tonight tile where class times exist)
Runtime evidence: no current-term class schedule is stored anywhere
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R3 Tonight tile | designed | cut it; the other tiles fill the slot | show it only for events dated inside the planned term, using planned sections |
State: approved
Actual answer: A, "cut it" (D4, user answer, 2026-10-28)
Accepted scope: Remove the Tonight tile from the event pop-up; About and the map take its space. Remove "Tonight" from the D7 partial-state row and the D12 label list.
History: none

### R4: Redo
Finding: 4, INFORMATIONAL, 9/10, backend/app/planner/store.py:18
Plan baseline: D16 (undo and redo icons)
Runtime evidence: undo pointer exists; steps after the pointer are dropped only on a new edit (`store.py:178`)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R4 redo | none | `POST /api/planner/redo` re-applies `stack[pointer]` and advances the pointer; a new edit still clears the steps after it | no redo; hide the redo icon |
State: approved
Actual answer: A, "server redo" (D5, user answer, 2026-10-28)
Accepted scope: Add `POST /api/planner/redo {expected_revision}`. It re-applies `stack[pointer].ops` through the same validation as an edit and advances the pointer. A new edit still drops the steps after the pointer. A refused redo returns the reason, and the UI shows "Couldn't save". `view` returns a `redo_label`. Update the `store.py` docstring. Tests cover redo after undo, redo cleared by a new edit, a refused redo, and a revision conflict.
History: none

### R5: Drag-and-drop library
Finding: 5, INFORMATIONAL, 8/10, frontend/package.json:7
Plan baseline: D18 (keyboard dragging, live announcements)
Runtime evidence: no dnd dependency
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R5 library | none | `@dnd-kit/core` + `@dnd-kit/sortable` (keyboard and touch sensors, announcements) | native HTML5 drag events plus button fallbacks |
State: approved
Actual answer: A, "dnd-kit" (D6, user answer, 2026-10-28)
Accepted scope: Add `@dnd-kit/core` and `@dnd-kit/sortable`, pinned to exact versions. Use pointer, touch and keyboard sensors and the built-in announcer. Verify the React 19 install before the first drag work, because that premise is unverified.
History: none

### R6: Old course page
Finding: 6, INFORMATIONAL, 8/10, frontend/src/App.js:93
Plan baseline: design scope ("`/courses/:id` redirects")
Runtime evidence: CourseDetailPage and UW-only `/api/courses/{id}` still routed
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R6 old page | routed | redirect the route to `/courses?course=ID`, delete CourseDetailPage and `/api/courses/{id}` in the same change, move links | keep both behind the redirect for now |
State: approved
Actual answer: A, "redirect + delete" (D7, user answer, 2026-10-28)
Accepted scope:
- **Redirect:** `/courses/:courseIdentifier` redirects to `/courses?course=ID`.
- **Links:** CourseChip, CourseVisualCard, CourseAnswerCard, ChatPage and the plan panel open the pop-up instead.
- **Delete:** CourseDetailPage, its components used nowhere else, `/api/courses/{id}` and their tests.
- **Before deleting,** check that the pop-up covers the old Trends (GPA by term) and Schedule data.
- **Tests:** a redirect test, and the chat course chip opens the pop-up.
History: none

### R7: Photo credits
Finding: 8, INFORMATIONAL, 7/10, scripts/import_places.py
Plan baseline: approved r1-place-2 (photo with Wikimedia credit)
Runtime evidence: import keeps no image fields
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R7 credit data | none | fetch each image's author and licence (`extmetadata`) at import and store them with the thumbnail URL; skip images without a licence | show photos with a generic "Wikimedia Commons" credit |
State: approved
Actual answer: A, "author + licence" (D8, user answer, 2026-10-28)
Accepted scope: `scripts/import_places.py` reads Wikidata P18. For each image it fetches the Commons `imageinfo` (thumburl plus `extmetadata` Artist and LicenseShortName) with the repo User-Agent. It stores `photo: {url, author, license, page}` in places.geojson and skips any image without a licence. The sheet renders "Photo: <author> · <licence>", linked to the file page. Tests cover parsing a recorded `imageinfo` response and skipping a missing licence.
History: none

### R8: Where the course pop-up can open
Finding: Section 1, INFORMATIONAL, 8/10, frontend/src/components/visuals/CourseChip.js:22
Plan baseline: R6 (`/courses?course=ID`); chat cards appear in the dock on every page (D17)
Runtime evidence: chat course chips link to `/courses/:id` today
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R8 pop-up host | Courses page only | `?course=ID` opens the course pop-up over whatever page you're on (one host mounted at app level) | course links navigate to `/courses?course=ID` |
State: approved
Actual answer: A, "any page" (D9, user answer, 2026-10-28)
Accepted scope: A lazy-loaded `CoursePopupHost` mounted at app level reads `?course=ID` on any route. Course chips and cards add the param to the current location, and Back removes it. The R6 redirect still targets `/courses?course=ID`. Tests: a chip on the map page opens the pop-up without changing the path, and Back closes it.
History: none

### R9: Chat attachment format
Finding: Section 1, INFORMATIONAL, 7/10, frontend/src/components/EnhancedChatInput.js
Plan baseline: D3 / D4 (Ask and drag-to-chat attach an item)
Runtime evidence: `/chat-stream` takes text
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R9 attachment | none | chip in the composer; on send it becomes a short text line ("Course: ECON 3720 Intermediate Macroeconomics") before the message; no backend change | new structured `context_items` field on `/chat-stream`, passed to tools |
State: approved
Actual answer: A, "text line" (D10, user answer, 2026-10-28)
Accepted scope: Ask and drop-on-dock add one chip per item to the composer (course, event or place: type, id and title). On send, each chip becomes one line ("Course: <code> <title>", "Event: <title> · <date>", "Place: <name>") before the user's text. Nothing is sent until the user presses send. Tests: a chip is serialized on send, removing a chip drops its line, and Ask doesn't send.
History: none

### R10: Dialog primitive for the three pop-ups
Finding: Section 2, INFORMATIONAL, 9/10, frontend/src/components/AppDialog.js:8
Plan baseline: D1 original arrangement (three pop-up systems); D3 (scrim over the page column only)
Runtime evidence: AppDialog wraps MUI Dialog with a left inset
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R10 primitive | AppDialog (left inset) | all three pop-ups use AppDialog with a new `rightInset` for the dock | each pop-up builds its own modal |
State: approved
Actual answer: A, "AppDialog + rightInset" (D11, user answer, 2026-10-28)
Accepted scope: Add `rightInset` to AppDialog: the dialog and scrim stop at the dock's left edge. The course, event and place pop-ups use it. D3 says the dock stays usable, so the pop-ups pass `disableEnforceFocus` and use `aria-modal="false"`. Focus moves into the pop-up on open, Escape closes it, and focus returns to the trigger. Tabbing can reach the dock. Tests: the insets are applied, Escape closes the pop-up and returns focus, and the dock's input can take focus while a pop-up is open.
History: none

### R11: Regression contract for the chat refactor
Finding: Section 3, CRITICAL, 9/10, frontend/src/pages/ChatPage.test.js
Plan baseline: R1 (ChatProvider)
Runtime evidence: 4 tests cover a 1,282-line page
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R11 coverage | 4 tests | before moving any code, add characterization tests for send + streamed reply, a stream error, new chat, opening a saved session and an advisor reply; they must pass unchanged after the move | test only the new provider |
State: approved
Actual answer: A, "characterize first" (D12, user answer, 2026-10-28)
Accepted scope:
- **Before R1 moves any code,** add 5 tests to `ChatPage.test.js` (mocking fetch and the stream):
  - send + streamed reply renders;
  - a stream error shows the existing error;
  - New chat clears the messages and calls `/new-chat`;
  - opening a saved session loads its messages;
  - an advisor reply posts to `/reply-to-advisor`.
- **After the move,** they pass unchanged.
- **Add `ChatProvider` unit tests:** state survives a route change mid-stream, and send / newChat / openSession / attach.
History: none

### R12: Loading facts for the degree board
Finding: Section 4, INFORMATIONAL, 8/10, backend/app/planner/service.py:77
Plan baseline: D1 (separate `/api/planner/degree`)
Runtime evidence: `load_facts` handles one term with a 6s budget
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R12 loading | one term per call | one `asyncio.gather` across every planned term under one 6s deadline; terms past the data's coverage return offered "unknown"; a term that misses the deadline shows unknown | load terms one after another |
State: approved
Actual answer: A, "all terms, one deadline" (D13, user answer, 2026-10-28)
Accepted scope:
- **Loading:** `/api/planner/degree` loads facts for every planned term in one bounded batch (shared 6s deadline, concurrency 8). It reuses `load_facts` by grouping `(id, term)` pairs.
- **Uncovered terms:** a term outside `planner_terms()` skips its provider call and returns offered "unknown".
- **Missed deadline:** a term that misses it gets "unavailable" courses, shown as unknown credits and load.
- **Tests:** a slow provider for one term doesn't delay the others past the deadline; uncovered terms make no provider call.
History: none

### R13: Edits validate against the destination term
Finding: Outside voice 1, CRITICAL, 9/10, backend/app/planner/service.py:120, Outside review (verified)
Plan baseline: planner M1 validates every edit against `plan["term"]`; R12 adds multi-term reads only
Runtime evidence: `facts = await _facts(ids, plan["term"])` (`service.py:120`, `:135`); `move` keeps the old section ids (`edits.py:176`)
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R13 term-aware validation | one term | Apply: (1) `view`, `report_for` and `/preview` take an optional `term` and check `dict(plan, term=term)`, the same pattern as `suggest.py:81`; the semester view for any term uses it; (2) validation groups ops by destination term (`add.term`, `move.to_term`, otherwise `plan.term`) and loads each term's facts in one bounded batch (R12); (3) `move` clears `sections` unless the op gives sections for the new term | Keep: board edits to other terms validate against the planned term | Investigate again | Defer |
State: approved
Actual answer: A, "Apply" (D15, user answer, 2026-10-28)
Accepted scope:
1. **Per-term reports:** `view`, `report_for` and `POST /api/planner/preview` take an optional `term` and check `dict(plan, term=term)`. The semester view for any term uses this.
2. **Per-term validation:** `_validated_diff` and `apply_edit` group ops by destination term (`add.term`, `move.to_term`, otherwise `plan.term`) and load each term's facts in one bounded batch (R12).
3. **Move clears sections** unless the op gives sections for the new term.
4. **Tests:**
   - a move into a term where the course isn't offered is flagged;
   - a move clears sections;
   - the per-term view returns that term's courses and credits;
   - a two-term edit loads facts for both terms in one batch.
History: D14 answered C "Investigate first" (user, 2026-10-28). The bounded investigation found these single-term assumptions:
- `service.py:87` (`report_for`), `:120` and `:135` (validation), `:203` (suggestions);
- `checker.py:573-606` (report scoped to `plan["term"]`, other terms listed as "later");
- `edits.py:172` (add defaults to the plan term) and `:178` (move keeps sections).
An existing per-term pattern is `suggest.py:81` (`dict(plan, term=term)`). The chat `plan_summary` (`service.py:233-248`) already lists other terms and needs no change. Option A's scope was rebuilt from these findings.

### R14: What the degree waffle may claim
Finding: Outside voice 2, CRITICAL, 8/10, schools/uw-madison/programs/econ-ba.yaml:84, Outside review (verified)
Plan baseline: D13 (credit total from the program file; Finish shown only when everything is planned); approved r7-degree-1 waffle groups include "Gen-ed areas" and "Free electives"
Runtime evidence: program files encode major rules plus `total_credits` only; UW lists L&S requirements as "not encoded"
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R14 waffle groups | major groups + gen-ed + free electives | Apply: groups only for rules the program file encodes, plus one "Other credit" group up to `total_credits`; a program `complete: false` flag hides Finish | Apply A plus a new `gen_ed` rule kind (match by gen-ed tag; `n` or `credits`), with hand-checked UW breadth / Comm / QR and UVA Disciplines groups encoded so the waffle shows real gen-ed groups; Finish stays hidden while `complete: false` | Keep the approved groups | Defer |
State: approved
Actual answer: A, "Encoded groups" (D17, user answer, 2026-10-28)
Accepted scope:
- **Waffle groups** come only from the rules a program file encodes, plus one "Other credit" group that fills to `total_credits`. There is no gen-ed group, which replaces the "Gen-ed areas" and "Free electives" groups in r7-degree-1.
- **New program field:** `complete: bool` (default false). UW and UVA econ files are false today, and Finish is hidden while it's false (amends D13).
- **Tests:**
  - the groups match the encoded rules;
  - "Other credit" plus the groups equals `total_credits`;
  - Finish is hidden when `complete` is false.
History: D16 answered C "Investigate first" (user, 2026-10-28). The bounded investigation found:
- gen-ed tags exist (UW designations, `_uw_source.py:738`; UVA Disciplines, `csv_snapshot.py:508`);
- no rule kind matches by tag (`programs.py:38`), so encoding gen-eds needs a new `gen_ed` rule kind plus hand-checked rules;
- UW residency, language and the 108 L&S credits have no data source, so `complete` stays false at UW even with gen-eds encoded.
The options were rebuilt from these findings.

### R15: Keep the dock visible to screen readers while a pop-up is open
Finding: Outside voice 3, CRITICAL, 8/10, frontend/src/components/AppDialog.js:12, Outside review (verified)
Plan baseline: R10 (AppDialog + rightInset, `disableEnforceFocus`, `aria-modal="false"`)
Runtime evidence: MUI Modal sets `aria-hidden` on the siblings of its portal container, which would include the dock
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R15 container | portal to body | Apply: render pop-ups into the page-column element (MUI `container`), so only page-column content is hidden; test that the dock stays in the accessibility tree | Keep R10 as approved | Investigate | Defer |
State: approved
Actual answer: A, "Apply" (D19, user answer, 2026-10-28)
Accepted scope:
- **Container:** the app shell exposes the page-column element (a ref through context). Course, event and place pop-ups pass it as AppDialog's MUI `container`.
- **Insets:** with the container, the scrim and dialog already stop at the rail and the dock. R10's behaviour is met by the container, so its left and right insets are 0 there.
- **Tests:** with a pop-up open, the dock and rail have no `aria-hidden` and the page content does. Escape and focus return still work.
History: R10 approved scope stands; this adds the container requirement if A. D18 answered C "Investigate first" (user, 2026-10-28).
- **Investigation:** in MUI 9.2.0 (`Modal/ModalManager.js:39`), `ariaHiddenSiblings(container, …)` sets `aria-hidden` on every child of the modal's container except the modal itself. The container defaults to `document.body`, which hides the dock.
- **`container` (`Modal.js:248`)** sends the portal to a given element, so only that element's other children are hidden.
- **`disablePortal` (`Modal.js:271`)** renders in place. It doesn't fit the app-level `CoursePopupHost` (R8), which renders outside the page column.
- **`hideBackdrop`** removes the dimming, which D3 needs to keep.
- **Conclusion:** option A's `container` approach is the fit. Scroll lock then applies to the page column only, which matches D3.

### R16: Ghost preview for moves and section changes
Finding: Outside voice 4, INFORMATIONAL, 8/10, backend/app/planner/edits.py:354, Outside review (verified)
Plan baseline: D9 (ghost preview), R2 (preview endpoint)
Runtime evidence: the diff's `schedule.blocks` contains only added courses
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R16 diff blocks | added only | Apply: the diff gains `schedule.blocks_in` (added, moved-in or re-sectioned course blocks) and `blocks_out` (blocks that disappear); ghost preview draws both | Keep added-only | Investigate | Defer |
State: approved
Actual answer: A, "Apply" (D20, user answer, 2026-10-28)
Accepted scope: `edits.diff` returns `schedule.blocks_in` (the after-blocks of added, moved-in and re-sectioned courses in the shown term) and `schedule.blocks_out` (the before-blocks that disappear). `schedule.blocks` stays as an alias of `blocks_in` for the current PlanPanel until it migrates. The ghost preview draws `blocks_in` dashed and `blocks_out` faded. `CONTRACTS.md` is updated. Tests: move-in, `pick_section` and remove each produce the right in/out blocks, and an add-only diff matches today's output.
History: none

Approval readiness: PASS. R1 (D2), R2 (D3), R3 (D4), R4 (D5), R5 (D6), R6 (D7), R7 (D8), R8 (D9), R9 (D10), R10 (D11), R11 (D12), R12 (D13), R13 (D15, after D14 investigate), R14 (D17, after D16 investigate), R15 (D19, after D18 investigate), R16 (D20) all cite the user's answers. Structure: D1. TODO: D21.

## Eng Review Outputs

### NOT in scope

- **Shared pop-up shell (DetailHost):** declined in D1. Three pop-ups share AppDialog only (R10, R15).
- **Structured chat context (`context_items`):** declined in D10. Attachments are text lines.
- **Tonight tile:** cut (R3). There is no current-term schedule data.
- **Gen-ed rule kind:** deferred to TODOS.md (D21).
- **Redo across devices beyond the server stack:** redo follows the single server undo stack (R4).

### What already exists (reuse)

| Need | Existing | Use |
|---|---|---|
| Per-term check | `suggest.py:81` `dict(plan, term=term)` | R13 view/report/preview |
| Bounded fact loading | `facts.load_facts` (concurrency 8, 6s) | R12 degree board |
| Undo stack + pointer | `store.py:177-183` | R4 redo |
| Diff of two reports | `edits.diff` | R2 preview, R16 blocks |
| Dialog with focus/Escape | `AppDialog.js` (MUI Dialog) | R10 / R15 pop-ups |
| Graph rendering | `cytoscape` + `fcose` (`CourseVisuals.js`) | Prerequisite web |
| Charts | `recharts` | Gauges, grade bars, GPA line |
| Gen-ed tags | `_uw_source.py:738`, `csv_snapshot.py:508` | Course chips (waffle groups wait for the TODO) |
| Saved store | `SavedContext` | Saved drop target |

### Failure modes

| New path | Realistic failure | Test | User sees |
|---|---|---|---|
| ChatProvider stream | Stream drops after navigating | R11 provider test | Existing chat error in the dock |
| `/api/planner/preview` | Revision moved (409) | R2 test | Refetch once, then "Couldn't load · Retry" |
| `/api/planner/redo` | Edit no longer valid | R4 test | "Couldn't save" |
| `/api/planner/degree` | One provider slow | R12 test | That term shows unknown credits and load |
| Term-aware edit | Course not offered in the destination term | R13 test | Card shows not-offered state (D8 flagged drop) |
| dnd drop save | 500 from the planner | D8 / T6 test | Card reverts, "Couldn't save · Retry" |
| Course pop-up | Catalog API down | T3 test | "Couldn't load · Retry" in the body |
| Pop-up a11y | Dock hidden by the modal manager | R15 test | Dock stays reachable |
| Place photo import | Commons rate-limit | R7 test | Photo skipped; rerun fills it |

No failure mode is silent and untested, so there are 0 critical gaps.

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| E1 chat characterization + ChatProvider | frontend/src/contexts, frontend/src/pages (ChatPage) | — |
| E2 planner backend (R2, R4, R12, R13, R14, R16) | backend/app/planner, backend/app/api/routes, schools/*/programs | — |
| E3 data backends (events fields, place photos, catalog fields) | backend/app/sources, scripts, schools/*/places | — |
| E4 dialog container + pop-up hosts + old page removal | frontend/src/components (AppDialog, course, events, map), frontend/src/App.js | E1 (App.js shell) |
| E5 dnd-kit + chat dock + attachments | frontend/src/components (dnd, ChatDock), frontend/src/contexts | E1, E4 |
| E6 degree board + semester view UI | frontend/src/components/planner, frontend/src/pages (Courses) | E2, E5 |

- **Lanes:** Lane A is E1 → E4 → E5 (shared frontend shell). Lane B is E2 (independent). Lane C is E3 (independent). E6 follows A and B.
- **Execution order:** launch A, B and C. Merge B and C as they finish. After A merges, run E6.
- **Conflict flags:**
  - `frontend/src/App.js` is touched by E1, E4 and E5, so keep them in one lane.
  - `docs/designs/tab-workspaces.md` and `CONTRACTS.md` are touched by E2 (diff contract). Update them in E2 only.

### Eng Implementation Tasks

These amend design tasks T1–T12 above. Effort ratios: features ~30×, tests ~50×, architecture ~5×; human ÷ CC.

- [ ] **E1 (P1, human: ~3d / CC: ~2h)**: Chat. Characterization tests, then ChatProvider.
  - Surfaced by: R1, R11.
  - Files: `frontend/src/pages/ChatPage.js`, `ChatPage.test.js`, new `frontend/src/contexts/ChatContext.js`.
  - Verify: the 5 characterization tests pass before and after the move; provider tests pass.
- [ ] **E2 (P1, human: ~3d / CC: ~2h)**: Planner backend. Term-aware view and validation, preview, redo, degree endpoint, diff in/out blocks, `complete` flag with encoded-only groups.
  - Surfaced by: R2, R4, R12, R13, R14, R16.
  - Files: `backend/app/planner/{service,edits,store,programs,checker}.py`, `backend/app/api/routes/planner.py`, `backend/app/planner/CONTRACTS.md`, `schools/*/programs/*.yaml`.
  - Verify: `backend/.venv/bin/python -m pytest backend/app/tests -q`.
- [ ] **E3 (P2, human: ~2d / CC: ~1h)**: Data backends. Event fields with the full description, place photo + author + licence, catalog fields for all schools.
  - Surfaced by: R7, T9, T10, T12.
  - Files: `backend/app/sources/ical_events.py`, `scripts/import_places.py`, `backend/app/sources/academics.py`.
  - Verify: pytest for each provider, plus a recorded `imageinfo` fixture.
- [ ] **E4 (P1, human: ~3d / CC: ~2h)**: Pop-ups.
  - Surfaced by: R3, R6, R8, R10, R15.
  - Details: the page-column container, AppDialog `container` / insets, the app-level `CoursePopupHost` (`?course=`), the event pop-up without Tonight, the place sheet. Redirect `/courses/:id` and delete CourseDetailPage and `/api/courses/{id}`.
  - Files: `frontend/src/App.js`, `frontend/src/components/AppDialog.js`, new pop-up components, `backend/app/api/routes/courses.py`.
  - Verify: Jest a11y test (dock not `aria-hidden`), redirect test, chip on `/map` opens the pop-up.
- [ ] **E5 (P1, human: ~3d / CC: ~2h)**: Drag and drop + dock.
  - Surfaced by: R5, R9, D17, D18.
  - Details: dnd-kit (pinned) with keyboard and touch sensors, attachment chips as text lines, dock breakpoints.
  - Files: `frontend/package.json`, new `frontend/src/components/dnd/*`, `ChatDock`, `EnhancedChatInput.js`.
  - Verify: keyboard move between terms; a chip is serialized on send; Ask doesn't send.
- [ ] **E6 (P1, human: ~1w / CC: ~4h)**: Degree board and semester view on the term-aware API.
  - Surfaced by: R12, R13, R14 (with design D5, D8–D11, D13).
  - Files: `frontend/src/components/planner/*`, `frontend/src/pages/CoursesPage.js`.
  - Verify: CU board with no requirement UI; Finish hidden while `complete` is false; the semester view for Fall 2027 shows that term's report.

### Eng completion summary

- **Step 0, Scope Challenge:** scope accepted as-is (Original arrangement, D1).
- **Reality rows:** 7/7 tier-1 rows emitted, 1 unverified premise (dnd-kit on React 19, to verify at install, R5).
- **Architecture review:** 2 issues (R8, R9).
- **Code quality review:** 2 issues (R10, plus the large-file note).
- **Test review:** diagram produced, 22 gaps identified (regression contract R11).
- **Performance review:** 1 issue (R12).
- **NOT in scope:** written.
- **What already exists:** written.
- **TODOS.md updates:** 1 item proposed and added (D21).
- **Failure modes:** 0 critical gaps.
- **Unresolved decisions:** 0 in this review.
- **Outside voice:** Outside review, completed, 5 findings. 4 became decisions (R13–R16); 1 was a correction to R2's cache key.
- **Parallelization:** 3 lanes, 2 parallel and 1 sequential (E6 after A + B).
- **Lake Score:** 4/16, the answers that picked a 10/10 option out of those scored for completeness.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | Outside review `outside review exec` (plan-review + design phases) | Independent 2nd opinion | 2 | completed | plan-review: 5 findings (4 decisions R13–R16, 1 correction to R2); design: 11 findings folded into D3–D24 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 27 issues, 0 critical gaps (all 16 decisions resolved; tasks E1–E6) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score: 3/10 → 8/10, 22 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:**
  - **Plan-review phase:** Outside review completed with 5 findings. All 5 were verified against code (`service.py:120`, `econ-ba.yaml:84`, `ModalManager.js:39`, `edits.py:354`, `edits.py:172`) and resolved.
  - **Design phase:** Outside review completed with 11 findings, resolved in the design review.
- **CROSS-MODEL:** The main review's sections found the single-owner chat state (R1), the saving preview (R2), the Tonight data gap (R3), redo (R4) and degree loading (R12). Outside review alone found:
  - term-aware validation (R13), confirmed by a bounded investigation;
  - over-claiming in the waffle (R14), confirmed;
  - MUI `aria-hidden` on the dock (R15), confirmed in MUI 9.2.0 source;
  - missing ghost blocks for moves (R16), confirmed;
  - the R2 cache key, confirmed.

  The two models agreed on the R2 / R10 direction. Outside review extended both.
- **VERDICT:** DESIGN CLEARED. ENG REVIEWED: every decision is resolved and the status is issues_open only because mapped work remains (E1–E6). Ready to implement.

NO UNRESOLVED DECISIONS
