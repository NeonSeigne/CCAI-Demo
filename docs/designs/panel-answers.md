# Panel answers

Bring the advisory panel back into Ask: students see who answered, where the advisors disagree, can talk to one advisor, get the panel's review on schedule changes, and take a brief to a human advisor.

Status: plan. The mockup has four boards: a panel answer, a one-advisor thread, a panel review on a change, and the brief.

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

## Phases

### 1. Show who answered (frontend, small)

- Under each merged answer, a row of advisor buttons from `source_personas` (avatar ring, name). One open at a time, showing that advisor's saved reply from `panelMessages`; none open by default.
- The "Advisor panel" switch in Settings (`show_panel`, saved through `PUT /api/me/advisor-preferences`); off hides the row.
- The "Asked" row moves to phase 4, where its Add button gives it a job; alone it would repeat the panel row.
- Old chats get it for free: the replies are already saved.
- Files: `components/chat/Answer.js`, new `components/chat/PanelRow.js`, `utils/messageGroups.js`, `styles/ChatFrame.css` (or a new `Panel.css`), `theme/schoolTheme.js` (advisor tokens), `DESIGN.md`.
- Tests: the row lists `source_personas` in order; opening one shows its reply; an answer with no panel messages shows no row.

### 2. The panel on data answers (backend, medium)

- In `chat.py`'s tool path, after the tool answer is streamed and saved, pick advisors as for open questions and run them with the tool's text and a short summary of its visuals as context ("Here is what the data says; add your judgement, do not restate the numbers").
- Stream each take as `type: "advisor"` with the same `response_group_id`, then the differences (phase 3). The tool answer gets `source_personas`.
- Skip the panel for place-only lookups (where something is, when it's open); run it for courses, planning and events. A per-school `chat.panel_on_data_answers` flag (default on) and `chat.panel_size_on_data` (default 2) control cost.
- A new progress event before the takes, `{"phase": "panel", "advisors": [...]}`, so the frontend can show "Asked" while they think.
- Cost: 2 extra model calls per data question, run in parallel, plus the differences call.
- Tests: tool answers stream first; takes follow with the group id; place-only questions get no panel; the flag turns it off.

### 3. Where they differ (backend + frontend, small to medium)

- The merge returns JSON: `{"answer": "...", "differences": [{"topic": "When to take it", "positions": [{"persona_id": "...", "stance": "..."}]}]}`. The prompt allows only real disagreements and an empty list otherwise.
- Data answers get the same `differences` from a short compare call over the takes.
- Saved on the merged (or tool) message as `differences` (new optional field on `PersistMessage`); streamed with it.
- Frontend: a "Where they differ" block between the card and the panel row, only when the list isn't empty.
- Tests: parsing with and without differences; a bad JSON reply falls back to plain text and no block; the block renders positions with advisor names.

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

### 6. Brief for my advisor (backend + frontend, medium)

- `POST /api/chat-sessions/{id}/brief` builds: the question, the panel's summary, where they differed, the plan for the active term (from the planner store, not the model), and questions for a human advisor.
- The frontend shows it in a dialog. The questions are editable before copying.
- Copy as text; Download PDF through `utils/file_export.py`.
- Tests: the plan section matches the planner exactly; an empty chat returns a clear error; the PDF builds.

### 7. Panel review on a change (backend + frontend, medium)

- When the tool path produces a `proposed_change`, run 2–3 advisors with a review prompt over the proposal, the current plan and the course facts: `{"verdict": "fine" | "concern", "line": "..."}`.
- Attach it to the visual as `review` and save it with the message. `ProposalCard` shows the rows under the change, above Apply and Not now.
- Review never blocks Apply, and it runs only for proposals.
- Tests: verdicts render; a failed review shows the card without the section; Apply is unchanged.

## Order

1, then 2 with 3, then 4, 5, 6, 7. Phase 1 can ship alone. 2 and 3 share the merge and the tool path, so they land together.

## Copy

New labels: Advisor panel, Asked, Add, Where they differ, Reply to {advisor}, Back to the panel, Same panel, Auto, Panel review, Fine, Concern, Brief for my advisor, Copy, Download PDF.

## Open questions

- Panel size on data answers: 2 or 3.
- Whether events questions get the panel, or only courses and planning.
- On phones: does an advisor's take open inline or as a bottom sheet.
