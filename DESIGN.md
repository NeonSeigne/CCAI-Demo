---
# gstack: design-md-format=spec
name: Campus Companion — Pebble Panel
description: Soft, friendly and calm. Tonal surfaces, rounded type, each advisor a colored shape, the school color as an accent only.
colors:
  # Neutrals (light / dark)
  page: "#FCFCFF"
  page-dark: "#15181F"
  raised: "#FFFFFF"
  raised-dark: "#1D2129"
  tonal-1: "#F1F3F9"
  tonal-1-dark: "#232832"
  tonal-2: "#E7EAF2"
  tonal-2-dark: "#2C323D"
  tonal-3: "#DADEE9"
  tonal-3-dark: "#363D4A"
  divider: "#E3E6EE"
  divider-dark: "#323845"
  outline: "#8A91A1"
  outline-dark: "#6E7688"
  ink: "#1B1F2A"
  ink-dark: "#E6E9F1"
  ink-variant: "#4A5163"
  ink-variant-dark: "#AEB5C4"
  ink-muted: "#626A7B"
  ink-muted-dark: "#9AA2B2"
  chart: "#878E9E"
  # Status
  warn: "#A86A00"
  warn-tint: "#FFEAB0"
  warn-ink: "#573C00"
  warn-dark: "#FFC24D"
  warn-tint-dark: "#4A3500"
  warn-ink-dark: "#FFE3A3"
  good-tint: "#D8F0DC"
  good-ink: "#1D5A2B"
  full: "#C0392B"
  full-tint: "#FBE1DD"
  full-ink: "#8C1D12"
  open: "#4F8F3C"
  star: "#B98200"
  # Grades (F to A), also used for the GPA meter fill
  grade-f: "#C0392B"
  grade-d: "#D9622B"
  grade-c: "#A87F1C"
  grade-bc: "#7D8A22"
  grade-b: "#4F8F3C"
  grade-ab: "#2E8B6A"
  grade-a: "#1F6F8B"
  # Difficulty pips (low / middle / high)
  difficulty-low: "#4F8F3C"
  difficulty-mid: "#A87F1C"
  difficulty-high: "#D9622B"
  # Advisors: shape fill / tint / ink on tint
  advisor-1: "#3A5BE0"
  advisor-1-tint: "#DFE4FF"
  advisor-1-ink: "#1E318F"
  advisor-2: "#007A7A"
  advisor-2-tint: "#CCEDED"
  advisor-2-ink: "#004848"
  advisor-3: "#7446DC"
  advisor-3-tint: "#E9E0FF"
  advisor-3-ink: "#42229A"
  advisor-4: "#507D12"
  advisor-4-tint: "#E2EFD0"
  advisor-4-ink: "#2F4A0A"
  advisor-5: "#B4307F"
  advisor-5-tint: "#FADCEC"
  advisor-5-ink: "#7A1A53"
  advisor-6: "#9536AE"
  advisor-6-tint: "#F5DEFA"
  advisor-6-ink: "#5E1A70"
  advisor-7: "#0B6FB0"
  advisor-7-tint: "#D6EAF8"
  advisor-7-ink: "#074570"
  advisor-8: "#6F5B4E"
  advisor-8-tint: "#EBE3DD"
  advisor-8-ink: "#43362D"
  # Subject families: tint / ink (dark: tint / ink)
  subject-computing-tint: "#DCE6F6"
  subject-computing-ink: "#1F3F78"
  subject-computing-tint-dark: "#1E2E4C"
  subject-computing-ink-dark: "#CFDDF7"
  subject-math-tint: "#E8E1F5"
  subject-math-ink: "#46307F"
  subject-math-tint-dark: "#30264A"
  subject-math-ink-dark: "#E2D8F6"
  subject-physical-tint: "#D7ECEE"
  subject-physical-ink: "#145259"
  subject-physical-tint-dark: "#143A3E"
  subject-physical-ink-dark: "#C3E6EA"
  subject-life-tint: "#DFEED8"
  subject-life-ink: "#2D531F"
  subject-life-tint-dark: "#22371B"
  subject-life-ink-dark: "#CDE7C2"
  subject-social-tint: "#F6E5D3"
  subject-social-ink: "#6B3A0E"
  subject-social-tint-dark: "#45301B"
  subject-social-ink-dark: "#F5DCC2"
  subject-humanities-tint: "#F5DFE5"
  subject-humanities-ink: "#702442"
  subject-humanities-tint-dark: "#47222F"
  subject-humanities-ink-dark: "#F4D3DD"
  # Schools: accent / accent ink (text and icons) / tint / on tint / on accent (button text) / focus
  uw-accent: "#C5050C"
  uw-ink: "#C5050C"
  uw-tint: "#FCE4E2"
  uw-on-tint: "#7D1015"
  uw-on-accent: "#FFFFFF"
  uw-focus: "#C5050C"
  uw-accent-dark: "#FFB3AE"
  uw-tint-dark: "#5C1416"
  uw-on-tint-dark: "#FFDAD6"
  uw-on-accent-dark: "#680008"
  cu-accent: "#CFB87C"
  cu-ink: "#594819"
  cu-tint: "#F3ECD9"
  cu-on-tint: "#4A3C14"
  cu-on-accent: "#000000"
  cu-focus: "#594819"
  uva-accent: "#E57200"
  uva-ink: "#9A4A00"
  uva-tint: "#FDE8D4"
  uva-on-tint: "#232D4B"
  uva-on-accent: "#141A2E"
  uva-focus: "#232D4B"
typography:
  display:
    fontFamily: Fredoka
    fontWeight: 500
    fontSize: 64px
    lineHeight: 72px
    letterSpacing: -0.01em
  title:
    fontFamily: Fredoka
    fontWeight: 500
    fontSize: 24px
    lineHeight: 32px
  body:
    fontFamily: Figtree
    fontWeight: 400
    fontSize: 16px
    lineHeight: 24px
  label:
    fontFamily: Figtree
    fontWeight: 600
    fontSize: 14px
    lineHeight: 20px
  small:
    fontFamily: Figtree
    fontWeight: 600
    fontSize: 12px
    lineHeight: 16px
  figure:
    fontFamily: Figtree
    fontWeight: 600
    fontSize: 24px
    lineHeight: 32px
    fontFeature: tnum
rounded:
  mark: 8px
  icon-tile: 12px
  control: 16px
  tile: 20px
  card: 28px
  full: 9999px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  14: 56px
elevation:
  ring: "0 0 0 1px rgba(27,31,42,.08)"
  lift: "0 1px 2px rgba(27,31,42,.10), 0 2px 6px -2px rgba(27,31,42,.12)"
  float: "ring + 0 1px 2px rgba(27,31,42,.04), 0 4px 8px -2px rgba(27,31,42,.06), 0 14px 28px -8px rgba(27,31,42,.10)"
  overlay: "ring + 0 2px 4px rgba(27,31,42,.04), 0 10px 20px -6px rgba(27,31,42,.10), 0 28px 56px -16px rgba(27,31,42,.20)"
components:
  button-primary:
    backgroundColor: "{colors.<school>-accent}"
    textColor: "{colors.<school>-on-accent}"
    rounded: "{rounded.full}"
    height: 44px
  button-tonal:
    backgroundColor: "{colors.tonal-2}"
    rounded: "{rounded.full}"
    height: 44px
  chip:
    borderColor: "{colors.outline}"
    rounded: "{rounded.full}"
    height: 40px
  chip-small:
    height: 36px
  badge:
    rounded: "{rounded.full}"
    height: 28px
  card:
    backgroundColor: "{colors.tonal-1}"
    rounded: "{rounded.card}"
    padding: 24px
  tile:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.tile}"
    padding: 16px
  card-icon:
    size: 24px
  subject-mark:
    rounded: "{rounded.icon-tile}"
    size: 44px
  message-box:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.card}"
    shadow: "{elevation.float}"
---

# Campus Companion — Pebble Panel

## Overview

**Creative North Star:** a friendly panel of advisors, each one a colored shape, on soft tonal surfaces. The school shows up in small, certain places: the active nav item, the primary action, focus and selection.
**Product context:** a campus companion for undergrads at UW–Madison, CU Boulder and UVA, one config per school. Ask (chat with an advisor panel) is the center; Courses, Events, Campus map and Saved sit around it. It's used on phones between classes and on laptops for planning.
**Source of truth:** the "5 · Pebble Panel" page of the Complete Redesign Directions design canvas: Identity and components, New chat, Course answer, Course page, Phone, and the Components board. The app code still follows the earlier Home Colors system until it's rebuilt.
**Key characteristics:**
- Tonal, not outlined: cards are a grey tint, tiles inside them are white, shadows only on things that float.
- Fredoka for display and titles, Figtree for everything you read.
- Fully round controls; cards 28px, tiles 20px.
- Data is drawn, not just printed: grade bars, a GPA meter, star ratings, difficulty pips, seat dots, credit bars.
- One component per job, the same in chat and on the course page.

## Colors

**Strategy:** restrained neutrals, the school as an accent, and data colors that mean the same thing at every school.

- **Tokens:** components read role tokens only (`--bg`, `--s1`, `--c1..3`, `--olv`, `--ol`, `--on`, `--onv`, `--onm`, `--acc*`, `--av*`, `--warn*`, `--g-*`), never hex. A school class (`.uw`, `.cu`, `.uva`) sets the `--acc` roles; an advisor class (`.a1`–`.a8`) sets `--av`, `--av-t`, `--av-on`; `.drk` sets the dark values.
- **School accent:** the primary button, the active nav icon (school ink on a white tile), focus rings, selected chips, the school mark, the active tab underline. Never a large surface. CU gold fails as text on white, so CU uses gold ink #594819 for text and focus and black text on gold buttons. White on UVA orange fails, so UVA buttons use dark text.
- **Advisors:** eight distinct hues, none a school color: blue, teal, violet, moss, magenta, purple, azure, brown. White icons on the shape fill are at least 4.9:1; ink on tint at least 7.9:1. Each has a dark tint and light ink for dark mode.
- **Warnings** ("Harder", "Over 18", the "Concern" verdict): amber tint with brown ink and an amber filled warning icon. The icon always goes with the color.
- **Grades:** F to A runs red, orange, amber, olive, green, teal-green, blue-teal. Every bar is at least 3.6:1 on white. The GPA meter fill uses the grade color the value falls in.
- **Seats:** taken seats in chart grey, open seats as green rings, a full section all red with a red-tint "Full" badge.
- **Subjects:** six families, each a soft tint with a dark ink icon: computing (blue), math and stats (indigo), physical sciences and engineering (teal), life and health (green), social sciences and business (tan), humanities and arts (rose). Subject marks are rounded squares and advisor avatars are geometric shapes, so the two never read as each other.
- **Chart grey** (#878E9E) is the base for any bar or mark that isn't color-coded; it is 3.3:1 on white.
- **Contrast:** text at least 4.5:1, control boundaries and chart marks at least 3:1, in both themes and at all three schools.

## Typography

- **Fredoka 500** for display and titles. Display 64/72 (New chat), 56/64 (course page), 36/44 on phone. Titles 24/32 for section headings, 20/28 for card headings.
- **Figtree** for body 16/24 (400), labels 14/20 (600), small 12/16 (600). Answer prose 16/26.
- Weights stop at 600. Figures use tabular numbers (24/32 at 600 in stat tiles and the GPA meter).
- Material Symbols Rounded is the only icon font: 24px in the rail and tab bar, 20px in controls and sidebar rows, 16px in pills, chips and badges. Outlined at rest, filled when active.

## Spacing

Every gap, padding and margin is 4, 8, 12, 16, 20, 24, 32, 40, 48 or 56px. Cards pad 24, tiles pad 16. Related controls sit 8 apart; groups 16–24; page sections 32–48.

## Layout

- **Desktop frame (tray):** the app background is tonal-1 (#F1F3F9) and the content sits in one white inset panel (radius 28, ring, 8px from the edges). The panel's 64px top row holds the school chip on the right (and course search on Courses). There is no separate top bar.
- **Sidebar, open (272px):** mark and "Campus Companion" with a close-sidebar button; New chat and Search chats; then Home, and three groups under 12/600 labels: Academics (Courses, My degree, Schedule), Campus (Events, Sports, Campus map), You (Saved, Settings), as 44px rows (radius 12, 14/500). During a live game Sports shows a red Live badge with the score. The active row is a white tile with a ring and its icon filled in the school ink. Then a "Recent" label (12/600) and chats with their advisor stacks; the open chat is tonal-2, a waiting change shows an amber dot, and hover shows an options button. The profile row (MR, Maya Rivera) sits at the bottom.
- **Sidebar, collapsed (88px rail):** the mark opens the sidebar; New chat as a white circle; Search; Home and the grouped sections as icon pills with labels, groups split by short hairlines, a red dot on Sports during a live game (active pill white with a ring, icon in school ink). No Recent. The MR avatar at the bottom.
- **Profile menu:** opens from the profile row or avatar (radius 20, overlay shadow): MR and the name, then the Auto/Light/Dark switch. The theme switch lives only here.
- **Content columns:** 880px (answer) to 1080px (course).
- **Phone:** a 56px header, content, and a bottom tab bar of five (Home, Academics, Ask, Campus, You; Academics, Campus and You open their section lists) with a 34px safe area below it for the home indicator. 16px gutters.
- **Home:** the ask box on top at full width; below it two columns (7:5). Left, Tonight: the live game card during a game, then tonight's events in time-grouped rows, with "All events" in the heading. Right, Recent: up to five chats with their advisor stack and names and any Change waiting badge, with "All chats" in the heading; then Coming up: the next game as an answer-style game card. Game cards on Home sit on tonal-1.
- **Sports:** the title with the followed-team chips and a Follow teams button on one line. Then the live game as a jumbotron: a near-black band (radius 32) with the sport, Live badge, 96px team marks with records, a 128px Fredoka score (the leading score in light red), the clock, and the venue with Game page. The dark band is the one large dark surface allowed in light mode, and only during a live game. Then a month calendar (Mon–Sun) with each followed game placed on its day: a white chip with the sport icon, team mark, opponent and time; today outlined in ink; the live game in the school tint; past days outlined. Then Big Ten standings beside Tickets.
- **Events:** the title with a 320px search pill on one line, then the filter chips (Today, Tonight, Tomorrow, This weekend | Within 10 min, Starting soon, Kind). Below, two columns (6:5). Left: the next-up card (the next event you can still reach in time) on tonal-1, the time-grouped event rows, and a "N more tonight" button. Right: a 680px map (radius 28) with a pin per event in its event-kind tint, the selected event as a 48px accent pin, your location dot, zoom and locate buttons, and a floating bar for the selected event with a primary walk-time button.
- **Event page:** a back link to Events, then a poster hero (radius 32) in the event-kind tint with a faded 420px kind icon cropped at the corner: the kind and a "Starts in" badge, the start time in Fredoka 112 with "to" the end time, the title in Fredoka 40, the place and walk time with "leave by", and Add to calendar, Directions with walk time, Save and Share (white tonal buttons on the tint). Below, two columns (6:5). Left: About (the description from the source, with its source pill) and Ask about it (a message box with the panel). Right: the place card (mini map with the event pin and your location, the place name with its open status, then Room, Address, Run by, Phone, Website) and "Also at <place> tonight" as event rows.
- **My degree:** the title with the program and year, a term menu and "Ask about my plan" (primary). Then a credit grid hero (tonal-1, radius 32): the credits done in Fredoka 96 beside a 20×6 grid with one square per credit (done in ink, this term in the school accent, the next planned term outlined, the rest empty) and a counted legend. Then the major core as a transit line: stations 44px, done filled in ink with a check, the current course ringed in the accent, next outlined, electives to pick dashed. Then requirements as four tiles with 72px progress rings (green when complete, no arc at zero). Then the next term's course column with its credit change and warning, beside Where they differ for that plan with Ask the panel.
- **Schedule:** the daily view of the current term, read-only. The title with a term menu and a Week / Day switch; a next-class bar (subject mark, course and building, the day and time in Fredoka 28, a walk-time button); then a week grid (Mon–Fri with dates, the next class day's header filled in ink) cropped to the hours that have classes, with blocks in the subject tint showing code, start time and building. On phone: the next-class card, then each day as rows of time, a subject stripe, code, building and walk time. No panel, credit totals or plan changes on Schedule.
- **Planning:** planning a future term lives in My degree as a "Plan <term>" view: a back link to My degree, the title with a Change waiting badge, the week cropped to class hours beside a dark credit meter (current credits filled, the change striped, the 18-credit limit marked), the lecture section picker (cards with seats bars, Full disabled, the chosen one ringed in the accent), the panel's verdicts, and an action bar with Ask the panel, Dismiss and Accept. Change waiting badges and Review buttons open this view.
- **Courses:** the title, a 64px search pill (courses, subjects or instructors), then filter chips (Subject and Level menus | Counts toward my degree, Prereqs met, Open seats, a term). Below, two columns (7:5). Left: results titled by the active filter with a sort menu; each row has a 44px subject mark, the code in Fredoka 20, the title, small tags (requirement it counts toward, in your plan, prereqs met in green, the course it unlocks after, Harder), and on the right the one figure we have (average GPA or credits); no row shows a figure we do not have. Right: For you on tonal-1, with open requirements (progress bar and course chips), courses a planned course opens, and recently viewed.
- **Campus map:** the title with a 320px search pill (buildings and places) on one line, then the filter chips (All, Open now, Dining, Study, Rec, Health, Bus stops). Below, two columns (5:7). Left: "Starting from <place> · Change", then place rows sorted by walk time (44px category tile, name, category with the open status and a green or grey dot, and a walk badge; the selected row is tonal-2) and a More places button. Right: the map (radius 28) with white category pins, the selected place as a 48px accent pin, your location dot, zoom and locate buttons, and a floating place card: name in Fredoka 24 with category and address, tiles for Walk, Open until (green) and Floors, then Directions, Ask about it and Save. A tile or status the place lacks is left out.
- **Place page:** a back link to Campus map, then a poster header (tonal-1, radius 32): the kind, the name in Fredoka 56, other names, the star rating with review count, the open status, address and walk time, then Directions, Save and Share; a three-photo gallery on the right with All photos. Then tabs with icons, like the course page: Overview, Events and Inside (count badges, dark when selected), Reviews. Overview (7:5): Tonight here, Inside as colored chips, and Reviews (rating and one review), each linking to its tab; on the right the mini map with Walk, Open until and Floors tiles, the details list, and Ask about it. Only Overview shows the map and details; other tabs use the full width. Events: date chips (Next 7 days, Today, This weekend) and kind chips, then every event in the next 7 days grouped by day, each row with time, kind tile, title, room and Save, and the feed's source link. Inside: a two-column list in the event-row style, grouped (Food and drink, Theaters, Studios, Rooms), each row with a kind tint and its open status or its event count this week. Reviews: a rating card with the source link beside star filter chips and the review excerpts. A building has no menu; menus belong on the page of each restaurant inside. Photos, ratings and reviews come from a third-party source with its attribution.
- **Answer order:** the question, Asked, the answer with its sources, the course card, Where they differ, the advisor buttons (no reply open until one is tapped), actions, follow-ups, the message box. In your plan appears only in a planning context (a plan question or the "Does it fit my plan?" follow-up), never by default.

## Elevation & Depth

Five levels. Tonal (a grey card on the page), Raised (a white tile on a card, no shadow), Lift (hover on a resting surface), Floating (the message box and sticky bars) and Overlay (menus, dialogs, sheets). Shadows are tinted with the ink color and use negative spread. Dark mode uses lighter surfaces plus a 1px ring instead of shadows. No glows.

## Shapes

Cards 28, tiles 20, controls 16, icon tiles 12, small marks 8, everything clickable fully round. A tile inside a card is never rounder than the card.

Advisor avatars are geometric shapes, one per advisor: rounded square, circle, diamond, triangle, quatrefoil, capsule, hexagon, arch. They carry the advisor's white icon at 48, 40 and 28px and stack without icons at 20px.

## Components

All of these are drawn on the Components board and reused as-is on every screen.

- **Card header:** every card and section title starts with a plain 24px icon in secondary ink, 8px before the heading, with no tile (20px on phone). Grades `bar_chart`, Sections and seats `event_seat`, Instructors `co_present`, Prerequisites `account_tree`, In your plan `event_note`, Where they differ `alt_route`, Sources `link`, Recent `history`.
- **Subject mark:** a filled Material Symbol on the subject family tint. 64px (radius 20) in the course page header, 44px (radius 12) in the chat course card, 28px (radius 8) in lists and chips. Icons: Computer sciences `code`, Data science `database`, Information `lan`, Mathematics `functions`, Statistics `query_stats`, Actuarial science `calculate`, Physics `orbit`, Chemistry `science`, Engineering `engineering`, Biology `genetics`, Neuroscience `neurology`, Nursing `stethoscope`, Economics `monitoring`, Psychology `psychology`, Political science `account_balance`, English `menu_book`, History `history_edu`, Languages `translate`, Art `palette`, Music `music_note`. A department not listed takes its family's icon.
- **Buttons:** 44px, fully round, with a 20px leading icon on every labeled button (Delete `delete`, Cancel `close`, Undo `undo`, Review `fact_check`, Ask `forum`); a trailing icon only for menus (`expand_more`), link-outs (`open_in_new`) and forward links (`arrow_forward`). Primary is the school accent; tonal is tonal-2; ghost is text in accent ink. Hover adds a 14% white (primary) or 6% ink (others) overlay; pressed an 18% ink overlay; no movement. Disabled is 8% ink with 38% ink text.
- **Interactive surfaces** (chips, toggles, tiles, rows, nav items, pills): hover 6% ink overlay, pressed 10%, 160ms on the one easing.
- **Focus:** a 2px ring in the school focus color, 2px offset, on every control including text boxes (the box border turns ink), checkboxes, radios and switches. An error never looks like focus: it keeps a red border and adds a filled error icon inside the field.
- **Chips:** 40px with a 1px outline; selected takes the school tint and a check. Course chips are 36px (`.chip.sm`).
- **Segmented control:** one control for views, sports and theme: a 44px tonal-2 track with 4px padding, options 36px, the selected option a white thumb with the lift shadow. Icons 20px.
- **Badges:** one 28px family: neutral (`.badge.n`, "3 credits"); time (`.badge.st`, tonal-2 with a 16px `schedule` icon, "Starts in 36 min"); pending (`.badge.pd`, tonal-2 with an 8px accent dot, "Change waiting"); full (`.badge.full`, red tint with a filled `block` icon). Warning chips (`.wn`) are 28px amber.
- **Red roles:** the school accent marks the primary action, selection, focus and the active nav item. Full red (with an icon or dot) marks only Full, Live, errors and Delete. "You" and "next" rows never take a tint: they sit on tonal-2 (tonal-3 in dark) with ink text and an 8px accent dot.
- **Source pill:** 32px tonal-2 pill with a white 24px icon disc and the source name.
- **Verdict chip:** 32px; Fine is green tint, Concern is amber.
- **Stat tile:** white tile, small label over a 24px figure with its unit ("12 credits").
- **Requirement progress:** label and value on one line, an 8px bar under them at full width.
- **GPA meter:** a white tile with the term GPA (24px figure), a 12px track from 0 to 4 with quarter ticks, the fill in the grade color it falls in, an ink marker for the all-terms average, the 0–4 axis, and an "All terms" legend.
- **Grade chart:** a white tile titled with the term, "D or F" and "A or AB" shares on the right, then seven bars from F to A in the grade colors with counts above and letters below. Bars share one scale (170 students = 128px).
- **Grade summary:** GPA meter and Students tile side by side, the grade chart below. Used in the chat course card and on the course page.
- **Instructor card:** a white tile with initials, the name and the number of ratings; then Rating as five stars filled to the value with the number, and Difficulty as five rising pips colored low/middle/high with the number. Same card in chat and on the course page.
- **Seats:** one row per section: the name, an 8px bar of seats taken (chart grey, red when full), then "N open" or the Full badge, and taken/capacity.
- **Credit impact:** term, "a → b credits", the warning chip when over the limit, and a bar of current credits (grey) plus the added course (ink) against the 18-credit limit line. Used in In your plan (planning context only) and the course page's "for you" strip.
- **Course card (chat):** the subject mark, the code in Fredoka 24, title, credits badge, warning chip, open-course button; then a segmented control (Grades, Instructors, Prerequisites) that shows one section at a time, Grades first. Grades is the grade summary and chart at full width; Instructors the instructor cards; Prerequisites the requirement list with done items checked.
- **"For you" strip (course page):** three columns on the page background split by dividers, each label with a 16px icon: Eligibility `check_circle`, Counts toward `flag`, Credit impact `stacked_bar_chart`.
- **Prerequisites:** a plain list of 28px tags (radius 8), the completed one as a check and text; "Opens N courses" as 36px link chips.
- **Advisor toggle:** 48px round button with the 28px avatar and name; expanded takes the advisor tint and opens that reply below.
- **Asked chip:** tonal pill with "Asked" and the 20px avatar stack.
- **Message box:** a floating white card (radius 28, float shadow): context chips, the text, then add, the "Panel of N" pill with the avatar stack, mic and send. Send is grey and disabled when empty, the school accent when there's text. @mentions show as advisor-tinted text.
- **Recent row:** 56px row with a fixed 48px column of the advisors who answered, the title, and a badge when something is waiting.
- **Follow-up button:** 44px tonal pill with a `subdirectory_arrow_right` icon and the question.
- **Where they differ:** the heading and topic, then one unboxed row per advisor (28px avatar, name in advisor ink, stance), divided by hairlines.
- **States:** empty, loading (the real layout in tonal) and error (ink text plus an icon) for every panel.
- **Danger button:** full-tint fill with full ink, for Delete only.
- **Fields:** 48px, radius 16, label above; error swaps the border to full red with a 12px message and filled error icon; disabled is tonal-1 with muted text. Search is a 48px pill with a leading icon and a clear button; the course picker opens an overlay listbox of rows with 28px subject marks.
- **Checkbox, radio, switch:** 24px box (radius 8) and circle, school accent when on; switch 52×32, track in the accent when on; off is a white track with a 2px outline and a 16px outline-colored thumb. Each row is a 44px label.
- **Toast:** inverse 48px bar with a filled check and an Undo action. **Banner:** 56px, radius 20, amber for warnings, tonal-2 with an accent icon for a change waiting, with a white Review button.
- **Menu:** radius 20 overlay, 44px items with 20px icons, Delete in full ink after a hairline. **Dialog:** radius 28, Fredoka title, Cancel (tonal) and the action. **Tooltip:** inverse 32px label, radius 8.
- **Event row:** rows sorted by start time and grouped under a time heading ("5:00 PM", Fredoka 20/28, 16px above, 4px below, no dividers). Each row (min 60px, padding 8/12, radius 16): a 44px event-kind tile (art, food, film, music, wellness, talks: soft tint with a filled 24px icon), title (16/24 600, up to 2 lines) over place (14/20), and a 28px neutral walk-time badge on the right. Hover is tonal-2.
- **Map pins:** teardrop pins (event in the accent, place in white, count in ink) and a blue you-are-here dot. Place sheet: radius 28 top, grabber, Open-until chip.
- **Planner:** term column (tonal-1 tile) of white course cards with drag handle, subject mark and credits; done courses outlined, a clash shown with an amber Full chip (no outline), a dashed drop target whose outline turns the school accent when active (no fill). Route map nodes: done (tonal with check), now (school tint), next (outlined), to pick (dashed).
- **Team mark:** the team's own logo, 72/56/40/28px, no tile. Dark mode uses the team's dark logo.
- **Game card:** one layout for every state. Top row: sport on the left; date, Live badge, or W/L chip and Final on the right. Middle: the two team marks with records and, between them, "at"/"vs" (14/20 muted) before the game, the score (Fredoka 36/44) and clock in red during it, the score with the loser dimmed after it. Bottom row: venue on the left and one tonal action on the right (Remind me, Game page).
- **Schedule row:** date, 28px team mark, "vs"/"at" opponent and venue, then time or a W/L chip with the score. Hover tonal-2, pressed tonal-3. The next game sits on tonal-2 with an accent dot after the opponent.
- **Standings:** table with rank, team mark and name, conference and overall records; your school's row on tonal-2 with ink text and an accent dot after the name.
- **Ticket card:** game, date and venue, a status chip (green ticket held, amber not claimed), and a link out to the school's ticket site. Tickets are never sold or claimed in the app.

## Do's and Don'ts

- Do read every color from a role token.
- Do reuse the component; if a screen needs a variant, add it to the Components board first.
- Do pair every color signal with text or an icon (warnings, full sections, grades).
- Don't put the school color on large surfaces.
- Don't add all-caps eyebrows, colored card borders, gradients, glows or glass.
- Don't add helper sentences or taglines; labels name things.
- Don't print a number twice on one card (a figure shown in a chart isn't repeated in a tile).

## Motion

- **Easing:** one curve, `cubic-bezier(.2, 0, 0, 1)`.
- **Duration:** 160ms for hover, press and focus; 250ms for sheets, menus and dialogs.
- **Transitions:** name the properties (background-color, box-shadow, color, opacity, transform). Never `transition: all`.
- **Reduced motion:** show the final state at once.

## Copy

- No exclamation points or hype words.
- Real figures only: real course, event and place data, never invented numbers.
- No trailing period on headlines, labels, buttons or links.
- Short sentences and everyday words. Say where an answer came from; never claim it is always right.
- American English. School names keep their own spelling, including the en dash in UW–Madison.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-29 | Initial design system (Home Colors) | /design-consultation with research and two outside voices |
| 2026-11-13 | Neon AI system underneath the school colors | Owner request after comparing the Neon AI brand guidelines |
| 2026-11-14 | Pebble Panel replaces Home Colors as the direction | Owner picked it from seven redesign directions; the full school-colored rail was too much |
| 2026-11-14 | School color as accent only; tonal surfaces; Fredoka + Figtree | Pebble direction |
| 2026-11-14 | Depth system: tonal, raised, lift, floating, overlay | Owner asked for cleaner shadows |
| 2026-11-14 | Audit fixes: 3:1 outlines and chart marks, 4px spacing, five radii, six type sizes, aria-hidden icons, dark advisor colors, hover and pressed states | frontend-design, ui-ux-pro-max and unslop audits |
| 2026-11-14 | Amber warning chips; one 28px badge family; no hover lift; Recent rows show advisor stacks; geometric advisor shapes kept; retuned advisor palette | Owner review of the Pebble Exploration page |
| 2026-11-14 | Grade chart F to A, color-coded | Owner request: reads low to high |
| 2026-11-14 | Shared course components (grade summary, GPA meter, instructor card with stars and difficulty pips, seat dots, credit impact) used in chat and on the course page | Owner request: as many reusable components as possible, more visualization |
| 2026-11-14 | Plain icon on every card header; subject marks in six color families | Owner request: more icons, and a look for each kind of class |
| 2026-11-14 | Tray frame with a 272px sidebar that collapses to an 88px rail; Recent in the sidebar; Search chats; theme switch in the profile menu | Owner picked G/H on the Pebble Navigation page |
| 2026-11-14 | Home plus grouped sidebar (Academics, Campus, You); new Sports section with real team logos, schedule, scores, standings and ticket status that links out; full component library on one board | Owner ideation round before designing the rest of the app |
| 2026-11-14 | Applied the three-reviewer fixes: red limited to accent roles plus Full/Live/error/Delete, one game card layout, one segmented control, seat bars, visible row and control states, type and icon sizes snapped to the scale, reduced motion | Codex, Unslop and Frontend-design reviews; owner approved all twelve on the Pebble Proposals page |
| 2026-11-14 | Phone tab bar is Home, Academics, Ask, Campus, You | Matches the grouped sidebar; owner picked it over Courses, Events, Ask, Map, Saved |
| 2026-11-14 | Chat course card uses Grades / Instructors / Prerequisites tabs; In your plan only in planning context; advisor replies start closed | Owner found the answer too dense; picked tabs over accordions |
| 2026-11-14 | Home leads with the ask box, then Tonight beside Recent and Coming up | Owner picked it over a Tonight-first layout |
| 2026-11-14 | Sports uses a jumbotron live band and a month calendar of games | Owner found the card layouts empty and boring; picked the jumbotron from five explorations and asked to keep a calendar |
| 2026-11-15 | Events is a list beside a large map | Owner picked it over a tile wall colored by event kind |
| 2026-11-15 | Event page uses a poster hero in the event-kind tint | Owner picked it over a walking-timeline layout |
| 2026-11-15 | My degree uses a 120-credit grid, a transit-line major map and requirement rings, with the panel's disagreement beside the next term | Owner picked it over a dashboard of planner parts |
| 2026-11-15 | Schedule is a daily read-only week grid of the current term; planning a future term moves into My degree as a Plan view | Most visits are to see this week's classes; panel review and changes only matter when planning |
| 2026-11-15 | Courses is search-first with a For you column | Owner picked it over browsing by requirement |
| 2026-11-15 | Campus map is a place list beside a map with a floating place card | Owner picked it over a full-page map with a docked card |
| 2026-11-15 | Place page is a poster header over tabs (Overview, Events, Inside, Reviews) | Owner wanted Yelp-style photos and reviews without an overwhelming page; grouped like the course page |
