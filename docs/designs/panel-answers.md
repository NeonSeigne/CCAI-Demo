# Panel answers

Bring the advisory panel back into Ask: students see who answered, where the advisors disagree, can talk to one advisor, get the panel's review on schedule changes, and take a brief to a human advisor.

Status: phases 1–3 built. The mockup has four boards: a panel answer, a one-advisor thread, a panel review on a change, and the brief.

## What exists today

- **The panel still runs.** For open questions, `POST /chat-stream` picks the top 3 advisors (`get_top_personas`, LLM-ranked, `k=3`) or the ones in `active_advisors`, runs them in parallel, then merges them (`synthesize_aggregated_response`).
- **Every advisor's reply is saved and streamed**, even in aggregated mode: `type: "advisor"` messages with `persona_id`, `advisorName` and `response_group_id`. The merged reply carries `is_aggregated: true` and `source_personas`.
- **The frontend hides them.** `ChatContext.js` runs with `responseMode = 'aggregated'`; `groupMessages` splits `panelMessages` from `aggregatedMessages` and `Thread.js` shows only the merged one.
- **Data answers skip the panel.** In `chat.py`, when `get_tool_response` uses a tool (courses, events, places, planning), the answer returns at once and "skips persona generation". Most questions the app is built around never reach an advisor.
- **The merge hides disagreement on purpose.** Its prompt says "Do NOT list or label the individual perspectives" and "Resolve contradictions by noting the trade-off briefly".
- **One-advisor endpoints exist:** `POST /reply-to-advisor` (`user_input`, `advisor_id`, `original_message_id`, `chat_session_id`) and `POST /chat/{persona_id}`. Neither streams.
- **Advisor choice exists:** `active_advisors` on each message is honoured exactly; `user.disabled_advisors` and `personas.allowed_advisors` filter the pool; `/api/config` lists every advisor (id, name, role, icon, color), BrainForge ones included.
- **Export exists:** `GET /export-chat` writes txt, pdf or docx through `utils/file_export.py`.
- **Proposals exist:** `plan_edit` stores a proposal; it reaches the chat as a `proposed_change` visual rendered by `ProposalCard`.

## Decisions

- **Data answers stay fast.** The data card and its short answer show as soon as the tool returns, as now. The panel's takes stream in under it, and "Where they differ" appears last. Nobody waits longer for the facts.
- **Advisor colors come from DESIGN.md, not the school config.** UW's config gives the Academic Planner red, which collides with the school color. Add six advisor ring tokens (`--advisor-1` … `--advisor-6`, each with ink and tint, taken from the course palette) and assign them by advisor order in `/api/config`; BrainForge advisors cycle through them. The config's `color` fields stop being used in the UI.
- **The merged answer stays the main answer.** The panel is one tap away, never in the way.
- **Students can turn the panel off.** A "Show the panel" setting, on by default and saved with the user. Off gives today's experience: the merged answer only, data answers without advisors (phase 2 skips the panel for them), no differences block, no review rows.
- **Facts come from data, not the panel.** Credits, terms, plans and course facts in the review and the brief are read from the planner and catalog. Advisors only add judgement.
- **Panel size on data answers is 2.** `chat.panel_size_on_data` changes it per school.
- **Only course and planning answers get the panel.** Events-only and places-only answers don't.
- **On phones, an advisor's take opens inline**, as on desktop, not in a bottom sheet.

## Phases

### 1. Show who answered (frontend, small)

- Under each merged answer, a row of advisor buttons from `source_personas` (avatar ring, name). One open at a time, showing that advisor's saved reply from `panelMessages`; none open by default.
- The "Advisor panel" switch in Settings (`show_panel`, saved through `PUT /api/me/advisor-preferences`); off hides the row.
- The "Asked" row moves to phase 4, where its Add button gives it a job; alone it would repeat the panel row.
- Old chats get it for free: the replies are already saved.
- Files: `components/chat/Answer.js`, new `components/chat/PanelRow.js`, `utils/messageGroups.js`, `styles/ChatFrame.css` (or a new `Panel.css`), `theme/schoolTheme.js` (advisor tokens), `DESIGN.md`.
- Tests: the row lists `source_personas` in order; opening one shows its reply; an answer with no panel messages shows no row.

### 2. The panel on data answers (backend, medium) — built

- In `chat.py`'s tool path, the tool answer is streamed and saved first, as before (now with the exchange's `response_group_id`). Then `_data_panel` picks advisors as for open questions (`choose_advisors`: `active_advisors` exactly, else the top `chat.panel_size_on_data` by relevance, from the allowed advisors the student hasn't turned off) and runs them in parallel. Each reads the tool's text and a plain-text list of its cards (`summarize_visuals`) with "add your judgement, do not restate the numbers" (`data_take_instructions`).
- The data answer and card list go in the student's message for each take, which ends the request on the user's turn (Mistral rejects a request that ends on the assistant's, and the vLLM formatting drops system messages). Every advisor request now sends history only up to the latest user message (`recent_until_user`).
- Each take streams as `type: "advisor"` with the answer's `response_group_id` and is saved the same way. A take whose model call failed (the client returns `LLMErrorText`; the result has `failed: True`) is not streamed, saved, listed or compared.
- Then one `type: "answer_update"` line: `{"message_id", "response_group_id", "source_personas", "differences"}`. The same `source_personas` and `differences` are set on the saved tool answer (`update_message` in `chat_sessions.py`). The frontend merges the line into the answer already shown.
- The panel runs only when the answer used a course or planning tool, the student's `show_panel` isn't false and the school's `chat.panel_on_data_answers` is on (default true; `chat.panel_size_on_data` defaults to 2, both in `config.py` `ChatConfig`).
- Both paths emit `{"phase": "panel", "advisors": [...]}` right after advisors are chosen. The frontend adds them to `thinkingAdvisors` for now.
- The frontend treats the orchestrator's tool answer as the exchange's main answer (`isMainAnswer` in `utils/messageGroups.js`), like a merged one: it shows at once, the takes join it as they arrive and the panel row shows under it. `PersistMessage` allows `source_personas` on it.
- Routing fix: "I'm struggling to balance my classes with a part-time job. How should I plan my week?" reached the planning domain ("what to take" and "plan" in its description) and the planning pass, told to call `plan_suggest` when a student "wants ideas", returned course suggestions. The classifier now has an `advice` choice (time, a job, money, wellbeing, study habits, careers), with examples; `advice` alone means no tools, so the panel answers. The planning description no longer says "what to take", and the planning pass calls no tool for time, job, money, stress or study-habit questions.
- Cost: 2 extra model calls per course or planning question, run in parallel, plus the compare call.
- Tests: `app/tests/unit/test_data_panel.py`, `test_routing.py` (advice), `ChatContext.test.js`.

### 3. Where they differ (backend + frontend, small to medium) — built

- The merge returns JSON: `{"answer": "...", "differences": [{"topic": "When to take it", "positions": [{"persona_id": "...", "stance": "..."}]}]}`. The prompt allows only real disagreements and an empty list otherwise, and forbids numbers, prices, dollar amounts or statistics the advisors didn't state. `parse_synthesis` keeps differences with at least two positions from advisors who answered; a reply that isn't that JSON is the answer as plain text with no differences.
- Data answers get the same `differences` from `compare_takes`, a short call over the takes (skipped with fewer than 2).
- Saved on the merged (or tool) message as `differences` (optional on `PersistMessage`). The merged answer streams it on its own line; a data answer gets it in `answer_update`.
- Frontend: `components/chat/Differences.js`, a "Where they differ" block after the cards and before the panel row, only when the list isn't empty and the panel is on. Styles in `styles/Panel.css`.
- Tests: `test_response_mode.py` (parsing with and without differences, bad JSON, cut-off JSON, compare call), `Differences.test.js` (block renders positions with advisor names; hides when empty or the panel is off).

### 4. Choose the panel (frontend, small)

- The "Asked" row above the answer: the advisors working on it (from phase 2's panel event), with Add.
- "Add" on the Asked row opens the advisor menu (available minus disabled), sending `active_advisors` on the next message.
- The composer chip ("Same panel") keeps the last panel for follow-ups; tapping it opens the same menu; "Auto" goes back to automatic choice.
- Typing `@` in the composer suggests advisors; picking one sets `active_advisors` to that advisor.
- Tests: the chosen ids reach `/chat-stream`; disabled advisors don't appear.

### 5. Talk to one advisor (frontend + backend, medium)

- "Reply to {advisor}" on an open take enters a one-advisor thread: a banner in the advisor's tint with "Back to the panel", and the composer placeholder "Reply to {advisor}".
- Messages go to `/reply-to-advisor`. Make it stream (same NDJSON lines as `/chat-stream`) so it feels like the rest of Ask.
- Saved replies carry `isReply` and `replyTo`, so a reloaded chat reopens in the same mode when its last message is a reply.
- Tests: the banner shows and clears; messages route to the reply endpoint; reload restores the mode.

### 6. Brief for my advisor (backend + frontend, medium) — built

- `POST /api/chat-sessions/{id}/brief` (`api/routes/chat_brief.py`, owner-scoped: another student's chat or a bad id is 404) builds from the saved chat (`core/brief.py`): `{"question", "summary", "differences", "plan", "questions"}`.
  - `question` and `summary`: the latest main answer (merged or data answer; in an old chat without one, the latest advisor reply) and the user message in its response group.
  - `differences`: that answer's saved `differences`, each position with the advisor's `name` (from the registry, else the saved `advisorName`).
  - `plan`: `{"term", "courses": [{"code", "title", "credits"}], "total_credits"}` for the plan's term, read with `store.load` and checked by `service.report_for` (never the model; nothing is created when the student has no plan, which gives `null`). Credits are display strings: "3", or "4–5" when they vary; `null` when unknown.
  - `questions`: one orchestrator call (the user's LLM config, else the default) over the recent questions and main answers, the differences and the latest exchange, sent as one user message, so the request ends on the user's turn. The prompt forbids numbers, prices, dates, requirements or rules the chat didn't contain. A failed call or a reply that isn't the JSON (one question per line also parses) gives `[]`; at most 6.
  - A chat with no question and answer yet is 400 "This chat has no question with an answer yet".
- `POST /api/chat-sessions/{id}/brief/pdf` takes the brief as the dialog holds it (questions edited) and returns `brief-for-my-advisor.pdf` through `file_export.generate_pdf_file_from_blocks`; text is escaped for its markup.
- Frontend: `components/chat/BriefDialog.js` in the band-sheet dialog (`SheetDialog` medium, `BandSheet`), styles in `styles/Brief.css`. The "Brief for my advisor" button sits at the right of `Answer.js`'s action row on the latest main answer of a saved chat, only while `show_panel` isn't false. Loading draws the sections in raised (`PanelState`); a failed load shows the error with Retry (none for the 400). Questions are inputs with remove and add icon buttons; empty ones are dropped. Copy writes `briefText` (the same sections as the PDF); Download PDF posts the edited brief. Client: `getBrief`, `getBriefPdf` in `api/chatSessions.js`.
- Differences from the plan: the plan is the plan's own term (`plan.term`), not the semester open in the view; the plain text and the PDF add a "Total: N credits" line under the plan, which the dialog doesn't show; sections with nothing in them (no differences, no plan) are left out.
- Tests: `app/tests/unit/test_brief.py` (shape, owner scoping, bad id, empty chat 400, the questions call ends on the user's turn, failed questions call, the plan matches the planner's report exactly, no plan is null and creates nothing, the PDF builds and is owner-scoped, text order, markup escaped), `BriefDialog.test.js` (loading layout, Retry, editing questions, copy text, PDF request, sections left out, the button only on the latest main answer of a saved chat, hidden when the panel is off).

### 7. Panel review on a change (backend + frontend, medium) — built

- In `chat.py`'s tool path, when the visuals include a `proposed_change` and the student's `show_panel` isn't false, `choose_advisors` picks the reviewers (`active_advisors` exactly, else the top `chat.panel_size_on_data` kept to 2–3, from the allowed advisors the student hasn't turned off; at most 3). The same advisors give the data panel's takes, so advisors are chosen once.
- `core/panel_review.py`: each reviewer runs through `generate_single_persona_response` with review instructions (so the request ends on the user's turn, as the takes do): the proposal's summary and its checked diff (course facts included, the week schedule left out) and the current plan for the open term (`brief.term_plan`, from the planner store). Each returns `{"verdict": "fine" | "concern", "line": "..."}`, one short sentence with no numbers. `parse_review` takes the JSON (fences and case allowed), trims the line to 200 characters and drops anything else; an advisor whose call fails or whose reply doesn't parse is left out.
- The review runs alongside the takes, after the data answer was streamed and saved, so the answer never waits. When at least one row came back, `review: [{"persona_id", "verdict", "line"}]` is set on the visual, saved with the answer (`update_message` with the whole `visuals`), and streamed as a sibling line: `{"type": "review", "data": {"message_id", "response_group_id", "proposal_id", "review"}}` (documented on `ChatStreamLine`). `ChatContext.js` sets it on the main answer's `proposed_change` with that proposal id. The proposal itself is unchanged, so Apply does what it did.
- `ProposalCard` renders `components/chat/PanelReview.js` under the change rows, above Apply and Not now: "Panel review", one row per advisor (avatar, bold name, line) and a "Fine" or "Concern" chip. No section when `review` is missing, empty or has no valid rows, or when the panel is off. Styles in `styles/Panel.css`.
- Differences from the plan: the review line is a sibling `review` line, not part of `answer_update`; the review shows only on a pending card (not on Applied or the muted states); when a proposal gets a review, its data panel uses the review's 2–3 advisors.
- Cost: 2–3 extra model calls per proposal, in parallel with the takes.
- Tests: `app/tests/unit/test_panel_review.py` (parsing good, fenced, bad JSON and other verdicts; failed and unparsable calls dropped; at most 3; instructions read the change and the plan, not the schedule; review streamed and saved on the visual with the proposal unchanged; failed review sends nothing; no review with the panel off or without a proposal), `ProposalCard.test.js` (verdict rows above Apply, no section without a valid review, hidden with the panel off, Apply unchanged), `ChatContext.test.js` (the review line reaches the card's visual).

## Order

1, then 2 with 3, then 4, 5, 6, 7. Phase 1 can ship alone. 2 and 3 share the merge and the tool path, so they land together.

## Copy

New labels: Advisor panel, Asked, Add, Where they differ, Reply to {advisor}, Back to the panel, Same panel, Auto, Panel review, Fine, Concern, Brief for my advisor, Copy, Download PDF.

## Open questions

None open.
