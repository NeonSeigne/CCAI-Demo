# Audit 1: Shell and Ask surfaces vs approved mockups

Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (M = that folder).
App: `frontend/src` (A = that folder). Checked against source and against the running app (localhost:3000, CU Boulder, light and dark, 1440x900 and 390x844).

Size: S = under an hour, M = a few hours, L = a day or more. "Backend" = needs backend, config or data changes.

---

## 0. Cross-cutting

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 0.1 | Breakpoints don't match DESIGN.md. Phone is ≤700, tablet 701–1099, desktop ≥1100. The app uses phone ≤767 (shell, home, composer), a chat rail drawer at ≤800, the answer panel hidden at ≤1100, the dock docked at ≥1280 and a drawer at 768–1279, and MUI `md: 769`. | M/system.css:208 `@media (max-width:700px)`; DESIGN.md:167-169 | A/styles/CampusRail.css:303, CampusHome.css:23, EnhancedChatInput.css:655, ChatFrame.css:284/288/320, contexts/ChatDockContext.js:17-18 (`1280`, `768`), theme/schoolTheme.js:81 | M | no |
| 0.2 | Leftover raw colours in scope files: rgba shadows and borders in ChatFrame.css; rgba red/green in SettingsModal; rgba in MessageBubble inline styles; ChatPage.css has 10 raw rgba values. This breaks the token-only rule (T0.2) and won't adapt to dark. | system.css tokens only | A/styles/ChatFrame.css:88,228,252,255,297,304; components/SettingsModal.js:241-254,488; components/MessageBubble.js:358,382,677; styles/ChatPage.css:430,596,778,785,954,991,1056-1071 | S | no |
| 0.3 | `components/Sidebar.js` (692 lines) and `styles/Sidebar.css` aren't imported anywhere except their test. They're dead code from the old shell, with lucide-era menus. | n/a | A/components/Sidebar.js | S | no |
| 0.4 | `.compact-composer` rules in ChatFrame.css are an older one-row pill. The specificity fight with `div.cc-composer` mostly works, but `.compact-composer .text-input-row .main-textarea` (0,3,0) still wins, so the chat composer textarea gets `padding: 8px 4px`. The text sits 4px right and 12px taller than the mockup. | M/components.css:2-14 | A/styles/ChatFrame.css:238-281 (esp. 262) | S | no |

---

## 1. Shell: desktop rail (shell.js → `.rail`)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 1.1 | Extra **"New chat"** pill button between the nav and Recent. The mockup rail has only brand, nav, Recent, a spacer, the toggle and the user row. | M/shell.js:28-33 | A/components/CampusRail.js:254-256; CampusRail.css:103-122 | S | no |
| 1.2 | Recent rows show a `forum` icon before each title. The mockup has plain text rows. | M/shell.js:31 `.recent a` text only; system.css:153 | A/components/CampusRail.js:134 (`MessageSquare` → forum) | S | no |
| 1.3 | Recent titles come from the backend already cut with a literal "..." ("Chat 10/27/2026...", "Where is the UMC?..."), so CSS ellipsis doubles up. The mockup shows real questions cut by CSS. Titles like "Chat 10/27/2026" are also not questions. | M/shell.js:5-9 | A/components/CampusRail.js:135 (`session.title`); backend title generation | S | **yes** (title generation) |
| 1.4 | Extra "All chats" link under Recent when there are more than 6 chats. | not in mockup | A/components/CampusRail.js:144-148 | S | no |
| 1.5 | Extra Saved count badge (tint pill) on the Saved nav item. | M/shell.js:30 | A/components/CampusRail.js:153-161, 172, 189; CampusRail.css:88-101 | S | no |
| 1.6 | The school name under "Campus Companion" is the full `institution` ("University of Colorado Boulder"), which wraps to 2 lines. The mockup uses a short name ("CU Boulder", "UW–Madison") on one line. There's no short-name field in `schools/*/school.yaml`. | M/shell.js:4-8 `name`; system.css:145 | A/components/CampusRail.js:224, 237 | S | **yes** (config field `short_name` and AppConfig model) |
| 1.7 | User row: settings icon is `tune` (Settings2 → tune); the mockup uses the `settings` gear. | M/shell.js:33 | A/components/CampusRail.js:271; icons.js:28 (`Settings2: 'tune'`) | S | no |
| 1.8 | User row: extra **Sign out** icon button. The mockup has avatar, name and settings only. Sign out lives in the Account menu (menus.html). | M/shell.js:33; M/menus.html:51-58 | A/components/CampusRail.js:273-275 | S (with 7.3) | no |
| 1.9 | User row spacing: gap 8 vs 10; padding `8px 2px 0 6px` vs `10px 6px 2px`; the settings control is a 40px button vs a bare 20px icon pushed right. | M/system.css:155 | A/styles/CampusRail.css:246-252, 277-288 | S | no |
| 1.10 | Toggle margin `12px 2px 4px` vs `8px 2px 4px`. | M/system.css:156 | A/styles/CampusRail.css:244 | S | no |
| 1.11 | Nav pill height is a fixed 44px (`min-height:44; padding:0 14px`) vs mockup `padding:10px 14px` (~42px). The nav list adds a 2px gap the mockup doesn't have. The rows drift about 4px per item. | M/system.css:146-148 | A/styles/CampusRail.css:57-71 | S | no |
| 1.12 | Hover states: app nav, recent and new-chat hover fills (8% on-deep). The mockup shows no hover state; this is fine, but there's no recent `.is-current` in the mockup (the app uses a 14% fill). Keep both and note them for review. | n/a | A/styles/CampusRail.css:81, 172-178 | none | no |
| 1.13 | Focus ring on deep is a 2px on-deep outline. The mockup has no spec. OK. | n/a | A/styles/CampusRail.css:293-297 | none | no |

## 2. Shell: phone header and tab bar (shell.js → `.phone-top`, `.tabbar`)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 2.1 | The header text is the **school name** ("University of Col…", truncated). The mockup reads **"Campus Companion"**. | M/shell.js:37 | A/components/CampusRail.js:328 | S | no |
| 2.2 | Extra **settings** (`tune`) icon button at the right of the phone header. The mockup has mark, name and toggle only. | M/shell.js:37 | A/components/CampusRail.js:330-332 | S | no |
| 2.3 | Header right padding 6px vs 12px. | M/system.css:211 | A/styles/CampusRail.css:319 | S | no |
| 2.4 | **The chat page hides the phone header** and uses a bordered hamburger button that slides the rail in as a drawer. The mockup keeps the school header and tab bar on chat with no hamburger. | M/png/ask-chat-*-phone.png; shell.js:35-38 | A/styles/CampusRail.css:325 (`.chat-frame .campus-phone-header {display:none}`); ChatFrame.css:288-307; pages/ChatPage.js:379-386 | M | no |
| 2.5 | Tab bar height: the app fixes it at 52px + 4px top padding + safe-area (~56px on desktop browsers). The mockup is content height + `padding:6px 4px 18px` (~76px), so labels sit tight to the bottom edge in the app. | M/system.css:217-218 | A/styles/CampusRail.css:343-355 | S | no |
| 2.6 | Tab gap 2px vs 3px. | M/system.css:219 | A/styles/CampusRail.css:363 | S | no |
| 2.7 | Extra Saved count badge on the Saved tab (signal dot with a number). | M/shell.js:40-42 | A/components/CampusRail.js:311; CampusRail.css:393-403 | S | no |
| 2.8 | On non-chat pages the Ask tab opens the dock sheet instead of going to Ask. That's behaviour, not visual, and is consistent with D17; noted only. | n/a | A/components/CampusRail.js:285-301 | none | no |

## 3. Theme toggle

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 3.1 | Matches: three stops, 120x36 (rail auto x38), thumb in tint-strong, 250ms ease, 17px icons, Auto as text. | M/system.css:161-173 | A/components/CampusRail.js:46-67; CampusRail.css:200-244 | none | no |
| 3.2 | `.tt.on-paper` variant (toggle on a light surface) isn't implemented. Needed only if the toggle is placed on paper; not used in these screens. | M/system.css:171-173 | n/a | S | no |
| 3.3 | Extra `title` tooltips on the toggle buttons. Harmless. | n/a | A/components/CampusRail.js:59 | none | no |

---

## 4. Ask home (ask-home.html)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 4.1 | The **home composer is a separate hand-built form**, not the shared composer. It has **no `+` button and no mic**: just scope chip + send on desktop, send only on phone. | M/ask-home.html:37-39; png/ask-home-*-phone.png shows + and mic | A/pages/HomePage.js:256-276; CampusHome.css:92-150 | M | no |
| 4.2 | Scope chip text: the app says "Courses, events and places **at {school}**". The mockup says "Courses, events and places". | M/ask-home.html:38 | A/pages/HomePage.js:270 | S | no |
| 4.3 | Composer inner gap 10px vs 14px. | M/components.css:4 | A/styles/CampusHome.css:94 | S | no |
| 4.4 | Composer focus adds a 2px `--control` ring around the card. The mockup has no focus spec (fine), and the chat composer instead changes the border colour, so the two composers are inconsistent. | n/a | A/styles/CampusHome.css:101 vs EnhancedChatInput.css:30 | S | no |
| 4.5 | Page padding: mockup `.main` 28px 36px plus `.home` padding-top 36 (64px top, 36 sides). App: 36px top, 24px sides. The date line sits ~29px higher. | M/system.css:175; ask-home.html:6 | A/styles/CampusHome.css:39-44, 70 | S | no |
| 4.6 | Phone page top: mockup `18px + 6px` (24px); app 12px. | M/system.css:215; ask-home.html:15 | A/styles/CampusHome.css:349 | S | no |
| 4.7 | **Phone: extra "Recent" panel at the top of the page** (bordered card, 16px radius, forum icons) above the date and heading. Not in the mockup. Its radius is also 16 instead of the 24 panel radius. | M/png/ask-home-*-phone.png | A/pages/HomePage.js:245-252; CampusHome.css:20-36 | S | no |
| 4.8 | Next up header has no **"Times in {Eastern/Mountain/Central} Time"** label on the right. `config.school.timezone` is available. | M/ask-home.html:42 (`.tz`) | A/pages/HomePage.js:281-283 | S | no |
| 4.9 | Panel header padding 16px 20px 12px vs 18px 22px 8px. | M/system.css:180 | A/styles/CampusHome.css:171-177 | S | no |
| 4.10 | Event time shows "4:30 PM" (with meridiem) in the big Unbounded line. The mockup shows "12:00" alone, with "to 1:00 PM" beneath. | M/schooldata.js `t`; ask-home.html:28 | A/pages/HomePage.js:118 (`formatEventTime`) | S | no |
| 4.11 | Extra **"Directions"** outline chip in each event row before the calendar and save icons. The mockup has calendar_add_on and bookmark only. | M/ask-home.html:31 | A/pages/HomePage.js:134-138; CampusHome.css:269-283 | S | no |
| 4.12 | Extra source footnote "From CU Boulder Events Calendar" in the panel footer (right side). Not in the mockup. It may need to stay for attribution, so ask the owner first. | M/ask-home.html:43 | A/pages/HomePage.js:300 | S | no |
| 4.13 | **Phone event rows show the action row** (Directions, calendar, save) on a second line. The mockup hides `.acts` on phone. | M/ask-home.html:20 (`.evt .acts{display:none}`) | A/styles/CampusHome.css:358 | S | no |
| 4.14 | Phone event grid first column 70px vs 64px (components.css `!important` wins over ask-home's 58px); phone time 13px vs 14px. | M/components.css:94 | A/styles/CampusHome.css:355-356 | S | no |
| 4.15 | **The side column (Your classes today, Saved) disappears** when there's no plan with meeting times and nothing saved, so Next up spans the full width. The mockup always shows the 1.7fr / 1fr bento. "Your classes today" depends on plan sections with times (UW has none; see the plan's R-notes). Seen live on CU with no classes or saved: single column. | M/ask-home.html:44-49 | A/pages/HomePage.js:230, 279, 304 | M | **yes** (plan meeting-time data; UW has none) |
| 4.16 | **Saved rows for courses show only the code** (`display_name || key`, styled as a code). The mockup shows the code in a 104px mono column plus the course title. Event and place rows have no fixed-width first column, so titles don't align with course titles. Align is `center` vs `baseline`; padding 8px 20px with min-height 44 vs 11px 20px. | M/ask-home.html:10-12, 48 | A/pages/HomePage.js:158-183; CampusHome.css:327-346 | S–M | maybe (course title not stored on the saved item; can fetch from catalog) |
| 4.17 | Classes rows are buttons with a raised hover. That's an extra state and fine. | n/a | A/styles/CampusHome.css:323 | none | no |
| 4.18 | Empty and loading text "Loading today’s events…" is plain text. DESIGN.md says loading should be "the real layout in raised" (skeleton). | DESIGN.md:192 | A/pages/HomePage.js:284 | S | no |
| 4.19 | Date line uses `.campus-kicker` (14px/600) overridden to 15/500. That's fine. | M/ask-home.html:7 | A/styles/CampusHome.css:81 | none | no |

---

## 5. Ask chat (ask-chat.html)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 5.1 | **Extra right-hand "This answer" / "On campus" panel** (300px, surface, left hairline) with Checked chips, Places mentioned, and Also today. The mockup is a single **centered 760px column** (DESIGN.md:167). | M/ask-chat.html; components.css:60 `.thread{max-width:760;margin:0 auto}` | A/pages/ChatPage.js:598-603; styles/ChatPage.css:1242-1355 | M | no (decision for the owner) |
| 5.2 | **The thread and composer are left-aligned**, not centered. `.messages-scroll > *` and `.floating-input-area > *` have max-width 760 with no auto margins, sitting at x=288 in a 900px column. | M/components.css:60, 146; ask-chat.html:15 | A/styles/ChatFrame.css:166-167, 188-203, 238-242 | S | no |
| 5.3 | Chat title is **Hanken 20px, one line with ellipsis**. The mockup uses Unbounded (h1 display) at 17px/700 and wraps (2 lines on phone). | M/ask-chat.html:7; system.css:121 | A/styles/ChatFrame.css:41-52 | S | no |
| 5.4 | Header height 72px with 48px side padding. The mockup has no fixed height: the header row sits in `.main` (28px top, 36px sides) with margin-bottom 16. | M/ask-chat.html:6; system.css:175 | A/styles/ChatFrame.css:32-39 | S | no |
| 5.5 | **Header icon buttons are boxed**: 36px, 1px line border, white surface, 10px radius, ink colour. The mockup has bare 38px muted icons (22px glyph), no border or background. | M/ask-chat.html:8 | A/styles/ChatFrame.css:61-78 | S | no |
| 5.6 | Share icon is `share` (ShareOutlined → share). The mockup uses `ios_share`. | M/ask-chat.html:33 | A/components/ExportButton.js:158; icons.js:40 | S | no |
| 5.7 | The share button opens a big MUI Menu ("Share or export", a helper sentence, a "What to export" toggle group, "Format" list with descriptions). Its **section labels use `Typography variant="overline"` → ALL-CAPS eyebrows**, which DESIGN.md:200 bans. The helper sentence also breaks the no-caption rule. In the mockup, Share and Export (PDF, DOCX) are items in the ⋯ menu. | M/menus.html:30-35 | A/components/ExportButton.js:164-248 (overline at 195-199, 219-225; helper 187-191) | M | no |
| 5.8 | Extra phone **hamburger** button in the chat header (see 2.4). | not in mockup | A/pages/ChatPage.js:379-386; ChatFrame.css:80, 307 | M (with 2.4) | no |
| 5.9 | **Answer action row** is different. App: reply, copy, expand, speak, search-references as 32px boxed buttons (1px border, 6px radius, 14px icons, translateY hover with shadow). Mockup: `.meta` = a "Checked" source chip (`verified` + source name, in tint) then copy, thumb_up and thumb_down as 36px round bare muted icons at 20px. | M/ask-chat.html:39; components.css:63-67 | A/components/MessageBubble.js:570-668; styles/components.css:621-650 | M | **yes** (thumbs up/down: no feedback endpoint in the backend) |
| 5.10 | **The "Checked" line isn't inline under the answer on desktop.** `.chat-frame .answer-checked{display:none}` above 1100px moves it to the side panel. The mockup shows the source chip inline in the meta row. | M/ask-chat.html:39 | A/styles/CourseVisuals.css:56-60 | S | no |
| 5.11 | Extra **"▸ Sources"** disclosure under each answer. | not in mockup | A/components/MessageBubble.js:567; CourseVisuals.css:27-47 | S | no |
| 5.12 | Answer body text is weight **400** and line-height **1.7** (measured). The mockup uses 16px/1.6 at weight 500, and DESIGN.md:160 says nothing lighter than 500. `strong` is 600, not 700. | M/components.css:62; system.css:118 | A/styles/components.css:543-555 (and markdown p rules); CourseVisuals.css:16 | S | no |
| 5.13 | User bubble matches (tint, 22/22/8/22, 12x16, 15.5/600, 80%). There's a dead older rule in ChatFrame.css (14x18, 20px radius, 16px) that's overridden; remove it. | M/components.css:61 | A/styles/ChatFrame.css:336-342 (dead); CourseVisuals.css:63-77 | S | no |
| 5.14 | Extra **follow-up suggestion chips** above the composer (domain dot, line border, 34px, 13px). `.follow` exists in the mockup CSS but ask-chat.html renders none. They read as the old "Start with" starters, which the plan replaced. Ask the owner whether to keep them. | M/ask-chat.html:12 (defined, unused) | A/pages/ChatPage.js:552-571; ChatFrame.css:206-236 | S | no |
| 5.15 | Composer placeholder: the app always shows "Ask about courses, events or places" (`chatPlaceholder`). Mid-thread the mockup says "**Ask a follow-up**". | M/ask-chat.html:42 | A/pages/ChatPage.js:589-593; utils/messageGroups.js `chatPlaceholder` | S | no |
| 5.16 | Composer bottom area: the mockup `.bottom` is sticky with a canvas background and padding 12px 0 20px (92px bottom on phone). The app uses 8px 48px 24px (static, inside a fixed-height flex). Close, but the side padding differs and it isn't centered (5.2). | M/ask-chat.html:14-15, 19 | A/styles/ChatFrame.css:188-201 | S | no |
| 5.17 | **New-chat landing state on /chat** (h2 "What do you need on campus today?" in Hanken 40px, plus a subtitle "Ask about courses, events or places at {school}."). The mockup has no chat landing: Ask home is the start. The h2 isn't Unbounded and the subtitle is an extra tagline. "New chat" in the rail lands here, not on the Ask home. | M/ask-home.html is the only start screen | A/pages/ChatPage.js:405-412; ChatFrame.css:169-185, 311-312 | M | no |
| 5.18 | Messages scroll padding is 8px 48px 24px. The mockup thread gap is 20px between turns; the app uses user margin-bottom 28 and answer margin-bottom 32. | M/components.css:60 (`gap:20px`) | A/styles/ChatFrame.css:166, 334, 344 | S | no |
| 5.19 | Advisor (non-plain) message frame still exists. Non-orchestrator answers render as a bordered "advisor-message-bubble surface-card" with avatar, name, accent dot and time ("↳ Reply", "⤴ Expanded" badges). The mockup has one plain voice. It only shows in panel mode, but it's still reachable. | M/ask-chat.html:31 `.ans` | A/components/MessageBubble.js:473-530 | M | no |
| 5.20 | ChatThinking / loading-session spinner ("Loading chat session...") is a spinner, not the raised skeleton DESIGN.md asks for. | DESIGN.md:192 | A/pages/ChatPage.js:417-421 | S | no |
| 5.21 | Clarification message copy ("I need a bit more information", "Here are some ways you could be more specific:") is old UI, unstyled to the system. Not in the mockup; keep the text but restyle with tokens. | n/a | A/pages/ChatPage.js:497-525 | S | no |
| 5.22 | Phone: chat height is `calc(100vh - 56px)` because the app tab bar is 56px. The mockup's `.bottom` padding-bottom is 92px. Once 2.5 changes, this needs to follow. | M/ask-chat.html:19 | A/styles/ChatFrame.css:320-325 | S | no |

### 5b. Composer (EnhancedChatInput) vs `.composer`

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 5b.1 | Padding 16px 12px 10px 20px vs 16px 14px 12px 20px; gap 10 vs 14. | M/components.css:2-5 | A/styles/EnhancedChatInput.css:15-28 | S | no |
| 5b.2 | Placeholder 16px vs 17px (`.ph`). | M/components.css:6 | A/styles/EnhancedChatInput.css:48 | S | no |
| 5b.3 | Scope chip weight 600 vs inherited 500; extra 4px left margin. | M/components.css:12-14 | A/styles/EnhancedChatInput.css:152-166 | S | no |
| 5b.4 | Send disabled state is raised with faint ink. The mockup only shows the enabled signal state. OK as a state; noted. | M/components.css:11 | A/styles/EnhancedChatInput.css:145-149 | none | no |
| 5b.5 | Non-compact composer (where used) adds an "Advisors" pill button and a "Panel / Aggregated" segmented control in the row. Not in the mockup. | M/components.css:7 | A/components/EnhancedChatInput.js:428-531 | S | no |
| 5b.6 | Advisor popover header has a helper sentence ("Choose exact responders or let the app decide.") and uses ✓ text glyphs instead of Material check icons. | M/menus.html filter `.mi.on` check | A/components/EnhancedChatInput.js:449-482 | S | no |
| 5b.7 | The "No documents uploaded yet / Upload documents to reference them…" panel is old UI with an explanatory line. | n/a | A/components/EnhancedChatInput.js:266-312 | S | no |

---

## 6. Ask dock (ChatDock, events.html `.dock`)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 6.1 | Header icons: app `add_comment` (New chat) + `keyboard_tab` (Collapse). The mockup uses `open_in_full` + `right_panel_close`. | M/events.html:32 | A/components/ChatDock.js:170-187 | S | no |
| 6.2 | Header padding 16px 12px 10px 18px vs 16px 16px 10px; gap 4 vs 6. | M/components.css:71 | A/styles/ChatDock.css:87-93 | S | no |
| 6.3 | The dock composer shows a mic. The mockup dock composer has + and send only. Placeholder is the generic one vs page-context ("Ask about these events"). | M/events.html:37 | A/components/ChatDock.js:190-205 | S | no |
| 6.4 | Docked at ≥1280 vs ≥1100; drawer 768–1279 vs 701–1099 (see 0.1). | DESIGN.md:167-168 | A/contexts/ChatDockContext.js:17-18 | S | no |
| 6.5 | Collapsed 52px strip state isn't in the mockup. Extra state; fine. | n/a | A/styles/ChatDock.css:27-32 | none | no |

---

## 7. Menus (menus.html)

| # | Difference | Mockup | App | Size | Backend |
|---|---|---|---|---|---|
| 7.1 | **The chat ⋯ menu has the wrong items.** App: "Search chats", "User guide". Mockup: Rename, Pin, Share, Export (right value "PDF, DOCX"), a separator, Delete (in `harder` colour). Rename and delete exist in the API (`PUT/DELETE /chat-sessions/{id}`); **Pin does not**. | M/menus.html:30-35 | A/components/ChatMoreMenu.js:34-43 | M | **yes** (pin) |
| 7.2 | The chat ⋯ menu shape: popover 300px wide, **14px radius (!important)**, raw rgba shadow; rows 38px, 8px radius, 14px text, 15px icons, ink icons. Mockup: 260px, 24px radius, line border, `--shadow-float`, 6px padding; rows 44px, 16px radius, 15px/600 text, 21px muted icons; hover in raised. | M/components.css:79-88 | A/styles/ChatFrame.css:83-158 | S | no |
| 7.3 | **The Account menu is missing.** The mockup has an avatar+name trigger with Profile, Settings, Model (right value "Gemini"), Help, a separator and Sign out. The app has settings and sign-out icon buttons in the rail user row and opens SettingsModal directly. | M/menus.html:49-58 | A/components/CampusRail.js:267-276 | M | no (the model name is in llm config) |
| 7.4 | **The Program menu is missing.** The mockup has a trigger button "Economics B.A. ⌃" opening a menu grouped under "Undergraduate" / "Graduate" headers, radio icons, and a tint selected row with a filled radio. The app picks programs in SetupDialog's radiogroup list and uses native `<select>` for terms. | M/menus.html:37-47 | A/components/planner/degree/SetupDialog.js:327, 394, 493 | M | maybe (program level grouping: needs an undergrad/grad field) |
| 7.5 | **Event actions bottom sheet on phone** (grab handle, 52px rows: Directions with "7 min", Add to calendar, Saved (tint selected), Ask about this, Share). The app has no such sheet; actions are inline buttons. Shared with the Events audit. | M/menus.html:61-70; components.css:89-91 | A/pages/EventsPage.js:176-181; components/events/EventPopup.js:366 | M | no |
| 7.6 | **The Filter menu is missing** (When: Today / Tonight / This weekend with a check; Kind with domain dots and counts). The app uses day chips; counts per kind aren't shown. Shared with the Events audit. | M/menus.html:71-79 | A/pages/EventsPage.js | M | maybe (counts per kind from the events API) |
| 7.7 | SavedRowMenu panel: radius 12 vs 24, item radius 8 vs 16, 14px text vs 15/600, no icons on items. | M/components.css:79-86 | A/styles/SavedPage.css:297-330; components/saved/SavedRowMenu.js:102-111 | S | no |
| 7.8 | The MUI Menu theme matches the mockup (24px radius, 6px padding, 44px rows, 16px radius, tint selected). But build plan T0.5 says menus are 32px; mockup CSS and DESIGN.md:191 say 24px. The app follows the mockup (correct). No icon colour override: `ListItemIcon` defaults to MUI grey, not `--muted`. | M/components.css:79-84 | A/theme/schoolTheme.js:119-134 | S | no |
| 7.9 | The composer + menu matches (24px, 44px rows, 16px radius, muted icons, 13px/700 section label). OK. | M/components.css:79-88 | A/styles/EnhancedChatInput.css:168-211 | none | no |

---

## 8. Settings dialog (SettingsModal)

No mockup screen. The mockup's Account menu replaces the direct entry. The dialog itself breaks DESIGN.md:

| # | Difference | Ref | App | Size | Backend |
|---|---|---|---|---|---|
| 8.1 | Tabs are underlined text tabs (2px ink underline). DESIGN.md segmented control is fully round, on raised, with the selected tab on surface. | M/system.css:193-195 | A/components/SettingsModal.js:20-27, 314-330 | S | no |
| 8.2 | Buttons are 8px radius and the primary is ink-on-surface. DESIGN.md: buttons fully round, 42px, primary in signal. | DESIGN.md:183 | A/components/SettingsModal.js:38-48 | S | no |
| 8.3 | Inputs are 8px radius. DESIGN.md: inputs 16px. | DESIGN.md:179 | A/components/SettingsModal.js:32-36 | S | no |
| 8.4 | Mini buttons are 6px radius; status messages use raw rgba red/green (see 0.2). | | A/components/SettingsModal.js:50-57, 241-254, 488 | S | no |
| 8.5 | Labels are title case ("First Name", "Delete Account"), which doesn't match the app's sentence case. | | A/components/SettingsModal.js:316-329, 342-367 | S | no |
| 8.6 | Bands: DESIGN.md says dialogs get the band header (build plan B.4). SettingsModal has a plain DialogTitle. | build plan B.4 | A/components/SettingsModal.js:304-311 | S | no |

---

## 9. Light vs dark

- Dark mode role switching works on rail, home panels, composer and toggle. Measured in dark: thumb `#4A4022`, panel shadow none, composer shadow-float dark. These match `--dark-*`.
- Items that won't follow dark because they're raw rgba: ChatFrame.css:252-255 (old pill border and shadow, overridden today), :297, :304 (drawer shadow, backdrop: use `--scrim`), ChatFrame.css:88 (⋯ menu shadow), MessageBubble.js:358, 382 (code block backgrounds at 4–6% black are invisible in dark), SettingsModal status colours.
- `.chat-suggestion:hover` border uses `rgba(17,17,20,.16)`, which is invisible in dark (ChatFrame.css:228).

## 10. DESIGN.md violations found in scope (summary)

1. All-caps eyebrows from MUI `overline` in ExportButton (DESIGN.md:200). A/components/ExportButton.js:195, 219
2. Breakpoints 767/800/1280 instead of 700/1100 (DESIGN.md:167-169).
3. Answer text at weight 400 (DESIGN.md:160, "nothing lighter than 500").
4. Square-ish controls: chat header buttons at 10px radius, message actions at 6px, SettingsModal buttons at 8px (DESIGN.md:136, 183 "fully round").
5. Menus at 14px or 12px radius instead of 24 (ChatMoreMenu, SavedRowMenu) (DESIGN.md:191).
6. Loading states are text or spinners instead of a raised skeleton (DESIGN.md:192).
7. Raw rgba colours in scope files (token-only rule, build plan T0.2).
8. Chat page conversation not centered in 760px (DESIGN.md:167).
9. Extra helper and caption text: ExportButton subtitle, advisor popover helper, documents empty-state helper, chat landing subtitle (user's global rule; ask before keeping).

## 11. What matches (no action)

Rail width (240), deep background, brand mark (38px circle, Unbounded 800 10.5px, mark-bg/mark-ink), brand name type, nav pill shape and active 14% fill with a filled icon, Recent label (13/700 soft), avatar, theme toggle geometry and motion, phone header colour, mark size, toggle size, tab bar order (Courses, Events, Ask, Map, Saved), tint pill on the active tab with a filled icon, home h1 (Unbounded 34/23px), date line (15/500 muted), composer card (32px radius, shadow-float, 40px round +/mic/send, signal send), Next up event row grid (76px / 1fr / auto / auto), walk pill, class rows, user bubble, MUI Menu and MenuItem overrides, composer + menu.
