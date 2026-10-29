# TODOS

## Design

### Write a DESIGN.md for Campus Companion

**What:** Record type scale, spacing, radii, colour roles and component rules in a DESIGN.md (run /design-consultation).

**Why:** The design system lives only in frontend/src/styles/brand-tokens.css plus per-page CSS, so each review has to rebuild contrast and token rules by hand.

**Context:** Raised by /plan-design-review on 2026-10-27 (docs/designs/campus-pages-plan.md, Pass 5 scored 8/10 for this reason). Start from decisions 23A-25A in that plan: coloured text uses the `--domain-*-ink` tokens, bright domain colours only for graphics; new `--focus-ring`, `--error-ink`, `--error-tint` and `--selection` tokens; every figure labelled with its own term or date. Keep it in sync with brand-tokens.css.

**Effort:** S
**Priority:** P2
**Depends on:** None

## Planner

### Add a gen-ed rule kind and encode gen-ed groups

**What:** Add a `gen_ed` rule kind to `backend/app/planner/programs.py` (RULE_KINDS) and `checker.py`. It matches courses by gen-ed tag, needing `n` courses or `credits`. Then hand-check and encode UW breadth / Comm / QR groups and UVA Disciplines groups in the program files.

**Why:** The degree waffle shows only the rules a program file encodes, plus one "Other credit" block (eng review R14, docs/designs/tab-workspaces.md). Encoded gen-ed rules would give real gen-ed squares and better requirement coverage.

**Pros:** The data is already parsed: UW designations (`_uw_source.py:738`) and UVA Disciplines (`csv_snapshot.py:508`). No redesign is needed; the waffle already draws one group per encoded rule.

**Cons:** About a day of code plus hand-checking for each school. Finish stays hidden at UW, because residency, the language requirement and the 108 L&S credits have no data source, so `complete` stays false.

**Context:** This came out of the R14 investigation in the 2026-10-28 eng review. Start with UW breadth, since its designations carry clear prefixes.

**Effort:** M
**Priority:** P3
**Depends on:** R14 (the encoded-groups waffle) shipped

### Hide "Your classes today" on in-term breaks

**What:** Add each school's in-term breaks (for example Thanksgiving week) to `schools/*/school.yaml` beside the term's first and last day of classes, and hide the Ask home's "Your classes today" card on those days.

**Why:** After the alignment plan's R12, the card lists classes on every weekday inside the term, including breaks when no classes meet.

**Pros:** One short list per term per school, in the same file and test pattern as the term dates.

**Cons:** More calendar data to look up and keep current each term.

**Context:** Decided in the eng review of docs/designs/home-colors-alignment.md (D13). Start from the term-date check R12 adds in Phase 3.

**Depends on / blocked by:** R12's term dates (alignment plan, Phase 3).

**Priority:** P3

## QA follow-ups (from /qa on undergrad-experimental, 2026-10-27)

Report: .gstack/qa-reports/run-20261027T211619Z/qa-report-localhost-2026-10-27.md

### Show that the level chips scroll on phones

**What:** At 390px the Courses level chips run off the right edge ("400s" half-visible) with no fade or arrow.
**Repro:** Open /courses at 390px wide.
**Severity:** Low · **Category:** Visual · **Priority:** P3

### Give Compare column titles room beside the remove button

**What:** Long course titles in Compare headers truncate right up against the X.
**Repro:** /courses/compare?ids=COMPSCI+298,COMPSCI+900 at 1440px.
**Severity:** Low · **Category:** Visual · **Priority:** P3

### Make the Events calendar arrows page by week

**What:** The Calendar view's arrows step through the named windows (Today, This week, Next 7 days…) instead of real weeks, because /api/events only takes named windows.
**Why:** Known deviation from docs/designs/campus-pages-plan.md; needs a date-range window on the backend.
**Severity:** Medium · **Category:** Functional · **Priority:** P2

### Return collections from listSaved

**What:** `listSaved` in frontend/src/api/campus.js returns only the items and drops `collections` and `unsorted_count`, so the Saved page makes a second request.
**Severity:** Low · **Category:** Performance · **Priority:** P3

### Skip rooms inside the starting building in map suggestions

**What:** Starting at Shannon Library (UVA), "Nearest library" is Scholars' Lab, 69 m away inside the same building.
**Severity:** Low · **Category:** Content · **Priority:** P3

### Fix test_document_upload collection

**What:** `pytest app/tests` stops at collection: app/tests/integration/test_document_upload.py raises FileNotFoundError. Fails on the base commit too.
**Severity:** Medium · **Category:** Tests · **Priority:** P2

## Semester planner follow-ups

- **Find a public UW-Madison meeting-time source.** Course Map sections have seats and term dates but no days, times or rooms, so UW gets no week grid, clash check or walk times. Look for a public, terms-compliant source (UW's public enrollment search, published schedule exports). Depends on nothing. Context: docs/designs/semester-planner.md, eng review R17.

## Completed
