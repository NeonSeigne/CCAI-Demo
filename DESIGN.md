---
# gstack: design-md-format=spec
name: Campus Companion — Home Colors
description: A school's own colors as the app's frame, rounded and bold, chat at the center, light and dark.
colors:
  # Shared neutrals (light / dark)
  surface: "#FFFFFF"
  surface-dark: "#1A1D24"
  raised: "#F1F3F6"
  raised-dark: "#23272F"
  text: "#14171F"
  text-dark: "#EEF0F4"
  text-muted: "#5B6270"
  text-muted-dark: "#A4AAB6"
  line: "#E3E6EB"
  line-dark: "#2B3039"
  control: "#D5D9E0"
  control-dark: "#3A404B"
  success: "#156B3A"
  success-dark: "#7FDCA4"
  success-tint: "#E3F4EA"
  error: "#B42318"
  error-dark: "#FF8F87"
  academics: "#2F5BEA"
  student-life: "#E8730C"
  campus: "#1E9E5A"
  # UVA
  uva-deep: "#232D4B"
  uva-deep-dark: "#1B2440"
  uva-signal: "#E57200"
  uva-signal-dark: "#F28A2E"
  uva-on-signal: "#14171F"
  uva-tint: "#FCEBDD"
  uva-tint-dark: "#33230F"
  uva-tint-ink: "#8A4206"
  uva-canvas: "#F3F4F7"
  uva-canvas-dark: "#10131B"
  uva-student-life: "#C79A00"
  # CU Boulder
  cu-deep: "#000000"
  cu-signal: "#CFB87C"
  cu-on-signal: "#000000"
  cu-tint: "#F4EEDD"
  cu-tint-dark: "#2B2617"
  cu-tint-ink: "#594819"
  cu-canvas: "#F5F4F0"
  cu-canvas-dark: "#0E0E0C"
  # UW–Madison (toned down: deep red on large areas, Badger red on small ones)
  uw-deep: "#7D1015"
  uw-deep-dark: "#3B1A1C"
  uw-signal: "#C5050C"
  uw-signal-dark: "#D0343A"
  uw-on-signal: "#FFFFFF"
  uw-tint: "#F9ECEC"
  uw-tint-dark: "#2E1A1B"
  uw-tint-ink: "#8A1015"
  uw-canvas: "#F6F5F4"
  uw-canvas-dark: "#121010"
  uw-band: "#14171F"
typography:
  display:
    fontFamily: Unbounded
    fontWeight: 900
    fontSize: 28px
    letterSpacing: -0.03em
  heading:
    fontFamily: Unbounded
    fontWeight: 800
    fontSize: 16px
    letterSpacing: -0.02em
  body:
    fontFamily: Hanken Grotesk
    fontWeight: 500
    fontSize: 15px
    lineHeight: 1.5
  label:
    fontFamily: Hanken Grotesk
    fontWeight: 700
    fontSize: 13px
  code:
    fontFamily: Unbounded
    fontWeight: 700
    fontSize: 0.78em
    fontFeature: tnum
  figure:
    fontFamily: IBM Plex Mono
    fontWeight: 500
    fontFeature: tnum
rounded:
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  full: 9999px
spacing:
  # The only allowed gap, padding and margin values (Neon AI scale).
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  5: 20px
  6: 24px
  8: 32px
  10: 40px
  12: 48px
  16: 64px
  24: 96px
  32: 128px
components:
  button-primary:
    backgroundColor: "{colors.uva-signal}"
    textColor: "{colors.uva-on-signal}"
    rounded: "{rounded.full}"
    height: 44px
  button-secondary:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.control}"
    rounded: "{rounded.full}"
  chip:
    rounded: "{rounded.full}"
    height: 36px
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.xl}"
  dialog:
    rounded: "{rounded.2xl}"
  composer:
    rounded: "{rounded.2xl}"
  nav-rail:
    backgroundColor: "{colors.uva-deep}"
    width: 240px
---

# Campus Companion — Home Colors

## Overview

**Creative North Star:** the app wears the student's own school colors as its frame (rail, phone header, pop-up bands), with rounded, bold components and the chat at the center.
**Product context:** a campus companion for undergrads at UVA, CU Boulder and UW–Madison, one config per school. Ask (chat) is the center; Courses with My degree, Events, Campus map and Saved sit around it. It's used on phones between classes and on laptops for planning.
**Mode per surface:** Ask and the in-chat cards are Operate. My degree and Courses are Operate with dense data. Events and the map are Operate, glanced at on the move.
**Reference sites:** Gemini's logged-out home (centered composer), Meta Muse write-ups (chat plus companion tabs), Quizlet style references (friendly, colorful), and the owner's coder-cards v2 frontend (component shape, token architecture, theme toggle). Mockups: `~/.gstack/projects/NeonSeigne-CCAI-Demo/designs/design-system-20261029/` (open `index.html`).
**Key characteristics:**
- The school is recognizable from the color field before any text is read.
- Bold, wide Unbounded headings and codes; Hanken Grotesk for everything you read.
- Fully round buttons, chips and toggles; panels at 24px; dialogs, menus and the composer at 32px.
- Light and dark for every school, with the Auto / Light / Dark toggle.

## Colors

**Strategy:** committed per school. Each school writes the same roles (deep, deep-raised, on-deep, signal, on-signal, tint, tint-strong, tint-ink, band, mark, canvas, line-1..3) for light and dark; neutrals and data colors are shared.
**Light or dark:** light by default (phones outdoors in daylight), dark always supported. The toggle stores Auto, Light or Dark; Auto follows the system.

- **Token shape (from coder-cards v2):** every role is written twice, `--light-<role>` and `--dark-<role>`, and `html[data-theme]` picks the live set into `--<role>`. Components use only `--<role>`, never hex.
- **deep:** the rail, the phone header and the Next up banner. It's the largest school-colored area, so it's tuned to be calm. UW uses #7D1015, not Badger red.
- **signal:** the one primary action per view, Send, the "now" marker and the selected thumb. It goes on small areas only.
- **tint / tint-ink:** selected rows, the user's chat bubble, the active tab, the "Now" tag.
- **band:** the dark top of detail pop-ups and course cards. It's the deep color at UVA and CU and ink at UW, because difficulty colors are unreadable on red.
- **mark:** the round school monogram, which can differ from signal (UW: white circle, red letters).
- **Data colors** (academics, student life, campus, difficulty, course lines) keep their meaning at every school. When a school color collides, the data color moves, not the brand: student life is yellow at UVA, and at UW "harder" and errors use ink plus an icon.
- **Dark mode** uses desaturated, darker tones of the school color (ui-ux-pro-max `color-dark-mode`), not the light values inverted. Map tiles are inverted and dimmed.
- **Contrast:** every text and background pair is at least 4.5:1 (`color-accessible-pairs`). Measured: white on UW deep 10.7:1, white on UW signal 6.2:1, white on UW dark signal 5.0:1, UVA on-signal ink on orange passes, white on orange does not, which is why UVA buttons use dark text.

## Typography

Unbounded (Google Fonts, 700–900) carries headings and course codes: wide, bold, unmistakable. Hanken Grotesk (Google Fonts, 400–800) is the body and UI face, the chrome font the owner chose in coder-cards v2. IBM Plex Mono (500) carries figures and dates, as in the Neon AI brand. Material Symbols Rounded is the only icon font.

- Page title 28px (23px on phone) in Unbounded 900; section and card titles 14–16px in Unbounded 800; both at −0.02 to −0.03em.
- Because Unbounded is wide, display sizes stay smaller than with a narrow face. Nothing larger than 34px in the app.
- Body 15px Hanken 500, labels 13px 700. Bold is the house voice: nothing lighter than 500.
- Course codes stay Unbounded 700 at about 11px. They're the app's signature, not figures.
- Figures and dates are IBM Plex Mono 500 with tabular figures: credits, GPA, ratings, seats, walking minutes, event times and dates.
- Use whole-pixel sizes from a short scale. No half sizes like 12.5px or 13.5px.
- Loading: `fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400..800&family=Unbounded:wght@700..900&family=IBM+Plex+Mono:wght@500` and `Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..700,0..1,0`.

## Spacing

Every gap, padding and margin uses one of 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 96 or 128px (the Neon AI scale). No other values.

- 4–12 inside components, 16–32 between elements, 48 and up between sections.
- A 2px step is allowed only for nudges inside small controls.

## Layout

- **Desktop (≥1100px):** a 240px school-colored rail (mark, product name, nav, recent chats, theme toggle, profile), the page, and the 360px Ask dock on non-chat pages. Ask itself is a centered 760px conversation column with the composer at the bottom.
- **Tablet (701–1099px):** the rail stays; the Ask dock becomes a drawer.
- **Phone (≤700px):** a school-colored header (mark, name, theme toggle) and a bottom bar of five: Courses, Events, Ask (center), Map, Saved. Pop-ups become bottom sheets. 16px gutters.
- **My degree:** the line map on desktop (requirement lines across terms, stops by status, prerequisite links, the core deadline); the route on phone (one stop per term).
- **Ask start:** the composer, then a "Next up" board (events with walking times, today's classes, saved items) in place of starter chips.

## Elevation & Depth

Panels get a hairline border and a 1px resting shadow in light mode, none in dark. Shadows are for things that float: the composer, menus, dialogs, sheets, the map's place card. Dark mode separates surfaces by lightness steps. No glows.

## Shapes

One radius ramp, ordered by nesting: a child is never rounder than its parent (coder-cards v2 law 4). Tags 8, rows and wells 12, stat tiles and inputs 16, panels 24, dialogs, menus and the composer 32, controls fully round. The school mark is a circle.

## Components

- **Buttons:** fully round, 44px (48px for a hero action). Primary is signal with on-signal text; secondary is surface with a control-colored hairline; ghost is text only. Press scales to 0.98. Icon-only buttons carry an aria-label.
- **Focus:** every focusable control shows a 2px signal ring with a 2px offset, in both themes. Where signal is under 3:1 on the surface (CU's gold in light mode), the ring is tint-ink. On school-colored bands it stays on-deep.
- **Touch targets:** at least 44×44px, even where the visible control is smaller.
- **Theme toggle:** three stops (Auto, Light icon, Dark icon) with a sliding thumb in tint-strong. Above the profile row in the rail; in the header on phone.
- **Nav rail item:** a fully round pill. Active is a white 14% fill with a filled icon. No side bars.
- **Course card / pop-up:** a band (code in Unbounded, title, three stat tiles: average GPA colored by difficulty, rating, seats), then sections, grades and prerequisites, then actions.
- **In-chat cards:** course card; prerequisite graph (done in green, this term ringed in signal, the asked course in band, "also opens" dashed; stacks vertically on phone); proposed change (before → after rows, Apply / Not now); difficulty card (four tiles, grade bars, GPA trend); schedule-fit shortlist; event list; place card with map; and sources.
- **Panel:** under a merged answer, one round button per advisor who answered: a 32px avatar (the advisor's icon in its ink, on its tint, with a 2px ring) and the name. Pressed, the button takes the advisor's tint and ring and opens that advisor's own reply in a 24px panel below; one open at a time, none at first. Students can turn the panel off in Settings ("Advisor panel"); off shows the merged answer only.
- **Advisor colors:** advisors wear the course palette, in config order 1, 2, 3, 6, 5, 4 (blue, purple, teal, orange, green, pink), then two advisor-only colors, `--advisor-7` olive and `--advisor-8` bronze (light and dark), never the school color. The eight advisors at every school, in order: Academic Planner, Career Coach, Study Strategist, Campus Guide, Wellness Advisor, Writing Tutor, Money Advisor, Peer Mentor. The `color` fields in a school's persona config aren't used.
- **Switch:** 48×28 pill with a 20px knob; off is raised with a control hairline, on is signal. 44px hit area.
- **Sources (from Neon AI chat):** each source Ask used is a 36px pill citation with an icon and its name ("COMP SCI 300", "Memorial Union"), plus "+2" when more share it. Opening it shows a sources panel: rows with an icon tile, the name, the detail in Plex Mono (term, page, date) and the quoted excerpt in curly quotes. Uploaded files show as attachment cards: an icon tile, the name, and type and size in Plex Mono.
- **Event row:** time in Plex Mono with the end time under it, title, place with a domain dot, a green walking-time pill, then calendar and save.
- **Event detail:** band with a date block, kind and host, title, then tiles for starts-in (signal), time, walk and cost. About, details, map, other events at the same place, actions.
- **Map:** OpenStreetMap tiles; round pins tinted by category, the selected one large in signal; a list with category chips; a place card with walk, open until, floors, access, today here and hours.
- **Menus:** 24px popovers with 44px rows, an icon, a label and a right-aligned count or value. Selection is a tint row with a filled icon. They become bottom sheets on phone.
- **States:** every panel has empty ("Nothing listed today" with an icon), loading (the real layout in raised) and error (ink text plus an icon; never red alone at UW).

## Do's and Don'ts

- Do read every color from a role token; never hex in a component.
- Do keep the school's color on the frame and the one primary action, and keep data colors meaning the same thing at every school.
- Do check each new pair at 4.5:1 in both themes, at all three schools.
- Do use the real school data in mockups (places, course titles, events).
- Don't add all-caps eyebrow labels above headings, colored side stripes or borders on cards, gradients, glows or glass.
- Don't put a card inside a card, or add helper sentences and taglines (labels only).
- Don't use bright Badger red on large areas; it belongs on small things.
- Don't mix icon sets; Material Symbols Rounded only, outlined at rest and filled when active.

## Motion

- **Approach:** functional.
- **Easing:** one curve for everything, `cubic-bezier(0.16, 1, 0.3, 1)` (the Neon AI curve).
- **Duration:** press 80ms, hover 140ms, entrance 420ms (rise 24px and fade in). Toggle thumb, sheets and dialogs 250–300ms; theme change 300ms on color roles.
- **Transitions:** name the properties (color, background-color, border-color, opacity, transform). Never `transition: all`, and never animate width, height, top or left.
- **Reduced motion:** show the final state at once.
- **The one authored moment:** switching theme fades every color role together, the coder-cards v2 palette fade.

## Copy

From the Neon AI copy rules.

- No exclamation points. No hype words (elevate, unleash, revolutionize, next-gen, game-changer, unlock).
- Real figures only: real course, event and place data, never invented numbers.
- No trailing period on headlines, labels, buttons or links. Only paragraphs of several sentences keep their periods.
- Short sentences and everyday words. Say what the app checked and where an answer came from; never claim it is always right.
- American English.
- Credit line: "©2026 Neon AI" in sentences, "Neon.ai" only in the logo and the web address.
- School names keep their own spelling, including the en dash in UW–Madison.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-29 | Initial design system created | /design-consultation with research (Gemini, Muse, Quizlet, school brand sites) and two outside voices (Outside review, second review) |
| 2026-10-29 | School colors as the frame | Memorable thing: "This is my school's app" |
| 2026-10-29 | Degree planner as a transit map (line map on desktop, route on phone) | Owner chose it after mockups of three variants |
| 2026-10-29 | Component shape, tokens and theme toggle from coder-cards v2 | Owner's stated taste: rounded, bold, light + dark |
| 2026-10-29 | Unbounded for headings and codes, Hanken Grotesk for text | Owner request; Hanken is the font chosen in coder-cards v2 |
| 2026-10-29 | UW toned down: #7D1015 rail, Badger red on small things | Owner request; ui-ux-pro-max color-dark-mode / accessible-pairs |
| 2026-11-13 | Neon AI system underneath the school colors: spacing scale, one easing and timings, Plex Mono figures, 800/900 headings, signal focus ring, 44px targets, chat sources, copy rules | Owner request after comparing the Neon AI brand guidelines; school colors, sentence case, Material Symbols and the radius ramp stay |
