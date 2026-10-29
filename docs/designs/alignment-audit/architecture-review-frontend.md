# Architecture review: frontend (undergrad-advisory-panel)

Scope: `frontend/src`. Direction: make the Home Colors alignment (docs/designs/home-colors-alignment.md, phases 1 to 9, decisions D1 to D9) cheap and safe. No GLOSSARY.md or ADRs exist, so no ADR conflicts; one earlier build decision (the scrim) is flagged where it matters.

Hot spots from `git log -150 -- frontend/src` (commits touching the file): ChatPage.js 18, App.js 15, CampusHome.css 11, EnhancedChatInput.js 10, brand-tokens.css 9, HomePage.js 9, MessageBubble.js 9, components.css 8, DegreeBoard.css 8, CoursesPage.css 8. The Ask surfaces (home, chat, composer, message rendering) are the hottest area, followed by the course pop-up and chat cards.

---

## 1. Deepen the course facts module

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 1.5, 1.6, 2 (rating, waitlist, D/F), 5.4, 6.1, 6.2, 6.7, 7 (difficulty colours), 8.1
- **Rough size:** M to L (2 to 3 days), best done at the start of Phase 1 or as the first step of lane C

**Files**
- components/course/popupFormat.js, components/catalog/catalogFormat.js, components/planner/degree/degreeFormat.js, components/planner/planFormat.js, components/planner/semester/semesterData.js (section and seat parts)
- components/course/CoursePopup.js (775): exports GradeDistribution, SectionsTab, InstructorsTab, GpaByTerm, instructorRows
- components/visuals/CourseAnswerCard.js (345): GradeBars, SeatRows, GpaTrend, Stat
- components/visuals/CourseVisualCard.js (176): MetricTile, imports the pop-up pieces above and Popups.css
- components/catalog/CatalogParts.js (GradesBar), components/course/CourseVisuals.js (CourseGradeDistribution, GRADE_KEYS)
- pages/CoursesPage.js (StatTile, SectionsBlock), pages/SavedPage.js (gradeLine)

**Problem.** How a course reads is spread across five format modules and five renderers.
- Difficulty by GPA is coded three times with the same hard-coded 3.4 / 3.0 thresholds: popupFormat.js:4 `difficultyOf(gpa)`, degreeFormat.js:40 `difficultyKey(gpa)`, semesterData.js:44 `difficultyOf(harder, gpa)`, plus planFormat.js:52 `difficultyTag(harder)`. None reads the school's `harder_below_gpa` (UW sets 3.4 in schools/uw-madison/school.yaml:63), which is audit 2:2.7.
- GPA text three times (`gpaText`, `formatGpa` in catalogFormat and degreeFormat), percent twice.
- Grade bars are drawn five ways (CoursePopup GradeDistribution, CourseAnswerCard GradeBars, CatalogParts GradesBar, CourseVisuals CourseGradeDistribution, SavedPage gradeLine). Buckets come straight from the payload (catalogFormat.js:100 `gradeSegments`), so D and F are never merged (audits 2:2.5, 4:7.4).
- Seat wording has two vocabularies: catalogFormat.js:146 "4 left / 4 open / Full" and semesterData.js:259 "12 of 90 left". The mockup wants "84 seats" / "4 waiting".
- Term short names three ways: popupFormat `termShort` ("Fa 25"), planFormat `shortTerm` ("Spring 27"), degreeFormat `pastTermLabel` ("Spr").
- The chat card imports the pop-up's internals (CourseVisualCard.js:11-13) and Popups.css. D1 removes the pop-up's tabs, instructor list and GPA-by-term, while Phase 6.1 changes the chat card. So lanes C and D both edit CoursePopup.js, which the plan's "lanes touch separate files" assumption misses.

**Solution.** A course facts module. It turns a catalog payload plus the school into tiles (with no tile when data is missing, per D7), fixed grade buckets with D/F merged, section rows with a seat tag, prerequisite tags with done or this-term states, difficulty from the school's thresholds, and GPA, percent and term text. Small render pieces (`GradeBars` with a size, `SectionRows`, `PrereqTags`, `CourseTiles`) take those facts. The pop-up, the chat course and difficulty cards, Courses Browse and the semester card are all callers.

**Benefits**
- Locality: the D/F merge, the seat words and the difficulty rule each change in one place.
- Leverage: one interface, four surfaces, three schools.
- Phase 2's new fields (rating, waitlist, section times) land in one reader, not four.
- Lanes C and D no longer share CoursePopup.js. Popups.css stops being imported by chat cards.
- The deletion test passes: delete the module and the rules reappear across every caller, which is what happens today.

**Tests that change**
- New: one courseFacts test file over UW, UVA and CU payload fixtures. It covers D/F merge, threshold per school, "84 seats" and "4 waiting", a tile left out when data is missing, and prerequisite states.
- Shrink: CoursePopup.test.js, CourseAnswerCard.test.js and CourseVisualCard.test.js keep wiring checks only (which pieces appear, Add or Save calls). The format assertions move to the new file.
- Delete: format-level assertions in CampusCards.test.js that duplicate the new tests.

---

## 2. Let the app shell own the rail, account menu and Settings

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 1.9 (short name), 3.1 (account menu), 3.2 (phone shell everywhere, no /chat drawer), 3.5 (menus), D5 (All chats into the ⋯ menu), 8.4 (Settings)
- **Rough size:** M (about 1 day). Doing it in Phase 1 means lane A later edits only shell files.

**Files**
- components/shell/AppShell.js (51), components/CampusRail.js (337), components/catalog/CampusPageShell.js, components/SettingsModal.js
- pages/HomePage.js, ChatPage.js, EventsPage.js, CampusMapPage.js, SavedPage.js (each wires the rail itself); CoursesPage.js and CourseComparePage.js through CampusPageShell
- styles/CampusHome.css (the `.campus-home` layout, imported by four pages)

**Problem.** Six modules (five pages plus CampusPageShell) each render `<CampusRail>` with the same five handlers: onNewChat, onSelectSession, onShowAllChats, onOpenSettings and onSignOut. Each also keeps an `isSettingsOpen` flag, a `handleSignOutClick` and a `<SettingsModal>` (for example HomePage.js:225-242 and :345-352, CampusMapPage.js:542-581 and :759-765). AppShell.js says pages "keep rendering their own CampusRail; it portals into the rail slot", and ChatPage keeps a separate in-page rail (`RAIL_IN_PAGE`). Seven test files mock both CampusRail and SettingsModal (App.popups, CampusMapPage, HomePage, SavedPage, EventsPage, ChatPage, ChatPage.provider). Phase 3's account menu, D5's rail changes and the phone shell rule would each edit all six. Those pages also belong to lanes B, C and E, so lane A would conflict with every other lane.

**Solution.** The shell renders the rail, the phone header and tab bar, the account menu, Settings and sign-out. It reads recent chats from ChatContext and navigation from the router. Pages render only their main region. CampusPageShell is deleted.

**Benefits**
- Delete about 150 lines of repeated wiring and one module (CampusPageShell).
- Locality: the account menu, short name and sign-out exist once.
- Lane A's Phase 3 touches the shell only, not lane pages.
- Page tests drop two mocks each.

**Tests that change**
- AppShell.test.js grows: rail present on every route, the account menu opens Settings, and sign-out navigates to /.
- CampusRail.test.js keeps its own tests.
- Seven page tests drop the CampusRail and SettingsModal mocks. Page tests render the page without the shell.

---

## 3. One campus time and walk wording module

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 3.3 (Next up time), 4.1 and 4.3 (rows, pop-up, "2 h 40 m", "Now"), 5.1 ("Here"), 5.3 (hours "Friday", "7 AM – 11 PM"), 6.3 and 6.4 (chat events and places), 9 (fixed date)
- **Rough size:** S to M (under a day)

**Files**
- components/visuals/EventListCard.js: `formatEventTime`, `formatEventRange` and `hasPhysicalLocation`, which a chat card exports and five modules import
- components/events/EventPopup.js: `spanText`, `countdown`, and the meridiem rule at :300-304
- pages/EventsPage.js (`soonTag`, `featureWhen`, `WalkTime`), pages/HomePage.js (`timeOf`), pages/SavedPage.js (`clockTime`, `dayLabel`, `Walk`)
- pages/CampusMapPage.js (`hoursLine`, `formatDistance`, walk column :687), components/map/PlaceSheet.js (`timeIn`), components/visuals/PlaceCard.js
- utils/eventWindows.js, utils/osmHours.js, planner/planFormat.js (`clockText`), semesterData.js (`timeRange`)

**Problem.** The mockups change the time and walk wording on every screen (audits 1:4.10, 2:4.3, 3:D2, 3:E4, 3:G6, 4:1.9, 4:3.11), and every screen formats them itself.
- Six `toLocaleTimeString` wrappers each repeat the same timezone try/catch.
- The "12:00 to 1:00 PM" rule exists only in EventPopup.js:300-304, which gets it by splitting `formatEventRange`'s output on " – ".
- Walk minutes read seven ways: "9 min", "9 min walk", "Your starting place" (SavedPage.js:75 and CampusMapPage), "7 min" plus "560 m walk", "~9 min", and the tile value with a "560 m" sub-line. The mockup wants "N min" or "Here".
- Two functions named `clockText` give different outputs: osmHours.js:30 gives "7:30 am" and planFormat.js:84 gives "7:30".

**Solution.** One module answers the wording:
- `eventWhen(event, timezone, now)` returns the start ("12:00"), the end ("1:00 PM"), all-day, starts-in ("2 h 40 m" or "Now") and live.
- `walkText(minutes)` returns "Here", "7 min" or nothing.
- `openUntil` and `weekHours` cover places.

Small `EventTime` and `WalkPill` pieces render the results. `now` is injected, so tests and the Phase 9 pixel check share one fixed date.

**Benefits**
- Locality: one wording change reaches every screen.
- Leverage: about 12 call sites behind one interface.
- The chat card stops being the home of page helpers.

**Tests that change**
- New: a pure test file with a fixed `now` and the three schools' timezones. It covers same-meridiem dropping, all-day, multi-day ("Until Nov 30"), "Here", the countdown and the hours wording.
- EventPopup.test.js, EventsPage.test.js and CampusMapPage.test.js keep only "is the time shown" checks.
- eventWindows.test.js (19 lines) grows or merges into the new file.

---

## 4. One pop-up host and one band sheet

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 3.5 (event actions sheet), 4.3, 5.3, 5.4 (scrim over the rail, 640px column), 6.4 (place tiles in a chat answer), D3
- **Rough size:** M (1 to 2 days). Split Popups.css along this seam in Phase 1, as the plan already intends.

**Files**
- components/AppDialog.js (104), components/course/CoursePopupHost.js, pages/EventsPage.js:844-1084 (the event host lives inside the page), pages/CampusMapPage.js (place card host)
- components/popup/PopupParts.js (46), events/EventPopup.js (local `Stat` at :86), course/CoursePopup.js (local `Band` at :159), map/PlaceSheet.js (local `Tiles` at :97), planner/degree/SetupDialog.js (`su-band`, `su-close`)
- styles/Popups.css (1091 lines: `pop-` 69 rules, `cp-` 74, `ep-` 32, `ps-` 57), utils/openCourse.js (already has `COURSE_PARAM` and `EVENT_PARAM`)

**Problem.**
- The course pop-up is hosted in the shell (App.js:60), so it opens anywhere.
- The event pop-up is hosted inside EventsPage, so it opens only on /events. Chat event rows, Home's Next up and Saved can't open it.
- The place card exists only on /map.
- Two hosts repeat the same `<AppDialog open container onClose maxWidth={false} aria-labelledby slotProps={{ paper: { className: 'pop-dialog-paper' } }}>`.
- The band, tile grid and close row are built four ways. Mockup changes to the band, tiles, footer or scrim (3:G4, 3:G13, 4:3.13, 4:5.2, 4:6.1) are therefore repeated per pop-up.

**Solution.** The shell hosts all three pop-ups by URL (`?course`, `?event`, `?place`). A band sheet module owns:
- the band (eyebrow, title, close) and a tile grid of 3 or 4 tiles, 2×2 on phone;
- the footer actions;
- the scrim and the phone bottom sheet;
- the skeleton and the CouldntLoad and NotFound states.

Each pop-up supplies its tiles and body. SetupDialog uses the same band. Popups.css splits into band-sheet primitives plus course, event and place body sheets.

**Benefits**
- Event and place pop-ups open from chat, Home and Saved.
- The scrim-over-rail change (mockup) becomes one edit.
- The tile model is shared with the chat place card (Walk, Open until, Access).
- The Popups.css split becomes principled, not ad hoc.

**Design note.** An earlier design decision (AppDialog.js:53, "design D3") keeps the scrim off the rail and the dock; the mockups cover it. Settle this before fixing the band sheet's interface.

**Tests that change**
- App.popups.test.js opens each of the three pop-ups by URL on two routes.
- A band sheet test covers tile count, phone sheet, Escape and focus return, and the error and not-found states. AppDialog.test.js stays for the container logic.
- EventPopup.test.js, CoursePopup.test.js and PlaceSheet.test.js drop shell assertions and keep body content.

---

## 5. One conversation thread for the chat page and the dock

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 3.4 (Checked inline, action row with thumbs, weight 500, centered 760px), 3.6 (dock), 2 (feedback endpoint wiring), 6 (cards slot into one place), D4, D8
- **Rough size:** M (1 to 2 days), smaller after the D8 deletions

**Files**
- pages/ChatPage.js (633; thread rendering at :420-530), components/chat/DockConversation.js (84), components/AdvisorCarousel.js (123), components/MessageBubble.js (735)
- components/AnswerPanel.js, utils/messageGroups.js, components/visuals/VisualBlock.js

**Problem.** Both the chat page and the dock map `groupMessages`, then pick the panel or aggregated view from `groupViews`, then render `AdvisorCarousel` and `MessageBubble`. The user, error, system and document branches are duplicated (ChatPage.js:445-525 vs DockConversation.js:32-77), and the two copies have drifted:
- The dock opens a course with `navigate('/courses/ID')`, the legacy redirect (DockConversation.js:25-28). The chat page opens the pop-up.
- The dock drops clarification messages.

MessageBubble wraps the plain answer (`plain` at :441) in advisor-panel code: avatars, persona colours, a TTS fetch, reply and a reference search popover, with eight `useState`s. ChatPage.test.js mocks MessageBubble, AdvisorCarousel, EnhancedChatInput, AnswerPanel, ExportButton, SuggestionsPanel and ThinkingIndicator, so no test checks what an answer looks like.

**Solution.** A thread module over `useChat()`, used as `<Thread variant="page|dock" />`. It renders every message kind and the answer: text, cards, Checked chips and the action row (copy, thumbs). Courses always open the pop-up. After D8, the advisor branches are deleted from inside the module, not from two pages.

**Benefits**
- Thumbs feedback and the action row land once.
- D8 deletions happen in one module.
- The chat page shrinks to the header and layout.
- The answer's look gets tested.

**Tests that change**
- New: Thread tests with a real ChatProvider and fixture messages (an answer with cards, an error, a document, a clarification) in both variants.
- ChatPage.test.js drops about seven mocks. ChatPage.provider.test.js stays.
- MessageBubble tests are not needed after the merge.

---

## 6. One composer bound to the chat

- **Strength:** Strong
- **Dependency category:** in-process
- **Phases helped:** 3.3 (Home gets +, scope chip and mic), 3.4 ("Ask a follow-up" placeholder, no suggestion chips), 3.6 (no mic in the dock, page-context placeholder), 4 (dock on Events), D3
- **Rough size:** M (about 1 day)

**Files**
- components/EnhancedChatInput.js (577, 31 props), pages/HomePage.js:256-276 (its own form), components/ChatDock.js:193-207, pages/ChatPage.js:573-593
- hooks/useAsk.js (focuses by `document.querySelector('.chat-frame textarea')`)
- styles/EnhancedChatInput.css (708), ChatFrame.css (`.compact-composer`, the specificity fight in audit 1:0.4), ChatDock.css (`.cc-composer`, `.main-textarea`), CampusHome.css (`.ah-ask`)

**Problem.**
- The interface has 31 props. Both callers pass `compact` plus 12 to 15 props that mirror `useChat()`: send, uploadedDocuments, isLoading, sessionId, attachments and removeAttachment.
- Advisor-era props still shape it: responseMode, selectedAdvisorIds, showProfileButtons, onOpenOnboarding and isLanding.
- Home builds its own form without + or mic (audit 1:4.1).
- The composer's look is split over four stylesheets.
- useAsk reaches across the seam with a CSS selector.

**Solution.** A composer module, used as `<Composer surface="home|chat|dock" />`. It reads the chat and dock state itself. The surface decides the mic, the scope chip and the placeholder. Focus requests go through the dock state (`requestComposerFocus` already exists), not the DOM. One stylesheet.

**Benefits**
- The interface shrinks from 31 props to about 1.
- Home gets + and the mic without new code.
- No more specificity fight between stylesheets.
- The deletion test passes: today the complexity is spread across callers, so deleting EnhancedChatInput would scatter it further.

**Tests that change**
- EnhancedChatInput.test.js (101) becomes per-surface composer tests with a ChatProvider: send, attach and remove, mic only where allowed, and the placeholder rules.
- HomePage.test.js, ChatPage.test.js and the dock tests stop mocking the composer.

---

## 7. A school module in front of the raw config

- **Strength:** Worth exploring
- **Dependency category:** in-process
- **Phases helped:** 1.9 (short_name), 3.3 ("Times in X Time"), 4, 6.3, feeds candidates 1 and 3; D8 shrinks AppConfigContext
- **Rough size:** S (half a day)

**Files**
- contexts/AppConfigContext.js (341; its value has 17 keys, 14 of them advisor or persona), planner/planFormat.js (hard-coded `SCHOOL_SHORT` map), CampusRail.js `schoolMark` (:70-75)
- `config?.app?.institution || config?.app?.title || 'Your campus'` in 8 files (HomePage, EventsPage, CampusMapPage, SavedPage, CoursesPage, CourseComparePage, OnboardingPage, CampusRail); `config?.school?.timezone` in 6
- utils/eventWindows.js `zoneName`

**Problem.** Callers read raw config paths with their own fallbacks. The short name is a hard-coded map, and the school's difficulty threshold never reaches the frontend.

**Solution.** `useSchool()` returns `{ name, shortName, mark, timezone, zoneLabel, difficulty }` from config, with the fallbacks inside.

**Benefits**
- short_name lands in one place.
- Course facts and campus time read thresholds and zones from here.
- Page tests mock one hook instead of the config shape.

**Tests that change**
- New: a small test over the three school configs plus an empty config.
- Page tests replace their `useAppConfig` config fixtures with a school fixture.

---

## 8. Put catalog reads behind one cached module

- **Strength:** Worth exploring
- **Dependency category:** ports & adapters (owned HTTP API; an HTTP adapter in production and an in-memory adapter in tests)
- **Phases helped:** 2 (new fields read once), 3.3 ("Your classes today"), 5.4, 6.1, 7
- **Rough size:** S to M (under a day)

**Files**
- hooks/useCourseDetail.js (cache 1, takes a token), hooks/useCampusDetail.js (`useCourseDetail` and `useCourseRatings`, no cache, abortable), planner/semester/useCourseDetails.js (caches 2 and 3)
- pages/HomePage.js:105 (Promise.all), CoursesPage.js:386, CourseComparePage.js:214, SavedPage.js:36 (`LOOKUPS`)
- api/campus.js

**Problem.** Seven call paths fetch `GET /api/catalog/{id}` through three caches. Two hooks are both named `useCourseDetail` with different interfaces; useCampusDetail.js:13-16 needs a comment to explain the split. The pop-up and the chat card for one course fetch it twice. The caches are cleared in different places, or not at all.

**Solution.** One catalog module (`useCourse`, `useCourseRatings`, `loadCourse`) owns fetch, cache, abort, retry and sign-out clearing for summaries and ratings.

**Benefits**
- New Phase 2 fields are read once.
- One cache, cleared once.
- Two adapters justify the seam: HTTP in the app, in-memory in tests.

**Tests that change**
- New: a catalog module test (dedupe, retry after failure, abort on key change, clear on sign-out).
- CourseVisualCard, CourseAnswerCard, SemesterView and HomePage tests use the in-memory adapter instead of mocking `api/campus` piecemeal.

---

## 9. A viewport module and stylesheet ownership

- **Strength:** Worth exploring
- **Dependency category:** in-process
- **Phases helped:** 1.1 (breakpoints), 1.8 (local class names), then every lane
- **Rough size:** S to M (part of Phase 1)

**Files**
- contexts/ChatDockContext.js:17-18 (1280, 768), pages/EventsPage.js:44 (`usePhone`, a copy of hooks/useMediaMatch.js), pages/CoursesPage.js:32 (`isPhone`), components/dnd/useSavedDropTarget.js:29, pages/ChatPage.js:38 (MUI `breakpoints.down('md')`)
- styles/*.css: 13 distinct `@media` widths (767 ×23, 640 ×4, 768 ×3, 1100 ×3, 1023 ×2, 480 ×2, and 900, 860, 800, 720, 1439, 1279 and 1024 once each); 700, the DESIGN.md phone width, appears zero times
- styles/components.css (1759 lines, imported app-wide in App.js)

**Problem.** Breakpoints and class names are global facts restated per file. The same class is defined in several stylesheets: `.error-message`, `.input-container`, `.logo-icon` (Login, Signup, components), `.cc-btn` (CoursesPage, DegreeBoard, components), `.user-message` (5 files), `.main-textarea` (3), `.cc-dialog` (DegreeBoard, components) and `.campus-kicker` (2). So one lane's stylesheet can restyle another lane's screen. Helpers are duplicated across pages too: `useDelayedFlag` (EventsPage, CampusMapPage, CatalogParts) and `isAbort` (3 files).

**Solution.** One viewport module for JS (`useViewport()` returns 'phone', 'tablet' or 'desktop'; constants 700 and 1100) with matching custom properties for CSS. brandTokens.test.js gains two checks: it fails on any other width, and on a class prefix defined outside its owning stylesheet.

**Benefits**
- Phase 1.1 becomes a test, not a one-off sweep.
- Parallel lanes cannot collide through selectors.
- Dock modes and CSS read the same widths.

**Tests that change**
- brandTokens.test.js gains the breakpoint and prefix-ownership checks.
- ChatDockContext tests use the shared constants.

---

## Considered and left out

- **PlannerContext (1031 lines, a 33-key value).** It is wide, but it already sits behind one seam with 619 lines of tests through that interface. Phase 7 mostly reads `degree` and `view`, so deepening it now would not make the alignment cheaper.
- **VisualBlock registry.** It is already a reasonable deep module. The friction is in what the course cards import (candidate 1), not in the dispatch.
- **Dead code (D8: Sidebar 692, the Advisor* components, ChatInput, SuggestionsPanel, CanvasPage, and about 1450 lines of components.css).** This is a deletion, not a deepening. Doing it first shrinks candidates 5, 6 and 7.

## Top recommendation

**Candidate 1, deepen the course facts module.** It is the one piece of friction that breaks the plan's own lane split. Lanes C (pop-up) and D (chat cards) both edit CoursePopup.js and Popups.css today, because the chat card imports the pop-up's tabs. Phases 2, 5, 6 and 7 all restate the same D/F, seat and difficulty rules, which now live in up to five copies with hard-coded thresholds that ignore the school's rule. Doing it first turns most of lanes C and D into edits of one tested module, plus layout.

Runner-up: candidate 2 (the shell owns the rail). It is cheap, fits Phase 1, and stops lane A from touching every other lane's page.
