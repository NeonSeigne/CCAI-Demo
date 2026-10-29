# Home Colors: aligning the app with the approved mockups

Source of truth: the approved mockups in `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (open `index.html`; PNGs in `png/`) and [DESIGN.md](../../DESIGN.md). Earlier approved mockups still apply where this set has no screen: first-run B (`first-run-20261029/`), the Semesters board (r7-degree-1) and the Semester view (r9-semester-1).

The six audits behind this plan are in [alignment-audit/](alignment-audit/). They list over 500 differences, each with the mockup file and selector, the app file and line, and a size:

| Audit | Covers |
|---|---|
| [audit-1-shell-ask.md](alignment-audit/audit-1-shell-ask.md) | Rail, phone header and tab bar, theme toggle, Ask home, chat page, composer, Ask dock, menus, Settings |
| [audit-2-chat-cards.md](alignment-audit/audit-2-chat-cards.md) | Course card, difficulty and grades, sections that fit, events and place in an answer, prerequisite graph, proposed change |
| [audit-3-events.md](alignment-audit/audit-3-events.md) | Events page and event detail |
| [audit-4-map-popup.md](alignment-audit/audit-4-map-popup.md) | Campus map, place card and course pop-up |
| [audit-5-degree.md](alignment-audit/audit-5-degree.md) | My degree (map and Semesters), Semester view and the setup dialog |
| [audit-6-unmocked.md](alignment-audit/audit-6-unmocked.md) | Screens with no mockup, a sweep of all CSS, and dead code |

Item numbers below (for example `3:A1`) point to audit 3, item A1.

## Where things stand

Phases 0 to 3 of [home-colors-build.md](home-colors-build.md) gave the app the school roles, fonts, icons and the transit map. They restyled what was there. In most places they didn't change the layout to the mockup's. The gaps fall into five kinds:

1. **Layout differs.** Examples: the map page's place card and phone layout, the course pop-up's columns, My degree's title row, counts row, Requirements panel and detail card, and the chat page's side panel.
2. **Extra things the mockups don't have.** These include school-name lines above titles, timezone and source lines, extra buttons (Directions, Call, Save), extra tiles and the walking-route panel. Under DESIGN.md and the no-added-text rule, these go unless a decision below keeps them.
3. **Missing things.** Missing pieces include the account menu, the ⋯ menu items, thumbs feedback, "Your classes today", Compare in the pop-up, "Nothing listed today" states, the program menu and the event actions sheet.
4. **Data the mockups need but the backend doesn't send.** Event kind and host, place type, course rating, waitlists, section times for UW, prerequisites for UVA and CU, and course cards outside UW.
5. **System leftovers.** Breakpoints are 767 and 1280 where DESIGN.md says 700 and 1100. Ten stylesheets never use the heading font. Tailwind still maps retired tokens. Other leftovers: MUI's uppercase `overline`, mono course codes on Courses, Saved and Semester view, and about 1,800 lines of dead CSS and components.

Some screens have no mockup at all: Courses Browse, Compare, Saved, Search chats, Settings, Sign-in and the landing page, Help, and the loading, empty and error states. A system sweep can only bring them partway; they need mockups first (Phase 9).

## Decisions needed before building

Each decision follows the rule "the mockup wins" unless you choose otherwise. Where following the mockup would remove something people use, I've said so.

| # | Question | Recommendation |
|---|---|---|
| D1 | **Course pop-up.** The mockup has one 640px column: three tiles, Grades, Sections, Prerequisites, then Add to plan, Compare and Save. The app has five tiles, Grades/Instructors/Sections tabs, a GPA-by-term chart, a "Fits" side column and the prerequisite graph. | Follow the mockup. Add the instructor list and GPA by term back only if you ask for them; the course page would be their home. |
| D2 | **Walking-route panel on the map** ("Starting from · Change", metres, Open in OpenStreetMap, the route line). The mockup has none; the place card's Walk tile and Directions button cover it. | Remove the panel. Keep the start place as a setting that the Events page shares ("Starting from Red Gym · Change" stays on Events, where the mockup has it). |
| D3 | **The Ask dock on Map, My degree and the course pop-up.** The mockups show the dock only on Events. | Show the dock on Events and on any page where the student opens it. Leave it closed by default on Map and My degree. |
| D4 | **Chat side panel** ("This answer / On campus"). The mockup has one centered 760px column with the "Checked" chips inline. | Remove the panel. |
| D5 | **Rail extras:** New chat, All chats, icons on Recent rows, the Saved count. The mockup has none of them. | Remove the icons and the Saved count. Keep New chat as the Ask item (Ask always opens a fresh Ask home). Move All chats into the ⋯ menu as "Search chats", which is how the mockup reaches it. |
| D6 | **Kept wordings** that DESIGN.md contradicts: "Unlocks" vs "Also opens", and Accept/Discard vs Apply/Not now. | Use the mockup's words and leave DESIGN.md as it is. |
| D7 | **Data the mockups show that we don't have** (see Phase 3). | Build what the sources have. Where no source exists (UW waitlists, course ratings at UVA), the tile or tag is left out, not faked. |
| D8 | **Dead code:** Canvas, Sidebar, advisor personas, the provider dropdown and about 1,450 lines of old `components.css`. | Decided (R4, D4): delete all of it, personas included. Expect a merge conflict with dev #87 (24917c2), which changes the persona config draft. |
| D9 | **Screens with no mockup.** | Mock them up first (Phase 9), in one design pass, before restyling. |
| D10 | **Pop-up backdrop.** The tab-workspaces design keeps the dimmed backdrop off the rail and the Ask dock, so both stay usable while a pop-up is open (`AppDialog.js:53`). The new mockups dim everything. | Decided (R1, D2): keep the rail and dock live; only the page column dims. Phase 10 treats this as an intended difference. |

## Phases

The order is:

1. Rules and cleanup, so every later phase builds on the right base.
2. Shared modules, so the lanes edit tested modules plus layout instead of copies of the same rules.
3. Data.
4. One lane per screen group (Phases 4 to 8). The lanes touch separate files and can run in parallel. Phase 2 removes the files they would otherwise share: `Popups.css`, `CoursePopup.js` and the pages that each render their own rail.
5. Mockups for screens that have none.
6. A final pixel check.

The frontend architecture review behind Phase 2 is [architecture-review-frontend.html](alignment-audit/architecture-review-frontend.html), with a text version in [architecture-review-frontend.md](alignment-audit/architecture-review-frontend.md). Its candidates are numbered C1 to C9 below.

### Phase 1: System rules and cleanup (M)

This changes every screen a little and stops later phases from fighting leftovers.

1. **Breakpoints and the viewport module (C9).**
   - Add `--bp-phone: 700px` and `--bp-desktop: 1100px` to the token docs.
   - Add one `useViewport()` hook that returns phone, tablet or desktop, built on those two widths. It replaces:
     - `ChatDockContext.js:17-18` (1280/768);
     - EventsPage's `usePhone`, CoursesPage's `isPhone` and ChatPage's MUI `md` check;
     - the `useMediaMatch` copies.
   - Replace all 13 widths now in the stylesheets (767 appears 23 times) and MUI's breakpoints with 700, 1100 and 1280 (1:cross-cutting, 3:B11, 4, 6). The dock's `DOCK_WIDE` (1280px, `ChatDockContext.js:17`) already matches design Q18 and stays; `DOCK_MEDIUM` (768px) becomes 701px, the tablet drawer.
   - Move the copied `useDelayedFlag` and `isAbort` helpers into `utils/`.
2. **Base type.** Add `h1–h4` rules in `index.css` that use `--font-display`. Set the body to 15px, weight 500, line height 1.5, with tabular numbers. Then remove per-page heading fonts that duplicate it (6:1, 6:6).
3. **Tailwind and `index.css`.** Point the config at the current roles, or remove the Tailwind layers the app no longer uses. Fix `.surface-card` and `.btn-primary`, which still fill with retired tokens (6:3).
4. **MUI theme.** Set `shape.borderRadius` to 1 so `sx` radii match the scale. Make `overline` regular case. Restyle inputs, toggle groups, Alert, Snackbar and error buttons to the system. Stop forcing `ListItemButton` into pills (6:4, 6:7).
5. **Codes.** Use `--font-code` (Unbounded) for every course code and code-like number: Courses, Saved and Semester view (6:5, 5:12).
6. **Shared bits.**
   - Tags become full pills.
   - Cards lose any shadow the mockup doesn't have.
   - Difficulty colours become the mockup's #7FDCA4, #F5B36E and #FF8F87 on the dark band, and follow school overrides (2:15, 4:band).
   - SaveButton gets a radius on the scale.
   - Fix the double-inverted dark map tiles (2:13).
   - Fix the pill-shaped Login and Signup cards on phone (`Login.css:419`, `Signup.css:409`).
7. **Text rule sweep.** Remove these from every page:
   - school-name kickers above titles;
   - timezone, source and helper lines;
   - "Welcome back" subtitles;
   - footnotes;
   - the emoji file icons and the ✨ system message.

   A line stays only where a mockup has it (1, 3:A1, 3:C1, 4:1.1, 6:10, 6:11).
8. **Dead code (D8).** Delete:
   - `components.css:4-1458` and `ChatPage.css:761-1105`;
   - `Sidebar.js` and `Sidebar.css`, plus the advisor and provider components the audit lists;
   - `ChatInput`, `SuggestionsPanel` and the `/canvas` route.
   - The persona UI (R4): AdvisorCard, AdvisorCarousel, AdvisorConfigPanel, AdvisorSidebarPicker, AdvisorStatusDropdown, AvatarPickerModal, HybridConfigModal, WelcomeModelPicker, ProviderDropdown (about 1,650 lines), and the persona keys in AppConfigContext.

   Then give each stylesheet its own class prefix. Today several global classes are defined in more than one stylesheet: `.error-message` and `.input-container` (3), `.cc-btn` (3), `.user-message` (5), `.main-textarea` (3) and `.cc-dialog` (2) (6:15, C9). Deleting dead code first removes most of these, and with them most of C5's and C6's surface.
9. **School short name.** Add `short_name` to `schools/*/school.yaml` (UVA, CU Boulder, UW–Madison). The rail and phone header use it (1:10).
10. **The shell owns the rail, the account menu and Settings (C2).**
    - Today six files each render `<CampusRail>` with the same five handlers, plus their own Settings flag, sign-out handler and `<SettingsModal>`: CampusPageShell, Home, Chat, Events, Map and Saved.
    - `AppShell` renders the rail, the phone header and tab bar, Settings and sign-out once. Pages render only their main region.
    - ChatPage's in-page rail (`RAIL_IN_PAGE`) goes.
    - The seven test files that mock CampusRail and SettingsModal drop those mocks.

    After this, lane A's rail, account-menu and phone-shell work touches the shell, not the pages that lanes B, C and E own.

11. **Screenshot script (R6, moved from Phase 10.1).** A script in `scripts/` signs in with the dev account at each school and opens each mockup screen in a seeded state with a fixed date (a seeded plan, a selected place, an open pop-up). It screenshots each at 1440×900 and 390×844, light and dark: 156 images. Run it once at the end of Phase 1 to capture the baseline Phase 2 is checked against. With design Q17 and Q18 it also covers 900px and 1280px: 312 images in all, with lanes running one school per change and the full set at phase ends. At 390px it fails any visible icon button whose box is under 44×44px (design Q19).

Done when: both suites pass, the old QA sweep stays clean, and the token test fails on:

- any media width other than 700, 1100 and 1280 (design Q18);
- `--font-mono` used outside chat code blocks;
- a class prefix defined outside its owning stylesheet.

### Phase 2: Shared modules (frontend architecture; M–L)

Each step puts rules that are now copied in several places behind one small interface with its own tests. The lanes then mostly change layout. Steps 1, 3 and 7 are pure modules and can run in parallel; steps 4 to 6 each own one area of the UI.

1. **Campus module (C7 + C3, D1).** One `useSchool()` returns `{name, shortName, mark, timezone, zoneLabel}`, and the same module holds the time and walk wording in step 3.
   - Today 12 files read `config?.app?.institution || config?.app?.title || …` or `config?.school?.timezone` themselves (20 call sites), each with its own fallback text. `planFormat.js` hard-codes `SCHOOL_SHORT`, and CampusRail builds the mark on its own.
   - AppConfigContext's value has 17 keys, 14 of them for advisors and personas. Those keys go with D8, leaving the school module as the context's main reader.
   - The start place (campus origin) is fetched separately by Home, Events, Map and Saved. It moves here as `useStartPlace()`, the shared setting that D2 needs.

   Size S.
2. **Course facts module (C1).** `courseFacts(payload, school)` returns:
   - the stat tiles, each left out when there's no data;
   - grade bars grouped by letter per school, every student kept (R11): UVA A, B, C, DFW; UW A, AB, B, BC, C, D/F;
   - section rows tagged "84 seats" or "4 waiting";
   - prerequisite tags with the student's states;
   - difficulty as sent by `/api/catalog/{id}` (R5); the module never computes it.

   Small render pieces (GradeBars by size, SectionRows, PrereqTags, CourseTiles) serve the pop-up, the chat cards, Courses and the Semester view.
   - This fixes a live bug (R5 decides the fix: the backend owns the rule). Three files hard-code "harder below 3.0" (`popupFormat.js:4`, `degreeFormat.js:40`, `semesterData.js:44`), so a UW course with a 3.2 GPA shows as Typical when UW's rule says Harder.
   - The chat card stops importing `GradeDistribution`, `SectionsTab`, `InstructorsTab` and `GpaByTerm` from `CoursePopup.js` (`CourseVisualCard.js:11-13`). After that, lanes C and D no longer share that file.

   Size M–L.
3. **Campus time and walk wording (C3).** `eventWhen(event, tz, now)`, `walkText(minutes)`, `openUntil` and `weekHours`, with `now` passed in.
   - They replace six `toLocaleTimeString` wrappers and the time functions that five files import from the chat event card (`EventListCard.js`).
   - They also replace seven ways of writing a walk ("9 min walk", "~9 min", "Your starting place"…) and the two different `clockText` functions in `osmHours.js` and `planFormat.js`.
   - The mockups' rules then live in one place: "12:00 to 1:00 PM", "N min", "Here", "2 h 40 m", "7 AM – 11 PM" and "Friday".
   - Passing in `now` gives Phase 10 its fixed date.

   Size S–M.
4. **One pop-up host and band sheet (C4).** The shell hosts `?course=`, `?event=` and `?place=`, so the event pop-up and the place card open from any page, as the course pop-up already does.
   - One band sheet module owns the dark band, the 3 or 4 tiles, the actions row, the backdrop (D10), the phone sheet, and the loading and error states.
   - It replaces four builds of the band: EventPopup `Stat`, CoursePopup `Band`, PlaceSheet `Tiles` and SetupDialog's band.
   - It replaces two copies of the AppDialog call.
   - `Popups.css` (1,091 lines) splits along the same lines, into band sheet, event, course and place stylesheets.

   Size M.
5. **One conversation thread (C5).** `<Thread variant="page|dock">` reads `useChat()` and owns:
   - the answer text;
   - the cards;
   - the Checked chips;
   - the action row (copy and thumbs).

   It replaces the two copies in `ChatPage.js:445-525` and `DockConversation.js:32-77`, which have drifted apart. The dock still opens courses through the old `/courses/ID` redirect and drops clarification messages. MessageBubble's advisor-era wrapping goes with D8. A test can then check how an answer looks without mocking seven modules. Size M.
6. **One composer (C6).** `<Composer surface="home|chat|dock">`, bound to the chat. The surface decides the +, the mic, the scope chip and the placeholder.
   - It replaces `EnhancedChatInput` (577 lines, 31 props, 12 to 15 passed through from `useChat()` by each caller) and Home's hand-built form.
   - Focus goes through the dock state instead of `document.querySelector('.chat-frame textarea')`.
   - Its styles come together into one stylesheet; today they are spread over four.

   Size M.
7. **Course data loader (C8).** One cached `useCourse(id)` with an HTTP adapter for the app and an in-memory adapter for tests.
   - It replaces two module-level caches (`hooks/useCourseDetail.js`, `semester/useCourseDetails.js`).
   - It also replaces the uncached request hooks in `useCampusDetail.js` and four direct page fetches (Home, Courses, Compare, Saved).
   - Two hooks are both named `useCourseDetail` and have different interfaces.
   - Today the pop-up and the chat card fetch the same course twice.

   Size S–M.

8. **Panel states (design Q4).** One shared piece per DESIGN.md's States rule: loading is the real layout in raised; empty is "Nothing listed today" with an icon; error is ink text with an icon and Retry. The band sheet, panels and chat cards use it.

Each module first reproduces today's rendering; the lanes switch on the mockup's presentation. Done when: each module has tests through its own interface, no screen looks different apart from difficulty labels (R5) (a screenshot check of the main screens before and after), and both suites pass. Phase 2 changes structure only. The visual changes stay in the lanes.

### Phase 3: Data the mockups need (backend, M–L; can run alongside Phases 1 and 2)

Each item feeds a later lane. All of it goes through existing pydantic contracts and `CONTRACTS.md`.

| Item | Feeds | Source |
|---|---|---|
| Event `kind` (academic, campus life, arts, athletics, career…), `host`, `cost`, `place_name` (the matched place's name, not the raw location) | Events dots, pop-up eyebrow and tiles, chat event list | Feed category fields mapped per school; place match already exists |
| Place `type` label ("Student union", "Academic building") and `floors`, `access` | Place card band and tiles | OpenStreetMap tags already fetched |
| Course cards and difficulty cards for every catalog provider, not only `uw_coursemap` (`visuals.py:273-281`) | Chat course and grades cards at UVA and CU | Each school's catalog and grades data |
| Prerequisite chains (prerequisites of prerequisites) and a `course_prereq_map` builder for chat | Chat prerequisite graph, pop-up prerequisites | UW has the data; UVA and CU need prerequisite parsing from the catalog |
| Section meeting times, instructor and `waitlist` per section | Section rows ("41 seats" / "4 waiting") | Where the snapshot has them; leave the tag out where it doesn't |
| Course `difficulty` (easier, typical, harder, null) from the planner's per-school rule (R5). Build this first: Phase 2.2 reads it | Every difficulty label | `csv_snapshot.py:600` and the UW source's `harder_below_gpa` |
| Course `instructor_rating`: mean of the ratings of instructors teaching the plan term's sections (design Q15) | Pop-up "Instructor rating" tile | Instructor ratings where they exist; tile hidden otherwise |
| Answer feedback endpoint (thumbs up/down) | Chat action row | New small endpoint and store field |
| Chat `pinned` and rename | ⋯ menu | Store fields |
| Full recent-chat titles (stop cutting with "...") | Rail Recent | `chat_sessions` title |
| Degree payload: selected course's section, "opens", slot wording for not-placed rules, the graduation term | My degree detail card, Not placed, Route to graduation | `degree.py` and the plan's sections |
| Proposal diff: per-term credits, prerequisite check, and the `courses.moved` row the UI ignores | Proposed change card | `edits.py:443-470` |
| Shortlist: a clash-free section per suggestion (via `checker.check_schedule`), its meeting time, GPA, and a "Clashes" mark when none fits (R9) | "Fits your schedule" | `suggest.py:80-104`, `checker.py:501` |
| "Your classes today": today's meetings from the plan, only on weekdays between the term's first and last day of classes, which each school.yaml gains from its official calendar; hidden when the dates are missing (R12) | Ask home side column | Plan sections; each school's academic calendar |

Done when: each field is in `CONTRACTS.md`, has a unit test, and shows in the payload at all three schools (or is documented as missing at a school).

### Phase 4: Shell, Ask home, chat and dock (lane A; M–L)

Files: `components/shell/*`, `CampusRail.js`, `AppShell.css`, `CampusRail.css`, `CampusHome.css`, `HomePage.js`, `ChatPage.js`, `ChatFrame.css`, `ChatPage.css`, `ChatDock.js`, the Composer and Thread modules from Phase 2, `ChatMoreMenu.js`, `ExportButton.js`, `SettingsModal.js`, new menu components.

1. **Rail (D5).** Short name on one line. Plain Recent rows. No Saved count. The user row is an avatar button that opens the account menu.
2. **Phone shell.** Keep the school header and tab bar on every page, including chat. Remove the hamburger and slide-out rail on /chat. The phone header shows the mark, "Campus Companion" and the toggle; remove the extra settings button.
3. **Ask home.**
   - The Phase 2 composer (`surface="home"`) with +, the scope chip ("Courses, events and places"), the mic and Send.
   - The Next up header gets "Times in X Time", the mockup's time format ("12:00" over "to 1:00 PM"), and no Directions chip or source footnote.
   - The side column holds "Your classes today", then Saved rows with a 104px code column and the title. Each panel shows only when it has rows; if both hide, Next up takes the full width. Next up shows "Nothing listed today" with an icon when empty (design Q6).
   - On phone: no Recent card and no second action row. A 44px history icon at the right of the title row opens Search chats (design Q21).
4. **Chat page (D4).**
   - One centered 760px column, with the "Checked" chips inline.
   - Header: Unbounded 17px title that wraps, bare 38px muted icons, `ios_share`.
   - Answer text at weight 500.
   - Action row: source chip, then copy, thumbs up and thumbs down as 36px round icons.
   - No suggestion chips over the composer. The placeholder changes to "Ask a follow-up".
   - New chat goes to the Ask home; the separate /chat landing goes.
5. **Menus** (menus.html):
   - ⋯ menu: Rename, Pin, Share, Export (PDF, DOCX), Delete, plus Search chats.
   - Account menu: Profile, Settings, Model, Help, Sign out.
   - Program menu, used by My degree.
   - Event actions bottom sheet, used by Events on phone.
   - Filter menu.
   - All menus get the mockup's radius, row height, icons and shadow. The MUI export menu goes.
6. **Ask dock (D3).** Header icons are `open_in_full` and `right_panel_close`. The placeholder depends on the page ("Ask about these events"). It docks from 1280px; from 1100 to 1279 it is the tablet drawer (design Q18). Pop-ups size to min(640px, page column). No mic in the dock.

### Phase 5: Events and event detail (lane B; M)

Files: `EventsPage.js`, `EventsPage.css`, `EventPopup.js` and its stylesheet.

1. **Rows.**
   - Titles at 15px, weight 700 (fix `.ev-title-btn {font:inherit}`).
   - Domain dot from `kind`.
   - Place from `place_name`.
   - Fixed columns so the icons line up when there's no walk time.
   - The mockup's time format.
   - No "0 min" pills.
   - 36px gutter.
2. **Page.**
   - No school line and no Today / timezone row; that row stays in Calendar view, where it holds the arrows.
   - No .ics footnote.
   - The Next up banner has only "Add to calendar", full width on phone.
   - On phone the segmented control stays, full width under the title (design Q2).
3. **Pop-up.**
   - Eyebrow "Kind · Host".
   - Up to four tiles: Starts in, Time, Walk, Cost. A tile with no data is left out and the rest share the width; unknown cost is never "Free", unknown walk never "0 min" (design Q5).
   - Details gets a Place row.
   - "Also at" shows today only, as time, title and "to {end}", with "Nothing else today" when it's empty.
   - Remove "More in {category}", the category chips, the grip and the pill over the mini map.
   - The button reads "Ask about this". Live events show "Starts in Now". Durations read "2 h 40 m".
   - The backdrop follows D10.
   - Correct the body padding.

### Phase 6: Map, place card and course pop-up (lane C; L)

Files: `CampusMapPage.js` and its CSS, `MiniMap.js`, `PlaceSheet.js`, `CoursePopup.js` and the course and place stylesheets. Phase 2.4 has already split `Popups.css`, so lanes B and C don't share a file. The band sheet stays as Phase 2 left it; lane C only changes its contents.

1. **Map page (D2).**
   - Full-colour tiles, as in the mockup.
   - The place card floats over the map on desktop and is open on load for the selected place.
   - The map centre is offset so the pin clears the card.
   - The list column has four chips (All, Dining, Study, Rec), category subtitles, "Here", eight rows and no row Save.
   - No zoom control or Leaflet prefix.
   - Pins at weight 600 with the light shadow; the start dot gets a white ring and halo.
2. **Phone map.**
   - A 420px map with a floating "Search places" pill.
   - The place sheet sits in the page flow under the map, overlapping it by 28px and staying above the tab bar.
   - The grab handle uses white at .35.
3. **Place card.**
   - Type label and name.
   - Tiles: Walk, Open until, Floors, Access.
   - "Today here" with end times, or "Nothing listed today".
   - Hours rows read "Friday" and "7 AM – 11 PM".
   - Actions: Directions, Ask (a labelled pill), and the bookmark. No Call.
4. **Course pop-up (D1).**
   - A 640px single column. The backdrop follows D10.
   - Up to three tiles, number above label: "Average GPA · Typical", "Instructor rating" (design Q15), "Seats open" (live data only, R8). Missing tiles are left out and the rest stretch (design Q5).
   - Grades as 72px neutral bars with the top bar in signal and no percentages, grouped per school by the course module (R11).
   - Section rows: code, time, instructor, and a "84 seats" or "4 waiting" tag.
   - Prerequisites as code tags with the student's done and this-term states.
   - Footer: Add to plan, Compare and Save.
   - Courses Browse rows and Compare open the pop-up directly.

### Phase 7: Chat answer cards (lane D; M–L, mostly blocked on Phase 3)

Files: `components/visuals/*`, `CourseVisuals.js`, `CourseVisuals.css`, `PrereqGraph.js`, `planner/proposalDiff.js`.

1. **Course card.** Section rows match the pop-up's. No Instructor section or extra bars. Footer: primary "Add to plan" and a bordered "Save".
2. **Difficulty card.** The third tile is "Finished", or is left out where no completion data exists. Bars in a 110px box, scaled so the largest group fills it, that group in signal (design Q13); groups per school (R11). No GPA or student caption.
3. **Events in an answer.**
   - Rows grouped by date in the school's timezone: "Later today", "Tomorrow", then "Saturday, Nov 1" (design Q10).
   - No date badge.
   - The time column fits "12:30 PM".
   - A walk pill instead of Directions.
   - Calendar and bookmark icons.
4. **Place in an answer.** Walk, Open until and Access tiles. Category pin. "Directions" and "Open in map".
5. **Prerequisite graph (D6).** Shows chains and the student's states. Labelled "Also opens". Emitted for every school that has data.
6. **Proposed change (D6).**
   - The move row leads.
   - Credit rows per term.
   - A Prerequisites row reading Met, Not met or Unknown, and a Clashes row when clashes are found (R10).
   - A "Not what you asked" row when the change differs from the request, and a "?" row per unknown (R10).
   - A "Not applied" tag.
   - No h4.
   - Buttons: Apply and Not now.
7. **Shortlist.** Title "Fits your schedule". Rows: time tag, GPA in the difficulty colour, and a round + button. No duplicated why text.

### Phase 8: My degree, Semesters, Semester view and setup (lane E; L)

Files: `components/planner/**`, `RouteMap.css`, `DegreeBoard.css`, `SemesterView.css`, `CoursesPage.js` (title only).

1. **Title row.**
   - Visible "My degree" h1.
   - The program as a chevron button that opens the program menu.
   - The Browse / My degree / Compare tabs after a spacer, fully round, with no count.
   - Undo, redo, and an "Add course" primary button.
   - No "Catalog YYYY".
2. **Counts row.** It replaces the summary waffle on the Map view: "9 credits done · 8 this term · 16 planned · 1 not placed", becoming 2×2 on phone. The counts row also tops the Semesters view, with the waffle and its "Other credit" count below it (R2, design Q16).
3. **Route panel.**
   - The Map/Semesters switch lives in its header; on phone it stays, full width under the title (design Q2).
   - Columns run to graduation ("Route to Spring 2029") with no "Earlier" column.
   - Map measurements to the mockup:
     - lines 8px;
     - open dash 4px "2 8";
     - full-height now column at radius 12;
     - 12px codes;
     - grades kept for stops drawn above;
     - "N more" in Unbounded ink;
     - "Core due" from y=54, weight 600.
4. **Requirements panel and detail card** (1.25fr / 1fr under the route):
   - The Requirements panel has rows of a dot, the rule name, the pill bar and "X of N".
   - Clicking a stop selects it and fills the detail card: Term, Line, Needs, Opens and Section.
   - The course pop-up stays one click away from the card's title.
5. **One colour per requirement.** Line colours everywhere on this page, so the board, the map and the panel agree.
6. **Phone route.**
   - In a "Your route" panel, with "9 credits done · 36 placed".
   - Deep, not ink, for the rail and done markers.
   - Markers at 22 and 30px.
   - A fixed code column.
   - Line-colour segments in the Lines strip.
7. **Semesters board and Semester view.**
   - Finish the restyle to r7 and r9: Unbounded title and codes, radii on the scale, signal primary buttons, 38px icon buttons.
   - Add the clash pill.
8. **Setup dialog** (first-run B):
   - Completed step: two columns with a dashed drop zone and a file chip, "Found N · 17 cr", grades as plain values, and a "Course code" row at the foot.
   - First-term preview: a small credit grid, "Credits done", "Open requirements" and struck-through met chips.
   - On phone: "2 of 3" and a three-segment progress bar.
   - Keep the Start term field. It is needed for the map; it gets mocked in Phase 9.

### Phase 9: Mockups for screens without one (design pass, then restyle)

Use one design pass (`/design-shotgun` or `/design-consultation` update mode) with the existing system, then restyle each screen to its approved mockup:

Brief for every screen below (design Q11): lists and tables, not tile grids. Browse, Saved and Search chats use the approved row style (code column, title, value at right); Compare is a table; Settings is a form in panels.

1. Courses Browse (list, level filters, preview) and Compare (the table). The mockup's Browse list in `course-popup.html` is the starting point.
2. Saved (mixed rows, collections, the phone collection picker as a sheet).
3. Search chats.
4. Settings and account, including whether the Advisors and Model tabs stay.
5. Sign-in, create account and the signed-out landing, with the school frame. The landing must show (design Q12): one composed first viewport in the school's deep colour; brand first (mark and product name), then the existing headline, then one primary sign-in action; no added copy; one entrance motion, instant under reduced motion.
6. Help.
7. The boot screen. Panel loading, empty and error states are built in Phase 2 (design Q4).
8. The setup dialog's Start term field.

Toast, ConfirmDialog, FileUpload and the thinking state can follow the system without a mockup.

### Phase 10: Pixel check against the mockups

1. Reuse the screenshot script from Phase 1.11 (R6). It signs in with the dev account at each school and opens each mockup screen in the same state (seeded plan, a fixed date, a selected place, an open pop-up). It screenshots each at 1440×900 and 390×844, light and dark. The approved PNGs are taken the same way.
2. Compare each pair side by side on one page with a diff overlay. Fix anything that isn't data-driven: 13 screens × 3 schools × 2 themes × 2 widths.
3. Rerun the contrast and overflow sweep from Phase 3 of the build plan, and add the screens it missed: event pop-up, place card and the route map with prerequisite links.
4. Update DESIGN.md wherever the build settled something the doc left open.

Done when: every pair matches except for real data differences (names, counts, times), the sweep is clean, and both suites pass.

## Order and size

| Phase | Depends on | Size | Can run with |
|---|---|---|---|
| 1 System rules and cleanup | D8 | M | 3 |
| 2 Shared modules | 1 (dead code and viewport first), D10 for step 4 | M–L | 3; its steps 1, 3 and 7 in parallel |
| 3 Data | D7 | L | 1 and 2, then alongside 4–8 |
| 4 Shell, Ask, chat, dock (lane A) | 2, D3–D5 | L | 5, 6, 7, 8 |
| 5 Events (lane B) | 2, 3 (kind, host, place_name) | M | 4, 6, 7, 8 |
| 6 Map, place card, pop-up (lane C) | 2, 3 (place type, rating, waitlist), D1, D2 | L | 4, 5, 7, 8 |
| 7 Chat cards (lane D) | 2, 3 (most items), D6 | M | 4, 5, 6, 8 |
| 8 My degree and planner (lane E) | 2, 3 (degree payload) | L | 4, 5, 6, 7 |
| 9 Mockups for unmocked screens | 1 | M design + M build | after 4–8 |
| 10 Pixel check | all | M | last |

Phase 2 makes the lanes smaller. Lane C's pop-up and lane D's cards become mostly layout on the course facts module. Lane A no longer edits other lanes' pages. The time and walk rules are written once instead of in each lane.

Lanes A to E each get their own branch and worktree, as lanes B, C and D did before. They merge in the order E, C, B, D, A. Lane A goes last because it touches the shell every page sits in.

## Eng review (2026-10-29)

Target: this plan, `docs/designs/home-colors-alignment.md`, reviewed on `undergrad-experimental`. Report file: this file.

### Scope record

Feature answers: no feature cuts proposed. Structure: A) Smaller arrangement (D1, answered 2026-10-29). Accepted scope: Phase 2 builds five modules instead of seven: campus (school facts plus time and walk wording, C7 + C3), course (facts plus the cached loader, C1 + C8), band sheet host (C4), thread (C5) and composer (C6). Features, contracts and tests unchanged. Remedies: R1, R2 and R4 approved; R3 withdrawn as a correction.

Scope Challenge result: scope accepted as-is (smaller arrangement, no reduction).

### Scope Challenge findings

1. [CRITICAL] (confidence: 9/10) `frontend/src/components/AppDialog.js:53` — "MUI Dialog with its scrim kept off the rail and the dock (design D3, eng R10, R15)". The tab-workspaces eng review bound this ("3 pop-up systems on AppDialog with page-column MUI container ... dock must stay in the accessibility tree"). D10 and Phase 2.4 reopen it. Reviewer: plan-eng-review. Remedy R1.
2. [INFORMATIONAL] (confidence: 9/10) Phase 8.2 replaces the summary waffle with the counts row. The tab-workspaces eng review bound "waffle shows encoded rules + Other credit". This reverses a binding decision without saying so. Remedy R2.
3. Factual correction, no question (was a suspected conflict): Phase 8.1 drops "Catalog YYYY" from the My degree title row (`DegreeBoard.js:342`). The setup-dialog decision R11/D13 ("catalog year shown not selected") covers setup step 1, which keeps showing the program file's year as text. No binding decision is reversed. R3 is withdrawn.
4. [CRITICAL] (confidence: 8/10) D8 deletes advisor and persona components. `dev` has persona work this branch doesn't: 24917c2 "Enforced locked backend config for BrainForge personas (#87)" by another contributor, touching the frontend config draft. The repo has five active authors. Deleting persona UI here guarantees conflicts when this branch merges into `dev`, and may remove a feature a teammate owns. Remedy R4.
5. Factual correction, no question: Phase 3's "course cards for every catalog provider" is not just removing a check. `backend/app/api/visuals.py:273-281` skips course cards when `academics.links_to_course_pages()` is false (`academics.py:53`: only `uw_coursemap`), because "those cards would call another school's API". The change must point the cards at `/api/catalog/{id}` (served for every school), then drop both the provider check and the `data_as_of` skip (R7, after outside-voice finding 1).

Reality rows:

- REALITY: premise-table finding 14 claims checked, unverified=1 (the exact dead range of components.css) frontend/src/styles/components.css:4-1458
- REALITY: already-done pass `git log undergrad-experimental..dev` shows 3 commits, none touching the planned UI files; 24917c2 conflicts with D8 (finding 4) git log
- REALITY: surface-check pass no CLI flags or routes are named beyond `/api/catalog/{id}`, which exists (`frontend/src/api/campus.js:80`)
- REALITY: binding-decisions finding two binding decisions reopened (R1, R2); a third was a false alarm (R3) frontend/src/components/AppDialog.js:53 docs/designs/setup-dialog.md:419
- REALITY: numbers finding sizes S/M/L are [estimated]; file sizes [measured: wc -l], 13 media widths [measured: grep], 20 school-config reads in 12 files [measured: grep] frontend/src/components/EnhancedChatInput.js:1-577 frontend/src/styles/Popups.css:1-1091
- REALITY: deferred-asks pass no linked issue; the user's ask (align with the mockups) is covered by Phases 1 to 10 docs/designs/home-colors-alignment.md:1
- REALITY: pr-count finding no `.gstack/ship-policy.json`; the plan implies at least 10 branches (Phases 1, 2, 3, lanes A to E, 9, 10). Per the user's standing rule they merge locally into undergrad-experimental, with nothing pushed or opened as a PR without asking 2e94f3c

## Decision ledger

### R1: Pop-up backdrop over the rail and dock (D10)
Finding: 1, CRITICAL, 9/10, frontend/src/components/AppDialog.js:53, plan-eng-review
Plan baseline: tab-workspaces eng review (2026-10-28): pop-ups render in the page column; the rail and dock stay live and in the accessibility tree. This plan's D10: undecided.
Runtime evidence: AppDialog.js:53-60 passes the page-column container so MUI hides only the column's siblings; the pop-up's "Ask" button opens the dock beside it.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 backdrop | page column only (approved 2026-10-28) | page column only, kept | whole window, rail and dock included |
| Pop-up "Ask" button | opens the dock beside the pop-up | unchanged | closes the pop-up, then opens the dock |
| Phase 2.4 host interface | n/a | keeps the page-column container | renders to body, drops the container and insets |
| R2 to R4 | pending | pending | pending |
Question D2:
D2 — Should a pop-up dim the rail and the Ask dock?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 2.4 builds one pop-up host.
ELI10: Today a course, event or place pop-up only dims the middle of the screen. The rail and the Ask dock stay usable, so you can ask about the course while it's open; that was decided in the tab-workspaces review. The new mockups dim the whole window. If we follow them, the dock is covered, so the pop-up's Ask button has to close the pop-up first.
Stakes if we pick wrong: either the screens don't match the mockups, or asking about a course means losing the pop-up you were reading.
Recommendation: A) Keep the rail and dock live because the pop-up's Ask button depends on the dock staying usable, and the earlier review chose this on purpose.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Keep rail and dock live (recommended)
  ✅ You can ask about a course in the dock while its pop-up stays open
  ✅ Nothing changes in AppDialog, and its accessibility tests keep passing
  ❌ The rail stays undimmed, which differs from every pop-up mockup
B) Dim everything
  ✅ Pop-ups match the mockups pixel for pixel, rail included
  ✅ The host renders to the page body, which is simpler than the inset maths
  ❌ Asking about a course closes the pop-up you were reading first
Net: matching the mockup exactly versus keeping the dock usable beside a pop-up.
Header: Backdrop
Options:
A) Keep rail and dock live (recommended)
Only the page column dims, as today. The pop-up's Ask button opens the dock beside it. The pixel check treats the undimmed rail as an intended difference from the mockup. (human: ~0 / CC: ~0; no change to AppDialog)
B) Dim everything
The backdrop covers the rail and dock, as in the mockups. The pop-up's Ask button closes the pop-up and opens the dock. Phase 2.4 renders to body and drops the page-column container and insets. (human: ~2 h / CC: ~15 min; reverses the tab-workspaces decision)

State: approved
Actual answer: A) Keep rail and dock live (D2, answered 2026-10-29)
Accepted scope: Only the page column dims, as today. Phase 2.4's host keeps AppDialog's page-column container and insets. The pop-up's Ask button opens the dock beside it. Phase 10 treats the undimmed rail and dock as an intended difference from the mockups.
History: none

### R2: Summary waffle on My degree
Finding: 2, INFORMATIONAL, 9/10, Phase 8.2 of this plan, plan-eng-review
Plan baseline: tab-workspaces eng review (2026-10-28) bound "waffle shows encoded rules + Other credit". This plan's Phase 8.2 replaces the waffle with the counts row on both views.
Runtime evidence: DegreeBoard.js:267-271 renders DegreeSummary (the waffle) above both the Map and Semesters views.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R2 waffle | on both views (approved 2026-10-28) | removed; counts row on both views; Requirements panel carries per-rule progress | counts row on Map; waffle kept on Semesters only |
| "Other credit" | shown in the waffle | shown as an "Other credit" row in the Requirements panel | shown in the waffle on Semesters |
| R1 | approved A | approved A | approved A |
| R3, R4 | pending | pending | pending |
Question D3:
D3 — Should My degree drop the summary waffle?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 8 rebuilds My degree.
ELI10: My degree shows a grid of little squares, one per credit, above both views. The tab-workspaces review chose it, including an "Other credit" count. The approved mockup has a plain counts row instead, plus a Requirements panel with a progress bar per rule. Dropping the waffle reverses that earlier decision, so it needs your say.
Stakes if we pick wrong: either the page keeps a chart the mockup replaced, or students lose the one place that shows credits outside any requirement.
Recommendation: A) Drop it because the Requirements panel shows the same progress per rule, and an "Other credit" row keeps the one thing only the waffle showed.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Drop the waffle (recommended)
  ✅ My degree matches the approved mockup on both the Map and Semesters views
  ✅ One progress display instead of two that can disagree about a rule
  ❌ Reverses the tab-workspaces choice; the per-credit picture goes away
B) Keep it on Semesters
  ✅ The credit-by-credit picture stays for students who plan term by term
  ✅ Map view still matches the mockup exactly
  ❌ Two progress displays to keep in step whenever a rule changes
Net: one progress display that matches the mockup, or keeping the waffle where the mockup doesn't reach.
Header: Waffle
Options:
A) Drop the waffle (recommended)
The counts row replaces the waffle on both views. The Requirements panel adds an "Other credit" row so credits outside any rule stay visible. Records the reversal of the tab-workspaces decision. (human: ~1 h / CC: ~10 min more than the plan)
B) Keep it on Semesters
Map view gets the counts row; the Semesters view keeps the waffle with its "Other credit" count. (human: ~0 / CC: ~0 more; two displays to maintain)

State: approved
Actual answer: B) Keep it on Semesters (D3, answered 2026-10-29)
Accepted scope (amended by design Q16): The counts row sits under the title on both views. The Semesters view keeps the waffle (DegreeSummary) with its "Other credit" count, below the counts row. Phase 10 treats the Semesters waffle as an intended difference from r7.
History: none

### R4: Deleting the advisor and persona UI (D8)
Finding: 4, CRITICAL, 8/10, D8 of this plan; dev commit 24917c2, plan-eng-review
Plan baseline: D8 recommends deleting Canvas, Sidebar, advisor personas, the provider dropdown and old CSS, with personas only on the user's confirmation.
Runtime evidence: `git log undergrad-experimental..dev` shows 24917c2 "Enforced locked backend config for BrainForge personas (#87)" by another contributor, which changes the frontend config draft for locked personas. `git log --format=%an` lists five authors. Sidebar.js is imported only by Sidebar.test.js.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| Unused UI (Sidebar, Canvas, ChatInput, SuggestionsPanel, old CSS) | present, unused | deleted in Phase 1 | deleted in Phase 1 |
| Persona UI (AdvisorCard, carousel, pickers, provider dropdown, persona keys in AppConfigContext) | present | kept and left untouched; Phase 2 modules sit beside it; removal goes to TODOS.md for the team to decide | deleted in Phase 1 |
| Merge into dev | n/a | no conflict with #87 | conflicts with #87's frontend changes |
| R1, R2 | approved | approved | approved |
Question D4:
D4 — Should this plan delete the advisor and persona UI?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; D8 deletes dead code in Phase 1.
ELI10: Some leftover screens are plainly dead: nothing imports Sidebar, Canvas has no link. Those can go. The advisor personas are different. A teammate's change on dev (#87) still works on persona settings, and this branch hasn't merged it yet. Deleting persona UI here would collide with that work when the branches meet, and might remove something the team still wants.
Stakes if we pick wrong: a messy merge into dev that undoes a teammate's fix, or persona code that keeps padding the composer and config.
Recommendation: A) Delete only the dead code because personas are shared work on dev, and the team should decide their removal, not this redesign.
Completeness: A=9/10, B=7/10
Pros / cons:
A) Dead code only (recommended)
  ✅ Sidebar, Canvas, ChatInput, SuggestionsPanel and old CSS go with no merge risk
  ✅ The teammate's persona fix on dev merges cleanly into this branch later
  ❌ The composer and config keep their persona props until the team decides
B) Delete personas too
  ✅ About 1,650 more lines go, and the composer drops its persona props
  ✅ AppConfigContext shrinks to the school facts the redesign needs
  ❌ Collides with dev #87 and removes a feature another contributor maintains
Net: a clean merge with the team's persona work versus a smaller codebase now.
Header: Personas
Options:
A) Dead code only (recommended)
Phase 1 deletes Sidebar, Canvas, ChatInput, SuggestionsPanel and the unused CSS. Persona UI and its config keys stay untouched; the composer and thread take persona props through unchanged. A TODOS.md entry asks the team whether personas stay. (human: ~same / CC: ~same)
B) Delete personas too
Phase 1 also deletes AdvisorCard, the carousel and pickers, the provider dropdown and the persona keys in AppConfigContext. Resolve the conflict with dev #87 when merging. (human: ~1 day incl. merge / CC: ~1 h)

State: approved
Actual answer: B) Delete personas too (D4, answered 2026-10-29)
Accepted scope: Phase 1 deletes the unused UI (Sidebar, Canvas, ChatInput, SuggestionsPanel, old CSS) and the persona UI (AdvisorCard, AdvisorCarousel, AdvisorConfigPanel, AdvisorSidebarPicker, AdvisorStatusDropdown, AvatarPickerModal, HybridConfigModal, WelcomeModelPicker, ProviderDropdown) with the persona keys in AppConfigContext. The conflict with dev 24917c2 (#87) is resolved when this branch merges dev.
History: none

### Section 1: Architecture

Findings:

1. [CRITICAL] (confidence: 9/10) `frontend/src/components/course/popupFormat.js:7-8` — `if (value >= 3.4) return 'easier'; if (value < 3.0) return 'harder';`. The backend already decides "harder" per school: `csv_snapshot.py:600` `cutoff = harder_below_gpa if harder_below_gpa is not None else _hardest_third(grades, grades_key)`, and the planner payload carries `"harder": bool|null` (`planner/CONTRACTS.md:88`). Phase 2's course module, as written, would move the frontend's copy into one place but keep two owners of the same rule (red flag 2, information leakage). The pop-up and the Semester card can disagree about one course. Remedy R5.
2. [INFORMATIONAL] (confidence: 8/10) Phase 2's done-when ("no screen looks different, a screenshot check of the main screens before and after") depends on a screenshot harness that the plan only builds in Phase 10.1. Remedy R6 (Section 3, regression contract).
3. [INFORMATIONAL] (confidence: 7/10) Phase 2.4 hosts `?event=` and `?place=` in the shell. The event pop-up's walk tile needs the start place. With R1 approved, the host keeps AppDialog's page-column container. The campus module's `useStartPlace()` must load once at the shell, so a pop-up opened from Home or chat shows the same walk as on Events. Correction folded into Phase 2.1; no question.

Design-twice (new modules: campus, course, band sheet host, thread, composer):

- Shape 1 (chosen in D1): five deep modules. `useCourseFacts(id)` returns ready-to-draw facts. `<Thread variant>` and `<Composer surface>` own their state through `useChat()`.
- Shape 2: one shared hook per surface (`useThread()`, `useComposer()`) with thin per-surface components. This is shallower: each surface re-implements layout decisions (Checked chips, action row, placeholder), which is the drift that exists today between ChatPage and DockConversation.
- Pick: shape 1, because it hides the surface differences behind one prop instead of in each caller.

Red flags:

- Flag 2 (information leakage): difficulty, R5 above.
- Flag 8 (hand-synced list): breakpoints live in CSS and in a JS constant. The token test checks that both use only 700 and 1100 (Phase 1 done-when), so they can't drift.
- Flag 6 (two ways to do one task): the persona-era `EnhancedChatInput` and Home's form. Phase 2's composer replaces both in the same change.

### R5: Who decides a course's difficulty
Finding: Section 1 finding 1, CRITICAL, 9/10, frontend/src/components/course/popupFormat.js:7, plan-eng-review
Plan baseline: Phase 2.2 (course facts) computes difficulty from the school's `harder_below_gpa` in the frontend.
Runtime evidence: the frontend hard-codes 3.4/3.0 in popupFormat.js:7-8, degreeFormat.js:42-43 and semesterData.js:48-49. The backend decides "harder" per school (csv_snapshot.py:600: the school setting, or the hardest third of graded courses) and sends `harder` in the planner payload; `/api/catalog/{id}` does not send it.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R5 owner of "harder" | frontend 3.0 (three copies) and backend per-school rule | backend only; `/api/catalog/{id}` adds `difficulty: easier/typical/harder/null`; the course module reads it | frontend course module, using `harder_below_gpa` from config |
| UVA and CU cutoff | frontend 3.0; backend hardest third | hardest third, the backend's rule, everywhere | 3.0 in the frontend unless the school sets `harder_below_gpa` |
| "easier" | frontend ≥ 3.4 | backend adds an easier cutoff (≥ 3.4 unless the school sets one) | frontend ≥ 3.4 |
| R1, R2, R4 | approved | approved | approved |
Question D5:
D5 — Should the backend alone decide whether a course is "harder"?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 2 builds one course module.
ELI10: The planner's backend already labels a course "harder" using each school's rule: UW's 3.4 setting, or the hardest third of courses at UVA and CU. The pop-up, the chat card and the Semester card ignore that and use their own fixed 3.0 line. So one course can say Harder on your plan and Typical in its pop-up. The plan moves the frontend copy into one place, which still leaves two rules.
Stakes if we pick wrong: students see two different difficulty labels for the same course on two screens.
Recommendation: A) Backend decides because it already owns the per-school rule, and the frontend then just shows the label it gets.
Completeness: A=10/10, B=7/10
Pros / cons:
A) Backend decides (recommended)
  ✅ One rule per school, so every screen shows the same label for a course
  ✅ UVA and CU use their real hardest-third cutoff instead of a guessed 3.0
  ❌ Adds a difficulty field to /api/catalog/{id}, with backend tests in Phase 3
B) Frontend decides
  ✅ No backend change; the course module reads harder_below_gpa from config
  ✅ Ships in Phase 2 without waiting for the Phase 3 data work
  ❌ UVA and CU still disagree with the planner, which uses the hardest third
Net: one owner and a small backend change, or a frontend-only fix that still disagrees at two schools.
Header: Difficulty
Options:
A) Backend decides (recommended)
Phase 3 adds `difficulty` (easier, typical, harder or null) to `/api/catalog/{id}` from the same per-school rule as the planner, with an easier cutoff (3.4 unless the school sets one). The course module only reads it; the three frontend copies go. (human: ~3 h / CC: ~20 min)
B) Frontend decides
The course module computes difficulty from `harder_below_gpa` in config, falling back to 3.0 and 3.4. No backend change. (human: ~1 h / CC: ~10 min)

State: approved
Actual answer: A) Backend decides (D5, answered 2026-10-29)
Accepted scope: `/api/catalog/{id}` adds `difficulty` (easier, typical, harder or null) from the planner's per-school rule (school `harder_below_gpa`, else the hardest third), with an easier cutoff of 3.4 unless the school sets one. Built first in Phase 3, before Phase 2.2 lands. The course module only reads it; the copies in popupFormat.js, degreeFormat.js and semesterData.js go. Backend unit tests cover each rule; the module test covers null (label hidden).
History: none

Section 1 dispositions: finding 1 accepted as R5 (D5, A). Finding 2 goes to R6 in Section 3. Finding 3 folded into Phase 2.1 as a correction.

### Section 2: Code quality

Findings:

1. [INFORMATIONAL] (confidence: 8/10) `course-popup.html:48` in the mockups — `<span>A</span><span>AB</span><span>B</span><span>BC</span><span>C</span><span>D/F</span>`. These are UW's letter grades, drawn for every school. Phase 2.2's "six fixed grade buckets" would print AB and BC at UVA and CU, which have no such grades. Correction folded into Phase 2.2: buckets follow the school's own letters from the grades payload, with D and F merged and at most six bars. No question; showing grades a school doesn't give isn't a viable option.
2. [INFORMATIONAL] (confidence: 8/10) Edge cases the campus module must own, because each one is a bug in today's copies (audits 3:B9, 3:E4, 2:4.3):
   - walk of 0 minutes or the start place itself: "Here", never "0 min";
   - unknown walk: no pill, with the row's columns kept;
   - all-day events and events with no end time;
   - a school with no timezone: the browser's zone, and no "Times in" label;
   - countdowns over 24 hours.

   Folded into Phase 2.3 as required tests.
3. [INFORMATIONAL] (confidence: 7/10) The shared-code rubric applied to Phase 2 (estimated, implementation lines only):

   | Module | Removed | Added | Saved |
   |---|---|---|---|
   | campus | 250–350 (6 time wrappers, 7 walk forms, 2 `clockText`, 20 config reads) | 150–200 | 100–150 |
   | course | 400–550 (3 difficulty copies, 5 grade-bar builds, 2 seat wordings, 3 caches) | 250–350 | 150–200 |
   | band sheet host | 300–450 (4 bands, 2 AppDialog hosts) | 200–300 | 100–150 |
   | thread | 120–160 (two thread copies) | 100–140 | 20 |
   | composer | 600–650 (EnhancedChatInput, Home form) | 250–350 | 300 |

   Tests grow by about the same as the code shrinks, so the total line count stays roughly flat. The gain is one owner per rule and per piece of chat state. The thread saves few lines; it stays in because the two copies have already drifted (the dock's old course link and its dropped clarifications).

Section 2 dispositions: findings 1 and 2 folded in as corrections and required tests. Finding 3 is information for the approved scope.

### Section 3: Tests

Framework: Jest through react-scripts (`CI=true npx react-scripts test --watchAll=false`, 507 passing) and pytest (`backend/.venv/bin/python -m pytest app/tests/unit -q`, 879 passing) [measured at the last merge, 2e94f3c].

```
CODE PATHS (proposed)                                  USER FLOWS
[+] campus module                                      [+] Open a course from chat, Home, Courses
  ├── useSchool() name/short/mark/zone  [GAP] new        ├── [★★ TESTED] ?course= opens — CoursePopupHost.test.js
  ├── eventWhen() ranges, all-day, no end [GAP]          └── [GAP] [→E2E] same facts in pop-up and chat card
  ├── walkText() 0 / null / n           [GAP]          [+] Open an event or place from any page
  └── useStartPlace() load once, change [GAP]            └── [GAP] ?event= and ?place= from Home and chat
[+] course module                                      [+] Ask from a pop-up
  ├── facts: tiles hidden when no data  [GAP]            └── [★★ TESTED] dock stays live — AppDialog tests (R1)
  ├── grade buckets per school, D/F     [GAP]          [+] Chat thread, page and dock
  ├── sections "N seats" / "N waiting"  [GAP]            ├── [GAP] dock opens courses through ?course=
  ├── difficulty read, null hidden (R5) [GAP]            └── [GAP] clarification shows in the dock
  └── cache: one fetch per id, clear on sign-out [GAP] [+] Composer on Home, chat, dock
[+] band sheet host                                      ├── [★★ TESTED] send, attach — EnhancedChatInput.test.js
  ├── loading / error / ready           [GAP]            └── [GAP] placeholder and mic per surface
  └── phone sheet vs desktop dialog     [GAP]          [+] Every screen unchanged after Phase 2
[+] thread, composer                                     └── [GAP] [→E2E] screenshot baseline (R6)
  └── replace mocks of 7 modules in ChatPage.test [GAP]
[+] backend difficulty field (R5)
  └── harder_below_gpa / hardest third / easier / null [GAP]

COVERAGE: 3/22 paths tested (14%), all new modules  |  QUALITY: ★★:3  |  GAPS: 19 (2 E2E)
```

Tests made obsolete: the tests for `difficultyOf` in popupFormat, `difficultyKey` in degreeFormat and semesterData's difficulty branch; the seven `jest.mock` calls for CampusRail and SettingsModal (Phase 1.10); `Sidebar.test.js`; the persona component tests (R4). Each needs a retirement note when deleted.

### R6: Regression contract for Phase 2
Finding: Section 1 finding 2 and the regression rule, INFORMATIONAL, 8/10, Phase 2 done-when, plan-eng-review
Plan baseline: Phase 2 done-when says "no screen looks different (a screenshot check of the main screens before and after)"; the harness exists only in Phase 10.1.
Runtime evidence: no screenshot script exists in `scripts/` today; the QA sweep used during the build ran by hand in the browser pane.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R6 Phase 2 regression proof | screenshot check named, no harness | Phase 10.1's screenshot script moves to the end of Phase 1; a baseline of 13 screens × 3 schools × light/dark × 2 widths is captured before Phase 2; Phase 2 must match it except the listed intended changes; each lane reuses it | unit suites only, plus a by-hand look at the main screens |
| Intended differences in Phase 2 | n/a | difficulty labels at UVA and CU (R5); nothing else | same |
| Existing suites | 507 + 879 passing | stay green; only the tests listed as obsolete change | same |
| R1, R2, R4, R5 | approved | approved | approved |
Question D6:
D6 — How do we prove Phase 2 changes nothing on screen?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 2 rebuilds shared code under every screen.
ELI10: Phase 2 rewires the code under nearly every screen but shouldn't change how anything looks. The plan says to compare screenshots before and after, but the screenshot script only gets built at the very end, in Phase 10. Building it at the end of Phase 1 means we take a 'before' picture of every screen, at all three schools, and every later step is checked against it automatically.
Stakes if we pick wrong: a quiet layout break at one school or in dark mode slips through and only shows up in the final check, mixed in with hundreds of intended changes.
Recommendation: A) Build the screenshot check early because the refactor touches every screen and unit tests can't see layout.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Screenshot baseline first (recommended)
  ✅ Phase 2 is checked on 156 screenshots instead of by eye on a few
  ✅ Each redesign lane reuses the same script, and Phase 10 is mostly done
  ❌ Phase 1 grows by the script and its seeded states, about half a day
B) Unit tests only
  ✅ Phase 1 stays as written, and Phase 2 can start sooner
  ✅ The 507 frontend tests still catch most logic regressions
  ❌ Layout, theme and school-specific breaks go unseen until Phase 10
Net: half a day earlier for an automatic before/after check on every screen.
Header: Regression
Options:
A) Screenshot baseline first (recommended)
Move Phase 10.1's script to the end of Phase 1. Capture a baseline before Phase 2: 13 screens × 3 schools × light and dark × desktop and phone, in seeded states with a fixed date. Phase 2 must match it except UVA and CU difficulty labels (R5). Lanes and Phase 10 reuse it. (human: ~1 day / CC: ~1 h)
B) Unit tests only
Phase 2 proves itself with the existing suites and new module tests, plus a by-hand look at the main screens. The screenshot script stays in Phase 10. (human: ~0 / CC: ~0 extra)

State: approved
Actual answer: A) Screenshot baseline first (D6, answered 2026-10-29)
Accepted scope: Phase 10.1's screenshot script moves to the end of Phase 1. A baseline is captured before Phase 2: 13 screens × 3 schools × light and dark × desktop and phone (156 images), seeded states, fixed date. Phase 2 must match it except difficulty labels at all three schools (R5; amended after outside-voice finding 7). Loading and error looks change too (design Q4); unit tests cover them, since the baseline shows ready states. The lanes and Phase 10 reuse the script. Existing suites stay green apart from tests listed as obsolete.
History: none

Section 3 dispositions: R6 accepted (D6, A). Test plan artifact saved at `~/.gstack/projects/NeonSeigne-CCAI-Demo/macmini-undergrad-experimental-eng-review-test-plan-20261029-190913.md`, with 8 edge cases, 3 critical paths and 4 groups of tests to retire. No LLM prompt or tool definition changes are planned, so no eval is needed. Phase 3's course-card change touches which visual specs chat emits, not prompts.

### Section 4: Performance

1. [INFORMATIONAL] (confidence: 7/10) `frontend/src/hooks/useCourseDetail.js:6` — `const responses = new Map();`, unbounded, as is `semester/useCourseDetails.js:12`. The course module's single cache stays unbounded. Scale [estimated]: a session opens tens to low hundreds of courses at roughly 10–30 KB each, so under 5 MB at worst. It is cleared on sign-out (test plan edge case). No bound needed; no question.
2. [INFORMATIONAL] (confidence: 8/10) Merging the three caches halves requests when a course's pop-up and chat card both show: today they fetch the same `/api/catalog/{id}` twice. Pages that fetch directly (Home, Courses, Compare, Saved) move onto the cache too. No new load on the backend.
3. [INFORMATIONAL] (confidence: 7/10) Hosting `?event=` and `?place=` in the shell adds one request per opened pop-up on pages that couldn't open them before. That is user-paced, not per render. The start place loads once at the shell instead of on four pages.
4. No N+1 or query changes: the new backend `difficulty` field (R5) reuses the grade index the planner already loads per request (`csv_snapshot.py:597`).

Section 4 dispositions: none needed.

### Outside voice (Outside review, completed)

Seven findings, all checked against the code:

- Finding 1: `csv_snapshot.py:146` sets `"data_as_of": as_of` on every snapshot result.
- Finding 2: `csv_snapshot.py:150` says "Enrollment and seat counts are historical, not current availability."
- Finding 3: `suggest.py:80-104` checks prerequisites and offering per course but never picks sections.
- Finding 4: `ProposalCard.js:190` renders `diff.literal_differs`, and `ProposalCard.js:198` renders `diff.unknowns`.
- Finding 5: `csv_snapshot.py:33` has `_GRADE_BUCKETS = ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "DFW")`.
- Finding 6: `facts.py:30-34` `Meeting` has only day, start and end.

Finding 7 is a correction, folded in with no question: Phase 2 extracts today's rendering unchanged, and the lanes switch on the new presentation (merged bars, section wording, Checked chips, action row). The only intended Phase 2 differences are difficulty labels, at all three schools including UW (R5). R6's accepted scope is amended to match. Findings 1 to 6 are R7 to R12.

### R7: Course cards for snapshot schools
Finding: outside voice 1, High, 9/10, backend/app/api/visuals.py:280, Outside review
Plan baseline: Phase 3 correction 5 keeps the `data_as_of` skip while pointing course cards at `/api/catalog/{id}`.
Runtime evidence: every UVA snapshot result carries `data_as_of` (csv_snapshot.py:146), so the kept skip still blocks every UVA course card.
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R7 snapshot course cards | skipped | rendered from `/api/catalog/{id}`; the skip goes; seat wording follows R8 | skip kept: no course cards at UVA | investigate the CU provider's results first, then decide | deferred; Phase 3 builds cards for live providers only |
| R8 to R12 | pending | pending | pending | pending | pending |
Question D7:
D7 — Should chat show course cards for schools whose data is a snapshot?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 3 turns on chat course cards beyond UW.
ELI10: UVA's course data comes from a downloaded snapshot, not a live feed. The chat skips course cards for any snapshot answer, so even after the planned fix, UVA students would never see a course or grades card. The mockups show those cards at UVA.
Stakes if we pick wrong: UVA chat answers stay text-only, or snapshot seat counts get shown as if they were live (R8 settles that part).
Recommendation: A) Apply because the snapshot's grades and sections are real data, and R8 decides how its seat counts are labelled.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ UVA answers get the course and grades cards the mockups show
  ✅ One rule for every school: a card renders whenever the catalog has the course
  ❌ Snapshot seat counts appear in chat, so R8's labelling has to be right
B) Keep current value
  ✅ No snapshot data in chat cards, so nothing stale can be misread there
  ✅ No change to the visuals builder or its tests
  ❌ UVA chat stays text-only and never matches its mockups
C) Investigate first
  ✅ Confirms what CU's provider returns before changing the rule
  ✅ Bounded to reading the CU provider and one test answer
  ❌ The decision waits; Phase 3's card work for UVA can't start
D) Defer this change only
  ✅ Phase 3 ships cards for live providers now and leaves this row open
  ✅ Nothing else in the plan changes
  ❌ UVA's chat mockups stay unmatched until this is picked up again
Net: real UVA cards with careful labelling, or no UVA cards at all.
Header: Snapshot cards
Options:
A) Apply this change (recommended)
Drop the `data_as_of` skip in visuals.py:280. Snapshot course cards render from `/api/catalog/{id}`; their seat wording follows R8. Backend tests cover a UVA snapshot answer producing cards. (human: ~2 h / CC: ~15 min)
B) Keep current value
Keep the skip: snapshot answers get no course cards. (human: ~0 / CC: ~0)
C) Investigate first
Read the CU provider and run one test answer per school, then come back to this row. Nothing changes meanwhile. (human: ~1 h / CC: ~10 min)
D) Defer this change only
Phase 3 builds cards for live providers; this row stays open in TODOS.md. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D7, answered 2026-10-29)
Accepted scope: Drop the `data_as_of` skip at visuals.py:280. Snapshot course cards render from `/api/catalog/{id}`, with seat wording per R8. Backend tests cover a UVA snapshot answer producing course cards.
History: none

### R8: How snapshot seat counts are shown
Finding: outside voice 2, High, 9/10, backend/app/sources/csv_snapshot.py:150, Outside review
Plan baseline: Phase 1.7 removes source and helper lines; Phases 6 and 7 show a "Seats open" tile and "N seats" / "N waiting" tags.
Runtime evidence: snapshot results say "Enrollment and seat counts are historical, not current availability" (csv_snapshot.py:150) and carry `data_as_of`.
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R8 snapshot seats | dated note in some places | for snapshot data, section tags read "41 of 60 · Fall 2025" (enrolled of limit, with the snapshot term); no "seats open" or "waiting"; the pop-up's Seats tile is hidden | "Seats open" tile and "N seats" / "N waiting" for every school | investigate how UW and CU seat data is sourced first | deferred; seat wording unchanged from today |
| Live seat data (UW) | "N left" | "N seats" / "N waiting" as in the mockup | same | pending | pending |
| R7 | approved A | approved A | approved A | approved A | approved A |
| R9 to R12 | pending | pending | pending | pending | pending |
Question D8:
D8 — How should seat counts from a snapshot be shown?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; the pop-up and chat cards get the mockup's seat wording.
ELI10: The mockups say "84 seats" or "4 waiting", which reads as live availability. UVA's numbers come from a snapshot taken at a past date, and its own source says they're history, not current seats. The plan also removes the small source lines that said so. A student could believe a full class has room.
Stakes if we pick wrong: students plan around seats that no longer exist, or every school loses the mockup's clean seat tags.
Recommendation: A) Apply because a past term's enrolment is still useful when it's labelled as one, and live schools keep the mockup's wording.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ Snapshot schools show what the data is: enrolled of limit, for a named term
  ✅ Live schools (UW) keep the mockup's "84 seats" and "4 waiting" tags
  ❌ UVA's section rows and pop-up differ from the mockup there
B) Keep current value
  ✅ Every school matches the mockup's seat tags and Seats tile
  ✅ One seat wording to build and test
  ❌ UVA shows past enrolment as if it were seats open today
C) Investigate first
  ✅ Confirms which of UW's and CU's seat counts are live before choosing
  ✅ Bounded to reading the two providers' section payloads
  ❌ Seat wording waits, which holds up the pop-up and chat section rows
D) Defer this change only
  ✅ Seat wording stays as today and this row stays open
  ✅ Nothing else in the plan changes
  ❌ Today's wording doesn't match the mockup at any school
Net: honest labels at snapshot schools versus one wording everywhere.
Header: Snapshot seats
Options:
A) Apply this change (recommended)
For snapshot data, section tags read "41 of 60 · Fall 2025" with no "seats open" or "waiting", and the pop-up hides its Seats tile. Live data keeps "N seats" / "N waiting". The course module decides from `data_as_of`; module tests cover both. (human: ~2 h / CC: ~15 min)
B) Keep current value
"Seats open" tile and "N seats" / "N waiting" tags for every school, as in the mockups. (human: ~0 / CC: ~0)
C) Investigate first
Read the UW and CU section payloads to confirm which counts are live, then come back. (human: ~1 h / CC: ~10 min)
D) Defer this change only
Seat wording stays as today; the row stays open. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D8, answered 2026-10-29)
Accepted scope: For snapshot data (`data_as_of` present), section tags read "{enrolled} of {limit} · {term}" with no "seats open" or "waiting", and the pop-up hides its Seats tile. Live data keeps "N seats" / "N waiting". The course module decides; its tests cover both. Phase 10 treats UVA's seat rows as an intended difference.
History: none

### R9: "Fits your schedule" on the shortlist
Finding: outside voice 3, High, 8/10, backend/app/planner/suggest.py:80, Outside review
Plan baseline: Phase 7.7 retitles the shortlist "Fits your schedule" and adds a time tag; Phase 3 adds GPA and a meeting time per suggestion.
Runtime evidence: suggest.py:80-104 checks each candidate with `checker.check` but picks no section and keeps no clash result; `checker.check_schedule` (checker.py:501) already finds clashes for a term's courses.
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R9 shortlist fit | title "Suggested courses"; no section chosen | suggest.py picks, per candidate, the first section with no clash against the plan's term (via `check_schedule`); candidates with none are dropped or marked "Clashes"; the card is titled "Fits your schedule" and shows that section's time | title "Fits your schedule" and a time tag with no clash check | investigate check_schedule's inputs per school first | title stays "Suggested courses" with no time tag until a fit check exists |
| R7, R8 | approved A | approved A | approved A | approved A | approved A |
| R10 to R12 | pending | pending | pending | pending | pending |
Question D9:
D9 — Should the shortlist check schedule fit before saying "Fits your schedule"?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 7 restyles the course shortlist in chat.
ELI10: The mockup titles the chat shortlist "Fits your schedule" and shows a class time on each row. Today the suggestions only check prerequisites and whether the course is offered. Nothing checks that a section fits around your other classes. The planner already has a clash checker, so we can use it to pick a section that fits.
Stakes if we pick wrong: the card promises a fit and then the student adds a course that clashes.
Recommendation: A) Apply because the clash checker already exists, so the title can be true for a small backend change.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ Every suggested course has a section that fits around the plan's classes
  ✅ Reuses check_schedule, so clashes mean the same thing as on My degree
  ❌ More backend work in Phase 3, plus tests for snapshot and live sections
B) Keep current value
  ✅ Matches the mockup's title and time tags with no backend change
  ✅ Phase 7 stays a pure restyle
  ❌ The card can promise a fit for a course that clashes
C) Investigate first
  ✅ Confirms check_schedule works with every school's section data
  ✅ Bounded to running it on one plan per school
  ❌ The shortlist restyle waits on the answer
D) Defer this change only
  ✅ The title stays "Suggested courses", which is true today
  ✅ No backend change now; the row stays open
  ❌ The shortlist doesn't match its mockup's title or time tags
Net: a true promise for some backend work, or the mockup's words without the check behind them.
Header: Schedule fit
Options:
A) Apply this change (recommended)
Phase 3: suggest.py picks, per candidate, the first section with no clash against the plan's term (checker.check_schedule); a candidate with none is marked "Clashes". The card is titled "Fits your schedule" and shows the chosen section's time. Tests cover fit, clash and unknown sections. (human: ~4 h / CC: ~30 min)
B) Keep current value
Title "Fits your schedule" and a time tag, with no clash check. (human: ~0 / CC: ~0)
C) Investigate first
Run check_schedule on one plan per school, then come back. (human: ~1 h / CC: ~10 min)
D) Defer this change only
The shortlist keeps the title "Suggested courses" and no time tag; the row stays open. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D9, answered 2026-10-29)
Accepted scope: Phase 3: suggest.py picks, per candidate, the first section with no clash against the plan's term (checker.check_schedule); a candidate with none is marked "Clashes". The shortlist is titled "Fits your schedule" and shows the chosen section's time. Tests cover fit, clash and unknown sections.
History: none

### R10: Notes and unknowns on the proposed-change card
Finding: outside voice 4, High, 9/10, frontend/src/components/visuals/ProposalCard.js:190, Outside review
Plan baseline: Phase 7.6 shows a "Prerequisites: Met" row and "No h4 or notes".
Runtime evidence: ProposalCard.js:190 renders `diff.literal_differs` (the change differs from what the student asked), and :198 renders `diff.unknowns` (what the check couldn't settle, edits.py:375).
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R10 proposal notes | literal_differs note and unknowns list shown | both kept, restyled as mockup rows: a "Not what you asked" row with the difference, and one "?" row per unknown; Prerequisites row reads Met, Not met or Unknown; a Clashes row when clashes are found | removed as the plan says; Prerequisites row always "Met" | investigate how often each appears first | deferred: the card keeps today's notes and unknowns unrestyled |
| h4 heading | shown | removed (mockup) | removed | pending | kept |
| R7 to R9 | approved A | approved A | approved A | approved A | approved A |
| R11, R12 | pending | pending | pending | pending | pending |
Question D10:
D10 — Should the restyled proposal card keep its warnings?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 7 restyles the "proposed change" card in chat.
ELI10: When chat proposes a plan change, the card can say two important things: that the change differs from what you asked, and what the checker couldn't confirm (like unknown prerequisites). The mockup has neither, and the plan says "no notes" and always shows "Prerequisites: Met". That would hide real problems behind a clean card.
Stakes if we pick wrong: a student applies a change believing prerequisites are met when the checker couldn't tell.
Recommendation: A) Apply because these are results of the check, not helper text, and they fit the mockup's row style.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ Unmet, unknown and changed-request cases stay visible on the card
  ✅ Shown as mockup-style rows, so the card still looks like the mockup
  ❌ The card grows extra rows when the check finds problems
B) Keep current value
  ✅ The card matches the mockup exactly in every case
  ✅ Fewer rows to build and test
  ❌ Hides unknown prerequisites and requests the change didn't follow
C) Investigate first
  ✅ Measures how often notes and unknowns appear on real proposals
  ✅ Bounded to replaying the planner test fixtures
  ❌ The card's restyle waits on the answer
D) Defer this change only
  ✅ The warnings stay exactly as today
  ✅ The row stays open with nothing removed
  ❌ The card mixes old note styling with the new rows
Net: the mockup's clean card versus showing what the checker actually found.
Header: Proposal warnings
Options:
A) Apply this change (recommended)
Keep `literal_differs` as a "Not what you asked" row and each unknown as a "?" row. The Prerequisites row reads Met, Not met or Unknown; a Clashes row appears when clashes are found. The h4 goes. Tests cover each case. (human: ~2 h / CC: ~15 min)
B) Keep current value
Remove notes and unknowns as the plan says; Prerequisites always reads "Met". (human: ~0 / CC: ~0)
C) Investigate first
Replay the planner fixtures to see how often each appears, then come back. (human: ~1 h / CC: ~10 min)
D) Defer this change only
The notes and unknowns stay as today; the row stays open. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D10, answered 2026-10-29)
Accepted scope: The restyled proposal card keeps `literal_differs` as a "Not what you asked" row and each unknown as a "?" row. The Prerequisites row reads Met, Not met or Unknown; a Clashes row appears when clashes are found. The h4 goes. Tests cover each case.
History: none

### R11: Grade bars per school
Finding: outside voice 5, High, 9/10, backend/app/sources/csv_snapshot.py:33, Outside review
Plan baseline: Section 2 correction 1: buckets follow the school's own letters, D and F merged, at most six bars.
Runtime evidence: UVA sends ten buckets: `("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "DFW")` (csv_snapshot.py:33). DFW includes withdrawals and can't be split into D and F.
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R11 grade bars | per-view, unmerged | group by letter, keeping every student: UVA shows A, B, C, DFW (4 bars, DFW labelled "DFW"); UW shows A, AB, B, BC, C, D/F; any other school groups its +/− into the letter and merges D and F only when both exist separately | six bars with D and F merged at every school | investigate CU's grade payload first | deferred: grade bars stay as today |
| R7 to R10 | approved A | approved A | approved A | approved A | approved A |
| R12 | pending | pending | pending | pending | pending |
Question D11:
D11 — How should grade bars group each school's letters?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; Phase 2's course module draws grade bars for the pop-up and chat.
ELI10: The mockup draws six bars with UW's grades: A, AB, B, BC, C and D/F. UVA's data has ten grades from A+ to C−, plus one "DFW" group that mixes Ds, Fs and withdrawals. Calling that "D/F" would be wrong, and squeezing ten into six needs a rule. Grouping by letter keeps every student counted.
Stakes if we pick wrong: UVA bars mislabel withdrawals as failing grades, or drop students to fit six bars.
Recommendation: A) Apply because grouping by letter keeps every student and labels each bar for what it contains.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ Every student is counted, and UVA's DFW bar keeps its real name
  ✅ UW looks exactly like the mockup's six bars
  ❌ UVA shows four bars, so its pop-up differs from the six-bar mockup
B) Keep current value
  ✅ Six bars at every school, as in the mockup
  ✅ One bucket rule to build and test
  ❌ Labels UVA's DFW group "D/F" and leaves ten grades without a rule
C) Investigate first
  ✅ Confirms CU's grade scale before fixing the rule
  ✅ Bounded to reading CU's grades payload
  ❌ The course module's grade bars wait on the answer
D) Defer this change only
  ✅ Grade bars stay as each view draws them today
  ✅ The row stays open
  ❌ The five different grade-bar builds stay, which Phase 2 set out to remove
Net: correct, school-specific bars, or the mockup's six bars everywhere.
Header: Grade bars
Options:
A) Apply this change (recommended)
The course module groups grades by letter, keeping every student: UVA A, B, C, DFW (labelled "DFW"); UW A, AB, B, BC, C, D/F; other schools fold +/− into the letter and merge D and F only when both are separate. The top bar is in signal. Tests cover each school's payload. (human: ~2 h / CC: ~15 min)
B) Keep current value
Six bars with D and F merged at every school. (human: ~0 / CC: ~0)
C) Investigate first
Read CU's grade payload, then come back. (human: ~30 min / CC: ~5 min)
D) Defer this change only
Grade bars stay as today; the row stays open. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D11, answered 2026-10-29)
Accepted scope: The course module groups grades by letter, keeping every student: UVA A, B, C, DFW (labelled "DFW"); UW A, AB, B, BC, C, D/F; other schools fold +/− into the letter and merge D and F only when both are separate. The top bar is in signal. Tests cover each school's payload. Phase 10 treats UVA's four bars as an intended difference.
History: none

### R12: When "Your classes today" shows
Finding: outside voice 6, Medium, 8/10, backend/app/planner/facts.py:30, Outside review
Plan baseline: Phase 3 builds "Your classes today" from "plan sections plus the term calendar"; Phase 4.3 shows it on the Ask home.
Runtime evidence: `Meeting` has only day, start and end (facts.py:30-34). No school file or planner module holds term start and end dates (grep of schools/*/school.yaml and backend/app/planner). UVA's sections CSV has MeetingDates1-4 (csv_snapshot.py:164), which the planner sections drop.
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R12 classes today | not built | school.yaml gains the plan term's first and last day of classes, from each school's official calendar; the card shows today's meetings only on weekdays inside those dates and hides when they're missing; no holiday handling | weekday match only | investigate each school's calendar source first | deferred: the side column shows Saved only until dates exist |
| R7 to R11 | approved A | approved A | approved A | approved A | approved A |
Question D12:
D12 — When should "Your classes today" appear?
Project/branch/task: undergrad-experimental, reviewing the mockup alignment plan; the Ask home gets a "Your classes today" card.
ELI10: The card lists today's classes from your plan. The plan's sections only know the weekday and time, not when the term starts or ends. Matching on weekday alone would show Monday classes on a Monday in summer or before the term begins. Adding each term's first and last day of classes fixes that.
Stakes if we pick wrong: the home screen lists classes that aren't happening.
Recommendation: A) Apply because two dates per term rule out the off-term days, and the card hides itself when the dates are missing.
Note: options differ in kind, not coverage — no completeness score.
Pros / cons:
A) Apply this change (recommended)
  ✅ The card only lists classes during the term they belong to
  ✅ Two dates per term per school, read from each official calendar
  ❌ Someone updates school.yaml each term; holidays still show classes
B) Keep current value
  ✅ No new data to collect or keep current
  ✅ The card always shows on class weekdays, as in the mockup
  ❌ Shows classes before the term starts, after it ends and over breaks
C) Investigate first
  ✅ Finds whether each school publishes machine-readable term dates
  ✅ Bounded to the three schools' calendar pages
  ❌ The Ask home's side column waits on the answer
D) Defer this change only
  ✅ Nothing wrong ever shows: the side column has Saved only
  ✅ No calendar data to maintain yet
  ❌ The Ask home doesn't match its mockup's side column
Net: two dates per term to keep current, or a card that's sometimes wrong, or no card yet.
Header: Classes today
Options:
A) Apply this change (recommended)
Phase 3 adds the plan term's first and last day of classes to each school.yaml from the official calendar. The card shows today's meetings only on weekdays inside those dates and hides when they're missing. No holiday handling. Tests cover inside, before, after and missing dates. (human: ~3 h / CC: ~20 min)
B) Keep current value
Show today's meetings on matching weekdays, with no date check. (human: ~0 / CC: ~0)
C) Investigate first
Check each school's calendar for usable term dates, then come back. (human: ~1 h / CC: ~10 min)
D) Defer this change only
No "Your classes today" card yet; the side column shows Saved only. (human: ~0 / CC: ~0)

State: approved
Actual answer: A) Apply this change (D12, answered 2026-10-29)
Accepted scope: Phase 3 adds the plan term's first and last day of classes to each school.yaml from the school's official calendar. "Your classes today" shows today's meetings only on weekdays inside those dates and hides when they're missing. No holiday handling. Tests cover inside, before, after and missing dates.
History: none

Approval readiness: PASS. Checked R1 (D2 A), R2 (D3 B), R4 (D4 B), R5 (D5 A), R6 (D6 A), R7 (D7 A), R8 (D8 A), R9 (D9 A), R10 (D10 A), R11 (D11 A), R12 (D12 A); structure D1 A; TODO D13 A. R3 withdrawn as a correction. No pending remedies.

### NOT in scope

- Holiday and break handling for "Your classes today": deferred to TODOS.md (D13), since it needs per-school break lists.
- Live seat availability at snapshot schools: the snapshot has no live counts; R8 labels the history instead.
- A course-level rating where no instructor ratings exist: hidden, not estimated (D7 of the plan).
- Restyling unmocked screens before their mockups exist: Phase 9 does the design pass first (D9 of the plan).

### What already exists

- `AppDialog` with the page-column container (tab-workspaces review) is kept as the base of the Phase 2.4 host (R1).
- `checker.check_schedule` (`checker.py:501`) supplies the shortlist's fit check (R9); no new clash logic.
- The planner's per-school "harder" rule (`csv_snapshot.py:600`, UW `harder_below_gpa`) becomes the only difficulty rule (R5).
- `/api/catalog/{id}` (`api/campus.js:80`) already serves every school; the course cards and the course module build on it (R7).
- `useMediaMatch` and the token test (`brandTokens.test.js`) are extended rather than replaced (Phase 1.1).

### Diagram: Phase 2 module flow

```
school.yaml + /api/config ──> campus module ──> useSchool(), eventWhen(), walkText(), useStartPlace()
                                   │                 (shell loads the start place once)
/api/catalog/{id} (+difficulty, R5) ──> course module ──> useCourseFacts(id): tiles, grade groups (R11),
                                   │                       section rows (R8), prereq tags, difficulty
                                   ▼
            band sheet host (shell: ?course= ?event= ?place=, page-column backdrop, R1)
                                   │
useChat() ──> thread (page | dock) ──> chat cards (course facts, R7 to R10)
          └─> composer (home | chat | dock)
```

### Failure modes

| Path | Realistic failure | Covered by | User sees |
|---|---|---|---|
| Backend `difficulty` field | grades file down, so no cutoff | backend test for null; module hides the label | no label (clear, not wrong) |
| Snapshot course cards (R7) | snapshot CSV refresh fails | `csv_snapshot` serves last good copy; seat tags carry the snapshot term (R8) | dated numbers, labelled |
| Shortlist fit (R9) | sections unknown for a course | test for unknown sections; row marked as unknown rather than "fits" | no false fit |
| Classes today (R12) | term dates missing in school.yaml | test for missing dates; card hidden | no card |
| Shell-hosted `?event=`/`?place=` | id no longer exists | band sheet error state (Phase 2.4) | error in the sheet with close |
| Screenshot baseline (R6) | seeded data drifts between runs | fixed date and seeded plan; diff threshold | failed check, not silent |

Critical gaps (no test, no handling, silent): none.

### Worktree parallelization

| Step | Modules touched | Depends on |
|---|---|---|
| Phase 1 rules, cleanup, shell, screenshot script | frontend/src/styles, components/shell, theme, scripts | — |
| Backend difficulty field (R5) | backend/app/api, backend/app/sources | — |
| Phase 2 campus module | frontend/src (new campus module) | Phase 1 |
| Phase 2 course module | frontend/src (new course module), hooks | Phase 1, backend difficulty field |
| Phase 2 band sheet host | components/popup, components/shell, styles | course module |
| Phase 2 thread and composer | components/chat, contexts | Phase 1 |
| Phase 3 other data (R7 to R9, R12) | backend/app/planner, backend/app/api, schools | — |
| Lanes A to E | per lane, as in Phases 4 to 8 | Phase 2; Phase 3 items they read |

Parallel lanes: Phase 1 and the backend difficulty field together. Then campus, course, and thread plus composer in parallel; band sheet after course. Phase 3 runs beside Phase 2. Lanes A to E run in parallel, merging E, C, B, D, A.

Conflict flags: `components/shell` is touched by Phase 1.10 and the band sheet host; sequence them. `TODOS.md` and `school.yaml` are touched by Phase 1.9 and R12; sequence them.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** — backend — Add `difficulty` to `/api/catalog/{id}` from the per-school rule
  - Surfaced by: Section 1 finding 1, R5
  - Files: backend/app/api/routes/catalog.py, backend/app/sources/csv_snapshot.py, backend/app/tools/_uw_source.py, CONTRACTS.md
  - Verify: `backend/.venv/bin/python -m pytest app/tests/unit -q`
- [ ] **T2 (P1, human: ~1d / CC: ~1h)** — scripts — Build the screenshot script and capture the Phase 1 baseline
  - Surfaced by: Section 1 finding 2, R6
  - Files: scripts/ (new), frontend seed data
  - Verify: 156 images captured; a rerun with no change shows no diffs
- [ ] **T3 (P1, human: ~1d / CC: ~1h)** — frontend — Delete persona UI and resolve the dev #87 conflict on merge
  - Surfaced by: Scope finding 4, R4
  - Files: frontend/src/components/Advisor*.js, AvatarPickerModal.js, HybridConfigModal.js, WelcomeModelPicker.js, ProviderDropdown.js, contexts/AppConfigContext.js
  - Verify: `CI=true npx react-scripts test --watchAll=false`
- [ ] **T4 (P1, human: ~2h / CC: ~15min)** — backend — Render snapshot course cards (drop the `data_as_of` skip)
  - Surfaced by: outside voice 1, R7
  - Files: backend/app/api/visuals.py
  - Verify: unit test with a UVA snapshot answer produces course cards
- [ ] **T5 (P1, human: ~2h / CC: ~15min)** — frontend — Snapshot seat wording in the course module
  - Surfaced by: outside voice 2, R8
  - Files: course module, its tests
  - Verify: module tests for snapshot and live sections
- [ ] **T6 (P1, human: ~4h / CC: ~30min)** — backend — Shortlist picks a clash-free section per suggestion
  - Surfaced by: outside voice 3, R9
  - Files: backend/app/planner/suggest.py, backend/app/api/visuals.py
  - Verify: tests for fit, clash and unknown sections
- [ ] **T7 (P1, human: ~2h / CC: ~15min)** — frontend — Keep proposal warnings as mockup rows
  - Surfaced by: outside voice 4, R10
  - Files: frontend/src/components/visuals/ProposalCard.js, planner/proposalDiff.js
  - Verify: ProposalCard tests for differs, unknown, unmet and clash cases
- [ ] **T8 (P1, human: ~2h / CC: ~15min)** — frontend — Group grade bars per school
  - Surfaced by: outside voice 5, R11; Section 2 finding 1
  - Files: course module
  - Verify: tests with UVA, UW and CU grade payloads
- [ ] **T9 (P2, human: ~3h / CC: ~20min)** — backend + frontend — Term dates and the "Your classes today" check
  - Surfaced by: outside voice 6, R12
  - Files: schools/*/school.yaml, backend/app/config.py, HomePage
  - Verify: tests for inside, before, after and missing dates
- [ ] **T10 (P2, human: ~1h / CC: ~10min)** — frontend — Keep the waffle on Semesters, counts row on Map
  - Surfaced by: Scope finding 2, R2
  - Files: frontend/src/components/planner/degree/DegreeBoard.js
  - Verify: DegreeBoard tests for both views
- [ ] **T11 (P2, human: ~1h / CC: ~10min)** — frontend — Load the start place once at the shell
  - Surfaced by: Section 1 finding 3
  - Files: campus module, components/shell
  - Verify: pop-up from Home and Events shows the same walk
- [ ] **T12 (P2, human: ~2h / CC: ~15min)** — frontend — Campus module edge-case tests
  - Surfaced by: Section 2 finding 2
  - Files: campus module tests
  - Verify: "Here", unknown walk, all-day, no end, no timezone, countdowns over 24 hours

### Unresolved decisions

None.

### Completion summary

- Step 0: Scope Challenge — scope accepted as-is (smaller arrangement, D1)
- Reality rows: 7/7 applicable rows emitted, 1 unverified premise (the exact dead range `components.css:4-1458`)
- Architecture Review: 3 issues found
- Code Quality Review: 3 issues found
- Test Review: diagram produced, 19 gaps identified
- Performance Review: 4 issues found (informational, no action)
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 1 item proposed to user (added)
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: Outside review, completed, 7 findings (6 decided as R7 to R12, 1 folded in)
- Parallelization: 8 steps, 5 parallel / 3 sequential
- Lake Score: 2/3 = answers picking a 10/10 option / answers scored for Completeness (D5, D6 yes; D4 picked the 7/10 option)

### Suppressed findings (appendix)

- (confidence: 4/10) The 156-image screenshot run may take several minutes per pass and slow each lane's loop. Unmeasured; suppressed until the script exists.

## Design review (2026-10-29)

Target: this plan. Calibrated against DESIGN.md and the approved mockups in `design-system-20261029/`. No new mockups were generated: the gstack designer needs an OpenAI API key, which stays reserved for the demo. Outside voices: Outside review (, completed) and an independent subagent (completed). Neither found a hard rejection on the mocked screens.

### Decisions (each answered individually)

| # | Decision | Where it lands |
|---|---|---|
| Q1 | Phone header gets the avatar at the right, opening the account menu (Profile, Settings, Model, Help, Sign out) as a bottom sheet | Phase 4.1, 4.2 |
| Q2 | On phone the Events and My degree view switches stay, full width under the title | Phases 5.2, 8.3 |
| Q3 | The Map keeps one "Starting from {place} · Change" line under its title, sharing `useStartPlace()`; the rest of the route panel stays removed | Phase 6.1 |
| Q4 | Phase 2 builds shared panel states per DESIGN.md (loading in raised, "Nothing listed today" + icon, ink error + icon + Retry); Phase 9.7 shrinks to the boot screen | Phase 2.8, 9.7 |
| Q5 | Pop-up tiles with no data are left out and the rest share the band's width; no invented values | Phases 5.3, 6.4, 7.4 |
| Q6 | Ask home side panels show only with rows; Next up widens when both hide and keeps its empty state | Phase 4.3; DESIGN.md States line |
| Q7 | My degree preselects the first this-term stop (else first planned; else the card hides), with a selected ring; on phone a stop opens the card as a bottom sheet | Phase 8.4 |
| Q8 | Proposal card order: move row, "Not what you asked", Not met / Clashes (close icon, error colour; ink + icon at UW), credit rows, "?" unknowns (muted help icon, short labels). Apply turns secondary when a negative row shows. Saving: spinner, Not now disabled. Applied: "Applied" tag with Undo and a My degree link. Failed: ink error line with Retry | Phase 7.6 |
| Q9 | Shortlist: fitting rows first with the time tag (under the code, left of the GPA); clash rows after with a "Clashes" tag; title "Suggested courses" when nothing fits; unknown sections show no time tag | Phase 7.7 |
| Q10 | Chat event lists group by date in the school's timezone ("Later today", "Tomorrow", "Saturday, Nov 1"); rows carry no date badge | Phase 7.3 |
| Q11 | Phase 9 brief: lists and tables, not tile grids | Phase 9 |
| Q12 | Landing checklist: composed first viewport in deep, brand first, existing headline, one sign-in action, no added copy, one entrance motion (instant under reduced motion) | Phase 9.5 |
| Q13 | Grade bars scale so the largest group fills the box (72px pop-up, 110px chat), that group in signal; bars share the width | Phases 6.4, 7.2 |
| Q14 | Snapshot seat tags use the neutral raised tag with ink text, never the green seats style; on phone the tag drops to a second line and the instructor hides | Phases 6.4, 7.1 |
| Q15 | The rating tile reads "Instructor rating", from the instructors of the plan term's sections; hidden when none are rated | Phases 3, 6.4 |
| Q16 | The counts row tops both My degree views; the waffle sits below it on Semesters (amends R2) | Phase 8.2 |
| Q17 | Tablet (701–1099): Ask home's side column under Next up; My degree panels stack under the route; the map's place card sits in the flow; Events rows keep desktop layout; pop-ups centre up to 640px; the dock is a drawer. The screenshot script adds 900px | Phases 4 to 8, 1.11 |
| Q18 | The dock docks from 1280px (page column ≥ 680px); 1100–1279 uses the drawer; pop-ups are min(640px, page column). DESIGN.md's layout section and the token test allow 1280 | Phases 1.1, 4.6; DESIGN.md |
| Q19 | Icon buttons keep their drawn size with 44×44px hit areas, ≥ 4px apart; thumbs use aria-pressed; theme-toggle stops have labels | All lanes |
| Q20 | Degree map keyboard: one Tab stop per line (roving tabindex), Left/Right along a line, Up/Down between lines, Enter or Space selects (aria-pressed), Shift+Enter opens the pop-up; the detail card is aria-live="polite" | Phase 8.4 |
| Q21 | Phone Ask home gets a 44px history icon at the right of the title row, opening Search chats | Phase 4.3 |

Already specified in code, no decision needed: AppDialog keeps the rail and dock live with `aria-modal="false"` and no focus trap (`AppDialog.js:53-60`), which R1 kept. Motion follows DESIGN.md's Motion section (enter ease-out, sheets and dialogs 250–300ms, instant under reduced motion).

### Journey storyboard

```
STEP | USER DOES                          | USER FEELS              | PLAN SPECIFIES
-----|------------------------------------|-------------------------|-------------------------------------------
1    | Opens Ask home                     | oriented: "my campus"   | school frame, h1, composer as anchor (4.3)
2    | Asks about a course                | curious                 | answer + course card with facts (2.2, 7.1)
3    | Reads difficulty and sections      | trusting                | one difficulty rule (R5), dated seats (R8, Q14)
4    | Asks to move a course              | hopeful, a bit wary     | proposal card with checks ranked (R10, Q8)
5    | Sees a problem row, decides        | in control              | Apply demoted on problems (Q8)
6    | Applies                            | relieved                | Applied tag, Undo, My degree link (Q8)
7    | Opens My degree                    | proud of progress       | counts row, route, preselected card (Q7, Q16)
8    | Checks an event on the way out     | practical               | grouped by real date (Q10), origin shown (Q3)
```

### Interaction states

```
FEATURE              | LOADING            | EMPTY                       | ERROR                 | SUCCESS            | PARTIAL
---------------------|--------------------|-----------------------------|-----------------------|--------------------|---------------------------
Pop-up band sheet    | layout in raised   | n/a                         | ink + icon + Retry    | band and body      | missing tiles left out (Q5)
Ask home Next up     | rows in raised     | "Nothing listed today"+icon | ink + icon + Retry    | rows               | n/a
Ask home side panels | rows in raised     | panel hidden (Q6)           | panel hidden          | rows               | one panel only
My degree detail     | layout in raised   | card hidden, no stops (Q7)  | ink + icon            | preselected stop   | rows without data hidden
Proposal card        | n/a                | n/a                         | ink line + Retry (Q8) | Applied + Undo     | "?" unknown rows
Shortlist            | n/a                | card not shown              | n/a                   | fitting rows       | clash rows after (Q9)
Grade bars           | bars in raised     | bars hidden                 | bars hidden           | scaled bars (Q13)  | per-school groups (R11)
```

### NOT in scope (design)

- New mockups for the 21 decisions: the designer needs an API key; the decisions are specified in words and tokens and checked in Phase 10.
- Responsive and state rules for Phase 9's screens: they get them in Phase 9's own mockup pass.

### What already exists (design)

- DESIGN.md's States, Motion, Menus and Layout sections, which Q4, Q6 and Q18 extend rather than replace.
- The approved mockups for 13 screens in three schools, light and dark, desktop and phone.
- AppDialog's live rail and dock (`AppDialog.js:53-60`).
- The neutral `.tag` style in the mockups' `components.css`, reused for snapshot seats (Q14).

### Design implementation tasks

- [ ] **DT1 (P1, human: ~1h / CC: ~10min)** — DESIGN.md — Record Q6 (side panels hide when empty), Q14 (history tag), Q18 (dock at 1280px, drawer 1100–1279) and Q19 (44px hit areas)
  - Surfaced by: Passes 2, 5, 6
  - Files: DESIGN.md
  - Verify: token test passes with 1280 allowed
- [ ] **DT2 (P1, human: ~4h / CC: ~20min)** — frontend — Shared panel states in Phase 2 (Q4)
  - Files: new panel-state piece and its tests
  - Verify: unit tests for loading, empty and error
- [ ] **DT3 (P1, human: ~4h / CC: ~30min)** — frontend — Tablet layouts and the 1280px dock (Q17, Q18), with 900px and 1280px added to the screenshot script
  - Files: lane stylesheets, ChatDock, scripts/
  - Verify: screenshots at 900, 1100, 1280 and 1440
- [ ] **DT4 (P1, human: ~3h / CC: ~20min)** — frontend — Degree map selection, keyboard and phone sheet (Q7, Q20)
  - Files: frontend/src/components/planner/degree/RouteMap.js and its tests
  - Verify: tests for preselection, arrow keys, Enter, Shift+Enter and the live card
- [ ] **DT5 (P1, human: ~4h / CC: ~20min)** — frontend — Proposal card ranking and result states (Q8)
  - Files: frontend/src/components/visuals/ProposalCard.js and its tests
  - Verify: tests for negative rows, demoted Apply, saving, applied and failed
- [ ] **DT6 (P2, human: ~2h / CC: ~15min)** — frontend — Phone header avatar, history icon and full-width view switches (Q1, Q2, Q21)
  - Files: components/shell, HomePage, EventsPage, DegreeBoard
  - Verify: phone screenshots; account sheet opens
- [ ] **DT7 (P2, human: ~2h / CC: ~15min)** — frontend — 44px hit areas, aria-pressed and toggle labels (Q19)
  - Files: shared button styles, chat action row, theme toggle
  - Verify: the screenshot script's 44px check at 390px (re-check finding 2)

## Design Review Completion Summary

```
  +====================================================================+
  |         DESIGN PLAN REVIEW — COMPLETION SUMMARY                    |
  +====================================================================+
  | System Audit         | DESIGN.md present; UI scope: every screen   |
  | Step 0               | 6/10; all 7 passes                          |
  | Pass 1  (Info Arch)  | 7/10 → 10/10 after fixes                    |
  | Pass 2  (States)     | 4/10 → 8/10 after fixes                     |
  | Pass 3  (Journey)    | 6/10 → 9/10 after fixes                     |
  | Pass 4  (AI Slop)    | 8/10 → 9/10 after fixes                     |
  | Pass 5  (Design Sys) | 7/10 → 9/10 after fixes                     |
  | Pass 6  (Responsive) | 3/10 → 8/10 after fixes                     |
  | Pass 7  (Decisions)  | 1 resolved, 0 deferred                      |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (2 items)                           |
  | What already exists  | written                                     |
  | TODOS.md updates     | 0 items proposed                            |
  | Approved Mockups     | 0 generated, 0 approved (designer needs key)|
  | Decisions made       | 21 added to plan                            |
  | Decisions deferred   | 0                                           |
  | Overall design score | 3/10 → 8/10                                 |
  +====================================================================+
```

Remaining below 10: Phase 9's unmocked screens still need their states and responsive rules (passes 2 and 6). They get them in Phase 9's own mockup pass.

Unresolved decisions: none.

## Eng re-check of the design review (2026-10-29)

Scope: design decisions Q1 to Q21 only. Earlier decisions D1 to D13 and R1 to R12 stand. The user accepted every recommendation below in one message ("Accept all your recomendations", 2026-10-29).

1. [INFORMATIONAL] (confidence: 9/10) `frontend/src/contexts/ChatDockContext.js:17` — `export const DOCK_WIDE = '(min-width: 1280px)';`. The app already docks at 1280px, so Q18 keeps today's behaviour. Phase 1.1 told the build to replace 1280; it now keeps it, and `DOCK_MEDIUM` (768px) becomes 701px. Applied.
2. [INFORMATIONAL] (confidence: 9/10) Q19's "token test checks hit size on phone" can't run in Jest: jsdom does no layout, so computed sizes are 0. The 44px check moves into the screenshot script, which runs a real browser and checks every visible icon button's box at 390px. Applied to DT7 and Phase 1.11.
3. [INFORMATIONAL] (confidence: 9/10) `frontend/src/components/visuals/ProposalCard.js:21-47,123-133` already tracks `applied`, `discarded`, `replaced` and undone states and renders "Applied". Q8 restyles and reorders these and adds the demoted Apply. It doesn't build a new state machine, so an applied card stays applied after reload. Applied to DT5.
4. [INFORMATIONAL] (confidence: 8/10) Q7's phone detail sheet reuses the Phase 2.4 band sheet's phone presentation without a URL parameter, so there is one sheet component, not two. Applied to DT4.
5. [INFORMATIONAL] (confidence: 8/10) Q17 and Q18 grow the screenshot set to 13 screens × 3 schools × 2 themes × 4 widths (390, 900, 1280, 1440) = 312 images. Each lane runs one school at all widths per change; the full 312 run at the end of Phase 1, Phase 2 and each lane merge. Applied to Phase 1.11.
6. [INFORMATIONAL] (confidence: 8/10) Q4 adds shared loading and error states in Phase 2, which conflicts with "no screen looks different". The baseline captures seeded ready states, so they aren't in it. Loading and error looks are listed as intended Phase 2 differences, checked by unit tests rather than screenshots. Applied to R6.

No new user-facing behaviour was added and no decision is open.

Design-twice: no new module beyond Phase 2's (the panel-state piece is a component inside the band sheet module's family, not a new boundary).

Test additions (all approved by the user's message): RouteMap keyboard tests (Q20), ProposalCard demoted-Apply and failure tests (Q8), panel-state unit tests (Q4), a browser-side 44px check in the screenshot script (Q19), and date-grouping tests in the campus module (Q10).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (2026-10-29, an earlier plan on this branch) | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | Outside review via `/plan-eng-review` and `/plan-design-review` | Independent 2nd opinion | 11 | completed | eng: 7 findings, all decided; design: 8 findings, all decided |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 11 | ISSUES OPEN | re-check: 6 issues, 0 critical gaps, all applied; 29 earlier issues mapped to T1 to T12 |
| Design Review | `/plan-design-review` | UI/UX gaps | 4 | CLEAR | score: 3/10 → 8/10, 21 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** Outside review completed for the eng plan review (7 findings) and the design phase (8 findings). No new outside run for this re-check: it only checked the design decisions against the code.
- **CROSS-MODEL:** No new cross-model data in the re-check. The earlier eng and design overlap stands as recorded in their sections.
- **VERDICT:** DESIGN CLEARED. Eng review is open only in the sense that its findings are build tasks: every finding is mapped to a task with no decision outstanding. Eng review required.

NO UNRESOLVED DECISIONS
