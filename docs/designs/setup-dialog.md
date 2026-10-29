# Degree planner setup dialog

First-run setup for My degree on the Courses page, and the way to change it later. Design approved 2026-10-29 (design-shotgun, variant B). Scope: UW–Madison, CU Boulder and UVA.

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/first-run-20261029/`

- `b1-program-v2.png` — Program step with UVA's real programs
- `b-setup-dialog.png` — Completed step with transcript upload
- `b3-first-term.png` — First term step
- `b-phone-completed.png` — Completed step on a phone

## Problem

- **First visit:** a new student sees a bare "Program" dropdown and a Completed button where the credit grid goes (`ProgramPicker` in `DegreeBoard.js`).
- **Changing program:** once a program is chosen, nothing in the app changes it. The UVA MPP can't be picked by a student who already chose a major.
- **Old tour:** the app's only tour (`components/OnboardingTour.js`, wrapping `ChatPage`) is the old PhD-advisor tour. It opens itself on first visit to chat, and 4 of its 6 steps point at sidebar elements that no longer exist.

## Design

A dialog in the pop-up style: black top band with a three-step indicator and the step name as title, white body, footer buttons. Labels only; no helper text.

| Step | Body | Footer |
|---|---|---|
| 1. Program | Programs grouped Undergraduate / Graduate as radio rows with requirement counts; the selected program's requirements with credits and colour dots (the credit grid's colours), plus "Other credit"; Catalog year select; Class year chips | Skip, Next |
| 2. Completed | Upload transcript (PDF · DOCX · TXT) on the left; "Found N" review list on the right (checkbox, code, title, grade, credits), unmatched codes highlighted and unchecked; course-code entry below | Back, Skip, Next |
| 3. First term | Term chips; preview: small credit grid with completed credits filled, Credits done, Open requirements, requirement chips (met ones struck through) | Back, Done |

- **Opens:** automatically on My degree when the plan has no program; from the board header's program name at any time, at step 1.
- **Close (×) or Skip:** saves what's been set so far; the board shows its current state.
- **Done:** saves and closes; the board appears.
- **Phone (<768px):** full-screen sheet; "2 of 3" progress bar in the band; footer pinned to the bottom.
- **Old chat tour:** removed, with no replacement.

## Data

| Step | Saved through | Notes |
|---|---|---|
| Program | `set_profile` `program_ids`, `catalog_year`, `class_year` | Fields exist (`edits.PROFILE_FIELDS`) |
| Completed | `set_profile` `completed: [{id, grade, term}]` | Same as the Completed editor (`CompletedEditor.js`) |
| First term | **Not supported yet** | The plan's `term` is set once at creation (`store.new_plan`, `service.default_term`); no op changes it |

- **Program types:** `programs.py` now has a `graduate` type (the MPP); the program list groups by it.
- **Transcript upload:** `utils/document_extractor.py` already turns PDF, DOCX and TXT into text (used by the chat upload). Matching course codes and grades in that text against the school's catalog is new work.

## Open questions for the eng review

1. **First term:** add `term` to `set_profile`, add a `set_term` op, or derive the first term from the board without saving it?
2. **Transcript parsing:** this version or a second pass? If now: course-code and grade patterns per school, matched against the catalog; text never stored; what happens with unmatched codes and in-progress courses?
3. **Reuse:** how much of `CompletedEditor` (checklist, search, grade entry) moves into step 2, and does the standalone editor stay?
4. **Saving:** one `set_profile` per step, or one at Done? How it interacts with undo/redo and the edit queue in `PlannerContext`.
5. **Changing program with planned courses:** keep planned courses and recompute requirements, or confirm first?
6. **Tour removal:** delete `OnboardingTour.js` and its tests; drop `@reactour/tour` if nothing else uses it.

## Out of scope

- Schools other than UW–Madison, CU Boulder and UVA.
- Degree-audit upload (on `feat/degree-planner-expander`).
- Program file format changes.

## Eng Review

Target: `docs/designs/setup-dialog.md` (this plan). Reviewed 2026-10-29 on `undergrad-experimental`.

### Scope record

feature answers: D1 transcript upload kept (answer: "Keep it (recommended)"); structure: D2 B, smaller arrangement (answer: "Smaller arrangement (recommended)"); accepted scope: one `SetupDialog.js` with the three steps, `CompletedEditor.js` and `ProgramPicker.js` removed with their tests moved, the Past column's Completed button opens the dialog at step 2, backend `planner/transcript.py` plus one upload route, old chat tour removed; pending remedies: R1 first-term saving, R2 save timing, R3 program change with planned courses, R4 entry point with no program.

Scope Challenge result: scope accepted as-is (smaller arrangement preserves scope).

### Scope Challenge findings

1. [CRITICAL] (confidence: 9/10) backend/app/planner/service.py:160 — `return await store.get_or_create(db, str(user_id), school, term=default_term())` sets the plan term once, and `edits.py:32` `PROFILE_FIELDS = ("program_ids", "catalog_year", "class_year", "completed", "interests")` has no term, so step 3's choice can't be saved. → R1
2. [INFORMATIONAL] (confidence: 8/10) frontend/src/components/planner/degree/DegreeBoard.js:235 — `else if (hasPrograms && !programIds.length)` is today's only program entry; with ProgramPicker removed (D2), a student who skips setup has no way back in. → R4
3. [INFORMATIONAL] (confidence: 7/10) docs/designs/setup-dialog.md open question 4 — saving per step or once at Done decides undo entries and what × keeps. → R2
4. [INFORMATIONAL] (confidence: 7/10) DegreeBoard.js:230 — `edit([{ op: 'set_profile', program_ids: [id] }])` replaces the program with planned courses still on the board; the plan doesn't say what the student sees. → R3
5. Tour removal: carried by the earlier design answer D3 "Remove it (recommended)" (design-shotgun, 2026-10-29). No new choice.

## Decision ledger

### R1: How the first term is saved
Finding: 1, CRITICAL, 9/10, backend/app/planner/service.py:160 and edits.py:32
Plan baseline: step 3 shows term chips; saving marked "Not supported yet" (original proposal)
Runtime evidence: plan `term` set at creation from `default_term()` (service.py:160); it is the default term for adds (edits.py:239 `"term": op.get("term") or new.get("term")`) and the highlighted column (DegreeBoard.js:276 `current={column.term === degree.term}`); no op changes it
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 first-term saving | unsaved, pending | new `set_term` op sets plan `term`; validated against known terms; undoable | step 3 is a preview only; no term chips | profile field `start_term`, used only by the board's first column |
| R2 save timing | pending | pending | pending | pending |
| R3 program change | pending | pending | pending | pending |
| R4 no-program entry | pending | pending | pending | pending |
Question D3:
D3 — How should the first term from step 3 be saved?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: Step 3 lets the student pick the term they're planning first. Today the plan's term is set once when the plan is created (service.py:160) and nothing can change it. That same term is where new courses land by default (edits.py:239) and which column is highlighted (DegreeBoard.js:276). So "first term" either has to change that value, or be dropped, or be stored separately.
Stakes if we pick wrong: Store it separately and the board and the add-default disagree about which term is "now"; drop it and step 3 loses its only control.
Recommendation: A because the plan term already means "the term I'm planning now", so one validated, undoable op keeps adds, the highlighted column and chat's active term in agreement.
Completeness: A=9/10, B=5/10, C=6/10
Header: First term
Options:
A) set_term op (recommended)
New edit op `set_term {term}` sets the plan's term, checked against covered and planned terms (service.py:100), with its own undo entry. Backend edits.py + service tests; dialog sends it at step 3. (human: ~3h / CC: ~15 min)
B) Preview only
Step 3 drops the term chips and only shows the preview; the plan keeps the term it was created with. No backend change.
C) Separate start_term
Add `start_term` to profile fields; the board starts its columns there. The add default and highlighted column still use the old plan term.

State: approved
Actual answer: A) set_term op (recommended), D3 answer 2026-10-29
Accepted scope: new edit op `set_term {term}` setting the plan's `term`, validated against covered and planned terms (service.py:100), with its own undo entry; backend edits.py and service tests; the dialog sends it at step 3
History: none

### R2: When the dialog saves
Finding: 3, INFORMATIONAL, 7/10, docs/designs/setup-dialog.md open question 4
Plan baseline: × and Skip save what's been set so far; Done saves and closes (original proposal); timing unspecified
Runtime evidence: edits go through PlannerContext's FIFO queue, one undo entry per `edit()` call; CompletedEditor saves its whole list in one `set_profile` on Save (CompletedEditor.js:133)
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1 first-term saving | approved: set_term op (D3) | set_term at step 3 | set_term in the batch at Done |
| R2 save timing | unspecified, pending | each step saves on Next (program fields, completed list, term); × keeps saved steps; up to 3 undo entries | one batched edit at Done, or at × / Skip for what's set so far; one undo entry |
| R3 program change | pending | pending | pending |
| R4 no-program entry | pending | pending | pending |
Question D4:
D4 — Should the setup dialog save after each step, or once at the end?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: Each step changes something on the plan: program and years, the completed list, the first term. Saving on each Next means a failed save shows on that step and closing the dialog keeps what's done; undo then steps back one part at a time. Saving once at the end makes setup a single undo, but a failure at Done has to say which part didn't save.
Stakes if we pick wrong: Per-step adds up to three undo entries; one batch can lose the whole setup if the save fails and the student closes the tab.
Recommendation: A because a long completed list from a transcript shouldn't ride on the same save as the program, and the Completed editor already saves its list on its own.
Note: options differ in kind, not coverage — no completeness score.
Header: Save timing
Options:
A) Save each step (recommended)
Next saves that step (set_profile for program and years; set_profile completed; set_term at step 3). × keeps steps already saved; errors show on the step with Retry. Up to 3 undo entries.
B) Save once at Done
One edit with all changed ops at Done, or at × / Skip for what's set so far. One undo entry; a failure shows on the last step and names the part that failed.

State: approved
Actual answer: A) Save each step (recommended), D4 answer 2026-10-29
Accepted scope: Next saves its step (set_profile program_ids/catalog_year/class_year; set_profile completed; set_term at step 3); × keeps steps already saved; a failed save shows on its step with Retry; up to 3 undo entries
History: none

### R3: Changing program when courses are planned
Finding: 4, INFORMATIONAL, 7/10, frontend/src/components/planner/degree/DegreeBoard.js:230
Plan baseline: open question 5, unanswered (original proposal)
Runtime evidence: `set_profile program_ids` replaces the program and leaves `plan.courses` untouched; the degree read recomputes requirement groups from the new program; undo restores the old program
Comparison grid:
| Choice | Current | A | B | C |
|---|---|---|---|---|
| R1 first-term saving | approved: set_term (D3) | same | same | same |
| R2 save timing | approved: each step (D4) | same | same | same |
| R3 program change | unspecified, pending | keep planned courses; requirements recompute; undo restores; no confirm | keep courses, but confirm first when any are planned | clear planned courses with the change |
| R4 no-program entry | pending | pending | pending | pending |
Question D5:
D5 — What happens to planned courses when a student changes program?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: Switching from, say, Economics to the MPP in step 1 changes which requirements the board shows. The courses already placed in terms can stay (they just count toward different groups, or "Other credit"), stay after a confirm dialog, or be cleared. Undo already brings the old program back in one click.
Stakes if we pick wrong: Clearing loses a student's plan on a mis-click; a confirm adds a dialog and its text to a reversible action.
Recommendation: A because the change is one undo away and keeping courses loses nothing, so a confirm would guard a reversible action.
Note: options differ in kind, not coverage — no completeness score.
Header: Program change
Options:
A) Keep courses (recommended)
Planned courses stay where they are; requirement groups recompute for the new program; Undo restores the old one. No confirm dialog.
B) Confirm first
Same as A, but a confirm dialog appears when any courses are planned. Adds dialog text.
C) Clear planned courses
The program change also removes planned courses (completed courses stay). One undo restores both.

State: approved
Actual answer: A) Keep courses (recommended), D5 answer 2026-10-29
Accepted scope: changing program keeps planned courses in place; requirement groups recompute for the new program; Undo restores the old program; no confirm dialog
History: none

### R4: Getting back into setup with no program
Finding: 2, INFORMATIONAL, 8/10, frontend/src/components/planner/degree/DegreeBoard.js:235
Plan baseline: dialog opens automatically when the plan has no program, and from the board header's program name (original proposal); no entry when skipped with no program
Runtime evidence: today the only entry is the inline ProgramPicker shown while `!programIds.length` (DegreeBoard.js:235), removed by D2
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1–R3 | approved (D3–D5) | same | same |
| R4 no-program entry | none after Skip, pending | auto-open on every My degree visit while no program; toolbar "Program" button when no program, program name button once set | auto-open once per browser (localStorage); afterwards only the toolbar button |
Question D6:
D6 — How does a student get back into setup after skipping it with no program?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: With the old inline program dropdown gone (D2), skipping setup leaves the board with no program and nothing to click. The board needs a way back: a toolbar button where the program name normally sits, and a rule for when the dialog opens by itself.
Stakes if we pick wrong: Auto-opening every visit can feel pushy to someone browsing; opening only once can strand a student who closed it by accident without noticing the button.
Recommendation: A because a board with no program shows nothing useful, so reopening while none is set costs the student nothing.
Note: options differ in kind, not coverage — no completeness score.
Header: No program
Options:
A) Reopen until set (recommended)
Dialog opens on each visit to My degree while no program is set. The toolbar shows a "Program" button in the program name's place; once set, the program name opens the dialog.
B) Open once per browser
Dialog opens automatically the first time only (remembered in this browser). After that, the toolbar "Program" button is the way in.

State: approved
Actual answer: A) Reopen until set (recommended), D6 answer 2026-10-29
Accepted scope: dialog opens on each visit to My degree while no program is set; toolbar shows a "Program" button in the program name's place; once set, the program name opens the dialog at step 1
History: none

### R5: Transcript upload limits and privacy
Finding: A1, CRITICAL, 8/10, backend/app/api/routes/documents.py:180-185 (Architecture review)
Plan baseline: D1 approved server-side extraction and catalog matching, "text never stored"; limits, logging and error text unspecified
Runtime evidence: the chat upload route checks `if file.size and file.size > MAX_FILE_SIZE` then `file_bytes = await file.read()` (documents.py:181-185), so a missing size header reads the whole body; it then stores the text in the chat's RAG index (documents.py:197) and logs session ids; `extract_text_from_file` raises developer-facing messages such as "Install pycryptodome ... and restart the backend" (document_extractor.py:17-21); PyPDF2 parses every page
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1–R4 | approved (D3–D6) | same | same |
| R5 transcript contract | text never stored (D1); limits unspecified, pending | new `POST /api/planner/transcript`: signed in; PDF/DOCX/TXT only; reads at most 10 MB; PDFs over 40 pages rejected; file and text never stored or logged (log counts only); unreadable or encrypted → 422 shown as "Couldn't read this file" | reuse `/upload-document`; transcript goes into the chat's document index; existing messages |
Question D7:
D7 — What limits and privacy rules does transcript upload follow?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: A transcript has a student's name, ID, grades and GPA. The chat upload route reads the whole file before checking its size when no size is sent (documents.py:181-185), keeps the text in the chat's search index (documents.py:197), and can show a developer message about installing pycryptodome (document_extractor.py:17). A setup upload should read the file, return the matched course codes, and forget it.
Stakes if we pick wrong: Reusing the chat route keeps every student's transcript text on the server and can show a server setup message to a student.
Recommendation: A because the dialog only needs course codes back, so the server should hold the text for one request and never write it anywhere.
Completeness: A=10/10, B=4/10
Header: Transcript
Options:
A) Separate private route (recommended)
New POST /api/planner/transcript: sign-in required; PDF, DOCX, TXT only; reads at most 10 MB; PDFs over 40 pages rejected; nothing stored or logged but counts; unreadable or encrypted files return 422, shown as "Couldn't read this file". (human: ~4h / CC: ~20 min)
B) Reuse chat upload
Send the file to /upload-document and parse its stored text. Text stays in the chat's document index; existing size check and messages.

State: approved
Actual answer: A) Separate private route (recommended), D7 answer 2026-10-29
Accepted scope: new `POST /api/planner/transcript`: sign-in required; PDF, DOCX, TXT only; reads at most 10 MB; PDFs over 40 pages rejected; file and text never stored or logged (counts only); unreadable or encrypted files return 422, shown as "Couldn't read this file"
History: none

### R6: Matching transcript codes against the catalog
Finding: P1, INFORMATIONAL, 8/10, backend/app/planner/facts.py:116 (Performance review)
Plan baseline: D1 approved "keeps only codes that exist in the school's catalog"; lookup method and time bound unspecified
Runtime evidence: `load_facts_by_term` fetches facts for many ids in "ONE bounded batch: one gate of concurrency calls and one budget_s deadline" (facts.py:125-127), concurrency 8, budget 6.0 s; UVA reads a local snapshot, UW and CU call live services per course or subject; a transcript holds about 20–60 course codes [estimated]
Comparison grid:
| Choice | Current | A | B |
|---|---|---|---|
| R1–R5 | approved (D3–D7) | same | same |
| R6 catalog matching | unspecified, pending | dedupe codes, then one `load_facts_by_term` batch for the plan's term (concurrency 8, 6 s budget); codes not checked in time come back unchecked and marked, not dropped | one catalog lookup per code, one after another, no shared deadline |
Question D8:
D8 — How are transcript course codes checked against the catalog?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: A transcript lists 20–60 courses. Each code has to be looked up to confirm it's a real course and get its title and credits. At UVA that's a local file; at UW and CU it's a live web call per course. The planner already has a loader that checks many courses at once with 8 in flight and one 6-second deadline (facts.py:116).
Stakes if we pick wrong: Looking codes up one at a time at CU could keep the student waiting most of a minute; without a deadline a slow catalog freezes the step.
Recommendation: A because the shared loader already bounds concurrency and time, and late codes stay visible for the student to tick by hand.
Completeness: A=9/10, B=5/10
Header: Matching
Options:
A) One bounded batch (recommended)
Dedupe the codes, check them in one load_facts_by_term batch (8 at a time, 6 s deadline). Codes not checked in time come back unchecked and marked, never dropped. (human: ~2h / CC: ~10 min)
B) One lookup per code
Check each code in turn with the catalog lookup, no shared deadline. Simpler code; time grows with transcript length.

State: approved
Actual answer: A) One bounded batch (recommended), D8 answer 2026-10-29
Accepted scope: dedupe transcript codes and check them in one `load_facts_by_term` batch for the plan's term (concurrency 8, 6 s budget); codes not checked in time come back unchecked and marked, never dropped
History: none

### Outside voice findings (Outside review, verified against the code)

- O1 [CRITICAL] (9/10) backend/app/planner/store.py:204 — `fields = {"courses": after["courses"], "profile": after["profile"], ...}`; undo (:232) and redo (:262) write the same two keys, so a `set_term` edit would never persist the term. → R7
- O2 [CRITICAL] (9/10) backend/app/utils/document_extractor.py:30 — `with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as tmp: tmp.write(file_bytes)` writes DOCX transcripts to disk; facts.py:161 `logger.warning("course_facts failed for %s (%s): %s", chunk, term, exc)` and :176 log course ids. Breaks R5 "nothing stored or logged". → R8
- O3 [CRITICAL] (8/10) docs/designs/setup-dialog.md step 2 — matching checks that a course exists, not that it was passed; the mockup ticks an "IP" row. Failed, withdrawn, in-progress and repeated attempts need rules. → R9
- O4 [INFORMATIONAL] (7/10) backend/app/planner/degree.py:99 — `"credits": list(fact.credits) if _usable(fact) and fact.credits else None` and :108 `_credit_value` use catalog credits (3-credit fallback); transcript credits aren't saved. → R10
- O5 [CRITICAL] (9/10) backend/app/planner/service.py:69 — `programs_for(school, program_ids)` resolves by id only; the Catalog year select is saved but never used, and UVA ME is a 2025 file. → R11
- O6 [INFORMATIONAL] (8/10) frontend/src/contexts/PlannerContext.js:465 — on hold, `entry.reject(failure)` rejects the step's promise while the edit stays queued and retries later. → R12

### R7: Persisting set_term
Finding: O1, CRITICAL, 9/10, backend/app/planner/store.py:204/:232/:262, Outside voice (verified)
Plan baseline: R1/D3 approved a validated, undoable `set_term` op; persistence not named
Runtime evidence: commit, undo and redo write only `courses` and `profile` (plus undo/idempotency); `term` is never written after creation
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R7 term persistence | not persisted | commit, undo and redo write `term` when the ops change it; tests for all three | keep (term lost after edit) | investigate store write paths first, no change yet | defer this change only |
Question D9:
D9 — Should commit, undo and redo save the plan term for set_term?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: The plan store saves only the course list and profile after an edit, an undo or a redo (store.py:204, :232, :262). A set_term edit would look saved, then the term would snap back on reload. The approved op (D3) needs those three writes to include the term.
Stakes if we pick wrong: Step 3 appears to work and silently doesn't; undo of a term change does nothing.
Recommendation: A because D3's undoable op can't work unless all three write paths save the term.
Completeness: A=10/10, B=3/10, C=5/10, D=3/10
Header: Term saving
Options:
A) Apply this change (recommended)
Commit, undo and redo write `term` whenever the applied ops change it; tests cover set_term, its undo and its redo surviving a reload. (human: ~2h / CC: ~10 min)
B) Keep this row's current value
Store writes stay as they are; set_term changes would not persist.
C) Investigate before choosing
Read the store's write paths and report; no change approved yet.
D) Defer this proposed change only
Leave R7 unresolved; R1 stays approved without persistence.

State: approved
Actual answer: A) Apply this change (recommended), D9 answer 2026-10-29
Accepted scope: commit, undo and redo write `term` whenever the applied ops change it; tests cover set_term, its undo and its redo surviving a reload
History: none

### R8: Keeping transcript data off disk and out of logs
Finding: O2, CRITICAL, 9/10, backend/app/utils/document_extractor.py:30 and backend/app/planner/facts.py:161/:176, Outside voice (verified)
Plan baseline: R5/D7 approved "file and text never stored or logged (counts only)"
Runtime evidence: DOCX extraction writes the bytes to a temp file (document_extractor.py:30-36) before deleting it; `docx2txt.process` opens its argument with `zipfile.ZipFile`, which also accepts an in-memory file; the facts loader logs course ids on provider failure (facts.py:161) and timeout (:176)
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R8 transcript data handling | temp file for DOCX; course ids in warnings | extract DOCX from memory (BytesIO) for the transcript route; facts loader takes a `log_ids=False` switch the transcript route uses, so its warnings carry counts only; test that no file is written and no id is logged | keep (DOCX hits disk briefly; ids can be logged) | investigate first, no change | defer this change only |
Question D10:
D10 — Should transcript reading stay in memory and keep course ids out of logs?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: D7 promised the transcript is never stored or logged. Two shared pieces break that: Word files are written to a temp file before reading (document_extractor.py:30), and the course checker logs the course codes it couldn't check (facts.py:161, :176). Course codes from a transcript are part of a student's record.
Stakes if we pick wrong: A crash between write and delete leaves a transcript on disk; server logs keep a list of a student's courses.
Recommendation: A because D7's promise is only true if the shared extractor and checker also keep transcript data out of disk and logs.
Completeness: A=10/10, B=3/10, C=5/10, D=3/10
Header: Privacy
Options:
A) Apply this change (recommended)
Read DOCX from memory for transcripts; the facts loader gets a switch so transcript checks log counts, not course codes. Tests assert no temp file and no codes in logs. (human: ~2h / CC: ~10 min)
B) Keep this row's current value
DOCX briefly written to a temp file; checker warnings can include transcript course codes.
C) Investigate before choosing
Trace every log and file write on the transcript path and report; no change yet.
D) Defer this proposed change only
Leave R8 unresolved; D7's contract stays approved but unmet.

State: approved
Actual answer: A) Apply this change (recommended), D10 answer 2026-10-29
Accepted scope: DOCX transcripts read from memory (BytesIO); the facts loader gets a switch so transcript checks log counts, not course codes; tests assert no temp file and no course codes in logs
History: none

### R9: Which transcript rows count as completed
Finding: O3, CRITICAL, 8/10, docs/designs/setup-dialog.md step 2 and mockup b-setup-dialog.png, Outside voice (verified)
Plan baseline: D1 approved "keeps only codes that exist in the school's catalog"; pass/fail and attempts unspecified; the approved mockup ticks an "IP" row
Runtime evidence: saved completed entries count toward requirements regardless of grade when a rule has no `min_grade`, and toward Other credit
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R9 transcript eligibility | unspecified | listed but unticked: F, W/WF/WP, NC/U, I/INC, IP or no grade; ticked: letter grades A–D−, P/S/CR; a repeated course shows once with its latest passing attempt; synthetic transcript fixtures for UVA, UW and CU | keep (every catalog match ticked) | investigate transcript layouts first, no change | defer this change only |
Question D11:
D11 — Which transcript rows should start ticked as completed?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: Matching a code to the catalog only proves the course exists. A transcript also lists courses a student failed, withdrew from, is taking now, or repeated. If those start ticked, the board counts credit the student hasn't earned. The approved mockup even ticks an in-progress "IP" row.
Stakes if we pick wrong: A failed or current course quietly fills a requirement; the student plans around credit they don't have.
Recommendation: A because unticked-but-listed keeps every row visible to fix by hand while only passed courses count by default.
Completeness: A=9/10, B=3/10, C=5/10, D=3/10
Header: Eligibility
Options:
A) Apply this change (recommended)
Rows graded F, W/WF/WP, NC/U, I/INC, IP or with no grade are listed unticked; A–D−, P/S/CR start ticked; a repeated course shows once with its latest passing attempt. Synthetic transcript fixtures for UVA, UW and CU. (human: ~4h / CC: ~20 min)
B) Keep this row's current value
Every catalog match starts ticked; the student unticks failed or current courses by hand.
C) Investigate before choosing
Collect real transcript layouts from the three schools and report; no change yet.
D) Defer this proposed change only
Leave R9 unresolved; eligibility stays unspecified.

State: approved
Actual answer: A) Apply this change (recommended), D11 answer 2026-10-29
Accepted scope: transcript rows graded F, W/WF/WP, NC/U, I/INC, IP or with no grade are listed unticked; A–D−, P/S/CR start ticked; a repeated course shows once with its latest passing attempt; synthetic transcript fixtures for UVA, UW and CU
History: none

### R10: Credits from the transcript
Finding: O4, INFORMATIONAL, 7/10, backend/app/planner/degree.py:99/:108, Outside voice (verified)
Plan baseline: completed entries save `{id, grade, term}` (plan Data table); credits unspecified
Runtime evidence: the degree read takes credits from the catalog (`list(fact.credits)`, degree.py:99) and counts the catalog minimum or a 3-credit fallback (`_credit_value`, :108)
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R10 completed credits | catalog credits, 3-credit fallback | completed entries may carry `credits` from the transcript row; set_profile validates it (0–12); degree uses saved credits before catalog credits; manual adds keep catalog credits | keep catalog credits | investigate first | defer this change only |
Question D12:
D12 — Should credits read from the transcript be saved and used?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: The board counts each completed course at its catalog credit value, or 3 if unknown (degree.py:99, :108). A transcript shows the credits the student actually earned, which differ for variable-credit courses (research, independent study) and for codes the catalog doesn't know.
Stakes if we pick wrong: Keep catalog credits and totals after import can disagree with the transcript the student just uploaded; save them and a misread credit column skews totals.
Recommendation: A because the transcript is the record of earned credit, and the review list shows each value before it's saved.
Completeness: A=9/10, B=6/10, C=5/10, D=4/10
Header: Credits
Options:
A) Apply this change (recommended)
Completed entries may carry `credits` from the transcript row (validated 0–12); the degree read uses saved credits before catalog credits; manual adds keep catalog credits. (human: ~3h / CC: ~15 min)
B) Keep this row's current value
Completed courses always count at catalog credits, 3 when unknown; transcript credits are shown in the list but not saved.
C) Investigate before choosing
Measure how often transcript and catalog credits differ in fixtures; no change yet.
D) Defer this proposed change only
Leave R10 unresolved.

State: approved
Actual answer: A) Apply this change (recommended), D12 answer 2026-10-29
Accepted scope: completed entries may carry `credits` from the transcript row (validated 0–12 in set_profile); the degree read uses saved credits before catalog credits; manual adds keep catalog credits
History: none

### R11: The Catalog year control
Finding: O5, CRITICAL, 9/10, backend/app/planner/service.py:69, Outside voice (verified)
Plan baseline: step 1 has a Catalog year select saved through `set_profile catalog_year` (approved mockup)
Runtime evidence: `programs_for(school, program_ids)` loads one file per program id (service.py:69-76); each school has one file per program, with its own `catalog_year` (UVA ME 2025, others 2026); the saved profile year never changes which requirements are checked
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R11 catalog year | select, saved, unused | no select: step 1 shows the program file's catalog year as text and saves it to the profile; Class year chips stay | keep the select | investigate year-aware program files first | defer this change only |
Question D13:
D13 — Should step 1 drop the Catalog year select and show the program file's year instead?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: Each program has exactly one requirements file, written for one catalog year (UVA ME's is 2025, the rest 2026). The planner loads that file no matter what year the student picks (service.py:69), so the select would label one catalog while checking another.
Stakes if we pick wrong: A student picks 2024–25 and sees 2026 requirements under a 2024 label.
Recommendation: A because with one file per program the honest control is a label showing the year being checked.
Completeness: A=9/10, B=3/10, C=5/10, D=3/10
Header: Catalog year
Options:
A) Apply this change (recommended)
Step 1 shows the selected program file's catalog year as text (e.g. 2025–26 for UVA ME) and saves it to the profile; no select. Class year chips stay. (human: ~1h / CC: ~5 min)
B) Keep this row's current value
Keep the Catalog year select; the saved year doesn't change the requirements checked.
C) Investigate before choosing
Look into multiple catalog-year files per program; no change yet.
D) Defer this proposed change only
Leave R11 unresolved; the mockup's select stays as designed.

State: approved
Actual answer: A) Apply this change (recommended), D13 answer 2026-10-29
Accepted scope: step 1 shows the selected program file's catalog year as text and saves it to the profile; no Catalog year select; Class year chips stay
History: none

### R12: Held saves inside the dialog
Finding: O6, INFORMATIONAL, 8/10, frontend/src/contexts/PlannerContext.js:465, Outside voice (verified)
Plan baseline: R2/D4 approved "a failed save shows on its step with Retry"; held-queue behaviour unspecified
Runtime evidence: when retries run out, `hold()` calls `entry.onHold(failure)` if given, else `entry.reject(failure)` (PlannerContext.js:465-466), keeps the edit queued and resumes it on a timer; CompletedEditor refuses to save while `planner.queueHeld` (CompletedEditor.js:125)
Comparison grid:
| Choice | Current | A | B | C | D |
|---|---|---|---|---|---|
| R12 held saves | step would treat a held save as failed | the step passes `onHold` and `onSaved`: on hold it shows "Couldn't save" with Retry and disables Next; when the queued edit lands, `onSaved` advances the step; Next is disabled while a save is in flight; × during a hold closes and the queued edit still lands | keep (await the promise; a held save looks failed and later lands unseen) | investigate first | defer this change only |
Question D14:
D14 — How does a step behave when its save is held for retry?
Project/branch/task: undergrad-experimental, eng review of docs/designs/setup-dialog.md.
ELI10: When the server is unreachable, the planner keeps the edit and retries it later, but the promise the dialog waits on is rejected right away (PlannerContext.js:465). A step that just awaits that promise would show an error and stay put, then the save lands later without the step noticing; a double click could also send it twice.
Stakes if we pick wrong: The student retries a save that's already queued and gets duplicates, or closes the dialog thinking nothing saved.
Recommendation: A because the planner already offers onHold and onSaved callbacks for exactly this, so the step can follow the queued edit to completion.
Completeness: A=9/10, B=4/10, C=5/10, D=3/10
Header: Held saves
Options:
A) Apply this change (recommended)
Steps use onHold/onSaved: a hold shows "Couldn't save" with Retry and disables Next; when the queued edit lands the step advances; Next is disabled while saving; × during a hold closes and the edit still lands. (human: ~2h / CC: ~10 min)
B) Keep this row's current value
Steps await the edit promise; a held save shows as failed and may land later unseen.
C) Investigate before choosing
Trace held-queue behaviour in the existing editors; no change yet.
D) Defer this proposed change only
Leave R12 unresolved.

State: approved
Actual answer: A) Apply this change (recommended), D14 answer 2026-10-29
Accepted scope: steps pass onHold/onSaved; a hold shows "Couldn't save" with Retry and disables Next; when the queued edit lands the step advances; Next is disabled while a save is in flight; × during a hold closes and the queued edit still lands
History: none

Approval readiness: PASS — R1 (D3), R2 (D4), R3 (D5), R4 (D6), R5 (D7), R6 (D8), R7 (D9), R8 (D10), R9 (D11), R10 (D12), R11 (D13), R12 (D14); scope D1, D2; tour removal carried from design answer D3 (design-shotgun).

### Reality rows

| premise | claim | file:line receipt | verdict |
|---|---|---|---|
| ProgramPicker is the only program entry | inline picker while no program | frontend/src/components/planner/degree/DegreeBoard.js:235 | true |
| Nothing changes the program once set | picker hidden when `programIds.length` | DegreeBoard.js:235-236 | true |
| Old tour wraps ChatPage, 4 of 6 steps target missing elements | `<OnboardingTour>` and selectors | frontend/src/pages/ChatPage.js:354; frontend/src/components/OnboardingTour.js:153-169 | true |
| Profile fields | `PROFILE_FIELDS` | backend/app/planner/edits.py:32 | true |
| Plan term set once | `term=default_term()` | backend/app/planner/service.py:160 | true |
| Extractor handles PDF/DOCX/TXT | `extract_text_from_file` | backend/app/utils/document_extractor.py:8 | true |
| `graduate` program type exists | `PROGRAM_TYPES` | backend/app/planner/programs.py:39 | true |
| Programs API returns type | `"type": p.type` | backend/app/api/routes/planner.py:108 | true |

unverified=0

REALITY: premise-table pass 8 premises, all with receipts backend/app/planner/service.py:160
REALITY: already-done pass origin/dev has no setup-dialog, tour or set_term commits since 2026-10-28 (checked against HEAD e53c47b) frontend/src/components/OnboardingTour.js:1
REALITY: surface-check pass `/api/planner/edits` exists, `/api/planner/transcript` is new backend/app/api/routes/planner.py:121
REALITY: binding-decisions pass consistent with earlier branch decisions (one owner for planner state, term-aware validation, page-column dialogs) backend/app/planner/service.py:96
REALITY: numbers pass 18→15 files and 6→2 modules are [estimated]; 6 UVA programs and 4 missing tour targets [measured: programs loader, OnboardingTour.js] frontend/src/components/OnboardingTour.js:153
REALITY: deferred-asks pass no linked issue docs/designs/setup-dialog.md:1
REALITY: pr-count pass one PR (no ship-policy file) docs/designs/setup-dialog.md:1

### 1. Architecture review

- [CRITICAL] (9/10) backend/app/api/routes/documents.py:181 — transcript data handling; resolved by R5 (D7) and R8 (D10).
- [CRITICAL] (9/10) backend/app/planner/store.py:204 — set_term persistence; resolved by R7 (D9).
- [CRITICAL] (9/10) backend/app/planner/service.py:69 — catalog year doesn't select requirements; resolved by R11 (D13).

Two shapes: (1) server-side transcript parsing (`POST /api/planner/transcript` → extractor → code scan → facts batch → found rows); (2) parse in the browser (pdf.js, a new dependency) and send only course codes. Pick: shape 1. It reuses the existing extractor and catalog checks and hides parsing behind one route returning `{rows}`; shape 2 adds a dependency, splits DOCX handling, and still needs a server check for catalog matches. D7/D10 keep the server copy in memory and out of logs.

Red flags: two ways to do one task (CompletedEditor and setup step 2) removed by D2; hand-synced list avoided by deriving term chips from `boardTerms()` (DegreeBoard.js:29) and the degree read's `covered` flag (degree.py:85). No other flags.

```
My degree ──(no program? D6)──► SetupDialog(step 1)
Toolbar program name / "Program" ─► SetupDialog(step 1)
Past column "Completed" ─────────► SetupDialog(step 2)

SetupDialog
  step 1 Program ── Next ─► edit set_profile{program_ids, catalog_year, class_year} ─┐
  step 2 Completed                                                                   │ each step:
     Upload ─► POST /api/planner/transcript ─► extract (memory) ─► scan codes         │ onSaved → advance
                └─► load_facts_by_term (8, 6 s, counts-only logs) ─► rows             │ onHold → Retry,
     tick/untick/grade ── Next ─► edit set_profile{completed[{id,grade,term,credits}]}┤ Next disabled
  step 3 First term ── Done ─► edit set_term{term} ──────────────────────────────────┘
                                   │
                         store: commit/undo/redo write courses, profile, term (R7)
```

Dispositions: A1 accepted (D7), O1 accepted (D9), O2 accepted (D10), O5 accepted (D13).

### 2. Code quality review

- [INFORMATIONAL] (8/10) frontend/src/components/planner/degree/CompletedEditor.js:125 — held-queue and discard handling must carry into step 2 (`if (planner.queueHeld) { setFailed(true); return; }`, `ConfirmDialog` "Discard changes?"); required by D2's moved tests and R12.
- [INFORMATIONAL] (7/10) backend/app/utils/document_extractor.py:17 — developer-facing error text ("Install pycryptodome ...") must not reach the dialog; covered by D7's 422 "Couldn't read this file".

Shared code: no new extraction. The transcript route reuses `extract_text_from_file` (memory path added per D10) and `load_facts_by_term`.

Dispositions: both carried by D2, D7, D10, D14; no new choices.

### 3. Test review

Framework: Jest via react-scripts (frontend), pytest (backend `app/tests/unit`).

```
CODE PATHS                                             USER FLOWS
[+] backend/app/planner/edits.py set_term              [+] First visit, no program
  ├── [GAP] valid term → plan term changes                ├── [GAP] dialog auto-opens on My degree (D6)
  ├── [GAP] unknown term → 422                            ├── [GAP] Skip → toolbar "Program" reopens step 1
  └── [GAP] inverse restores old term                     └── [GAP] reload with no program → opens again
[+] backend/app/planner/store.py                       [+] Program step
  └── [GAP] commit/undo/redo persist term (R7)            ├── [GAP] grouped Undergraduate/Graduate list
[+] backend/app/api/routes/planner.py transcript          ├── [GAP] catalog year shown as text (R11)
  ├── [GAP] 401 signed out                                └── [GAP] change program keeps courses (R3)
  ├── [GAP] wrong type → 415/422                       [+] Completed step
  ├── [GAP] >10 MB → 413 (reads capped)                   ├── [GAP] upload → Found rows, IP/F/W unticked (R9)
  ├── [GAP] >40-page PDF → 422                            ├── [GAP] unreadable file → "Couldn't read this file"
  ├── [GAP] encrypted/unreadable → 422                    ├── [GAP] late codes shown unticked + marked (R6)
  └── [GAP] no file written, no codes logged (R8)         ├── [GAP] manual add/grade/untick (moved from CompletedEditor)
[+] backend/app/planner/transcript.py                     └── [GAP] discard confirm on × with changes
  ├── [GAP] scan codes (UVA/UW/CU fixtures)            [+] First term step
  ├── [GAP] grade → eligibility table (R9)                ├── [GAP] chips from board terms
  ├── [GAP] repeated course → latest passing              └── [GAP] Done sets term; board highlights it
  └── [GAP] credits parsed, 0–12 (R10)                 [+] Saving
[+] backend/app/planner/degree.py                         ├── [GAP] held save → Retry, Next disabled (R12)
  └── [GAP] saved credits beat catalog credits            ├── [GAP] queued edit lands → step advances
[+] facts.load_facts_by_term(log_ids=False)               └── [GAP] double-click Next sends once
  └── [GAP] timeout/failure logs counts only           [+] Chat page
[+] frontend SetupDialog.js steps                         └── [★★ TESTED → update] ChatPage renders without tour
  └── [GAP] per-step edits and callbacks                     ChatPage.test.js, ChatPage.provider.test.js

COVERAGE: 1/34 paths tested (3%) | Code paths: 0/17 | User flows: 1/17
QUALITY: ★★:1 | GAPS: 33 (0 E2E, 0 eval)
```

Proposed tests (all required proof of approved decisions):
- backend `test_planner_edits.py` (extend): set_term valid, unknown term, inverse. Value: protects=set_term validation and undo; fails_when=op accepts any string or inverse drops old term; why_new=no set_term exists; seam=none; no_claim=persistence (store tests)
- backend `test_planner_redo.py` / `test_planner_store_api.py` (extend): term persists across commit, undo, redo, reload (R7).
- backend `test_planner_transcript.py` (new): route auth, type, 10 MB, 40 pages, 422 text; scanner on UVA/UW/CU synthetic fixtures; eligibility table; repeats; credits; no temp file (patch `tempfile`), no codes in captured logs (R5, R8, R9, R10).
- backend `test_planner_facts.py` (extend): `log_ids=False` warnings carry counts only.
- backend `test_planner_degree.py` (extend): saved credits beat catalog credits; manual entries unchanged.
- frontend `SetupDialog.test.js` (new): auto-open with no program; toolbar entry; program grouping; catalog year text; per-step edit ops; upload rows ticked/unticked; manual add, grade, untick, discard confirm (moved from CompletedEditor tests); held save Retry and later advance; single submit.
- frontend `DegreeBoard.test.js` (update): Past column Completed opens step 2; program name opens step 1; ProgramPicker cases removed.
- frontend `ChatPage.test.js`, `ChatPage.provider.test.js` (update): drop tour mocks.

Tests to retire: CompletedEditor and ProgramPicker cases in `DegreeBoard.test.js` (moved to SetupDialog.test.js, not deleted outright); OnboardingTour mocks in ChatPage tests.

Regression contract (carried from D2): the moved Completed behaviour must keep checklist courses, search add, grade select, untick, discard confirm and held-queue refusal.

### 4. Performance review

- [INFORMATIONAL] (8/10) backend/app/planner/facts.py:116 — transcript matching bounded by one batch (R6, D8). Scale: 20–60 codes per transcript [estimated]; at most 8 concurrent provider calls, 6 s wall clock.
- PDF parsing is bounded by 10 MB and 40 pages (D7).

Dispositions: P1 accepted (D8).

### Outside voice

Outside review (plan-review role), completed. Six findings, all verified against the code: O1→R7 (D9), O2→R8 (D10), O3→R9 (D11), O4→R10 (D12), O5→R11 (D13), O6→R12 (D14); all accepted. Cross-model: the main review review had flagged the extractor's error text and documents.py size check; Outside review added the store write paths, DOCX temp file, log lines, eligibility, credits, catalog year and held saves.

### NOT in scope

- Multiple catalog-year files per program: one file per program today; R11 shows the file's year instead.
- Degree-audit upload: on `feat/degree-planner-expander`.
- Schools beyond UW, CU Boulder and UVA.
- Program file format changes (at-most-one, credit rules, hyphenated subjects).

### What already exists

- `utils/document_extractor.py` — PDF/DOCX/TXT text; reused, with an in-memory DOCX path (D10).
- `planner/facts.load_facts_by_term` — bounded batch checks; reused with a counts-only log switch (D8, D10).
- `PlannerContext.edit` with `onSaved`/`onHold` — reused for per-step saves (D4, D14).
- `CompletedEditor.js` — checklist, search, grades, discard confirm; its behaviour moves into step 2 (D2).
- `AppDialog` with page-column container — reused so the chat panel stays usable.
- `boardTerms()` and the degree read's `covered` flag — source for term chips.

### Failure modes

| Path | Failure | Handling | User sees | Test |
|---|---|---|---|---|
| Transcript upload | encrypted or scanned PDF | 422 | "Couldn't read this file" | transcript route tests |
| Transcript upload | huge file | read capped at 10 MB, 413 | "Couldn't read this file" | route test |
| Catalog matching | CU/UW service slow | 6 s deadline | late rows unticked and marked | facts + transcript tests |
| Step save | network down | queue holds and retries | "Couldn't save" + Retry; advances when it lands | SetupDialog held-save test |
| set_term | term outside known terms | 422 | step error with Retry | edits test |
| Undo after set_term | term not persisted | R7 writes term in all paths | correct term after reload | store tests |

Critical gaps: 0 (every row has handling, a visible state and a planned test).

### Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Backend: set_term + store persistence | backend/app/planner/ | — |
| Backend: transcript route, parser, extractor memory path, facts log switch, degree credits | backend/app/planner/, backend/app/api/routes/, backend/app/utils/ | — |
| Frontend: SetupDialog, board entry points, remove CompletedEditor/ProgramPicker | frontend/src/components/planner/ | backend steps (API shapes) |
| Frontend: remove chat tour | frontend/src/pages/, frontend/src/components/ | — |

Lane A: set_term → transcript (shared backend/app/planner/). Lane B: chat tour removal (independent). Lane C: SetupDialog after A merges.
Execution order: launch A + B; merge both; then C.
Conflict flags: lane A's two steps share backend/app/planner/ and run in sequence.

## Implementation Tasks
Synthesized from this review's findings. Each task derives from a specific finding above.

- [ ] **T1 (P1, human: ~3h / CC: ~15min)** — planner backend — Add the set_term op and persist term in commit, undo and redo
  - Surfaced by: Scope finding 1 (R1/D3) and outside voice O1 (R7/D9)
  - Files: backend/app/planner/edits.py, backend/app/planner/store.py, backend/app/planner/service.py, tests test_planner_edits.py, test_planner_redo.py, test_planner_store_api.py
  - Verify: backend/.venv/bin/python -m pytest app/tests/unit -q
- [ ] **T2 (P1, human: ~1d / CC: ~45min)** — transcript backend — Add POST /api/planner/transcript with memory-only extraction, eligibility, repeats, credits and a bounded catalog batch
  - Surfaced by: D1, A1 (R5/D7), P1 (R6/D8), O2 (R8/D10), O3 (R9/D11), O4 (R10/D12)
  - Files: backend/app/planner/transcript.py (new), backend/app/api/routes/planner.py, backend/app/utils/document_extractor.py, backend/app/planner/facts.py, backend/app/planner/degree.py, backend/app/planner/edits.py (credits validation), tests test_planner_transcript.py (new), test_planner_facts.py, test_planner_degree.py, transcript fixtures for UVA/UW/CU
  - Verify: pytest suite; no temp file and no course codes in captured logs
- [ ] **T3 (P1, human: ~1.5d / CC: ~1h)** — degree board — Build SetupDialog (three steps, per-step saves with onSaved/onHold), wire entry points, remove CompletedEditor and ProgramPicker
  - Surfaced by: D2, R2/D4, R3/D5, R4/D6, R11/D13, R12/D14, code-quality finding on CompletedEditor.js:125
  - Files: frontend/src/components/planner/degree/SetupDialog.js (new), DegreeBoard.js, PastColumn.js, CompletedEditor.js (delete), ProgramPicker.js (delete), frontend/src/api/planner.js, frontend/src/styles/DegreeBoard.css, SetupDialog.test.js (new), DegreeBoard.test.js
  - Verify: CI=true npx react-scripts test --watchAll=false; browser QA at UVA, UW, CU, desktop and phone
- [ ] **T4 (P2, human: ~1h / CC: ~5min)** — chat page — Remove the old onboarding tour and its dependency
  - Surfaced by: design answer D3 (tour removal), Scope finding 5
  - Files: frontend/src/pages/ChatPage.js, frontend/src/components/OnboardingTour.js (delete), ChatPage.test.js, ChatPage.provider.test.js, frontend/package.json (@reactour/tour)
  - Verify: frontend test suite; /chat renders with no tour

### Unresolved decisions

None.

### Completion summary
- Step 0: Scope Challenge — scope accepted as-is
- Reality rows: 7/7 applicable rows emitted (PLAN_REALITY below), 0 unverified premises
- Architecture Review: 3 issues found
- Code Quality Review: 2 issues found
- Test Review: diagram produced, 33 gaps identified
- Performance Review: 1 issue found
- NOT in scope: written
- What already exists: written
- TODOS.md updates: 0 items proposed to user
- Failure modes: 0 critical gaps flagged
- Unresolved decisions: 0 in this review
- Outside voice: outside review, completed (6 findings, all accepted)
- Parallelization: 3 lanes, 2 parallel / 1 sequential
- Lake Score: 10/10 = answers picking a 10/10-completeness option or the highest-scored option / answers scored (D1, D3, D7–D14)

PLAN_REALITY: phase=eng rows=7/7 missing=none verdict=complete

### Suppressed findings

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | clean (tab-workspaces plan, 2026-10-29) | mode: HOLD_SCOPE, 0 critical gaps |
| Outside Review | outside review via `/plan-eng-review` | Independent 2nd opinion | 8 | completed | 6 findings, all accepted (D9–D14) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 8 | issues_open (this run, all resolved) | 6 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 3 | clean (tab-workspaces plan) | score: 3/10 → 8/10, 22 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** Outside review, plan-review phase, completed; 6 findings (O1–O6), all verified and accepted.
- **CROSS-MODEL:** main review and Outside review both flagged transcript data handling; Outside review alone found the store write paths, eligibility, credits, catalog year and held saves.
- **VERDICT:** ENG REVIEWED — 12 decisions approved, 0 unresolved; ready to implement (status issues_open counts resolved findings, not open ones). Design review for this dialog's mockups was design-shotgun (variant B), not /plan-design-review.

NO UNRESOLVED DECISIONS
