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
type: major            # major | minor | certificate
catalog_year: 2026
source_url: https://...
checked_on: 2026-10-28
total_credits: 120     # degree total-credit rule; omit if unknown
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
```

`programs.py` exposes `list_programs(slug) -> list[Program]` and
`get_program(slug, id) -> Program`, with frozen dataclasses mirroring the YAML.
Invalid files raise at load with the file and field named.

## Plan document (lane C owns `store.py`)

Mongo collection `plans`, unique index `(user_id, school)`:

```
{ user_id, school, revision: int, term: "Spring 2027",
  profile: { program_ids: [...], catalog_year: int|null, class_year: str|null,
             completed: [{ id, grade|null, term|null }],
             interests: { text: str, tags: [str] } },
  courses: [{ id, term, sections: [section ids]|null }],
  undo: { stack: [{ ops, inverse, label, revision }], pointer: int },
  proposal: null | { id, base_revision, ops, summary, created_at, expires_at,
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
  "schedule": {"blocks": [...]},        # week blocks of proposed additions (dashed in the grid)
}
```

## HTTP API (lane C), all scoped to the signed-in user + deployment school

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/planner/plan` | | `{plan, report, proposal: {…, diff}|null, undo_label}` |
| GET | `/api/planner/programs` | | `[{id, name, type, rules: [{id, title, courses}]}]` |
| POST | `/api/planner/edits` | `{ops, expected_revision, idempotency_key}` | `{plan, report, undo_label}`; 409 `revision_conflict` |
| POST | `/api/planner/proposals` | `{ops, expected_revision}` | `{proposal (with diff)}` |
| POST | `/api/planner/proposals/{id}/accept` | `{}` | `{plan, report}`; 409 `{status:"needs_review", proposal}` or `{status:"refused", reason}` |
| POST | `/api/planner/proposals/{id}/discard` | | `{proposal}` |
| POST | `/api/planner/undo` | `{expected_revision}` | `{plan, report, undo_label}` |
| GET | `/api/planner/suggestions` | `?q=&term=` | `{items: [{id, title, why, labels, prereqs, credits}]}` |

Ops: `{"op":"add","course":id}`, `{"op":"remove","course":id}`,
`{"op":"move","course":id,"to_term":term}`, `{"op":"swap","out":id,"in":id}`,
`{"op":"pick_section","course":id,"sections":[ids]}`,
`{"op":"set_profile", ...profile fields}`.
Errors: `unknown_course`, `couldnt_verify_course`, `revision_conflict`.

## Chat (lane D)

Planning domain tool `plan_edit` (propose only) with `ToolContext(user_id, school)`
passed by the dispatcher; visual type `proposed_change` carries the proposal
with its diff; visual type `course_shortlist` carries suggestions.
