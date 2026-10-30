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
  "courses": {"added": [ids], "removed": [ids],
              "moved": [{"id", "from", "to",    # a lead "Move" row:
                         "title": str|null,     # from the destination term's report
                         "credits": [min, max]|null}]},
  "rules": [{"rule_id", "title", "before": {status, completed, planned, needed},
             "after": {...}}],          # every rule whose counts or status change
  "credits": {"before": [min, max], "after": [min, max]},   # the shown term only
  "terms": [{"term": "Spring 2027",     # one row per term whose courses or sections change, term order
             "before": {"min", "max", "status"}, "after": {"min", "max", "status"},
             "limits": {"min", "max"}|null}],
  "prereqs": {"status": "met"|"not_met"|"unknown",   # R10 Prerequisites row
              "courses": [{"id", "term", "status": "met"|"not_met"|"unknown", "reason": str|null}]},
              # checked: added / moved / swapped-in courses, plus any course (in an affected
              # term or a later planned term) whose prerequisite status the edit changes;
              # one not_met -> not_met, else one unknown -> unknown; nothing to check -> met
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
                 "requirements": [rule titles], "gen_ed": [str]|null,
                 "sections": [{"id", "kind"|null,              # the sections the plan picked ([] when none)
                               "meetings": [{"day", "start", "end"}]|null,  # null: times not published
                               "instructor": str|null}],       # CU (FOSE); null at UVA and UW
                 "opens": [{"id", "title"|null, "in_plan": bool}],  # courses this one unlocks
                 "opens_complete": bool}]}],                   # see "Opens" below
  "completed": [{"id", "title", "credits": [min, max]|null, "grade", "term",
                 "opens": [...], "opens_complete": bool}],
  "graduation": {"term": "Spring 2029"|null,       # the spring of profile.class_year, else waffle.finish
                 "source": "class_year"|"finish"|null},
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
    "slots": [{"program_id", "rule_id", "line", "open": n,   # courses a rule needs that the plan hasn't chosen
               "wording": str|null,                # "Any ECON course, 2000 or above"; see "Slot wording"
               "options": [ids]}],                 # a list rule's unchosen courses; [] for level rules
    "edges": [{"from": id, "to": id}],             # prerequisite links between courses in the plan
    "terms": ["Fall 2025", ..., "Spring 2029"],    # every fall and spring from start_term (else the
                                                   # earliest planned/completed term) to graduation.term
                                                   # or the last planned term, whichever is later, plus
                                                   # planned summer/winter terms; at most 16 + those
  },
}
```

Waffle groups (eng review R14) claim only what the program file encodes; there
is no gen-ed group. A credits rule is sized by its `credits`; a course-count
rule by the credits of the courses it took plus 3 per course still needed (a
course with unknown credits counts 3). Each course's credits count once across
the waffle: a course a `double_count` rule reuses is listed in that group but
adds no credits there, so the earned sum is the distinct earned credits.

Opens: with the source's own list of courses that name this one as a
prerequisite (`CourseFacts.unlocks`, UW Course Map "following") `opens` is
every such course, in or out of the plan, and `opens_complete` is true. Where
the source has no such list (UVA, CU) `opens` holds only plan courses whose
prerequisite trees name this one, and `opens_complete` is false: the card
should not claim the list is whole. Ids are matched spacing-blind ("COMP SCI
300" is "COMPSCI 300"). Titles are null when unknown.

Slot wording comes only from the rule data: `level` reads "Any ECON course,
3000 or above" ("Any ECON or MATH course, 3000 to 4999", "Any ECON course",
"..., up to 4999"); `all_of` names the unchosen courses ("ECON 2020 and
ECON 2030"); `n_of` and `credits_from` read "One of ECON 4010 or ECON 4020"
(at most 3 named) or "One of 6 listed courses", excluded courses left out.
`one_of_groups` and a level rule without subjects have `wording: null`.
`CourseFacts` gained `unlocks: tuple[Unlock(course, title)] | None` and
`Section.instructor: str | None`.

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
| GET | `/api/planner/suggestions` | `?q=&term=` | `{items: [{id, title, why, labels, prereqs, credits}]}` |
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
