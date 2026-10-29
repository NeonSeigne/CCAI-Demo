# Build plan: Home Colors redesign

Source of truth: [DESIGN.md](../../DESIGN.md). Approved mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (open `index.html`).
Branch: `feat/home-colors` (from `undergrad-experimental`). Local commits only.

## Where the frontend is today

| Area | Today | Gap |
| --- | --- | --- |
| Tokens | `src/styles/brand-tokens.css`: one light set (`--ink`, `--paper`, `--domain-*`, `--course-*`, `--band-*`); 165 raw hex values in CSS and 60 in JS | No per-school roles, no dark set, raw hex in components |
| School | `AppConfigContext` sets `--accent-primary` from `app.primary_color` (only UVA's yaml has one); `config.school.slug` is available | Nothing keys the theme on the school |
| Theme | `ThemeContext` hard-codes light; `toggleTheme` is a no-op | No dark mode, no toggle |
| MUI | `src/theme/muiTheme.js` with concrete light colors; `@mui/material` 9 | Needs light and dark color schemes reading our tokens |
| Fonts | `public/index.html` loads Inter and JetBrains Mono | Hanken Grotesk, Unbounded, Material Symbols Rounded |
| Icons | `lucide-react` in 43 files, `@mui/icons-material` in 13 | One set: Material Symbols Rounded |
| Shell | `Sidebar.js`, `CampusRail.js`, `ChatDock.js`, phone bottom bar | School-colored rail, round mark, toggle above profile, 5-tab phone bar with Ask in the center |
| Ask home | `HomePage.js` composer plus "Start with" starters | "Next up" board: events, today's classes, saved |
| Chat cards | `AnswerPanel`, `visuals/*`, `CoursePopup`, `PrereqWeb` (cytoscape) | Restyle every card; the new prerequisite graph look |
| My degree | `DegreeBoard` semester columns plus `DegreeSummary` | Transit line map (desktop) and route (phone), with the board kept as "Semesters" |
| Events, Map | `EventsPage`, `EventPopup`, `CampusMapPage`, `PlaceSheet`, `MiniMap` | Restyle to the mockups; the map page layout with list plus place card |

## Phases

Phase 0 has to land first; after it, lanes A–D touch separate files and can run in parallel.

```
Phase 0  tokens · theme · fonts · MUI      (one lane, everything depends on it)
   │
   ├── Lane A  icons sweep                 (56 files, mechanical)
   ├── Lane B  shell + core components     (rail, phone bar, dock, buttons, menus, dialogs, composer)
   ├── Lane C  Ask home + chat cards
   └── Lane D  Events, event pop-up, map, course pop-up
   │
Phase 2  My degree transit map (after B, needs the new tokens and shell)
Phase 3  dark-mode and contrast QA at three schools, cleanup
```

### Phase 0 — foundations

- **T0.1 School tokens.** Add `src/styles/school-tokens.css` with the DESIGN.md roles: shared neutrals and data colors, then deep, signal, tint, band, mark, canvas and line-1..3 for `uva`, `cu-boulder` and `uw-madison`, each as `--light-*` and `--dark-*`, picked into `--<role>` by `html[data-theme]` (the coder-cards v2 pattern). Unknown schools fall back to a neutral set.
- **T0.2 Alias layer.** Point the existing names (`--ink`, `--paper`, `--paper-sunken`, `--line`, `--accent-*`, `--domain-*`, `--band-*`, `--course-*`, `--difficulty-*`) at the new roles, so every page picks up both themes before any page is touched. Then replace the 225 raw hex values with tokens, file by file. `brandTokens.test.js` grows a check that no CSS or JS outside the token files has hex.
- **T0.3 School attribute.** `AppConfigContext` sets `data-school` on `<html>` from `config.school.slug`, and drops the `--accent-primary` injection (and `primary_color` from the yaml).
- **T0.4 Theme.** `ThemeContext` stores Auto, Light or Dark (`cc.theme.v1` in localStorage, wrapped in try/catch), sets `html[data-theme]`, and follows `prefers-color-scheme` on Auto. A small inline script in `index.html` applies it before first paint, so there's no light flash. Color roles fade over 300ms, instant under reduced motion.
- **T0.5 MUI.** `muiTheme.js` uses MUI 9's `cssVariables` with light and dark `colorSchemes` whose values come from our roles. Overrides: buttons, chips and the segmented control fully round, papers at 24px, dialogs and menus at 32px, menu rows at 44px.
- **T0.6 Fonts.** `index.html` loads Hanken Grotesk 400–800, Unbounded 500–800 and Material Symbols Rounded, and drops Inter and JetBrains Mono. Tokens: `--font-app` is Hanken, `--font-display` and `--font-code` are Unbounded; `--font-mono` remains only for real code blocks in chat.
- **Tests:** ThemeContext (stored mode, Auto follows media, boot attribute), the token hex check, one snapshot per school of the resolved roles.

### Lane A — icons

- **A.1** Add an `Icon` component (`<Icon name="event" filled />`) that renders a Material Symbols span, with `aria-hidden` by default and a `label` prop for icon-only buttons.
- **A.2** A mapping table from lucide and MUI names to Material names, then replace all 56 files. Remove `lucide-react` and `@mui/icons-material` from `package.json` and the lockfile once no imports remain.
- **Tests:** an Icon test; the existing component tests updated where they query by an SVG test id.

### Lane B — shell and core components

- **B.1 Rail:** a round school mark, "Campus Companion" with the school name, nav pills (filled icon when active), Recent, the theme toggle above the profile row, and settings. It's the deep color and 240px wide.
- **B.2 Phone:** a school-colored header (mark, name, toggle) and the bottom bar Courses, Events, Ask, Map, Saved, with Ask in the center and a tint pill on the active tab.
- **B.3 Ask dock:** the header and composer restyled; a drawer from 701–1099px.
- **B.4 Components:** buttons, chips, segmented control, tags, panels, menus (24px popovers, 44px rows, tint selection) and dialogs (the band header; bottom sheets on phone). `AppDialog`, `ConfirmDialog` and `SetupDialog` follow.
- **B.5 Composer** (`EnhancedChatInput`): a 32px card with +, scope chip, mic and a round signal Send.

### Lane C — Ask home and chat cards

- **C.1 Ask home:** the date line, the heading (existing text kept), the composer, then the Next up board (events in the next hours with walking times), Your classes today (from the plan's current term sections; hidden without a plan) and Saved. It replaces "Start with".
- **C.2 Chat thread:** the user bubble in tint, the answer text, and the "Checked" line as tint chips.
- **C.3 Cards:**
  - Course card with the band and three stat tiles.
  - Difficulty card: four tiles, grade bars and the GPA trend.
  - Prerequisite graph: a layered SVG (columns of prerequisites → this term → the course asked, plus dashed also-opens) with done, this term, asked and also-opens states; vertical on phone. It replaces cytoscape in `PrereqWeb`.
  - Proposed change with before → after rows.
  - Shortlist, event list, and place card with map.

### Lane D — Events, map, pop-ups

- **D.1 Events page:** the starting-from line, day chips, search, the Next up banner (deep, with a white mark-colored button), the list rows (Unbounded time, walk pill, actions) and the dock.
- **D.2 Event pop-up:** a date block, kind and host, title, tiles for starts-in, time, walk and cost; about, details, map, and also-at-this-place.
- **D.3 Map page:** a list column with search, category chips and rows; round category pins, the selected pin large in signal; the place card (walk, open until, floors, access, today here, hours); dark tiles inverted and dimmed; a bottom sheet on phone.
- **D.4 Course pop-up:** the band, grade bars, sections, prerequisites and actions.

### Phase 2 — My degree as a transit map

- **P.1** A `RouteMap` component: requirement lines (grouped from the program's rules) across terms, stops by status (done, this term, planned, not placed), prerequisite links and the core-due marker. It renders as SVG from the data DegreeBoard already loads. Tapping a stop opens the course pop-up.
- **P.2** A `RouteList` component for phones: one stop per term with that term's courses, and the line progress panel.
- **P.3** My degree gets a Map | Semesters switch. Semesters is today's drag-and-drop board, restyled. Map is the default on first visit and remembered after that.
- **Tests:** layout from fixture plans (stop states, two stops in one term, not-placed stops); the phone route renders every term.

### Phase 3 — QA and cleanup

- Walk every screen at UVA, CU and UW in light and dark, desktop and phone, with `/qa`. Check contrast with the tasteskill inspector and ui-ux-pro-max's color rules.
- Delete the leftover old CSS (`md3-theme.css`, `OnboardingTour.css`, unused tour config) and the dead tokens.

## Decisions (2026-10-29)

1. **Rollout:** a separate `feat/home-colors` branch, cut from `undergrad-experimental`, merged back when the whole redesign is done. Local commits only.
2. **Parallel lanes:** after Phase 0 lands on `feat/home-colors`, lanes A–D run as four parallel sessions in their own worktrees, each branching from `feat/home-colors` and merged back into it.
3. **Prerequisite graph:** replace cytoscape with the layered SVG layout from the mockup (C.3). Remove the `cytoscape` dependency once `CoursePopup` and the chat card no longer use it.
4. **"Your classes today":** shown only when the plan's current term has chosen sections with meeting times; hidden otherwise.

## Out of scope

Logos or wordmarks (trademarked; color only), new data sources, and schools beyond the three.

## Eng review (2026-10-29)

Target: docs/designs/home-colors-build.md (this file). Reviewer: /plan-eng-review.

### Scope record
feature answers: no cuts proposed; structure: B) Smaller arrangement (D16); accepted scope: all features as planned, with the icon sweep moved into Phase 0 and three parallel lanes (B shell + core components, C Ask + chat cards, D events, map, pop-ups); pending remedies: R1, R2.
Scope Challenge result: scope accepted as-is (smaller arrangement, same scope).

### Scope Challenge findings
1. [CRITICAL] (confidence: 8/10) plan T0.1 — school palettes hard-coded in frontend CSS contradict "standing up a new school should be configuration, not new code" (docs/designs/campus-companion-school-packs.md:13); backend AppConfig already serves branding (backend/app/config.py:53-56). → R1
2. [CRITICAL] (confidence: 8/10) frontend/src/theme/muiTheme.js:3 "MUI requires concrete palette values" — CSS-only palettes force a hand-synced copy for MUI. → R1
3. [CRITICAL] (confidence: 8/10) plan Lane A — icon sweep overlaps 56 files owned by lanes B–D. → resolved by D16 (structure B).
4. [INFORMATIONAL] (confidence: 9/10) TODOS.md:74 — UW sections have no meeting times, so "Your classes today" never shows at UW. Factual correction; the approved rule (shown only when the plan has times) already covers it.
5. [INFORMATIONAL] (confidence: 9/10) backend/app/planner/programs.py:47 — rules have no line/group field and "Core due" exists only as note text; plan P.1 grouping is undefined. → R2

## Decision ledger

### R1: Where each school's palette lives
Finding: Scope 1 and 2, CRITICAL, 8/10, plan T0.1 + frontend/src/theme/muiTheme.js:3
Plan baseline: T0.1 — a frontend CSS file with per-school --light-*/--dark-* sets keyed on data-school (original proposal)
Runtime evidence: /api/config (backend/app/main.py:91) already returns app.primary_color from school.yaml (backend/app/config.py:53-56); muiTheme.js needs concrete hex values.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 palette source | CSS file per slug (plan) | `theme:` block in each school.yaml, validated by AppConfig, served in /api/config | JS module in the frontend keyed by slug | CSS file as planned |
| MUI colors | concrete light hex | built from the same data | built from the same data | second hand-kept copy |
| New school | — | yaml only | frontend code change | frontend code change |
| R2 lines in My degree | pending | pending | pending | pending |
Question D17:
D17 — Where should each school's light and dark colors live?
Project/branch/task: Home Colors build plan, Phase 0 T0.1, before feat/home-colors is cut.
ELI10: The plan puts UVA's, CU's and UW's colors in a frontend CSS file. But the whole product promise is that a new school is just a config file, and the backend already sends each school's brand color from its school.yaml. MUI also needs real color values, so a CSS-only palette means keeping a second copy in sync by hand.
Stakes if we pick wrong: each new school needs frontend code, and MUI's colors drift from the CSS colors.
Recommendation: A) school.yaml theme block, because it keeps "any school, one config" and gives CSS and MUI one source.
Completeness: A=10/10, B=8/10, C=5/10
Pros / cons:
A) school.yaml theme block (recommended)
  ✅ A new school is yaml only; the palette sits next to its other branding
  ✅ One JS function writes the CSS variables and builds the MUI theme from the same data
  ❌ Touches the backend: AppConfig schema, validation, /api/config and tests (human: ~1 day / CC: ~40 min)
B) Frontend JS module
  ✅ One source for CSS variables and MUI, with no backend change
  ❌ Each new school still needs a frontend code change and a deploy
C) CSS file as planned
  ✅ The smallest diff; pure CSS
  ❌ MUI needs a hand-kept copy of every school's colors, and new schools need code
Net: a backend schema change now buys config-only schools and a single palette source.
Header: Palette home
Options:
A) School yaml theme (recommended)
Add a `theme:` block (light and dark role values) to each school.yaml, validated by AppConfig and served in /api/config. One frontend function writes the --role CSS variables on <html> and builds the MUI light and dark schemes from the same data. Neutral defaults when a school has no theme block. Tests: backend validation, config payload, frontend variable writer.
B) Frontend JS module
A frontend module keyed by school slug holds the palettes; one function writes the CSS variables and builds the MUI theme. No backend change; new schools need a code change.
C) CSS file as planned
Keep T0.1 as written (CSS per slug), plus a hand-kept copy of each palette in muiTheme.js.
State: approved
Actual answer: A) School yaml theme (D17, 2026-10-29)
Accepted scope: Add a `theme:` block (light and dark role values) to each school.yaml, validated by AppConfig and served in /api/config. One frontend function writes the --role CSS variables on <html> and builds the MUI light and dark schemes from the same data. Neutral defaults when a school has no theme block. Tests: backend validation, config payload, frontend variable writer. Replaces T0.1's per-slug CSS file and drops `app.primary_color`.
History: none

### R2: How My degree groups requirements into lines
Finding: Scope 5, INFORMATIONAL, 9/10, backend/app/planner/programs.py:47 (rule fields: exclude, min_grade, double_count, notes, groups)
Plan baseline: P.1 — "requirement lines (grouped from the program's rules) … and the core-due marker" (original proposal, grouping undefined)
Runtime evidence: Rule has no line/group field; econ-ba.yaml states the sixth-semester deadline only in notes.
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R2 line grouping | undefined | optional `line:` name per rule in program yaml; rules without it get their own line | one line per rule, no data change | inferred from rule kind and level |
| Deadline marker | note text only | optional program `deadline: {rules: [...], by_semester: N}` drives "Core due" | no marker | no marker |
| R1 palette source | approved: school yaml theme (D17) | unchanged | unchanged | unchanged |
Question D18:
D18 — How should My degree decide which requirements share a transit line?
Project/branch/task: Home Colors build plan, Phase 2 RouteMap.
ELI10: The mockup grouped Economics into three lines (Foundations, Core theory, Electives) and drew a "Core due" deadline, but I grouped those by hand. Program files list rules with no grouping and keep the deadline only in a note. We either add a small optional field to the program files, draw one line per rule, or guess the grouping.
Stakes if we pick wrong: the map shows up to 11 thin lines per program, or the grouping is wrong and the deadline marker can't appear.
Recommendation: A) Optional line field, because it matches the approved mockup and falls back to one line per rule for files nobody has grouped yet.
Completeness: A=10/10, B=7/10, C=5/10
Pros / cons:
A) Optional line field (recommended)
  ✅ The mockup's three-line map and the "Core due" marker, driven by data
  ✅ Ungrouped program files still render (one line per rule), so nothing breaks
  ❌ A schema change in programs.py plus edits to 16 program files (human: ~half a day / CC: ~30 min)
B) One line per rule
  ✅ No data or schema change at all
  ❌ Economics becomes 7 lines and Mechanical Engineering 11; no deadline marker
C) Infer from rule kind
  ✅ No data change, and fewer lines than B
  ❌ Guesses wrong (calculus and statistics aren't "core"); hard to explain or fix
Net: a small optional schema field buys the approved look without guessing.
Header: Degree lines
Options:
A) Optional line field (recommended)
Add optional `line:` (a short name) to program rules and an optional program `deadline: {rules: [...], by_semester: N}`, validated in programs.py and served with the degree view. Rules without a line get their own line. Fill in line names and deadlines for the 16 shipped program files. Tests: programs.py validation, degree payload, RouteMap grouping and marker.
B) One line per rule
Draw each rule as its own line from existing data; no deadline marker. No schema change.
C) Infer from rule kind
Group rules by kind and course level in the frontend; no deadline marker. No schema change.
State: approved
Actual answer: A) Optional line field (D18, 2026-10-29)
Accepted scope: Add optional `line:` (a short name) to program rules and an optional program `deadline: {rules: [...], by_semester: N}`, validated in programs.py and served with the degree view. Rules without a line get their own line. Fill in line names and deadlines for the 16 shipped program files. Tests: programs.py validation, degree payload, RouteMap grouping and marker.
History: none

### Section 1 notes (architecture)
- Design-twice for the theme module: shape 1 (plan) splits ownership: AppConfigContext writes school variables, ThemeContext writes the mode (red flag 5, split ownership). Shape 2: ThemeContext owns both through one `applyTheme(themeData, mode)` that writes the --role variables and returns the MUI theme. Picked shape 2 (one owner, one call, hides light/dark selection and MUI building). Covered by R1's accepted "one frontend function"; no new choice.
- Red flag 8 (hand-synced list): DESIGN.md's colour values duplicate school.yaml after R1. Fix inside R1's work: DESIGN.md names school.yaml `theme:` as the source of truth for per-school values.

### R3: First paint before /api/config arrives
Finding: A1, INFORMATIONAL, 8/10, frontend/src/contexts/AppConfigContext.js:279 (`if (config?.app?.primary_color)` inside a useEffect after config loads)
Plan baseline: T0.4 — inline boot script applies light/dark before first paint (original proposal); R1 approved (D17) moves palettes to /api/config
Runtime evidence: config is fetched after the app mounts; the boot script can read localStorage only.
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R3 first paint | not specified | boot script applies the last school theme cached in localStorage, then the fresh config replaces it | neutral palette until /api/config arrives |
| R1 palette source | approved: school yaml theme (D17) | unchanged | unchanged |
| R2 degree lines | approved: optional line field (D18) | unchanged | unchanged |
Question D19:
D19 — What should the very first paint show before the school's colors arrive?
Project/branch/task: Home Colors build plan, Phase 0 T0.4, after R1 moved palettes into /api/config.
ELI10: The app only learns its school colors after it asks the server for config, a fraction of a second after the page appears. Without a cache, every page load flashes neutral gray chrome and then turns navy, black or red. Coder-cards v2 avoids this by caching the last palette in localStorage and applying it in the boot script.
Stakes if we pick wrong: a visible color flash on every load or refresh, most noticeable in dark mode.
Recommendation: A) Cache the last theme, because it removes the flash for every returning visit at the cost of about 20 lines.
Completeness: A=10/10, B=6/10
Pros / cons:
A) Cache last theme (recommended)
  ✅ Returning visits paint the right school and mode on the first frame
  ✅ Same pattern as coder-cards v2's boot cache, so it's proven
  ❌ About 20 lines in index.html plus a cache-key test (human: ~2 h / CC: ~10 min)
B) Neutral first paint
  ✅ No boot cache or stale-cache cases to handle
  ❌ Every load flashes neutral chrome before the school colors appear
Net: a small boot cache trades a few lines for no color flash.
Header: First paint
Options:
A) Cache last theme (recommended)
ThemeContext saves the resolved theme roles to localStorage (try/catch) whenever config loads; the inline boot script in index.html writes them and data-theme before first paint; the fresh config always replaces them. Test: cache written on load, boot script applies it, a bad cache is ignored.
B) Neutral first paint
The boot script sets only data-theme; school colors appear when /api/config arrives.
State: approved
Actual answer: A) Cache last theme (D19, 2026-10-29)
Accepted scope: ThemeContext saves the resolved theme roles to localStorage (try/catch) whenever config loads; the inline boot script in index.html writes them and data-theme before first paint; the fresh config always replaces them. Test: cache written on load, boot script applies it, a bad cache is ignored.
History: none

### Authorized auto-decisions
The user said "Can you go with your recommendations for all of them?" (2026-10-29). Every remaining choice below takes its recommended option under that instruction.

### R4: One route model for map and list
Finding: Q1, INFORMATIONAL, 8/10, plan P.1/P.2 (RouteMap and RouteList both derive lines and stop states)
Plan baseline: two components each deriving lines, stops and states (original proposal)
Comparison grid: | R4 | two derivations | A: one pure `routeModel(degree, plan)` (lines, stops, states, deadline) feeding both renderers | B: keep two |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: Add `routeModel(degree, plan)` as a pure function used by RouteMap and RouteList; tests target the model, renderers get render tests only.
History: none

### R5: Retire the alias layer
Finding: Q4, INFORMATIONAL, 7/10, plan T0.2 (old token names point at new roles) — red flag 6, two ways to do one task
Plan baseline: aliases kept indefinitely (unstated)
Comparison grid: | R5 | aliases stay | A: Phase 3 migrates the remaining old names and deletes the aliases; the token test then fails on any old name | B: keep aliases |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: Phase 3 removes `--ink`, `--paper*`, `--accent-*`, `--domain-*`, `--band-*`, `--course-*`, `--difficulty-*` aliases after migrating callers; the token test asserts none remain in src/.
History: none
Built (Phase 3): Phase 0 kept `--ink`, `--course-*`, `--difficulty-*` and the `--domain-*-ink/-tint` data tokens as real roles, so the aliases removed were the 45 old names in brand-tokens.css's alias block (`--paper*`, `--ink-soft`, `--accent-*`, bare `--domain-*`, `--bg-*`, `--text-*`, `--border-*`, `--input-*`, the old shadows). The token test fails on any of them, and also on any `var()` that nothing defines, which found five undefined names left from before the redesign.

### R6: Subset the icon font
Finding: P1, INFORMATIONAL, 7/10, plan T0.6 (loads Material Symbols Rounded with four axes)
Plan baseline: full Material Symbols Rounded variable font (original proposal)
Runtime evidence: unknown size until measured; the full variable font is the largest asset in the font set [re-measure before gate].
Comparison grid: | R6 | full font | A: `icon_names=` subset in the Google Fonts URL, with a test that every `<Icon name>` used in src/ is in the list | B: full font |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: Load Material Symbols with `&icon_names=` listing the used names; a Jest test scans src/ for Icon names and fails when one is missing from the list.
History: none

### R7: Regression contract for the restyle
Finding: T1, CRITICAL, 8/10, IRON RULE — the restyle rewrites shared components covered by 405 frontend tests (e.g. EnhancedChatInput.test.js, Sidebar.test.js, SuggestionsPanel.test.js query icons) and CoursePopup's cytoscape prerequisite web
Plan baseline: no regression contract stated
Comparison grid: | R7 | unstated | A: every phase and lane keeps the full frontend (405) and backend (863) suites green; tests change only where the visual contract changes (icon queries move to accessible names; cytoscape assertions become SVG node assertions for the same prerequisites); behaviour assertions are never deleted | B: rewrite tests freely |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: Regression contract A, enforced at each merge into feat/home-colors.
History: none

### R8: Contrast test over every school theme
Finding: T2, INFORMATIONAL, 8/10, DESIGN.md Colors ("every text and background pair is at least 4.5:1") with palettes now in yaml (R1)
Plan baseline: brandTokens.test.js checks one light set in brand-tokens.css (frontend/src/styles/brandTokens.test.js:5)
Comparison grid: | R8 | one light file | A: a backend pytest loads every school.yaml theme and checks each on-pair at 4.5:1 in light and dark, so a new school with bad colors fails CI | B: frontend-only test |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: backend test over all schools' themes (on-deep/deep, on-signal/signal, tint-ink/tint, ink/surface, muted/surface, both modes); brandTokens.test.js rewritten for the shared neutral tokens.
History: none

### Outside voice findings (Outside review, completed) — all verified against code, auto-decided per the user's instruction

### R9: Route data contract before RouteMap
Finding: O1, High (Outside review), confidence 9/10 — backend/app/planner/degree.py has no prerequisite edges (grep "prereq": no matches); rule results give counts and allocated courses, not unfilled slots.
Comparison grid: | R9 | P.1 assumes the data exists | A: add task P.0 — extend the degree payload with prerequisite edges between planned/completed courses and explicit unfilled-requirement slots (rule, count still needed), so "not placed" means an unchosen slot, never a missing course | B: build RouteMap from today's payload |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: P.0 backend payload extension + tests (edges for courses in the plan, unfilled slots per rule) before P.1; routeModel (R4) consumes it.
History: none

### R10: Where "Core due" counts from
Finding: O2, High (Outside review), confidence 9/10 — backend/app/planner/edits.py:32 `PROFILE_FIELDS = ("program_ids", "catalog_year", "class_year", "completed", "interests")`: no start term.
Comparison grid: | R10 | counts displayed terms | A: optional `start_term` profile field (asked in setup step 1, prefilled as Fall of class_year − 4); the marker shows only when start_term or class_year is known, counts from start_term, and is hidden otherwise | B: count from class_year only | C: count displayed terms |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: add `start_term` to PROFILE_FIELDS with validation (known term label), setup dialog field, deadline placement from start_term, suppression when unknown; tests for each case including a transfer start term.
History: none

### R11: Prerequisite graph keeps AND/OR meaning
Finding: O3, High (Outside review), confidence 9/10 — frontend/src/components/course/PrereqWeb.js:29 "An OR group becomes a compound node holding its options; an AND group links each of its parts straight to the course."
Comparison grid: | R11 | SVG columns by status only | A: the SVG graph draws OR groups as a labelled "One of" group box and AND parts as separate edges; nodes are focusable buttons with names; tests assert group membership and edges, not just node names | B: status columns only |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: PrereqGraph preserves nested any/all from prereq_tree, keyboard focus and accessible names; regression tests port PrereqWeb's AND/OR cases.
History: none

### R12: "Your classes today" means today
Finding: O4, High (Outside review), confidence 8/10 — frontend/src/components/planner/semester/semesterData.js:58 meeting parsing drops date ranges; a planning term may be in the future.
Comparison grid: | R12 | plan's current term has times | A: show only sections in the term whose date range contains today's date in the school's timezone (keep MeetingDates when parsing), on today's weekday; hidden when dates or times are unknown | B: weekday match only |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: date-aware filter in the school timezone reusing meetingsOf plus section dates; hidden otherwise; tests for future term, out-of-range date, missing dates, UW (no times).
History: none

### R13: Config icons in the Lucide→Material move
Finding: O5, Medium (Outside review), confidence 9/10 — backend/app/config.py:147 "`icon://<LucideIconName>` - render a Lucide icon component"; 18 icon entries in undergrad_config.yaml, resolved dynamically in AppConfigContext.js:52.
Comparison grid: | R13 | literal JSX names only | A: change config icons to Material names (`icon://<material_name>`), map old Lucide names to Material in the backend for old configs, fall back to a default icon; the R6 subset test also reads icon names from every yaml | B: keep Lucide for config icons |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: yaml icon names migrated, backend name map + fallback, subset list includes config-derived names, tests on both sides.
History: none

### R14: One owner for the shared graph and chart code
Finding: O6, Medium (Outside review), confidence 9/10 — frontend/src/components/course/CourseVisuals.js:2-3 registers cytoscape for PrereqWeb, used by both CoursePopup (lane D) and chat cards (lane C).
Comparison grid: | R14 | unassigned | A: lane C owns PrereqWeb/PrereqGraph and CourseVisuals; lane D restyles CoursePopup around them and integrates the new graph after lane C merges | B: lane D owns them |
State: approved
Actual answer: A, recommended (authorized auto-decision, 2026-10-29)
Accepted scope: file ownership table below; lane D's CoursePopup graph section lands after C merges.
History: none

Approval readiness: PASS — R1 (D17), R2 (D18), R3 (D19), R4–R14 (authorized auto-decisions, user instruction 2026-10-29), structure (D16).

## Plan amendments from the eng review

- **Phase 0** now also holds the icon sweep (D16). T0.1 becomes: `theme:` block per school.yaml → AppConfig validation → /api/config → ThemeContext `applyTheme(themeData, mode)` writes the --role variables and builds MUI (R1, shape 2). T0.4 adds the localStorage theme cache read by the boot script (R3). Icons: Material names in config too, with a backend Lucide→Material map (R13); `icon_names=` subset plus a test over src/ and yaml (R6). Token test rewritten; backend contrast test over every school theme (R8).
- **Lanes:** B shell + core components; C Ask home + chat cards, owning PrereqWeb → PrereqGraph and CourseVisuals (R11, R14); D events, event pop-up, map, course pop-up (graph area after C merges). Popups.css belongs to lane D; lane C styles chat cards in its own files.
- **Ask home:** "Your classes today" reuses `meetingsOf` (semesterData.js:84) with a date-aware filter (R12).
- **Phase 2:** P.0 data contract (R9), `start_term` + deadline (R2, R10), optional `line:` field (R2), shared `routeModel` (R4), then RouteMap/RouteList.
- **Phase 3:** delete the alias layer (R5); full suites green at every merge (R7).

- **R13 as built (Phase 0):** the Lucide→Material table lives in `frontend/src/components/icons.js` (`LEGACY`), not the backend: it is the same table the import aliases need, so one list instead of two. Config icon names stay Lucide names because the backend validates them against `app/utils/lucide_icons.py`; `icons.test.js` checks that every icon the shipped configs name maps to Material. Moving configs to Material names needs a Material name registry in the backend; not done.

### File ownership (parallel lanes)
| Lane | Owns |
|---|---|
| Phase 0 | src/styles/brand-tokens.css, theme/, contexts/ThemeContext.js, contexts/AppConfigContext.js, public/index.html, components/Icon.js, every icon import, backend/app/config.py, schools/*/school.yaml, undergrad_config.yaml |
| B | Sidebar.js, CampusRail.js, ChatDock.js, AppDialog.js, ConfirmDialog.js, EnhancedChatInput.js, components.css, AppShell.css, Sidebar.css, CampusRail.css, ChatDock.css, EnhancedChatInput.css, SetupDialog styling in DegreeBoard.css |
| C | HomePage.js, CampusHome.css, AnswerPanel.js, visuals/*, MessageBubble.js, ChatPage.css, course/PrereqWeb.js (→ PrereqGraph), course/CourseVisuals.js, CourseVisuals.css |
| D | EventsPage.js/.css, events/EventPopup.js, CampusMapPage.js/.css, map/*, course/CoursePopup.js, Popups.css, CoursesPage.css |
| Phase 2 | planner/degree/*, backend/app/planner/{degree,edits,programs}.py, schools/*/programs/*.yaml |

## Review body

### Section 1 — Architecture
- [INFORMATIONAL] (confidence: 8/10) frontend/src/contexts/AppConfigContext.js:279 — config-driven colors arrive after first paint → R3 (approved).
- Design-twice: shape 2 picked (ThemeContext owns theme data and mode). Red flags: split ownership (fixed by shape 2), hand-synced list DESIGN.md vs yaml (fixed by naming yaml as source).
- Dispositions: R3 accepted (D19).

### Section 2 — Code quality
- [INFORMATIONAL] (confidence: 8/10) plan P.1/P.2 — two derivations of the same route data → R4 accepted.
- [INFORMATIONAL] (confidence: 7/10) plan T0.2 — alias layer becomes a permanent second vocabulary → R5 accepted.
- [INFORMATIONAL] (confidence: 8/10) frontend/src/components/planner/semester/semesterData.js:84 `export const meetingsOf` — reuse for "Your classes today" rather than a new parser (reuse ladder rung 1). Accepted as part of R12.
- [INFORMATIONAL] (confidence: 8/10) frontend/src/styles/Popups.css is imported by CoursePopup, PlaceSheet, EventPopup and CourseVisualCard (App.js imports) — ownership assigned to lane D in the table; required mechanics of the approved parallel lanes (D13).
- Dispositions: R4, R5 accepted (auto); ownership and reuse accepted.

### Section 3 — Tests
Framework: Jest via react-scripts (frontend, 405 tests), pytest (backend, 863 tests).

```
CODE PATHS                                              USER FLOWS
[+] backend config theme (R1, R8)                       [+] First load
  ├── [GAP] theme block validation (bad hex, missing)     ├── [GAP] returning visit paints cached school + mode (R3)
  ├── [GAP] /api/config carries theme                     └── [GAP] first visit: neutral → school, no crash
  └── [GAP] contrast of every school theme, both modes  [+] Theme toggle
[+] ThemeContext.applyTheme (R1, R3)                      ├── [GAP] Auto follows system change
  ├── [GAP] writes --role vars for light and dark         ├── [GAP] Light/Dark persist across reload
  ├── [GAP] neutral defaults without theme                └── [GAP] storage blocked → still works (try/catch)
  ├── [GAP] cache written; bad cache ignored            [+] Ask home
  └── [GAP] MUI scheme built from same data               ├── [GAP] classes today: today's weekday, in-range dates
[+] Icon + subset (R6, R13)                               ├── [GAP] hidden: future term, no times (UW), no plan
  ├── [GAP] every used name in the subset list            └── [★★ TESTED] events list — HomePage tests
  └── [GAP] icon:// Lucide name maps to Material        [+] Chat prerequisite graph (R11)
[+] programs.py line + deadline (R2)                      ├── [GAP] OR group drawn as "One of", AND as edges
  ├── [GAP] optional line accepted / bad type rejected    └── [GAP] keyboard focus + names
  └── [GAP] deadline rules must exist                   [+] My degree map (R2, R4, R9, R10)
[+] degree payload edges + unfilled slots (R9)            ├── [GAP] stops by state; two stops in one term
  └── [GAP] edges only between known courses              ├── [GAP] unfilled slot vs placed course
[+] routeModel (R4)                                       ├── [GAP] Core due from start_term; hidden when unknown
  └── [GAP] grouping by line; rule without line alone     └── [GAP] [→E2E] phone route renders every term
[+] Regression (R7)                                     [+] Existing flows
  └── [★★★ TESTED] 405 frontend + 863 backend suites      └── [★★★ TESTED] Semesters board drag/drop — DegreeBoard.test.js

COVERAGE: 3/26 paths tested today (all regression)  |  GAPS: 23 (1 E2E)
Legend: ★★★ behavior + edge + error | ★★ happy path | [→E2E] integration test
```
Tests to retire: PrereqWeb cytoscape-specific assertions once ported to PrereqGraph (R11); brandTokens.test.js single-file parsing (replaced, R8).
Dispositions: R7, R8 accepted (auto). Test plan artifact written to ~/.gstack/projects/NeonSeigne-CCAI-Demo/.

### Section 4 — Performance
- [INFORMATIONAL] (confidence: 7/10) plan T0.6 — the full four-axis Material Symbols font is the heaviest font asset; size unknown [re-measure before gate] → R6 accepted.
- Map tiles: dark mode uses a CSS filter on OSM tiles (no extra requests). No findings.
- Theme switch: 300ms color fade on role variables; reduced motion makes it instant. No findings.

### NOT in scope
- Logos/wordmarks (trademark); color only.
- Schools beyond UVA, CU, UW (the yaml theme block makes them config-only later).
- A public UW meeting-time source (TODOS.md:74) — "Your classes today" stays hidden at UW.
- Visual regression screenshots in CI; Phase 3 QA uses /qa by hand.

### What already exists
- /api/config + AppConfig (backend/app/config.py) — reused for the theme block.
- ThemeContext (stub) — rebuilt in place, same hook API.
- meetingsOf (semesterData.js:84) — reused for classes today.
- PrereqWeb's AND/OR model (PrereqWeb.js:29) — semantics kept in the SVG rewrite.
- brandTokens.test.js contrast helpers — moved to the backend theme test.

### Failure modes
| Path | Failure | Covered by | User sees |
|---|---|---|---|
| /api/config theme | missing or invalid theme block | validation test + neutral defaults | neutral colors, app works |
| boot cache | stale/corrupt localStorage | bad-cache test | correct colors after config loads |
| icon subset | name missing from subset | subset test fails CI | (blocked before ship) |
| config icon | unknown Lucide name | map + default icon test | default icon |
| classes today | dates missing | R12 tests | panel hidden |
| route map | unknown start term | R10 tests | no Core due marker |
| prereq graph | empty tree | ported PrereqWeb empty-state test | "No prerequisites" |
Critical gaps: 0 (every failure has a planned test and a visible, non-silent outcome).

### Worktree parallelization strategy
| Step | Modules touched | Depends on |
|---|---|---|
| Phase 0 | styles/, theme/, contexts/, public/, components/ (icons), backend config, schools/ | — |
| Lane B | shell + core components, their CSS | Phase 0 |
| Lane C | pages/Home, AnswerPanel, visuals/, course/PrereqWeb, CourseVisuals | Phase 0 |
| Lane D | events/, map/, course/CoursePopup, Popups.css | Phase 0; graph area after C |
| Phase 2 | planner/degree/, backend planner, programs yaml | Phase 0, Lane B |
| Phase 3 | all | everything |
Parallel lanes: B, C, D after Phase 0. Execution order: Phase 0 → launch B + C + D → merge C → D finishes the CoursePopup graph area → merge B, D → Phase 2 → Phase 3. Conflict flags: CoursePopup graph area (C→D), DegreeBoard.css (B styles SetupDialog, Phase 2 owns the board; sequence B before Phase 2).

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~1 day / CC: ~40 min)** — backend config — `theme:` block in AppConfig, served in /api/config, filled for three schools
  - Surfaced by: R1 (Scope 1, 2)
  - Files: backend/app/config.py, schools/*/school.yaml, backend tests
  - Verify: `backend/.venv/bin/python -m pytest app/tests/unit -q`
- [ ] **T2 (P1, human: ~1 day / CC: ~45 min)** — ThemeContext — applyTheme writes roles + builds MUI; Auto/Light/Dark; boot cache
  - Surfaced by: R1 shape 2, R3
  - Files: frontend/src/contexts/ThemeContext.js, theme/muiTheme.js, public/index.html
  - Verify: `CI=true npx react-scripts test --watchAll=false`
- [ ] **T3 (P1, human: ~1 day / CC: ~1 h)** — icons — Icon component, sweep 56 files, Material names in config with Lucide map, subset + test
  - Surfaced by: D16, R6, R13
  - Files: frontend/src/components/Icon.js, 56 importers, backend/app/config.py, undergrad_config.yaml
  - Verify: full frontend + backend suites; no `lucide-react` import left
- [ ] **T4 (P1, human: ~4 h / CC: ~20 min)** — tokens — alias layer, raw hex → tokens, contrast test over every school theme
  - Surfaced by: R8, plan T0.2
  - Files: frontend/src/styles/*, brandTokens.test.js, backend theme test
  - Verify: both suites
- [ ] **T5 (P1, human: ~1 day / CC: ~1 h)** — PrereqGraph — SVG graph with AND/OR groups and keyboard access, replacing cytoscape
  - Surfaced by: R11, R14
  - Files: frontend/src/components/course/PrereqWeb.js, CourseVisuals.js
  - Verify: ported AND/OR tests
- [ ] **T6 (P2, human: ~4 h / CC: ~20 min)** — Ask home — date-aware "Your classes today"
  - Surfaced by: R12
  - Files: frontend/src/pages/HomePage.js, planner/semester/semesterData.js
  - Verify: future-term, out-of-range, UW cases
- [ ] **T7 (P1, human: ~1 day / CC: ~45 min)** — degree data — payload edges + unfilled slots, start_term, optional line + deadline
  - Surfaced by: R2, R9, R10
  - Files: backend/app/planner/{degree,edits,programs}.py, schools/*/programs/*.yaml, SetupDialog.js
  - Verify: backend suite + new cases
- [ ] **T8 (P2, human: ~1 day / CC: ~1 h)** — route model — routeModel + RouteMap + RouteList
  - Surfaced by: R4
  - Files: frontend/src/components/planner/degree/
  - Verify: model tests; phone route render test
- [ ] **T9 (P2, human: ~2 h / CC: ~10 min)** — cleanup — remove aliases; token test forbids old names
  - Surfaced by: R5
  - Files: frontend/src/styles/
  - Verify: both suites

### Unresolved decisions
None.

### Completion summary
- Step 0: Scope Challenge — scope accepted as-is (smaller arrangement D16)
- Reality rows: 7/7 applicable rows emitted, 0 unverified premises
- Architecture Review: 1 issue found
- Code Quality Review: 4 issues found
- Test Review: diagram produced, 23 gaps identified
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: outside review, completed (6 findings, all accepted)
- Parallelization: 3 lanes, 3 parallel / 3 sequential phases
- Lake Score: 3/3 answers picking a 10/10 option (D17, D18, D19)

REALITY: premise-table pass 5 premises with receipts (config.py:53, muiTheme.js:3, programs.py:47, TODOS.md:74, edits.py:32), unverified=0 docs/designs/home-colors-build.md
REALITY: already-done pass no commits touch the planned files since the plan was written; HEAD 95f5398 frontend/src/contexts/ThemeContext.js:1
REALITY: surface-check pass /api/config route exists backend/app/main.py:91
REALITY: binding-decisions pass D12–D15 and D16–D19 honored; no default reintroduced docs/designs/home-colors-build.md
REALITY: numbers finding 225 hex (165 CSS + 60 JS) and 56 icon files measured by grep; font size not measured [re-measure before gate] frontend/src
REALITY: deferred-asks pass no linked issue docs/designs/home-colors-build.md
REALITY: pr-count pass local commits only, no PRs; merges into feat/home-colors docs/designs/home-colors-build.md

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Outside Review | outside review via `/plan-eng-review` | Independent 2nd opinion | 3 | completed (issues_found) | 6 findings, all accepted (R9–R14) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 3 | issues_open | 29 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — (design set by /design-consultation, DESIGN.md) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** outside review, plan-review phase, completed; 6 findings (4 High, 2 Medium), all verified against code and accepted.
- **CROSS-MODEL:** Outside review added data-contract gaps (prerequisite edges, unfilled slots, start term, AND/OR semantics, date-aware classes, config icons, shared graph ownership) that the native review missed; both agree the restyle lanes need disjoint file ownership.
- **VERDICT:** Eng review complete with all 14 decisions resolved; issues are mapped to tasks T1–T9 (ISSUES OPEN = work to do, not blockers). Ready to implement.

NO UNRESOLVED DECISIONS
