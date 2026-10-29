# Audit 2: cards inside chat answers vs the approved mockups

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (M = that folder).
App: `/Users/macmini/Developer/undergrad-advisory-panel/frontend/src` (paths below are relative to it).
Method: I read the mockup HTML/CSS and the PNGs (uva, cu and uw; light and dark; desktop and phone), the card components, `styles/CourseVisuals.css`, the tokens, and `backend/app/api/visuals.py` plus the providers that fill the payloads. Read-only. I did **not** render live answers in the running app, because that needs LLM calls. Every item comes from reading the code against the mockups.

Sizes: S = under an hour, CSS or wording. M = a component change. L = needs new data, a backend change, or a new path.

Deviations the build kept on purpose (listed for completeness, not counted as gaps): the legend says "Unlocks" where the mockup says "Also opens" (PrereqGraph.js:348); the proposal buttons say "Accept" / "Discard" where the mockup says "Apply" / "Not now" (ProposalCard.js:228,233). **Both still contradict DESIGN.md:187**, which names "also opens" and "Apply / Not now". Either update DESIGN.md or the code so the two agree.

---

## 0. The answer frame around the cards (MessageBubble, AnswerPanel)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 0.1 | On desktop above 1100px the "Checked" line is hidden inside the answer and moved to a right-hand "This answer" panel, which also has "Places mentioned" and "Also today / Today" sections. The mockups have no side panel: Checked sits inline under the cards at every width, and the thread is one centred 760px column. | components.css:143 `.checked`; every chat PNG | CourseVisuals.css:56-60 (`.chat-frame .answer-checked {display:none}`); AnswerPanel.js:89-143; ChatFrame.css:284; ChatPage.js:598 | M |
| 0.2 | The meta row under an answer is different. Mockup (ask-chat): a "Class search" source chip (`verified` icon) followed by copy, thumb up and thumb down, each a 36px borderless round icon. App: five 32px square buttons (6px radius, 1px border, lift on hover): Reply, Copy, More (`open_in_full`), Speak and Search for references. There is no thumbs feedback anywhere, and no backend endpoint for it. | ask-chat.html:42; components.css:63-64 | MessageBubble.js:569-668; components.css:615-655 (old style, `translateY(-1px)` and a shadow on hover) | M (L if feedback must be stored) |
| 0.3 | A "Sources" `<details>` dropdown is added under every plain answer. It's not in any mockup. | n/a | MessageBubble.js:567; AnswerSources.js:34-46; CourseVisuals.css:27-47 | S |
| 0.4 | The Checked chip for the planning domain ("Your plan") uses the fallback `check` icon. The mockup uses `route`. | chat-prereq.html:30 | SourcesChecked.js:5; AnswerPanel.js:6 (`DOMAIN_ICONS` has no `planning`) | S |
| 0.5 | The mockup's per-tool source chip ("Class search", `verified`) has no counterpart. The app only shows domain chips (Courses, Events, Campus map, Your plan). | ask-chat.html:42 | backend `app/api/visuals.py:242` DOMAIN_LABELS | S |
| 0.6 | Cards get `box-shadow: var(--shadow-rest)`. The mockup `.vcard` and `.ccard` have none: border only. | components.css:44,137 | CourseVisuals.css:111 | S |
| 0.7 | The phone breakpoint is 767px. Mockup cards switch at 700px. | components.css:150; chat-*.html `@media (max-width:700px)` | CourseVisuals.css:733 | S |
| 0.8 | `.vc-tag` uses an 8px radius (`--r-sm`). The mockup `.tag` is a full pill (`--r-full`). This affects the seat tags, the shortlist label chips and every other in-card tag. | system.css:200 | CourseVisuals.css:246 | S |
| 0.9 | `.vc-btn` is 15px with a 6px icon gap. The mockup `.btn` is 14.5px with an 8px gap, and its icons use FILL 0, wght 600. | system.css:185-189 | CourseVisuals.css:179-197 | S |
| 0.10 | `SuggestionsPanel.js` is no longer used by any page (only its test imports it). It still uses the pre-redesign classes `surface-card`, `accent-dot` and `prompt-advisor-chip`. Delete it or restyle it. | n/a | components/SuggestionsPanel.js | S |

---

## 1. Course card (ask-chat.html; `CourseAnswerCard`, course branch)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 1.1 | **Course cards never appear at UVA or CU.** `build_visuals` skips every course builder unless the provider is `uw_coursemap`. UVA (csv_snapshot) and CU (FOSE) answers have no course card and no difficulty card, yet the ask-chat and chat-grades mockups are drawn for UVA and CU. | ask-chat-uva-*.png, ask-chat-cu-*.png | backend `app/api/visuals.py:273-281`; `app/sources/academics.py:51-53` | L |
| 1.2 | **Footer actions differ.** Mockup: a primary "Add to plan" (`add` icon) and a bordered "Save" button with a bookmark icon and the word "Save". App: a secondary "Course page" with no icon, an icon-only 44px SaveButton, and an "Open in Courses →" text link pushed to the right. "Add to plan" is missing, although `planner.propose([{op:'add'}])` already exists and the shortlist uses it. | ask-chat.html:41; components.css:57 | CourseAnswerCard.js:222-234; SaveButton.js; CourseVisuals.css:139-145,226-237 | M |
| 1.3 | **Section rows are a different design.** Mockup `.sec`: section number (Unbounded 11px, muted, 44px column), meeting time, instructor (muted), then a pill tag: "41 seats" in good tint when open, "4 waiting" in signal tint when waitlisted. App: a "Seats" label column (92px), then per row the section name (84px), a seat-fill **progress bar**, and a tag "N left" or "Full" (error tint). There's no time and no instructor, and the tag words differ ("left" vs "seats", "Full" vs "N waiting"). | ask-chat.html:40; components.css:53-56 | CourseAnswerCard.js:173-200; CourseVisuals.css:314-344 | M |
| 1.4 | Payload gap behind 1.3: UW Course Map sections carry no meeting times and no per-section instructor ("Course Map does not say who teaches which section"), and no provider sends waitlist counts. | — | backend `app/tools/_uw_source.py:420-428,455-467`; `academics.py:_CAPABILITIES` (`meeting_times: False` for UW) | L |
| 1.5 | Extra "Instructor" section: top-rated name, "4.1 quality · 3.2 difficulty · 120 reviews", "Rate My Professors, out of 5" and an "N more on the course page" link. None of this is in the mockup. It's extra text under the no-added-text rule. | ask-chat.html (absent) | CourseAnswerCard.js:142-171,333-340; CourseVisuals.css:327-331 | M |
| 1.6 | Extra grade bars inside the course card when the answer also had grade refs. The mockup course card has only the band and the section rows. | ask-chat.html | CourseAnswerCard.js:332 | S |
| 1.7 | The "Rating of 5" tile appears only when a `course_instructors` ref exists **and** ratings loaded. "Seats open" appears only with `course_schedule`. The mockup always has three tiles; the app can show one or two, and the grid then leaves empty columns (`repeat(3, …)` with fewer children). | ask-chat.html:39 | CourseAnswerCard.js:322-330; CourseVisuals.css:283-290 | S |
| 1.8 | Difficulty colours on the band differ. Mockup: easier `#7FDCA4`, typical `#F5B36E`, harder `#FF8F87`. App: `#3DD07A`, `#F59E4C`, `#F97066`. | components.css:52 | brand-tokens.css:54-56; CourseVisuals.css:310-312 | S |
| 1.9 | On phone the app shrinks the band: h3 17px, stat value 18px, label 12px, padding 10px. The mockup keeps h3 19px and value 21px, and hides only the instructor column. | ask-chat.html:18-20 | CourseVisuals.css:736-740 | S |
| 1.10 | Footer padding is `4px 20px 18px`; the mockup's is `12px 18px 16px`. | components.css:57 | CourseVisuals.css:144 | S |
| 1.11 | The band's stat label wraps differently on phone: the app sets the label to `display:block`. The mockup's label is an inline span (the cells are still blocks). Minor. | components.css:51 | CourseVisuals.css:740 | S |

## 2. Difficulty card (chat-grades.html, first card; `CourseAnswerCard`, grades branch)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 2.1 | The third tile says "D or F" (value `pct_df`). The mockup says "Finished" (completion rate, e.g. 96%). The backend has no completion or withdrawal figure, only `pct_a` and `pct_df`. | chat-grades.html:49 | CourseAnswerCard.js:284; backend `academics.py:339-341` | S (wording) + L (data) |
| 2.2 | The extra footer ("Course page", Save, "Open in Courses →") is drawn on the difficulty card. The mockup card has none. | chat-grades.html:48-51 | CourseAnswerCard.js:309 | S |
| 2.3 | The chart caption reads "Grades, {latest term}", with "GPA 3.18 · 182 students" pushed to the right. The mockup reads "Grades, last 3 years" with nothing on the right. The extra text breaks the no-added-text rule. The data is cumulative (`grades` from the latest term, or cumulative?), so the term label may also be wrong. Check `useCourseDetail`. | chat-grades.html:50 `.cap` | CourseAnswerCard.js:76-83; CourseVisuals.css:165-176 | S |
| 2.4 | Bar geometry differs. Mockup: a 110px box, bar height = pct × 2.6px (absolute), % labels absolutely 20px above each bar, grade letters in a separate row 6px below, caption margin-bottom 26px. App: a 140px box, the tallest bar always fills the column (heights relative to the top bucket), the % label and letter stacked in each flex column with a 4px gap, caption margin 12px. | chat-grades.html:7-12 | CourseAnswerCard.js:84-96; CourseVisuals.css:376-392 | S |
| 2.5 | Bucket handling differs. App drops zero buckets and shows each payload key uppercased, so UW draws separate D and F bars, possibly plus OTHER. The mockup always shows six fixed buckets and merges "D/F". The mockup highlights the first bar (A); the app highlights the largest. | chat-grades.html:33-38,50 | catalogFormat.js:100-111; CourseAnswerCard.js:72,92 | S |
| 2.6 | The difficulty tone ignores per-school overrides. The tile uses static `--difficulty-*-ink`, not the school role `--easier/--typical/--harder`. At UW, DESIGN.md:150 and the UW yaml (`harder: #14171F` light, `#EEF0F4` dark) say "harder" is ink, but the app shows red `#B42318`. | system.css:76,82; chat-grades.html:17,49 `color:var(--${diff})` | CourseVisuals.css:368-370; schools/uw-madison/school.yaml:32,51 | S |
| 2.7 | The difficulty thresholds are hard-coded (≥3.4 easier, <3.0 harder) and ignore the school's `harder_below_gpa` (UW 3.4). The word and colour can disagree with the school's own rule. | — | popupFormat.js:4-10; school.yaml:63 | S |
| 2.8 | The tile value is weight 700; mockup `.dtile b` is 600. The trend's latest-value label is also 700; mockup is 600. | components.css:119,148; chat-grades.html:69 | CourseVisuals.css:363,398 | S |
| 2.9 | The trend SVG uses a fixed `viewBox 0 0 320 130` with `width:100%`, so its text and stroke scale with the column. The mockup draws at the real pixel width, so 11.5px labels stay 11.5px. On a wide desktop column the labels grow about 10–15%. The app also adds round line caps. | chat-grades.html:62-71 | CourseAnswerCard.js:105-137; CourseVisuals.css:394-399 | S |
| 2.10 | The two-chart row is `repeat(auto-fit, minmax(240px,1fr))`; the mockup's is a fixed `1fr 1fr` that stacks at 700px. Same outcome at most widths. | chat-grades.html:6,19 | CourseVisuals.css:372 | S |

## 3. "Fits your schedule" shortlist (chat-grades.html, second card; `CourseShortlistCard`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 3.1 | The title says "Suggested courses"; the mockup says "Fits your schedule". | chat-grades.html:56 | CourseShortlistCard.js:37 | S |
| 3.2 | **The row anatomy differs.** Mockup `.srow`: code (Unbounded, muted) above the title (bold), then a time tag (`.tag.plan`, e.g. "TuTh 8:00"), the average GPA in Unbounded 14px coloured by difficulty, and a 42px round icon "+" button (`aria-label "Add X"`). App: the code as a link plus " · N cr", the title, a "why" paragraph, label chips, a prerequisite status line ("Prerequisites met"), and a text button "+ Choose". | chat-grades.html:13-17,57 | CourseShortlistCard.js:87-124; CourseVisuals.css:561-581 | M |
| 3.3 | Payload gap: `plan_suggest` items carry `id, title, why, labels, prereqs, credits`, with no average GPA and no meeting time. A difficulty-ranked "easier" shortlist with times can't be drawn. | — | backend `app/planner/suggest.py:93-102`; `visuals.py:191,210-221` | L |
| 3.4 | The same text appears twice: `why` is `"; ".join(labels)` on the backend, and the card renders both the `why` paragraph and the label chips. | — | suggest.py:97-99; CourseShortlistCard.js:101-106 | S |
| 3.5 | An extra lead paragraph (`visual.reason`) sits above the rows. Note that `_shortlist_specs` never forwards `reason`, so this is dead today, and the empty state always shows its default sentence. | — | CourseShortlistCard.js:54,85; visuals.py:191 | S |
| 3.6 | The phone layout isn't specified in the app. The mockup hides the time tag on phone and keeps GPA and +. | chat-grades.html:20 | CourseVisuals.css:748 | S |

## 4. Event list (chat-campus.html, first card; `EventListCard`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 4.1 | **The card header is missing.** The mockup has an `event` icon, the h3 "Later today" and, on the right, a muted "Times in Eastern Time". The app card starts straight at the rows. The payload has `timezone` and `query.when`, enough for both. | chat-campus.html:39 | EventListCard.js:104-105 | S |
| 4.2 | An extra date badge ("OCT 27", **uppercase** month and day) sits above each time. The mockup has no date. All-caps small labels conflict with DESIGN.md:200 and the QA commit c3a092f. | chat-campus.html:40 | EventListCard.js:56-67,111-116; CourseVisuals.css:662-664 | S |
| 4.3 | The time format is "12:30 PM" in Unbounded (from `toLocaleTimeString`); the mockup has "12:30" with "to 1:30 PM" underneath. In Unbounded at 14px, "12:30 PM" is about 75px, which overflows the 76px column (64px on phone). | chat-campus.html:40 | EventListCard.js:16-33,117; CourseVisuals.css:605,614-620 | S |
| 4.4 | The place line has a `location_on` pin icon. The mockup has an 8px domain dot coloured by the event's kind (`.kd.life`, `.kd.academics`, `.kd.campus`). The payload has `calendar` but no domain or kind per event. | components.css:39-41 | EventListCard.js:123-128 | S + L(data) |
| 4.5 | **The walk pill differs.** Mockup: "🚶 9 min", green, showing walking minutes. App: "🚶 Directions", a button that sends "How do I get to X?". The `events_search` payload has no walking minutes and no origin. | chat-campus.html:40; components.css:25-27 | EventListCard.js:143-152; backend visuals.py:146-167 | M + L(data) |
| 4.6 | **The row actions differ.** Mockup: two 38px round muted icon buttons on the right (`calendar_add_on`, `bookmark`). App: two text chips under the title, "Add to calendar" and "Event details ↗", plus a 44px SaveButton on the right. That adds text and an extra external-link action. | components.css:28-29 | EventListCard.js:129-141,153-162; CourseVisuals.css:666-677 | M |
| 4.7 | An extra footer reads "N more on the calendar" and "See all on Events →". Not in the mockup. | — | EventListCard.js:167-176; CourseVisuals.css:681-693 | S |
| 4.8 | The phone layout differs. Mockup: time, title and walk pill on row 1; calendar and bookmark under the time on row 2. App: walk pill moved to row 2 under the title, Save in row 1 col 3, and the chips in the middle column. | chat-campus-uva-phonefull.png; components.css:94-98 | CourseVisuals.css:742-747 | S |

## 5. Place card (chat-campus.html, second card; `PlaceCard`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 5.1 | **The tiles differ.** Mockup: always three, "Walk" (2 min), "Open until" (9 PM) and "Access" (`accessible` icon), in `repeat(3,1fr)`. App: one tile, only when the answer had an origin, labelled "from {origin name}" with "~N min" and an extra "N m straight line". | chat-campus.html:12,43 | PlaceCard.js:67-75; CourseVisuals.css:727-729 | M |
| 5.2 | Payload: `hours` is sent but never rendered, so "Open until" is missing even though `places.py:308` already computes `until`. No accessibility field exists, and walk minutes exist only with an origin. | — | backend visuals.py:183; app/sources/places.py:308-309 | M (open until) / L (access, walk without origin) |
| 5.3 | **The actions differ.** Mockup: primary "Directions" (`directions_walk`) and secondary "Open in map" (`map`). App: primary "Open on map" with a map icon and a trailing →, and secondary "Open in OpenStreetMap ↗" (external). | chat-campus.html:44 | PlaceCard.js:76-88 | S |
| 5.4 | The map pin always shows `location_on`. The mockup pin shows the category icon (`restaurant` for dining). | chat-campus.html:53 | PlaceCard.js:55 (no `icon` prop); map/MiniMap.js:23,48 | S |
| 5.5 | **Dark mode bug: the tiles are inverted twice.** `CourseVisuals.css:702` filters each `.mini-map-tile`, and `Popups.css:793-796` filters the parent `.mini-map-tiles`. Together the inversion cancels, and dark mode gets light, dimmed tiles. The mockup inverts once. | components.css:104 | CourseVisuals.css:702; Popups.css:793-796 | S |
| 5.6 | An extra SaveButton sits beside the place name. Not in the mockup. | chat-campus.html:42 | PlaceCard.js:63-66 | S |

## 6. Prerequisite graph (chat-prereq.html, first card; `PrereqGraph`, `PrereqTree`, `CourseVisualCard`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 6.1 | **Chat answers never draw the graph.** `course_prerequisites` produces the legacy flat `prereq_tree` spec, which renders `PrereqTree`: a band-coloured pill for the course plus a row of course chips, no SVG and no states. `course_prereq_map`, the only path to `PrereqCard`/`PrereqGraph` in chat, is emitted by no builder. The backend comment says the course API has no prerequisite graph yet. | chat-prereq.html:27-29 | backend visuals.py:69-92,75; VisualBlock.js:45-46; PrereqTree.js; CourseVisualCard.js:59-88,122-127 | L |
| 6.2 | Payload gap behind 6.1: no path in chat carries `prereq_tree` (AND/OR) or `next_courses` for the asked course. At UVA and CU the provider capabilities are `prerequisites: False`, `next_courses: False`. The mockup itself is UVA. | — | academics.py:68-88 | L |
| 6.3 | The graph can't show a chain. The mockup shows prerequisites of the prerequisite (MATH 1210 and ECON 2010 → ECON 3010 → ECON 4010). The app uses only the asked course's own tree, and every non-asked node edges straight into the asked course. Showing the chain needs recursive prerequisite data. | chat-prereq.html:53-58,75-76 | PrereqGraph.js:267-314 | L |
| 6.4 | Node and gap sizes differ. Mockup: node 176×60 desktop, 150×60 phone; column gap 56 (34 on phone); row gap 22; code text at y+25, title at y+44; phone font sizes 10.5 and 12. App: node 148×52, column gap 40, row gap 14, code at y+22, title at y+39, one font size for every width. | chat-prereq.html:52,92-93 | PrereqGraph.js:26-32,220-221; CourseVisuals.css:419-420 | S |
| 6.5 | The phone "+N more" node has no subtitle. The mockup shows the hidden codes ("4190 · 4210"). | chat-prereq.html:56 | PrereqGraph.js:291 | S |
| 6.6 | Titles are cut at 18 characters with an ellipsis ("Intermediate Micr…"). The mockup uses short titles ("Intermediate Micro", "Industrial Org."). | chat-prereq.html:55-57 | PrereqGraph.js:193,221 | S |
| 6.7 | The legend reads "Unlocks"; mockup and DESIGN.md say "Also opens" (kept on purpose, see top). | chat-prereq.html:29 | PrereqGraph.js:348 | S |
| 6.8 | The app adds "One of" / "All of" group boxes for OR/AND (R11, accepted). They aren't in the mockup, but they're intended. | — | PrereqGraph.js:232-245 | — |
| 6.9 | The legacy `PrereqTree` card (what users actually see, 6.1) uses band-coloured pills and old CourseChip chips. Its "After X you can take" heading isn't in the mockup. | — | PrereqTree.js:21-50; CourseVisuals.css:811-824 | M (goes away with 6.1) |

## 7. Proposed change (chat-prereq.html, second card; `ProposalCard`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 7.1 | The header is missing the "Not applied" status tag (signal tint, right-aligned). The CSS for it exists (`.vc-proposal .vc-head .vc-tag`), but `Head()` never renders one. | chat-prereq.html:34 | ProposalCard.js:79-86; CourseVisuals.css:474 | S |
| 7.2 | An extra h4 sits above the rows (`diff.heading`, or "Change to your plan"). The mockup goes straight from the header to the rows. | chat-prereq.html:35-36 | ProposalCard.js:189; CourseVisuals.css:475 | S |
| 7.3 | **The course move row is missing.** The mockup's first row is the move: swap icon, "<code>ECON 4010</code> Game Theory", and "Fall 2027 → Spring 2027". The backend sends `diff.courses.moved [{id, from, to}]`, `added` and `removed`, but `consequenceRows` ignores `courses` entirely. The app's first row is whatever ranks highest (a requirement, difficulty or credits). | chat-prereq.html:36 | planner/proposalDiff.js:48-90; backend app/planner/edits.py:443-448 | M |
| 7.4 | The lead row always gets the `swap_horiz` "move" icon in tint, even when it's a requirement or credits row, which is misleading. | chat-prereq.html:13,36 | ProposalCard.js:51-52 | S |
| 7.5 | Credits are one row, "Credits this term" with a span (e.g. 12–15 → 15–18). The mockup has a row per affected term ("Spring 2027 credits 7 → 10", "Fall 2027 credits 6 → 3"). The backend `diff.credits` covers only the report's term. | chat-prereq.html:37-38 | planner/proposalDiff.js:52-61; edits.py:462-470 | M + L(data) |
| 7.6 | The "Prerequisites: Met" row is missing (green check icon in good tint, "Met" in good colour, no arrow). The diff has no prerequisite result, and `RowIcon` has no "ok" style. | chat-prereq.html:14,39 | ProposalCard.js:51-57; CourseVisuals.css:493-505 | M + L(data) |
| 7.7 | Every row renders `<s>before</s> → after`. The mockup's non-change rows show a single value. `.vc-arrow` also lacks `white-space: nowrap` (mockup `.arrow` has it), so long spans wrap on phone. | chat-prereq.html:17 | ProposalCard.js:69-74; CourseVisuals.css:507-513 | S |
| 7.8 | The course code inside a row label isn't in Unbounded. The mockup uses `<span class="code">ECON 4010</span> Game Theory`, but the app's labels are plain text. | chat-prereq.html:36 | ProposalCard.js:64-67 | S |
| 7.9 | Extra elements: the `literal_differs` note, the "? unknown" list (with a literal "?" prefix), the "Drop it instead" third button, and the needs-review / refused / held alerts. These are states the mockup doesn't draw; they're kept on purpose, but the "? " prefix and the note are extra text. | — | ProposalCard.js:190,198-216,236-240 | S |
| 7.10 | Buttons read "Accept" (check icon) / "Discard". Mockup and DESIGN.md say "Apply" / "Not now" (kept on purpose, see top). | chat-prereq.html:41 | ProposalCard.js:228,233 | S |
| 7.11 | The vertical gap between the rows and the buttons differs: `.vc-body` bottom padding 18 plus `.vc-foot` top 4. Mockup `.vf` is `0 20px 18px` after `.vb` `6px 20px 18px`. Close; only check this after the other fixes. | components.css:141-142 | CourseVisuals.css:137,144 | S |

## 8. Legacy grade chart (`gpa_chart` → `CourseGradeDistribution`)

| # | Difference | Mockup | App | Size |
|---|---|---|---|---|
| 8.1 | Old persisted answers still render a Recharts bar chart: bars in `--ink`, a y-axis, gridlines, a tooltip, a "Grade Distribution" label above the h2, and a heading with an em dash ("ECON 3010 — avg GPA 3.18"). The new difficulty card style isn't applied. | chat-grades.html | VisualBlock.js:23-41; course/CourseVisuals.js:21-57; CourseVisuals.css:761-809 | S–M |

---

## DESIGN.md violations, collected

- DESIGN.md:187 names "also opens" and "Apply / Not now"; the code says "Unlocks" and "Accept / Discard" (6.7, 7.10). Make the doc and the code agree.
- DESIGN.md:150: UW "harder" should be ink. The chat difficulty tile uses red (2.6).
- DESIGN.md:200, no all-caps labels: the event date badge uppercases the month (4.2).
- DESIGN.md:187 lists the prerequisite graph as an in-chat card, but chat never draws it (6.1).
- DESIGN.md:186, course card: "three stat tiles … then sections … then actions". The tiles are conditional (1.7) and the actions lack "Add to plan" (1.2).
- the "no added text" rule: the grades caption's GPA/students (2.3), the instructor section (1.5), "N m straight line" (5.1), "N more on the calendar" (4.7), the Sources dropdown (0.3), the h4 heading and notes in the proposal card (7.2, 7.9), and the duplicated why/labels (3.4).

## Backend and payload gaps, collected

1. Course cards (course, difficulty) are emitted only for `uw_coursemap`, so UVA and CU get none (1.1).
2. There's no prerequisite graph payload in chat (no `course_prereq_map` builder, no recursive prerequisites, and UVA/CU providers have no prerequisite data) (6.1-6.3).
3. Sections have no meeting time, per-section instructor or waitlist (UW) (1.4).
4. There's no completion rate for "Finished" (2.1).
5. The shortlist has no GPA or meeting time per item (3.3).
6. Events have no walking minutes and no domain/kind (4.4, 4.5).
7. Places: `hours` is sent but not rendered as "Open until"; there's no accessibility field, and walking minutes need an origin (5.2).
8. The proposal diff lacks per-term credits and a prerequisite result. `courses.moved` exists but the frontend ignores it (7.3, 7.5, 7.6).
9. There's no endpoint for answer feedback (thumbs) (0.2).
