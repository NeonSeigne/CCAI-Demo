# Audit 6: screens with no mockup, against the Home Colors system

Read-only audit. System sources: `design-system-20261029/system.css` and `components.css`, `index.html`, PNGs (`menus-*`, `events-*`), and `DESIGN.md`. All paths below are relative to `frontend/src/` unless stated otherwise.

Sizes: **S** is under 30 minutes and local. **M** is a component or file rework. **L** is a screen rebuild or a cross-cutting change.

Shorthand for the system, used throughout:
- **Type:** headings and course codes in Unbounded (`--font-display` / `--font-code`), text in Hanken. Page title 28px (23px on phone), card and section titles 14–16px, nothing above 34px. Body 15px/500, labels 13px/700, no weight under 500.
- **Radii:** sm 8 (tags), md 12 (rows and wells), lg 16 (inputs and tiles), xl 24 (panels), 2xl 32 (dialogs, menus, composer), full (buttons, chips, seg, toggle).
- **Buttons:** `.btn` is 42px, fully round, 700 weight. Primary is `--signal` / `--on-signal`, secondary is surface with a `--control` hairline, ghost is text only. Press scales to .95.
- **`.seg`:** raised track, r-full, selected is surface with a small shadow.
- **`.chip`:** 36px, r-full, 700. On is `--deep` (dark mode: `--tint-strong` / `--tint-ink`).
- **Menus:** r-xl panel, 44px rows at r-lg with icon, label and right-aligned value. Selected is `--tint` / `--tint-ink` with a filled icon. On phone they become sheets.
- **States:** empty is icon plus a short muted line. Loading is the real layout in `--raised`. Error is ink text plus an icon (never red alone at UW).
- **Shadows:** `--shadow-rest` on panels and `--shadow-float` on floating things only. No hover lifts, glows or gradients.
- **Breakpoints:** phone ≤700, desktop ≥1100.

---

## 0. Global foundations (these cause problems on every unmocked screen)

| # | Where | Issue | System says | Size |
|---|---|---|---|---|
| G1 | `index.css:10-17` | `body` sets only family, colour and background. It has no `font-size: 15px`, `font-weight: 500`, `line-height: 1.5` or `font-variant-numeric: tabular-nums`. | system.css `body { font: 500 15px/1.5 var(--font); tabular-nums }` | S |
| G2 | `index.css` (missing) | No base `h1, h2, h3` rule. Tailwind preflight (`@tailwind base`) resets headings to `inherit`, so every heading without its own `font-family` renders in Hanken. 10 stylesheets never use `--font-display`: CoursesPage, CourseComparePage, SavedPage, CanvasPage, CampusLanding, Login, Signup, Toast, UserGuide, FileUpload. Every h1 and h2 on Courses, Compare, Saved, landing, sign-in and sign-up is therefore not Unbounded. | `h1,h2,h3 { font-family: var(--font-display); letter-spacing: -0.03em; line-height: 1.12 }`, h1 28px/700, h2 16px/700 | S to add, M to verify ripple |
| G3 | `index.css:19-23` plus every `--font-mono` use | `code, pre, .font-mono` and course codes use `--font-mono` (ui-monospace). Course codes use it at `CoursesPage.css:92, 381, 515`, `SavedPage.css:247`, `SemesterView.css:230, 303, 534` and `UserGuide.css:208`. | Course codes and big numbers use `--font-code` (Unbounded 700, about 11px or 0.78em). "JetBrains Mono is gone." Mono is acceptable only for literal code blocks. | S |
| G4 | `index.css:25-50` and `../tailwind.config.js:6-31` | The Tailwind theme still maps to **retired tokens**: `--paper`, `--paper-sunken`, `--ink-soft`, `--bg-primary`, `--text-primary`, `--text-secondary`, `--card-bg`, `--border-primary`, `--accent-primary`, `--accent-red/blue/green`, `--shadow-soft`, `--shadow-soft-md`. None of these is defined any more. `.surface-card`, `.glass-card`, `.nav-pill` and `.btn-primary` therefore resolve to transparent backgrounds, and borders fall back to `currentColor` (an ink border). `.surface-card` is used live by `MessageBubble.js:496` and `ThinkingIndicator.js:22`. `.btn-primary` is used by `Login.js:189` and `Signup.js:355`. `rounded-2xl` is overridden to 1rem. | Map Tailwind to the current roles (`--surface`, `--line`, `--signal`, `--shadow-rest`), or delete the `@layer components` block and the Tailwind colour map. | M |
| G5 | `theme/schoolTheme.js:75-77` | MUI `typography` sets only `fontFamily: var(--font-app)`. `h1`–`h6` and `subtitle1` are not Unbounded. **`overline` is left at MUI's default (uppercase with 1px tracking)**, and `ExportButton.js:196, 220` uses it, which makes it an all-caps eyebrow. | Headings use `--font-display` 700 at -0.02em. Override or forbid `overline` (13px, 700, no transform). | S |
| G6 | `schoolTheme.js:79` | `shape.borderRadius: 12`, so `sx={{ borderRadius: 2 }}` gives 24px and unthemed MUI inputs, toggle buttons and alerts are 12px. | Inputs `--r-lg` (16). Use token strings in `sx`, not multipliers. | S |
| G7 | `schoolTheme.js:82-170` (gaps) | No overrides for `MuiOutlinedInput` / `MuiTextField`, `MuiToggleButtonGroup` / `MuiToggleButton`, `MuiAlert`, `MuiSnackbar`, `MuiChip`, `MuiSwitch`, `MuiTabs`, `MuiSkeleton`, `MuiCircularProgress` colour, or `MuiButton` height, padding, press scale and `containedError`. | Inputs: r-lg, `--control` hairline, ink focus. Toggle group: `.seg`. Alert and Snackbar: route to the shared Toast. Button: 42px, padding 0 18px, `:active` scale .95. Danger button: ink or `--harder` with an icon (UW rule). | M |
| G8 | `schoolTheme.js:149-156` | `MuiListItemButton` is forced to `--r-full`. In list panels such as ChatSearchPage this makes every divided row a pill. | Rows inside a panel are r-md (12). Menu rows are r-lg. Only rail nav items are pills. | S |
| G9 | `schoolTheme.js:80` and many CSS files | Breakpoints are `md: 769` with CSS `@media (max-width: 767px)` / `1023px`. | Phone ≤700, tablet 701–1099, desktop ≥1100. A tablet band of 700–767px currently gets the phone layout. Decide this once. | M |
| G10 | `brand-tokens.css:123` (`.skip-link`) | `border-radius: 10px` and weight 600. | r-full pill (it is a button), weight 700 | S |
| G11 | `brand-tokens.css:3-7` (comment) | The header comment says "the older token names, which now point at the roles", but those aliases were retired in commit 6a3ffe3. Tailwind (G4) still depends on them. | Fix the comment together with G4. | S |
| G12 | `../public/index.html:7, 58` | `theme-color #111114` is the old ink, and `<title>React App</title>`. | `theme-color` from `--deep` (set at runtime per school). Title "Campus Companion". | S |
| G13 | Global class collisions | `Login.css` and `Signup.css` both define global `.logo-container`, `.logo-icon`, `.form-group`, `.form-input`, `.input-container`, `.submit-btn`, `.divider`, `.error-message`, `.link-btn`, `.google-btn`, `.phone-btn`, `@keyframes spin` and `fadeInUp`. `components.css` also defines `.logo-container` (76), `.input-container` (831), `.error-message` (755), `.header`, `.main` and `.footer`. `CanvasPage.css:604` and `Login.css:268` both define `.loading-spinner`. Whichever file loads last wins. | Prefix per screen (`au-`), or share one auth stylesheet. | M |
| G14 | Icon sizing via CSS width | Icons are font ligatures sized by inline `fontSize` (`icons.js:56`). CSS such as `.logo-icon { width:28px }` (`Login.css:72`), `.input-icon { width:16px }` (`Login.css:122`) and `.canvas-title-icon` / `.section-icon` therefore does not resize them: the glyph stays 24px inside a 16px box. | Pass `size` and drop the width/height CSS. | S |

---

## 1. Signed-out landing: `pages/OnboardingPage.js`, `styles/CampusLanding.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `OnboardingPage.js:69-71` | The brand mark is a `MapPin` icon. | The school monogram `.mark` (`schoolMark()` from CampusRail), the same as the rail and phone header | S |
| `OnboardingPage.js:67-91`, `CampusLanding.css:17-22` | The bar is plain canvas. There is no school colour and no theme toggle. | The frame is the school's `--deep` (phone-top / rail), with the `.tt` theme toggle in the header | M |
| `OnboardingPage.js:98` (`.campus-kicker`) | An eyebrow line with the school name above the h1 | No eyebrows above headings (user taste). The school name belongs in the brand lockup. | S |
| `OnboardingPage.js:100-103` | `.landing-lede`, a tagline paragraph | No taglines or helper text | S |
| `OnboardingPage.js:14-18, 123` | `DOMAIN_SOURCES` adds a helper sentence under each domain ("Course grades, instructors and sections") | Labels only | S |
| `CampusLanding.css:76-83` | h1 `clamp(34px, 5.4vw, 56px)` in Hanken (G2) | Unbounded 700, max 34px (28px is the page title) | S |
| `CampusLanding.css:31-45` | `.landing-soft-btn` is r-10, weight 600, `--line` border, 38px tall | `.btn` secondary: r-full, 42px, 700, `--control` border | S |
| `CampusLanding.css:93-110` | The CTA is an ink button with a color-mix hover | `.btn.primary` hero: `--signal` / `--on-signal`, 48px, `--signal-hover` | S |
| `CampusLanding.css:118-123` | The h2 "Questions students ask" is a 13px muted label (eyebrow-like) | A section heading: Unbounded 16px, or a `.panel-h h2` | S |
| `CampusLanding.css:132-136` | `.landing-domains` panel at r-18 with no rest shadow | `.panel`: r-xl, `--shadow-rest` | S |
| `CampusLanding.css:145` | Row dividers use `--line` | Rows inside a panel use `--rule` | S |
| `CampusLanding.css:183` | `@media (max-width: 640px)` | 700 | S |

## 2. Auth: `pages/AuthPage.js`, `components/Login.js`, `components/Signup.js`, `styles/Login.css`, `styles/Signup.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| **`Login.css:417-420`** | **On phones (≤480px) `.login-container { border-radius: 9999px }`, so the whole form card becomes a pill or stadium.** | Dialog / sheet r-2xl (32), or full-bleed on phone | S (bug) |
| **`Signup.css:407-410`** | The same bug at ≤640px | Same as above | S (bug) |
| `Login.css:42`, `Signup.css:17` | The card is 1rem (16) | r-2xl (32) for a standalone dialog-like card | S |
| `Login.js:105-111`, `Signup.js:141-149` | The logo is a generic `BookOpen` icon in an ink circle with a float shadow | The school `.mark`, with no shadow (shadows are for floating things) | S |
| `Login.js:109-111` | "Welcome Back" plus a subtitle ("Sign in to continue"). `Signup.js:145-148` has "Join Our Community" plus "Create your account to get personalized guidance from expert advisors". | No taglines. Use a title only, in sentence case ("Sign in", "Create account"). The signup copy still names "expert advisors" from the old product. | S |
| `Login.css:78-84`, `Signup.css` (title) | Titles are 28px Hanken (G2) | Unbounded 700, 28/23px | S |
| `Login.css:132-142` | `.form-input` is r-12 with 16px padding and a focus ring of `0 0 0 3px var(--tint)` | Inputs r-lg (16). One focus style: the 2px ink ring (`brand-tokens.css:96`). | S |
| `Login.css:107-113` | `.form-label` is 14px/600 with Title Case labels ("Email Address", "Current Password") | Labels 13px/700, sentence case | S |
| `Login.css:230-261`, `Login.js:189` | `.submit-btn` is an **ink** button with a `translateY(-2px)` hover lift and shadow. It also carries the broken Tailwind `.btn-primary` (G4). | `.btn.primary` is `--signal` / `--on-signal`, 42–48px, press scale .95, no lift | S |
| `Login.css:317-348` | Google and Phone buttons are r-12, weight 500, with a hover lift | `.btn` secondary: r-full, 700 | S |
| `Login.css:164-206` | `.password-toggle` and `.forgot-password` are r-6 with a surface hover | `.btn.icon` / `.btn.ghost` (r-full) | S |
| `Login.css:217-227` | `.submit-error` is a red tint with red text and no icon | Ink text plus an error icon, with a tint fill at most (UW: never red alone) | S |
| `Login.css:271` | Spinner border `rgba(255,255,255,.3)` | A token (`--on-signal` at reduced alpha via color-mix) | S |
| `Login.css:283-307` | An "or continue with" divider with a 13px faint label | Acceptable. Use `--rule`, not `--control`. | S |
| `Login.css:370-375`, `Login.js:247-252` | A "Powered by Neon.ai" block inside the card, plus a copyright footer outside it | Product decision. If kept, put it in the page footer only, not inside the card. | S |
| `Signup.js:295-306`, `Signup.css:125-170` | A native `<select>` for academic stage | A menu-style select (MUI Select themed as `.menu`), or a `.seg` / chips when there are ≤4 options | M |
| `Signup.css:540-588` | Dead password-strength CSS (`.password-strength`, `.strength-bar`, `.strength-text`); `.w3` is also dead | Delete | S |
| `Signup.css:102` | `font-weight: 400` | Nothing lighter than 500 | S |
| `Signup.js:336-343` | Terms and Privacy links are buttons with no handler | Functional, not visual. Flag to the owner. | S |
| `AuthPage.js` | Login and Signup are two unrelated layouts (Signup lacks the `login-content` wrapper and the page footer) | One auth layout with a `.seg` "Sign in / Create account" switch | M |
| Both | No theme toggle and no school frame on these pages | Same frame as the landing (§1) | M |

## 3. Auth boot screen and route fallbacks: `App.js:35, 41-46, 88, 97, 105, 111`, `ProtectedRoute.js:10, 28`, `components.css:1052-1061`

| Where | Issue | System says | Size |
|---|---|---|---|
| `components.css:1052-1061` | `.auth-boot-screen` is muted centred text ("Checking session…", "Loading courses…") on canvas at 0.9375rem | Loading is "the real layout in raised". At minimum, show the school frame (deep rail or header plus mark) with raised placeholder blocks. The text belongs in `sr-only`. | M |
| `App.js:88, 97, 105, 111` | The same 100vh boot screen is reused as the Suspense fallback **inside** the shell page column for Saved, Map, Courses and Compare | A page-shaped skeleton (titlerow placeholder plus panel placeholders in `--raised`) | M |

## 4. Courses catalog (Browse): `pages/CoursesPage.js`, `components/catalog/*`, `styles/CoursesPage.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `CoursesPage.js:581`, `CoursesPage.css:33-38` | `.cc-kicker` (school name) above the h1 | No eyebrow. The school is already on the rail. | S |
| `CoursesPage.css:40-45` | h1 `clamp(26px, 3.4vw, 32px)` in Hanken | Unbounded 28px (23px on phone) | S |
| `CatalogParts.js:51`, `CoursesPage.css:47-74` | `.cc-tabs` is r-14 on a `--line` track, with r-10 tabs at weight 600 | `.seg` (already in `components.css:1549` as `.cc-segmented`): raised track, r-full, 700, 14px | S |
| `CoursesPage.css:76-88` | `.cc-tab-count` is an ink pill | `.tag` (r-full, 12.5px/700). Use tint or raised, not inverted ink. | S |
| `CoursesPage.css:224-236` | `.cc-search` is r-14, 48px, with a `--line` border and an ink focus border | Input: r-lg (16), or r-full like the Events search in the mockup, with a `--control` border | S |
| `CoursesPage.js:603-638`, `CoursesPage.css:261-275` | `.cc-filter` chips are 44px, weight 500, with a `--line` border, and on is **ink** | `.chip` (`components.css:1515` `.cc-chip`): 36px, 700, `--control` border, on is `--deep` (dark: `--tint-strong`) | S |
| `CoursesPage.css:288-302` | `.cc-ticked-chip` has a coloured `--academics` border on an academics tint | `.chip.on`, or `.tag` with an `x`. No coloured borders. | S |
| `CoursesPage.css:91-97` | `.cc-code` is `--font-mono` 13px/500 with +0.01em tracking, in academics ink | `--font-code` Unbounded 700, about 11px, `--muted` (or band) colour | S |
| `CoursesPage.css:306-311`, `CoursesPage.js:659` | The "Start with" h2 is a 13px muted label | `.panel-h h2` (Unbounded 16px) or a plain label at 13px/700 in ink | S |
| `CoursesPage.css:313-321` | `.cc-rows` panel is r-16 with no rest shadow, and rows use `--line` | `.panel` r-xl plus `--shadow-rest`. Row rules use `--rule`. | S |
| `CoursesPage.css:341-347` | Native checkbox with `accent-color: var(--ink)` | Acceptable. Prefer `--signal` for the one primary action, or a round tick in `--tint` / `--tint-ink`. | S |
| `CoursesPage.css:377-386` | GPA number in `--font-mono` 15px/600 | Unbounded 600 at about 14px (like `.evt .time`), coloured by difficulty | S |
| `CoursesPage.css:388-403` | `.cc-tickbar` is an ink bar at r-14 | A floating bar: `--deep` / `--on-deep` at r-2xl (or r-full), `--shadow-float` | S |
| `CoursesPage.css:406-412, 555` | `.cc-preview` panel is r-20 (r-16 on phone) | `.panel` r-xl (24) | S |
| `CoursesPage.css:442-447` | The preview h2 is 24px Hanken | Unbounded 16–19px (`.ccard .band h3` is 19px) | S |
| `CoursesPage.css:457-468` | `.cc-tile` is r-12 on `--canvas`, the value is 22px Hanken, and the label is 13px | `.dtile` / `.stats`: r-lg, `--raised`, value Unbounded 16–21px/700, label 12.5–13px/600 | S |
| `CoursesPage.css:472` | `.cc-block h3` is 14px Hanken | `.sect h3`: Unbounded 13.5px/700 | S |
| `CoursesPage.css:482-489` | `.cc-prereq` well is r-12 on canvas | Acceptable as a well (r-md), but use `--raised`, not `--canvas` | S |
| `CoursesPage.css:157-167` | Placeholders `.cc-ph` are r-6 on `--line` | Placeholder blocks in `--raised`, r-sm or r-md | S |
| `CoursesPage.css:172-178, 212, 517-525` | Grade bar r-6, legend dot r-2 (square), seat bar r-3, seats fill **ink** | Bar r-sm, dots round (`.kd`), fill `--good` or `--track` | S |
| `CoursesPage.css:127-152`, `CatalogParts.js:87-98` | `.cc-error` is error tint and error text, with no icon. Retry is r-10 with a `currentColor` border. | Error: ink text plus an `error` icon. Retry is a `.btn` (r-full). | S |
| `CoursesPage.css:115-125`, `CoursesPage.js:519, 529, 573` | Empty states are bare sentences ("Search by course code or title to get started.", "Pick a course to see grades and seats.") with no icon | `.empty`: icon plus a short muted line. Trim to labels ("No course selected"). | S |
| `CoursesPage.js:214-217, 654, 663` | Footnotes: "Grades, seats and requirements from …", "Compare up to 4", "As of …" | Source attribution is useful data. Keep it, but as `.checked`-style `.src` chips rather than sentence footnotes. | S |
| `CoursesPage.css:101-108` | `.cc-na` is r-10 on canvas | r-md on `--raised` | S |
| `CoursesPage.css:539, 546` | Breakpoints 1023 and 767 | 1099 and 700 (G9) | S |
| `CoursesPage.css:4-9` | `.cc-page-main` padding is 40/32/64 | `.main`: 28px 36px 40px (18px 16px 96px on phone) | S |

## 5. Compare: `pages/CourseComparePage.js`, `styles/CourseComparePage.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `CourseComparePage.js:313` | `.cc-kicker` eyebrow | Remove | S |
| `CourseComparePage.css:11-18` | The table panel is r-16 with no shadow | `.panel` r-xl plus `--shadow-rest` | S |
| `CourseComparePage.css:35` | Cell rules use `--line` | `--rule` | S |
| `CourseComparePage.css:51, 79-85` | Column title 15px Hanken. `.cmp-value` is 20px Hanken. | Title in Unbounded 14–16px. Values in Unbounded 700 at 16–20px (like `.dtile b` / `.kpis`). | S |
| `CourseComparePage.css:53-67` | The remove button is a 44px square at r-10 | `.btn.icon` (r-full, 42px, ghost) | S |
| `CourseComparePage.css:94-103` | `.cmp-add` panel has a **dashed** border at r-16 | Solid `.panel` r-xl. No dashed borders in the system. | S |
| `CourseComparePage.css:105` | The `.cmp-add h2` is 16px Hanken | Unbounded 16 (G2) | S |
| `CourseComparePage.css:109-127` | Add-list rows use a `--line` top border, weight 500 | Menu-like rows (44px, r-lg, hover `--raised`) | S |
| `CourseComparePage.css:136-159` | `.cmp-empty` and `.cmp-ask` are r-16 with no icon on the empty state | `.panel` r-xl. Empty state gets an icon. | S |
| `CourseComparePage.js:305` | "Compare up to 4. Remove one to add another." | Helper sentence. Use "Compare up to 4" only, or disable add with an aria-describedby. | S |
| `CourseComparePage.css:161, 166` | Breakpoints 1023 and 767 | G9 | S |

## 6. Saved: `pages/SavedPage.js`, `components/saved/SavedRowMenu.js`, `styles/SavedPage.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `SavedPage.js:765`, `SavedPage.css:30-35` | `.saved-kicker` eyebrow | Remove | S |
| `SavedPage.css:37-43` | h1 `clamp(28px, 4vw, 36px)` in Hanken. **36px is above the 34px cap.** | Unbounded 28/23 | S |
| `SavedPage.js:770` | Footnote: "Anything you save from a page or an answer card lands in Unsorted until you file it." | A tagline. Remove it (labels only). | S |
| `SavedPage.js:645` | Empty state: "Nothing saved yet. Use the bookmark on any course, event or place, here or in chat." | `.empty`: icon plus "Nothing saved yet" | S |
| `SavedPage.css:68-93` | The collections list is r-10 with weight 400/600, selected is surface plus an inset `--line` ring | Menu or rail-list idiom: rows r-lg (or r-full like rail recents), selected `--tint` / `--tint-ink`, 700 | S |
| `SavedPage.css:112-119` | `.saved-panel` is r-16 with no shadow | `.panel` r-xl plus `--shadow-rest` | S |
| `SavedPage.css:138-143` | Panel h2 18px Hanken | `.panel-h h2` Unbounded 16 | S |
| `SavedPage.css:151-175` | `.saved-btn` is r-10, weight 500, `--line` border. Primary is **ink**. Danger is red text. | `.btn` r-full, 42px, 700, `--control`. Primary `--signal`. Danger `--harder` plus an icon. | S |
| `SavedPage.css:177-190` | `.saved-icon-btn` is a 44px square at r-10 with a border | `.btn.icon` (r-full), ghost inside rows (`.acts` pattern) | S |
| `SavedPage.css:199-211` | Inline-form input is r-10 with a `--line` border | Input r-lg, `--control` | S |
| `SavedPage.css:220-228` | Row dividers use `--line` | `--rule` | S |
| `SavedPage.css:244-250` | `.saved-code` uses `--font-mono` 14px in academics ink | `--font-code` (G3) | S |
| `SavedPage.css:284-292` | `.saved-tag` is a campus tint at 12px/600 | `.tag` (24px, 12.5/700) | S |
| `SavedPage.css:297-331`, `SavedRowMenu.js:102-128` | A hand-rolled menu: r-12 panel, r-8 rows, 14px weight 400, hover `--canvas`, **no icons** | `.menu`: r-xl, 44px rows at r-lg with an icon (`drive_file_move`, `delete`) and label, hover `--raised`, danger `--harder`. On phone it becomes a bottom sheet (§ menus PNG). Better still, reuse the themed MUI Menu (`components.css:1632-1679`). | M |
| `SavedPage.css:347-361` | Past toggle is r-8 | `.btn.ghost` | S |
| `SavedPage.css:374-382` | The error panel is an error tint with red text | Ink text plus an icon | S |
| `SavedPage.css:395-401` | Placeholder bars are r-6 on `--canvas` | `--raised` | S |
| `SavedPage.js:611-614`, `SavedPage.css:423-442` | The phone collection picker is a native `<select>` at r-10 | `.chip`-style trigger that opens a `.menu` / sheet (menus PNG "Program" pattern) | M |
| `SavedPage.js:141, 166, 188, 221` | Row actions are text buttons ("Course page", "Directions", "Remove") | `.acts` icon buttons (open, directions, bookmark) with aria-labels, as on Events rows | M |
| `SavedPage.css:416` | 767 breakpoint | G9 | S |

## 7. Search chats: `pages/ChatSearchPage.js`

| Where | Issue | System says | Size |
|---|---|---|---|
| `ChatSearchPage.js:107-119` | An MUI `AppBar` / `Toolbar` with a back arrow and "Search chats" as `Typography h6` (Hanken). The page renders **no CampusRail**, so the shell rail slot is empty on desktop and there is no phone header or tab bar. | Render `CampusRail` like other pages. `.titlerow` with h1 Unbounded 28px. Back is a `.btn.icon`. | M |
| `ChatSearchPage.js:135-158` | MUI `TextField` small, with `borderRadius: 2` giving **24px** | Input r-lg (16) or a r-full search pill like Events | S |
| `ChatSearchPage.js:165-176` | Loading is a `CircularProgress` plus "Loading chats…" | Raised row placeholders | S |
| `ChatSearchPage.js:178-185` | Empty state is centred body2 text with no icon | `.empty` (icon plus line) | S |
| `ChatSearchPage.js:186-216` | List `borderRadius: 2` (24) with no rest shadow. Rows inherit **r-full** from the theme (G8) with dividers, so the rows become pills. | `.panel` plus rows like `.cls` / rail recents: r-md rows, `--rule` dividers | S |
| `ChatSearchPage.js:205-212` | Title weight 600 and the secondary meta line | Title 700. Meta 13–14px muted. Acceptable. | S |

## 8. Canvas: `pages/CanvasPage.js`, `styles/CanvasPage.css` (orphan route)

The only link to `/canvas` is in `components/Sidebar.js:157`, which is dead code. The page is reachable only by typing the URL. It belongs to the old multi-advisor product ("insights", "AI advisors"). **Recommendation: delete the route, page and CSS rather than restyle them.** If the owner keeps it, it needs a mockup. The issues are listed for completeness:

| Where | Issue | System says | Size |
|---|---|---|---|
| `CanvasPage.css:59, 66, 143, 155, 194, 201` | Box shadows `rgba(0,0,0,.05/.1)` and hover `translateY(-1px)` lifts | No hover lifts. Shadows come from tokens only. | — |
| `CanvasPage.css:167, 174` | Danger button tinted `rgba(239,68,68,…)` with a glow shadow | Tokens. No glows. | — |
| `CanvasPage.css:528-535, 550` | The primary button has an inset highlight and a coloured drop shadow | Flat `.btn.primary` | — |
| `CanvasPage.css:11-12, 299, 336-338, 472, 620, 630-631` | `white` / `black` literals (some are print styles) | Tokens (keep for print only) | — |
| `CanvasPage.css:24, 231, 323, 405` | Radii of 16 and 20, with rem font sizes | Ramp tokens | — |
| `CanvasPage.js:448, 37, 497` | Tagline "Your research progress at a glance", section descriptions, and "Start chatting with your AI advisors…!" | Labels only. Also mentions "AI". | — |
| `CanvasPage.js:401-449` | A header card with a float shadow on canvas, an icon in the title, and Title Case labels ("Total Insights") | — | — |
| `CanvasPage.css:2, 18` (dead) | `.header-left` and `.start-chatting-button` are unused | — | — |
| Size if deleted | | | S |

## 9. Dialogs and overlays

### AppDialog, ConfirmDialog: `components/AppDialog.js`, `ConfirmDialog.js`, `components.css:1681-1758`
Mostly on-system: r-2xl, band title, bottom sheet on phone, scrim token.

| Where | Issue | System says | Size |
|---|---|---|---|
| `ConfirmDialog.js:56-61` | The danger confirm is MUI `contained` / `color="error"`, which is unthemed (G7). At UW, a red danger button on a red frame breaks the "never red alone at UW" rule. | Danger = `--harder` (ink at UW) plus a `delete` icon | S |
| `ConfirmDialog.js:34-46` | A centred 48px warning icon circle in the band, with centred text | Acceptable, but no other dialog centres. Left-align to match the band header pattern. | S |
| `components.css:1724` | 767 breakpoint for sheets | G9 | S |

### SettingsModal: `components/SettingsModal.js` (inline styles throughout)

| Where | Issue | System says | Size |
|---|---|---|---|
| `SettingsModal.js:16-27, 314-328` | Tabs are underline tabs (2px ink bottom border), 13.5px/500 | `.seg` (r-full raised track), or a left `.menu` list on desktop | M |
| `SettingsModal.js:30` | Labels are 13px/600 muted, in Title Case ("First Name", "Confirm New Password") | 13px/700, sentence case | S |
| `SettingsModal.js:32-36` | Inputs are r-8 with a `--line` border, 14px | r-lg, `--control`, 15px | S |
| `SettingsModal.js:38-48` | Primary is **ink** at r-8, weight 500. Danger is solid `--error` at r-8. | `.btn.primary` (signal, r-full, 700). Danger `--harder` plus an icon. | S |
| `SettingsModal.js:50-59` | `miniBtn` is r-6, 12px | `.btn` small or `.chip` | S |
| `SettingsModal.js:238-258` | Status banner `rgba(220,38,38,.1/.3)` and `rgba(22,163,74,.1/.3)` | `--error-tint` / `--good-tint` plus an icon, or the shared Toast | S |
| `SettingsModal.js:486-490` | Danger-zone box `rgba(220,38,38,.08)` with a `.3` border | Ink text plus a warning icon on `--raised`. No red side borders. | S |
| `SettingsModal.js:383-385` | Helper line: "… · turn an advisor off to keep them out of your conversations" | Label only ("4 of 6 on") | S |
| `SettingsModal.js:417` | Advisor avatar square r-8 | Round avatar (`.avatar`) | S |
| Whole "Advisors" and "Model" tabs | Legacy multi-advisor and LLM-provider UI. The mockup's Account menu lists Profile, Settings, Model and Help, but no settings screen is designed. | Needs a mockup (see §13) | L |

### Toggle: `components/Toggle.js`
| `Toggle.js:37-57` | The switch is ink when on, with a white knob and hard-coded `rgba(0,0,0,.15)` / `.1` shadows | On is `--signal` (or `--tint-strong` with a `--tint-ink` knob, matching `.tt`). Knob shadow from `--shadow-rest`. | S |

### UserGuide: `components/UserGuide.js`, `styles/UserGuide.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `UserGuide.js:72-87`, `UserGuide.css:1-38` | `.ug-header` adds a bottom border and an ink r-8 icon square, inside the band title (`.cc-dialog` makes the title `--band`). The result is an ink square on a dark band. | Band title with the label only ("Help"). Drop the icon tile. | S |
| `UserGuide.js:77` | "User Guide" | Sentence case "Help" (matches the Account menu PNG) | S |
| `UserGuide.css:65-67` | Search is r-10 on canvas | Input r-lg or a r-full pill | S |
| `UserGuide.css:99-130` | TOC items are r-8, 500, hover canvas, **active `rgba(38,99,235,.1)` blue** | `.menu .mi`: r-lg, 600, hover `--raised`, active `--tint` / `--tint-ink` with a filled icon | S |
| `UserGuide.css:159-180` | Content h1 is 26px/**800**, h2 18px, h3 15px, all Hanken | Unbounded 700 at 16–19 / 14 / 13.5 inside a dialog | S |
| `UserGuide.css:204-208` | Inline code r-4 in `--font-mono` | r-sm. Mono is acceptable for literal code. | S |
| `UserGuide.css:139` | 13px labels; there is no topic icon fill when active | Filled icon when active | S |

### ExportButton: `components/ExportButton.js`

| Where | Issue | System says | Size |
|---|---|---|---|
| **`ExportButton.js:196-200, 219-224`** | **`Typography variant="overline"`: "WHAT TO EXPORT", "FORMAT". These render all-caps with tracking (G5).** | `.menu .mh` (13px muted, no caps) | S |
| `ExportButton.js:183-191` | Header "Share or export" plus a helper line, "Download this saved conversation" | Label only | S |
| `ExportButton.js:202-215` | Unthemed `ToggleButtonGroup` (square, r-12) | `.seg` | S |
| `ExportButton.js:228-244` | MenuItems with `ListItemText secondary` (a description per format) | `.mi` with an icon, a label and a right value ("PDF, DOCX"). No description line. | S |
| `ExportButton.js:250-266` | MUI `Snackbar` plus a filled `Alert` (green/red, MUI radius), separate from the shared Toast | `useToast().show({ message, tone })` | S |
| `ExportButton.js:156` | `CircularProgress` in the icon button | Acceptable, or `progress_activity` ligature | S |

### Toast: `components/Toast.js`, `styles/Toast.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `Toast.css:16` | r-12 | A floating pill (r-full) or r-lg. Not in the system: decide once. | S |
| `Toast.css:17-24` | Ink background. Error is a solid `--error` fill, which at UW means red alone. | Ink with an error icon for errors (never red alone at UW) | S |
| `Toast.css:28-41` | The action button is r-8, weight 600 | `.btn.ghost` r-full 700 in on-ink colour | S |
| `Toast.css:45` | 767 breakpoint | G9 | S |

### FileUpload: `components/FileUpload.js`, `styles/FileUpload.css`

| Where | Issue | System says | Size |
|---|---|---|---|
| `FileUpload.css:8-28` | The status banner has a 1px coloured border in good/error colours with a slide-in | Tint fill plus an icon, no coloured border | S |
| `FileUpload.css:64-70` | Drop zone has a 2px **dashed** border at r-12 | Not in the system. Use a raised well at r-lg. The composer's `+` menu is the mocked entry point. | M |
| `FileUpload.js:218-220` | "Click to upload or drag and drop" / "PDF, DOCX, or TXT files only" | Helper text. Use label only ("Upload a file") plus the type chips. | S |
| `FileUpload.js:13-15`, `FileUpload.js:227-234` | Type chips coloured by error/academics/good (PDF is **red**) | `.tag.plan` (raised/muted). Data colours keep their meanings, so PDF should not be "error". | S |
| `FileUpload.css:53, 176, 203` | Radii 4 / 16 / 8 | Ramp tokens | S |
| `FileUpload.css:226` | `color: white` | `--on-signal` | S |
| `FileUpload.js:98` | Console emoji (not visible) | — | — |

### ThinkingIndicator: `components/ThinkingIndicator.js`, `components.css:768-823`, `components/chat/ChatThinking.js`

| Where | Issue | System says | Size |
|---|---|---|---|
| `ThinkingIndicator.js:14-45` | A per-advisor bubble: avatar square plus `surface-card` (broken Tailwind, G4) plus advisor colour dot plus advisor name h4 plus three dots plus lowercase "thinking..." | One "Thinking…" line in the answer column (the mockups show no persona bubbles). If personas stay, use `.ubub`-like spacing, r-xl, no persona colour dot. | M |
| `components.css:777-783` | `.thinking-bubble` is r-12 with a `border: 1px solid` (currentColor fallback) and a rest shadow | — | S |
| `components.css:792-796` | `.advisor-name` 14px/500 | 700 | S |
| `contexts/AppConfigContext.js:77-80` | Advisor fallback colours are hex (`#6B7280`, `#F3F4F6`, `#9CA3AF`, `#374151`) | Roles | S |

### ErrorBoundary: `components/ErrorBoundary.js`
| `ErrorBoundary.js:24` | Fallback defaults to `null` (silent). The only caller is MessageBubble. | System error state: ink line plus an `error` icon ("Couldn't show this message") | S |

---

## 10. Advisor components

| Component | Status | Notes | Size |
|---|---|---|---|
| `AdvisorCarousel.js` (live: ChatPage, DockConversation) | Live | The multi-advisor carousel is not in the chat mockups, which show one answer. Its CSS is `ChatPage.css:215+`: arrows, dots, `.single-response-wide`. Decide whether multi-advisor answers survive. If yes, it needs a mockup. | L (decision) |
| `AdvisorConfigPanel.js` (live via SettingsModal) | Live | Inline styles: inputs r-8 at 13.5px (`:42-43`), title 600 (`:51`), helper paragraph (`:116`), 12px descriptions (`:125, 143, 168`). Restyle with Settings. | M |
| `AdvisorCard.js` | **Dead** (no importer) | `rgba(0,0,0,.45)` overlay (`:36`), `surface-card` | delete, S |
| `AdvisorStatusDropdown.js` | **Dead** | Inline `<style>` block with `rgba` shadows (`:189, 197, 245, 394`), r-8 avatars, "Disable all advisors?" h3 | delete, S |
| `AdvisorSidebarPicker.js` | **Dead** (only `Sidebar.js`, also dead, imports it) | `variant="overline"` (`:196`), r-50% avatars, a 9px check icon | delete, S |
| `AvatarPickerModal.js` | **Dead** (only dead AdvisorCard and AdvisorStatusDropdown import it) | — | delete, S |
| `HybridConfigModal.js` | **Dead** | Its own fixed overlay `rgba(0,0,0,.5)` (`:7`), r-16 canvas card, "Hybrid LLM Configuration" h3 18px, r-8 buttons | delete, S |
| `WelcomeModelPicker.js` | **Dead** | r-16/12/10 inline, 18px h3, helper paragraph | delete, S |
| `ProviderDropdown.js` | **Dead** | Uses a `✓` text glyph (`:130`). **Its CSS is still in `ChatPage.css:761-1105`, about 340 lines**, including the only two `text-transform: uppercase` / `letter-spacing: .5px` rules in the app (`:835-836`, `:1050-1051`) and the `rgba(66,133,244…)`, `rgba(16,185,129…)`, `rgba(239,68,68…)` and `rgba(168,85,247…)` badge colours (`:1056-1071`). | delete, S |
| `Sidebar.js` plus `styles/Sidebar.css` | **Dead** (CampusRail replaced it). Has a test (`Sidebar.test.js`). | Also the only link to `/canvas` and the only remaining `CircularProgress` users besides Export and Search | delete, S |
| `ChatInput.js`, `SuggestionsPanel.js` | **Dead** (no importer). `SuggestionsPanel.test.js` exists. | `components.css:285-443` (suggestions) and `:825-893` (basic chat input) are dead CSS as a result | delete, S |

---

## 11. Leftover sweep of `src/styles/*.css`

### 11a. Hard-coded colours (outside `brand-tokens.css`)
- **CanvasPage.css:** 13 rgba, plus `white` and `black` literals (§8). Delete with the page.
- **ChatPage.css:** `:424` is a **gradient** (`linear-gradient(135deg, var(--ink), var(--muted))`) on `.system-content` (dead, see 11f), with `color: white` at `:425`. `:430, 596, 778, 785, 954, 991` are rgba shadows. `:1056-1071` are provider badges (dead). `color: white` / `background: white` also appear at `:285, 379, 512, 740, 745, 756`.
- **ChatFrame.css:** `:87-88` `.chat-more-popover` uses r-14 `!important` and a custom shadow `!important` (should be `.menu`: r-xl plus `--shadow-float`). `:228, 252, 255, 297, 304` are rgba borders, shadows and scrim (use `--control`, `--shadow-float` and `--scrim`). These are chat-adjacent, but `.chat-more-popover` is a menu.
- **components.css:** `:644, 677, 948` are rgba shadows on `.message-action-button` hover (with a `translateY(-1px)` lift at `:946-949`) and the tooltip. `:533` is `color: white` (`.reply-badge`).
- **Login.css:271, Signup.css:273:** spinner border `rgba(255,255,255,.3)`.
- **UserGuide.css:128:** active TOC `rgba(38,99,235,.1)`.
- **FileUpload.css:226:** `color: white`.
- **Inline JS:** `SettingsModal.js:241-254, 488`, `Toggle.js:57`, plus the dead files (`HybridConfigModal.js:7`, `AdvisorCard.js:36`, `AdvisorStatusDropdown.js:140, 189-245, 394`).
- `Login.js:220-223` and `Signup.js:386-389` use Google brand hex in the "G" logo. This is acceptable, because it is a third-party brand mark.

### 11b. Font families
- No stray font family names. Everything uses tokens.
- `--font-mono` is wrongly used for course codes and numbers (G3).
- Headings with no display font (G2).

### 11c. Font sizes off the scale
- Above the 34px cap: `CampusLanding.css:79` (to 56), `SavedPage.css:39` (36), `SemesterView.css:230` (36, mono), `ChatPage.css:140` (to 52), `ChatFrame.css:181` (40), and in `components.css` `:117` (48), `:1019` (36) and `:1183` (2rem, all dead homepage CSS).
- rem/em sizes: CanvasPage (13), Popups (10), components.css (20).
- Weight below 500: `Signup.css:102` (400).
- Many weight-500 buttons and labels where the system wants 700 (Saved, Courses filters, Settings, Login social buttons).

### 11d. Radii off the ramp
About 150 literal radii. Off-ramp values:
- **10px:** CampusLanding:38, ChatFrame:67/118, CoursesPage:62/104/146, DegreeBoard:544, SaveButton:10, SavedPage ×6, components.css:1149/1296, CourseComparePage:63, brand-tokens:123, dnd:11/24, SemesterView:114, UserGuide:67
- **14px:** ChatFrame:87, CoursesPage:51/231/394, SemesterView:145
- **18/20px:** CampusLanding:133, ChatPage:374/427/730, CanvasPage:405, CoursesPage:410, components.css:335
- **2–6px:** CampusHome:56, ChatPage:624/662/686/1049/1079, CoursesPage:160/176/212/519, DegreeBoard:56/170/231/724, FileUpload:53, Login:172/199, Signup:180/557, Popups:871, SemesterView ×12, UserGuide:204, components.css:535/635/673/738, CourseVisuals:390
- **9/11px:** SemesterView:84/375/401
- **1rem:** Login:42, Signup:17
- **9999px on a card:** Login:419, Signup:409 (bug)

On-ramp values written as literals (8/12/16/24/32) should become `var(--r-*)`. That is S per file and mechanical.

### 11e. Uppercase, letter-spaced eyebrows, side stripes
- `text-transform: uppercase`: only `ChatPage.css:835` and `:1050` (provider badges, dead), plus MUI `overline` (G5) at `ExportButton.js:196, 220` (live) and `AdvisorSidebarPicker.js:196` (dead).
- Positive letter-spacing: `ChatPage.css:836, 1051` (dead), `CoursesPage.css:96` and `SemesterView.css:519` (0.01em on codes, which goes away with `--font-code`).
- Muted labels sitting above an h1: `.cc-kicker` (CoursesPage.css:33, used on Courses and Compare), `.saved-kicker` (SavedPage.css:30), `.campus-kicker` (CampusHome.css:46, used on the landing page and Home).
- **Left-border stripes:** none. All six `border-left` rules are 1px `--line` column dividers (ChatDock:22, ChatPage:1253, EventsPage:536/556, SemesterView:606/701), which is acceptable.
- Coloured card borders: `.cc-ticked-chip` (academics border), `.upload-status` (good/error borders), the Settings danger box (red border), `.clear-canvas-btn` (red border).

### 11f. Shadows outside the system, and hover lifts
- `translateY(-n)` hover lifts: CanvasPage ×9, ChatPage ×5, components.css ×6, FileUpload ×2, Login ×2, Signup ×2. The system says press scales to .95, with no lifts.
- Non-token shadows are listed in 11a.
- `.chat-suggestion` and `.compact-composer` shadows in `ChatFrame.css` (chat scope).

### 11g. Icons
- No Lucide or `@mui/icons-material` imports remain. All icons go through `components/icons.js` (Material Symbols Rounded), and every icon name in use is in the font subset in `public/index.html:20`.
- Text glyphs used as icons, which should become Material icons:
  - `ProviderDropdown.js:130` `✓` (dead)
  - `EnhancedChatInput.js:215-218` uses `📄 📝 📃` **emoji as file-type icons** (live, in the composer: should be `description` / `draft`)
  - `EnhancedChatInput.js:459, 481` `✓`
  - `MessageBubble.js:710` "✓ Copied!"
  - `CoursePopup.js:390-391, 495` uses `★` / `✓ Met` (pop-up is mocked; flag to that audit)
  - `SetupDialog.js:551` `✓`
  - `planFormat.js:34-35` `✓ ✕`
  - `ChatPage.js:141` puts **`✨` in a visible system message** ("✨ Switched to …"). Remove it.
- The `.ms` base in `index.css:53-71` uses `opsz 24` with no default size. The system's `.ms` is 20px at `opsz 20`. The font subset loads only `wght 500`, so the system's `wght 600` on `.btn .ms` and filled nav icons cannot render. Minor: either load `wght@500..600` or accept 500.

### 11h. Dead CSS (classes unused by any live component)
- **components.css** (about 1,000 of 1,759 lines are dead):
  - `:4-283` covers the homepage, header, hero, CTA, `advisors-grid` and features (`.homepage`, `.hero-*`, `.cta-*`, `.advisor-card*`, `.feature-*`)
  - `:285-443` is the suggestions panel (only dead `SuggestionsPanel.js`)
  - `:825-893` is the basic chat input (only dead `ChatInput.js`)
  - `:894-939` is the old footer (check `.footer-neon-*`, which is still used by CopyrightNotice)
  - `:1063-1458` is the old home launchpad (68 classes, none referenced)
  - `:951-961` is an empty "Dark theme adjustments" block
  - The live part starts at `:1459` (`cc-btn`, `cc-chip`, `cc-segmented`, `cc-tag`, `cc-panel`, menus, dialogs). Split the live part into its own file and delete the rest.
- **ChatPage.css:**
  - 26 dead classes: `material-chat-header`, `material-chat-toolbar`, `header-left`, `header-brand`, `brand-icon`, `header-title`, `header-controls`, `thinking-pulse`, `export-dropdown`, `messages-area`, `messages-end-anchor`, `orchestrator-message`, `orchestrator-avatar`, `orchestrator-content`, `orchestrator-header`, `orchestrator-name`, `message-timestamp`, `orchestrator-text`, `system-notification`, `system-content`, `sidebar-collapsed`, `session-title-display`, `header-signout-btn`, `document-indicator`, `doc-count`, `mobile-menu-button`
  - Plus the whole `provider-*` block `:761-1105` (only the dead ProviderDropdown uses it)
- **Sidebar.css:** the whole file (only `Sidebar.js`, which is dead)
- **EnhancedChatInput.css:** `reply-content`, `document-upload-notification`, `notification-close-btn`
- **FileUpload.css:** `input-with-upload`
- **Signup.css:** `w3`, `password-strength`, `strength-bar`, `weak`, `strength-text`, and the `fadeInUp` class rule
- **Login.css:** the `.fadeInUp` class rule at `:506`
- **CanvasPage.css:** `header-left`, `start-chatting-button` (the whole file if Canvas is removed)
- **index.css `@layer components`:** `.nav-pill` and `.glass-card` are unused. `.btn-primary`, `.surface-card`, `.pill-active` and `.accent-dot` are used only by Login/Signup, MessageBubble, ThinkingIndicator and dead components (G4).

---

## 12. MUI default overrides (theme `schoolTheme.js:68-170` plus `components.css:1500-1512, 1630-1679`)
- **Already on-system:** Dialog (r-2xl, float shadow, scrim), DialogTitle (Unbounded 17), Menu (r-xl, float, padding 6), MenuItem (44px, r-lg, tint selection), Button (r-full, 700, signal), IconButton (muted, raised hover), Tooltip (ink).
- **Duplicated:** Menu and MenuItem styles exist in both the theme and `components.css:1632-1679` (the CSS adds `.ms` sizing and the sheet on phone). Keep one source.
- **Missing:** see G5–G8. In addition:
  - `MuiButton` has no `outlined` / `text` overrides in the theme. They are patched in CSS at `components.css:1502-1512`, which forces `MuiButton-text.MuiButton-colorPrimary` to ink. Move these into the theme.
  - `MuiDialogTitle` in the theme (`:107-114`) has no band colour. The band comes only from `.cc-dialog`, so any raw `<Dialog>` gets a different header. All current dialogs go through AppDialog, which is fine.
  - `MuiTooltip` keeps MUI's 4px radius. Use r-sm (8).

---

## 13. Screens that probably need their own mockup before restyling

The system decides components, but not the layout or content of these:

1. **Settings / Account** (SettingsModal, AdvisorConfigPanel, Toggle). The Account menu PNG shows Profile, Settings, Model and Help as menu entries, but no destination. It is a dialog with five tabs, including the legacy "Advisors" and "Model" tabs. The owner needs to decide what remains (profile, password, delete account, model?) and whether it is a dialog, a sheet or a page.
2. **Sign in / Create account / signed-out landing** (OnboardingPage, Login, Signup). This is the first screen anyone sees. It has the school frame on a page with no rail, a hero without taglines, and the auth form layout with a seg switch. The system rules out the current look but does not say what replaces it.
3. **Courses Browse (catalog list plus preview)** and **Compare**. The list, filter and preview split, the tick-to-compare bar, and the comparison table have no mockup. The course pop-up mockup covers the detail band, not the browse layout or the table. This is high-traffic and data-dense.
4. **Saved.** The collections list next to the items, row actions per type (course, event, place), the past group, and the phone collection picker (sheet). The Events mockup row is a good base, but the mixed-type list needs a design.
5. **Search chats / all chats.** It needs a decision on whether it is a page with a rail or a dialog. The layout is simple, so a quick mockup or a reuse of the Events list pattern will do.
6. **Help / User Guide.** A two-pane dialog (TOC plus markdown). The system has menus and dialogs, but no long-form reading layout or markdown type scale.
7. **Multi-advisor answers (AdvisorCarousel) and the thinking state.** The chat mockups show a single answer. Decide whether personas survive before restyling. If they do, they need a mockup.
8. **Loading, empty and error states and the boot screen.** DESIGN.md describes them in one line. One sheet showing the boot frame, a page skeleton and an error panel at each school would settle about 15 separate ad-hoc implementations.

These do not need a mockup:
- **Canvas.** Delete it: it is an orphan route from the old product.
- **Toast, ConfirmDialog, ExportButton menu and FileUpload.** The system's menus, dialogs and tags are enough.
- **The dead advisor, provider, hybrid and welcome components.** Delete them.

---

## 14. Suggested order
1. Foundations: G1, G2, G3, G5, G6, G8. Together these are about an hour of work and visibly fix every unmocked screen.
2. Delete dead code: the Canvas route, the dead components, components.css lines 4–1458, the `provider-*` block in ChatPage.css, Sidebar.css, and Tailwind's legacy layer (G4).
3. Fix the Login and Signup 9999px bug.
4. Swap local buttons, chips, tabs and menus for the existing `.cc-btn` / `.cc-chip` / `.cc-segmented` / MUI Menu on Courses, Compare, Saved and Settings.
5. Mockups for §13 items 1–4, then restyle those screens.
