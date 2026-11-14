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

### 4. Choose the panel (frontend, small) — built

- The "Asked" row above the answer (`components/chat/AskedRow.js`): the answer's `source_personas`; while it streams, the advisors from phase 2's panel event (`exchangePanels` in `ChatContext.js`; an open question's row shows under the question until the merged answer arrives). Then Add. Hidden when `show_panel` is false or nobody was asked.
- "Add" on the Asked row opens the advisor menu (`components/chat/AdvisorMenu.js`, on the system `Menu`): Auto, then a checkbox row per advisor from `/api/config` that `GET /api/me/advisor-preferences` lists as available and not disabled. The menu edits one shared choice, `nextAdvisors` in `ChatContext.js`, sent as `active_advisors` on the next message.
- The composer chip keeps the last panel for follow-ups: after each exchange `nextAdvisors` becomes the advisors who answered it ("Same panel"); a reopened chat starts from its last answer's `source_personas`. Tapping the chip opens the same menu; "Auto" (an empty choice) sends `active_advisors: null`. Differs from the plan: a custom choice of one advisor shows that advisor's name; several show only their avatars. The chip is hidden on home, in one-advisor mode and when the panel is off (then nothing is sent).
- Typing `@` in the composer suggests advisors (the same rows, filtered by the text after the @; arrows, Enter or Tab, Escape); picking one removes the `@query` and sets the choice to that advisor.
- Backend: an advisor that fails on the open-question path (`failed: True`, an error, or removed mid-request) is dropped like a data take: not streamed, saved, named in `source_personas` or merged. If every advisor fails the stream ends with an `error` line (`NO_ADVISOR_ANSWERED`) and no merge. Aggregated-mode takes now stream their stored `message_id`.
- Tests: `PanelChoice.test.js` (Asked from `source_personas` and from the panel event; Add and the menu set `active_advisors`; disabled advisors don't appear; Same panel and Auto; `@` suggestions), `test_advisor_reply.py` (failed advisors dropped on the open path).

### 5. Talk to one advisor (frontend + backend, medium) — built

- "Reply to {advisor}" on an open take (`PanelRow.js`) enters one-advisor mode (`oneAdvisor` in `ChatContext.js`): a banner at the top of the thread in the advisor's tint with "Back to the panel" (`OneAdvisorBanner.js`), and the composer placeholder "Reply to {advisor}". Choosing a panel in the advisor menu or with `@` also leaves the mode.
- Messages go to `/reply-to-advisor`, which now streams the same NDJSON lines as `/chat-stream`: `progress` `received`, `progress` `panel` with the one advisor, one `advisor` line (with `is_reply: true`, `reply_to` and `message_id`), then `progress` `complete`; a failed model call gives an `error` line and nothing saved. The advisor reads the student's message last (`recent_until_user`), with its own earlier reply in the instructions. The old JSON response is gone; nothing in the frontend called it.
- The student's message and the reply are saved with `isReply: true`, `replyTo` (`advisorId`, `advisorName`, `messageId` of the take) and a shared `response_group_id`, so a reloaded chat reopens in the same mode when its last message is a reply.
- A reply shows as one advisor's answer: the advisor's avatar and name above the text, no Asked row, panel row or differences.
- Tests: `PanelChoice.test.js` (the banner shows and clears; messages route to the reply endpoint; reload restores the mode), `test_advisor_reply.py` (the reply streams, saves `isReply` and `replyTo` and ends on the user's turn; a failed reply isn't saved).

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

None open.
