# Planner M1 build contracts

Shared shapes for the parallel build lanes. Change them only with all lanes in
mind. Design and decisions: `docs/designs/semester-planner.md` (eng review
R1–R17, design review 1A–19A).

## Course facts (lane A provides, lane C consumes)

`app/planner/facts.py` dataclasses. Provider entry point in
`app/sources/academics.py`:

```python
async def course_facts(identifiers: list[str], term: str) -> dict[str, CourseFacts]
def planner_terms() -> list[str]   # terms this school's data covers, oldest first, e.g. ["Fall 2026", "Spring 2027"]
def next_term() -> str             # the term students plan for now
```

`term` is a label like "Spring 2027". Keys of the returned dict are the
identifiers as passed in. A provider never raises for one bad course; it
returns `known="unavailable"` with a reason.

## Program files (lane B provides, lane C consumes)

`schools/<slug>/programs/<id>.yaml`, loaded by `app/planner/programs.py`:

```yaml
id: econ-ba
name: Economics B.A.
type: major            # major | minor | certificate | graduate
catalog_year: 2026
source_url: https://...
checked_on: 2026-10-28
total_credits: 120     # degree total-credit rule; omit if unknown
complete: false        # the rules encode EVERY degree requirement (default false; gates Finish)
rules:
  - id: intro
    title: Introductory economics
    kind: all_of       # all_of | n_of | credits_from | level
    courses: [ECON 2010, ECON 2020]
  - id: electives
    title: Economics electives
    kind: level        # any course matching subjects and min_level
    subjects: [ECON]
    min_level: 3000
    n: 4               # n_of / level: number of courses; credits_from: use `credits`
    exclude: [ECON 3010, ECON 3020]
    min_grade: C-      # optional
    double_count: false  # may a course also count toward another rule (default false)
    line: Core theory  # optional: rules sharing a line are one route-map line (R2)
deadline:              # optional: the "Core due" marker
  rules: [micro, macro]
  by_semester: 6       # counted from the student's start_term
```

`programs.py` exposes `list_programs(slug) -> list[Program]` and
`get_program(slug, id) -> Program`, with frozen dataclasses mirroring the YAML.
Invalid files raise at load with the file and field named.

## Plan document (lane C owns `store.py`)

Mongo collection `plans`, unique index `(user_id, school)`:

```
{ user_id, school, revision: int, term: "Spring 2027",
  profile: { program_ids: [...], catalog_year: int|null, class_year: str|null,
             start_term: "Fall 2025"|null,      # first semester, for the "Core due" marker (R10)
             completed: [{ id, grade|null, term|null }],
             interests: { text: str, tags: [str] } },
  courses: [{ id, term, sections: [section ids]|null }],
  undo: { stack: [{ ops, inverse, label, revision }], pointer: int },
  proposal: null | { id, base_revision, ops, summary, term|null, created_at, expires_at,
                     status: "pending"|"applied"|"discarded"|"replaced"|"expired" },
  updated_at }
```

## Report (checker output) and diff

```
report = {
  "term": "Spring 2027", "data_as_of": str|null,
  "credits": {"min": n, "max": n, "status": "met"|"short"|"over"|"unknown",
              "limits": {"min": n, "max": n}|null, "reason": str|null},
  "difficulty": {"label": "Light"|"Balanced"|"Heavy"|null, "harder": n, "graded": n, "total": n},
  "clashes": {"status": "none"|"found"|"unknown", "pairs": [[a, b]], "reason": str|null},
  "rules": [{"program_id", "rule_id", "title", "status": "met"|"short"|"unknown",
             "unit": "courses"|"credits", "completed": n, "planned": n, "needed": n,
             "completed_courses": [ids], "planned_courses": [ids], "reason": str|null}],
  "courses": [{"id", "title", "term", "credits": [min, max]|null, "harder": bool|null,
               "gen_ed": [str]|null, "offered": "yes"|"no"|"unknown",
               "prereqs": {"status": "met"|"short"|"unknown", "reason": str|null},
               "fills": [str]}],
  "later": [{"id", "term"}],
  "schedule": {"published": bool, "reason": str|null,
               "blocks": [{"course", "section", "kind", "day", "start", "end"}]},
}

diff = {
  "heading": "Move ECON 3010 to fall, add ECON 3300",
  "courses": {"added": [ids], "removed": [ids], "moved": [{"id", "from", "to"}]},
  "rules": [{"rule_id", "title", "before": {status, completed, planned, needed},
             "after": {...}}],          # every rule whose counts or status change
  "credits": {"before": [min, max], "after": [min, max]},
  "difficulty": {"before": label, "after": label},
  "clashes": {"before": status, "after": status},
  "unknowns": [str],                    # "Prerequisites not published for UVA"
  "literal_differs": str|null,          # 11A: "You said drop; I moved ECON 3010 to fall"
  "added_courses": [report course rows], # title, credits, labels of proposed additions
  "schedule": {                         # the shown term's week (tab-workspaces R16)
    "blocks_in": [...],                 # after-blocks of added, moved-in or re-sectioned courses (dashed)
    "blocks_out": [...],                # before-blocks that disappear (faded)
    "blocks": [...],                    # alias of blocks_in, for PlanPanel until it migrates
  },
}
```

## Degree board (`GET /api/planner/degree`, `planner/degree.py`)

Facts for every planned term load in ONE bounded batch (shared 6s deadline,
concurrency 8; eng review R12). Each planned course is read with its own
term's facts, completed courses with the plan term's. A term outside
`academics.planner_terms()` makes no provider call of its own: its courses
are looked up in the newest covered term and read `offered: "unknown"` with
no sections (`covered: false`). A term whose calls miss the deadline gets
"unavailable" courses: credits `null`, credit status and load unknown.

```
degree = {
  "revision": n, "term": "Spring 2027",            # the plan's term
  "terms": [{                                      # plan term + every planned term, in term order
    "term": "Fall 2027", "covered": bool,
    "credits": {min, max, status, limits, reason}, # report credits for that term
    "difficulty": {label, harder, graded, total},
    "courses": [{"id", "title", "credits": [min, max]|null, "avg_gpa": n|null,
                 "harder": bool|null, "offered": "yes"|"no"|"unknown",
                 "requirements": [rule titles], "gen_ed": [str]|null}]}],
  "completed": [{"id", "title", "credits": [min, max]|null, "grade", "term"}],
  "rules": [report rule rows, across all terms],
  "waffle": {
    "total_credits": n|null,                       # largest total_credits of the student's programs
    "complete": bool,                              # every program file says complete: true
    "groups": [{"program_id", "rule_id", "title", "status",   # one per encoded rule, file order
                "size", "earned", "planned", "open",          # credits; earned + planned + open == size
                "unknown_grade": n,                           # this group's own earned courses with no grade on record
                "unknown_grade_credits": n,                   # their credits (<= earned); counted_elsewhere courses excluded
                "courses": [ids],                             # what the rule took (status follows these)
                "counted_elsewhere": [ids]}],                 # taken, but credits counted by an earlier group
                # last: {"program_id": null, "rule_id": null, "title": "Other credit", "status": null, ...}
                # sized total_credits - (distinct rule credits + rules' open credits), never
                # negative; only when total_credits is known. Sizes sum to total_credits.
    "finish": "Fall 2028"|null,                    # only when complete AND nothing is open AND every rule is met
  },
  "route": {                                       # the route map (R2, R9)
    "lines": [{"program_id", "name", "rule_ids": [ids]}],  # a rule's `line`, else its title; file order
    "deadline": {"program_id", "rule_ids", "by_semester"}|null,
    "slots": [{"program_id", "rule_id", "line", "open": n}], # courses a rule needs that the plan hasn't chosen
    "edges": [{"from": id, "to": id}],             # prerequisite links between courses in the plan
  },
}
```

Waffle groups (eng review R14) claim only what the program file encodes; there
is no gen-ed group. A credits rule is sized by its `credits`; a course-count
rule by the credits of the courses it took plus 3 per course still needed (a
course with unknown credits counts 3). Each course's credits count once across
the waffle: a course a `double_count` rule reuses is listed in that group but
adds no credits there, so the earned sum is the distinct earned credits.

## HTTP API (lane C), all scoped to the signed-in user + deployment school

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/planner/plan` | `?term=` (optional) | `{plan, report, proposal: {…, diff}|null, undo_label, redo_label}`; with `term` the report is checked for that term (`dict(plan, term=term)`) |
| GET | `/api/planner/programs` | | `[{id, name, type, rules: [{id, title, courses}]}]` |
| GET | `/api/planner/degree` | | `degree` (above) |
| POST | `/api/planner/edits` | `{ops, expected_revision, idempotency_key}` | `{plan, report, undo_label, redo_label, notes}`; 409 `revision_conflict` |
| POST | `/api/planner/preview` | `{ops, expected_revision, term?}` | `{diff, revision}`: the diff a proposal of `ops` would carry, seen in `term` (default the plan's); writes nothing, a pending proposal is untouched; 409 `revision_conflict`, 422 edit errors |
| POST | `/api/planner/proposals` | `{ops, expected_revision, term?}` (diff shown in `term`, stored as `proposal.term` and reused by the accept recheck) | `{proposal (with diff)}` |
| POST | `/api/planner/proposals/{id}/accept` | `{}` | `{plan, report}`; 409 `{status:"needs_review", proposal}` or `{status:"refused", reason}` |
| POST | `/api/planner/proposals/{id}/discard` | | `{proposal}` |
| POST | `/api/planner/undo` | `{expected_revision}` | `{plan, report, undo_label, redo_label}` |
| POST | `/api/planner/redo` | `{expected_revision}` | `{plan, report, undo_label, redo_label}`: re-applies `undo.stack[pointer].ops` through the edit checks and advances the pointer; 409 `revision_conflict`, 409 `{status:"refused", reason}` ("Nothing to redo", "Can't redo that: …"). A new edit drops the steps after the pointer. `redo_label` is `"Redo: added ECON 3010"` or null |
| GET | `/api/planner/suggestions` | `?q=&term=` | `{items: [{id, title, why, labels, prereqs, credits, gpa, difficulty, fit, fit_reason, section, clashes_with}]}` (fit: see "Suggestion schedule fit") |
| POST | `/api/planner/transcript` | multipart `file` (PDF, DOCX or TXT; 10 MB; PDF 40 pages) | `{rows: [{id, title, grade, credits, term, ticked, checked, in_catalog}], counts: {rows, ticked, not_checked, not_in_catalog}}`; nothing stored, logs carry counts only; 413 `too_large`, 415 `unsupported_type`, 422 `no_file` / `too_many_pages` / `unreadable` (`planner/transcript.py`) |

Ops: `{"op":"add","course":id}`, `{"op":"remove","course":id}`,
`{"op":"move","course":id,"to_term":term,"sections":[ids]?}` (a move clears the
course's sections unless it names new ones), `{"op":"swap","out":id,"in":id}`,
`{"op":"pick_section","course":id,"sections":[ids]}`,
`{"op":"set_profile", ...profile fields}` (a `completed` entry may carry
`credits`, 0–12), `{"op":"set_term","term":term}` (sets `plan.term`; the term
must be one `canonical_term` knows, else `unknown_term`; undo restores the old one).
Errors: `unknown_course`, `couldnt_verify_course`, `unknown_term`, `revision_conflict`.

A client `term` (`GET /plan?term=`, `/preview`, `/proposals`) is matched case-
and space-insensitively against `planner_terms()`, the plan's terms and the
terms the ops name, and used in that spelling (`fall 2027` -> `Fall 2027`); an
unknown term is 422 `unknown_term`.

Every op is validated against the facts of the term it lands in (eng review
R13): `add.term`, `move.to_term`, the current term of the course a `swap` or
`pick_section` changes, otherwise `plan.term`. All terms an edit touches load
in one bounded batch (`facts.load_facts_by_term`). A course added or moved
into a term where it is not offered is kept, with the note
"ECON 3010 isn't offered in Fall 2027" (edit `notes`, diff `unknowns`).

## Chat (lane D)

Planning domain tool `plan_edit` (propose only) with `ToolContext(user_id, school)`
passed by the dispatcher; visual type `proposed_change` carries the proposal
with its diff; visual type `course_shortlist` carries suggestions and the
`term` they were checked for.

The open semester (CEO review O1, eng re-review N2): `/chat-stream` takes an
optional `active_term` ("Fall 2027"). `tool_context_for` keeps it only when it
is one of `academics.planner_terms()` (in the school's spelling) and drops
anything else, so `ToolContext.active_term` never comes from the model.
With it, `plan_summary` says "planning Fall 2027", `plan_suggest` checks
suggestions for that term, and `plan_edit` gives an `add` with no `term` that
term and draws the proposal's diff for it (`proposal.term`). Without it everything uses `plan.term`. `GET /api/planner/suggestions`
returns `{items, reason, term}`.

## Catalog course summary (`GET /api/catalog/{id}`, `sources/academics.course_summary`)

Fields the planner rules decide; the frontend reads them and never recomputes.

```
summary = {
  ...,                                   # identifier, title, grades, sections, ... (see course_summary)
  "difficulty": "easier"|"typical"|"harder"|null,   # always present (eng review R5)
}
```

`difficulty` uses the planner's per-school rule (`facts.difficulty_of`):
"harder" is the course facts' `harder` flag (the school's
`planner.harder_below_gpa`, else the hardest third of the snapshot's grade
data, `csv_snapshot._hardest_third`); of the rest, an average GPA at or above
`planner.easier_from_gpa` (default 3.4, `facts.EASIER_FROM_GPA`; read with
`getattr`, so it takes effect once `PlannerConfig` declares the field) is "easier",
anything else "typical". null when the course has no average GPA or the school
has no "harder" cutoff. Per school: UVA all three labels; UW "harder" below
3.4, so with the default easier cutoff a UW course is "harder" or "easier",
never "typical", until its pack sets `easier_from_gpa`; CU always null (FOSE
publishes no grades).

## Chat course cards (`api/visuals.py`)

Course card refs (`{type: "course_*", course, term?}`) are emitted for every
school (eng review R7) and hydrate from `/api/catalog/{id}`; snapshot results
are no longer skipped, and their summary keeps `as_of` / `sections.as_of` for
the dated label (R8). Sources: UW `course_grades`, `course_prerequisites`,
`course_next`, `course_sections`; UVA `course_grades`, `course_sections` (its
`term` is a label like "2026 Spring", not a number); CU `search_courses`
(FOSE) gives `course_schedule` and `course_instructors` when its rows are one
course, nothing for a subject listing (no grades at CU). Course links
(`course:` markdown) stay UW-only (`academics.links_to_course_pages`).

### Prerequisites and chains (`prerequisites`, `prereq_chain`)

```
"prerequisites": {"text": str, "courses": [{"identifier", "title", "timing"?}]}|null,  # capabilities.prerequisites
"prereq_tree": {kind: all|any|course, ...},       # planner-checkable tree; UW only
"prereq_chain": {                                 # only when the course's requisites name a course
  "root": "CS 4774",
  "courses": [{"id", "title", "depth": n,         # breadth-first, root at depth 0
               "requires": [ids],                 # courses its requisites name (and/or not kept)
               "known": bool}],                   # false: the source didn't answer for it
  "complete": bool,                               # false when depth 4, 30 courses or 6 s cut it short
}
```

`academics.prereq_chain` walks the provider's `prerequisites` level by level.
Per school:

- UW (Course Map): structured requirements; `prereq_tree` (and/or, minimum
  grade, timing) for the course itself, `prereq_chain` for the levels below.
- UVA (snapshot): no structured prerequisites. `prerequisites.text` is the
  description's "Prerequisite:" / "Co-requisite:" sentences as written (768 of
  2,839 Spring 2027 courses have one); `courses` are the codes they name that
  the snapshot lists (a bare number takes the subject before it), with
  `timing` "prior" or "concurrent". No `prereq_tree`: how the courses combine
  is only in the text, so the planner keeps reading UVA prerequisites as
  unknown. `next_courses` stays unavailable.
- CU (FOSE): the class search rows carry no prerequisites (fields: code,
  title, crn, no, schd, meets, meetingTimes, instr, dates, linked_crns,
  cart_opts); `capabilities.prerequisites` is false and there is no
  `prerequisites`, `prereq_tree` or `prereq_chain`. Reading FOSE's per-section
  details would be a new source path and isn't built.

Chat: a `course_prerequisites` result naming at least one course gives
`{type: "course_prereq_map", course}` (hydrated from the summary above); the
legacy flat `prereq_tree` spec is no longer emitted but still renders for old
messages. UVA's pack now enables `course_prerequisites`.

### Section rows (`sections.rows[]`)

```
{"id", "section", "type", "instructors": str, "enrolled", "capacity", "seats_open", "is_open",
 "meetings": [str]?,                                  # as the source writes them
 "meeting_times": [{"day": "Mo", "start": "HH:MM", "end": "HH:MM"}]?,  # parsed, 24-hour, school-local
 "waitlist": n?,                                      # students waiting at snapshot time
 "bldg": str?}                                        # CU only
```

A key is left out where the source lacks it. UVA (snapshot): instructor per
section, `meeting_times`, `waitlist` (the summary reads `sections_url`, the
Fall 2026 file; the Spring 2027 file reads 0 waiting everywhere today). CU (FOSE): instructor per section and
`meeting_times`; no seats, no waitlist. UW (Course Map): seats only; no
meeting times, no waitlist, and instructors per course, not per section.
Snapshot data stays dated: `as_of` and `sections.as_of` carry the snapshot
date and `sections.historical` is true (R8: the frontend shows "{enrolled} of
{capacity} · {term}" and no "waiting" for it).

## Instructor ratings (`GET /api/catalog/ratings/{id}?term=`, `sources/ratings.py`)

```
{"identifier", "ratings": [{name, rating, difficulty, num_ratings, would_take_again_pct?, url?}],
 "source": {name, url}|null,
 "instructor_rating": {"rating": 3.6,          # plain mean, one decimal
                       "instructors": 2,       # how many rated instructors it averages
                       "term": "Spring 2027"|null}|null}   # null: nobody rated (hide the tile)
```

Design Q15: the mean rating of the instructors teaching `term`'s sections
(`term` is the plan's term, "Season YYYY"; default `academics.next_term()`).
It is on the ratings payload, not the summary, because the summary must stay
free of RateMyProfessors lookups (and ratings already reads the summary).
Only unambiguous matches count (the `ratings.match` rule). Per school: UVA
from that term's snapshot file (null for a term with no file); CU from FOSE's
rows for the term, but FOSE names instructors by initial or last name only
("K. Nielsen", "Shandilya/Hoenigman"), which never match a full RMP name, so
CU is in practice null; UW from Course Map's own ratings of the course's
instructors (Course Map doesn't say who teaches which term, so `term` is null).

## Suggestion schedule fit (eng review R9, `planner/suggest.schedule_fit`)

Each suggestion item (`/api/planner/suggestions`, `plan_suggest`, the
`course_shortlist` visual) also carries:

```
"gpa": n|null,                                   # the course's average GPA (facts.avg_gpa)
"difficulty": "easier"|"typical"|"harder"|null,  # same rule as the catalog summary (R5)
"fit": "fits"|"clashes"|"unknown",
"fit_reason": str|null,                          # unknown: the checker's reason, e.g. "class times not published"
"section": {"ids": [section ids],                # the chosen bundle, ready for pick_section
            "meetings": [{"section", "kind", "day", "start", "end"}]}|null,
"clashes_with": [course ids],                    # fit == "clashes": the plan courses its sections hit
```

The candidate's sections are tried in order (lectures first; for a bundled
course, one of each required companion kind, the first that clashes with
nothing), each through `checker.check_schedule` with the plan's courses in
the term. `fits`: a bundle clashes with nothing and every course could be
checked. `clashes`: every bundle clashes (`section` null). `unknown`: the
candidate publishes no times (UW Course Map: always), a companion has no
times, or another course in the term can't be checked (e.g. "sections not
chosen"); `section` is then the first bundle with no clash found, or null.
Items rank offered, then prerequisites met, then fits / unknown / clashes.
The `course_shortlist` visual passes all of these fields through.

### Grade figures (`grades`, `cumulative`)

```
{"gpa", "students", "pct_a", "pct_df", "distribution": {bucket: count},
 "buckets": [{"key": "A+", "label": "A+"}, ...],   # the school's own buckets, best grade first
 "term"?, "labels"?: {"a", "df"}, "as_of"?}          # latest-term figure only
```

Each school keeps its own scale (eng review R11; the frontend groups them):
UW `a, ab, b, bc, c, d, f` (labels A, AB, B, BC, C, D, F); UVA `A+, A, A-,
B+, B, B-, C+, C, C-, DFW` (DFW counts D, F and withdrawals together). CU
publishes no grades: no `grades`, `cumulative` or `buckets`.
