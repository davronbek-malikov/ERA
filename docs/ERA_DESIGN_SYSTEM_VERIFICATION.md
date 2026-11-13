# ERA Design System: Verification and Regression Review

**Date:** 5 November 2026
**Scope:** the design system described in [`ERA_DESIGN_SYSTEM.md`](ERA_DESIGN_SYSTEM.md), checked against [`ERA_INFORMATION_ARCHITECTURE.md`](ERA_INFORMATION_ARCHITECTURE.md) and [`ERA_PRODUCT_AUDIT.md`](ERA_PRODUCT_AUDIT.md).
**Restrictions honoured:** no redesign, no workspace screens, no changes to authentication, database schema, authorization or the AI backend, no new component library. Only clear bugs were fixed; everything that needs a product decision is reported in §7.

---

## 1. Overall result

**READY WITH KNOWN LIMITATIONS.**

- **64 of 65** automated interaction and accessibility checks pass in a real browser. The one failure is the known, documented gap: no focus trap in the full-height mobile assistant sheet.
- **No horizontal overflow** at any of the 7 widths (1440 to 320px), in English or Uzbek, on the component preview and on the four public pages that render without a database.
- Type check, lint and production build pass.
- **6 regressions or bugs from the design-system work were found and fixed** (§6). Two of them would have been visible on existing pages: cards losing their top padding, and the assistant overlay being twice the screen height.
- Pre-existing issues the review surfaced are listed separately (§6.2). None block Prompt 04.

---

## 2. Tests performed

### 2.1 How

| Method | Tool | Notes |
|---|---|---|
| Static code review | Reading every design-system file; `grep` and Node scripts over `src/` | Tokens, arbitrary values, API compatibility, dependency use |
| Generated-CSS check | Compared every utility class in the design-system files with the CSS Tailwind actually generated | Finds classes that silently produce no styles |
| Real-browser tests | Headless Chrome driven through the Chrome DevTools Protocol, with real keyboard and mouse events | Node's built-in WebSocket; **no new dependencies**. The scripts lived in the session's scratch folder and are not committed |
| Visual review | Screenshots at each width, inspected by eye | Desktop, tablet and phone, English, Uzbek, injected Russian |
| Production check | `next build` and `next start` | Production-only behaviour such as the preview page's 404 |
| Regression scripts | The practice-lab check from tasks 7 and 8 | Unchanged by this work, re-run as a regression |

**No existing test suite exists** in the repository (no test script and no test files), so none could be run. The audit (§7.7) already records this.

### 2.2 Results

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | ✅ Pass |
| ESLint (`next lint`) | ✅ No warnings or errors |
| Production build (`next build`) | ✅ Pass (first attempt in the final run). One earlier attempt failed while downloading Google Fonts and passed on retry with no code change, see §6.2 |
| `/design-system` in production | ✅ Returns **404** with none of its content (`?locale=uz` too) |
| Public routes in production | ✅ `/sign-in`, `/sign-up`, `/about`, `/faq`, `/robots.txt` return 200 |
| Solutions in browser JavaScript (tasks 7 and 8) | ✅ 0 occurrences in `.next/static` |
| Practice-lab regression script | ✅ All 9 checks pass |
| Browser interaction suite | ✅ **64 / 65** (details in §4 and §5) |
| Responsive suite | ✅ No overflow at any width (details in §3) |

### 2.3 Implementation checks

| Item | Result | Evidence |
|---|---|---|
| Tokens centralised | ✅ | All colours, radii, shadows, layout sizes and type sizes are CSS variables in `globals.css`, mapped once in `tailwind.config.ts` |
| Components use semantic tokens | ✅ | No hex values, palette classes or arbitrary radii in `ui/`, `layout/`, `assistant/`, `education/` or `shared/`. Arbitrary values left are layout calculations (`h-[calc(100vh-var(--header-height))]`, `w-[min(85vw,20rem)]`) |
| Classes that generate no CSS | ✅ after fix | Found `top-header` missing (fixed, §6.1 R2). Off-scale opacity classes: none in design-system files |
| Backward-compatible APIs | ✅ after fix | Old Button names (`default`, `danger`, `size="default"`) and Badge names (`default`, `secondary`) still work; `EmptyState` keeps `actionLabel` and `actionHref`; no `Badge` wraps block elements (it's now a `<span>`). Card and Section padding overrides were broken and are fixed (§6.1 R1) |
| One toaster | ✅ | A single `<Toaster />` in the root layout and one notifications region on the page. The older redirect banners and sign-in success dialog are separate, pre-existing patterns, not competing toasters |
| Dependencies | ✅ | The 4 added Radix packages are each used by their wrapper. Tabs and DropdownMenu are only used by the preview so far; their first real use is the lesson editor and row menus in the coming screens |
| Radix components together | ✅ | Dialog, Sheet, DropdownMenu, Tabs, Tooltip and Toast pass their keyboard and focus checks. Escape in a dialog closes only the dialog, not the assistant panel |

---

## 3. Responsive review

Each width was loaded fresh at 900px viewport height (844px for phones in the focus tests). "Overflow" is the page's horizontal scroll width beyond the viewport.

### 3.1 Component preview (`/design-system`)

| Width | Sidebar | Mobile tab bar | Assistant | Roster | h1 | Overflow (EN / UZ) |
|---:|---|---|---|---|---|---|
| 1440 | 240px | — | Docked, 380 × 844 | Table | 28px | 0 / 0 |
| 1280 | 240px | — | Docked, 380 × 844 | Table | 28px | 0 / 0 |
| 1024 | 240px | — | Overlay, 380 × 844 | Table | 28px | 0 / 0 |
| 768 | 64px rail | — | Overlay, 380 × 844 | Table | 28px | 0 / 0 |
| 390 | Hidden | ✅ | Bottom sheet, 50vh | Cards | 24px | 0 / 0 |
| 360 | Hidden | ✅ | Bottom sheet, 50vh | Cards | 24px | 0 / 0 |
| 320 | Hidden | ✅ | Bottom sheet, 50vh | Cards | 24px | 0 / 0 |

Body text is 14px at every width. Every transition happens at the breakpoints in the design system (§3.7).

**Visual review** (screenshots inspected at 1440, 1024, 390 and 320px):
- The desktop layout is flat and consistent, with the docked tutor.
- At 1024px the tutor overlays the content and ends at the bottom of the screen.
- On phones the bottom sheet shows the Expand and Close buttons, the privacy line under the composer, and the floating launcher above the tab bar.
- Inter renders Uzbek Latin modifier letters (`oʻ`, `gʻ`) and Cyrillic correctly.

### 3.2 Long labels

| Test | Result |
|---|---|
| Uzbek copy (`?locale=uz`) at 1440–320px | ✅ No overflow. Banners, consequences, assistant strings and chips wrap cleanly |
| Russian stress test: a 37-character label injected into **every** nav item, tab, button and badge | ⚠ Overflows at 390px (110px) and 320px (109px). Nav items and tabs are fine: they truncate or scroll. The overflow comes from **buttons**, which don't wrap by design (`whitespace-nowrap`) |

The stress test is deliberately extreme. Real Uzbek labels in the system (for example "Keyingi qadamni ko'rsatish", 26 characters) fit at 320px. Whether buttons should wrap is a design decision, so it's reported in §7, not changed.

### 3.3 Existing public pages

| Page | 1440 | 768 | 390 | 320 |
|---|---|---|---|---|
| `/sign-in` | 0 | 0 | 0 | 0 |
| `/sign-up` | 0 | 0 | 0 | 0 |
| `/about` | 0 | 0 | 0 | 0 |
| `/faq` | 0 | 0 | 0 | 0 |

Pages that need the database (home, courses, lessons, My Learning, admin) can't render because the database is offline (audit §0), so they weren't visually reviewed. They use the same primitives, and the Card and Section override fix (§6.1) applies to them.

---

## 4. Assistant component review

All tested in the browser at 1440px, plus the phone checks at 390px.

| Area | Check | Result |
|---|---|---|
| Composer | Shift+Enter inserts a new line and doesn't send | ✅ |
| | Enter during IME composition (`isComposing`) doesn't send | ✅ |
| | Grows with content and stops at 160px | ✅ (40px → 160px) |
| | Enter sends, clears the input and shows the question | ✅ |
| | Send becomes **Stop** while generating; "ERA is thinking…" shows | ✅ |
| | Stop ends generation and restores Send | ✅ |
| | Input capped at 3,000 characters; counter visible near the limit ("0 characters left") | ✅ |
| | Send disabled when the input is empty | ✅ |
| | No attachment or voice controls by default (text-first) | ✅ |
| | Uses 16px text on phones (no iOS zoom) | ✅ after fix (§6.1 R4) |
| Announcements | Nothing announced while an answer is still generating | ✅ |
| | **Exactly one** announcement when an answer completes | ✅ |
| | Stopping is announced | ✅ |
| Context chips | An attached chip (04:32) has a labelled remove button and can be removed | ✅ |
| | The "Can see" chips in the header are read-only | ✅ |
| Answer blocks | Guided steps start with one step; "Show next step" reveals the next | ✅ |
| | Hints reveal one at a time | ✅ |
| | Formula has `role="math"`, a spoken label, and keyboard focus | ✅ |
| | Copy puts the code on the clipboard and shows "Copied" | ✅ (clipboard contents verified) |
| | Timestamp calls `onSeek` with the right second (4:32 → 272) | ✅ |
| | Lesson citation shows lesson and section | ✅ |
| Focus | 1440px: closing returns focus to the rail launcher | ✅ |
| | Opening moves focus into the composer | ✅ |
| | Escape inside the panel collapses it and returns focus | ✅ |
| | 390px: closing returns focus to the floating launcher | ✅ after fix (§6.1 R3) |
| | 390px: the full-height sheet traps focus | ❌ **Known gap**, not implemented (§7) |
| Layout | 390px: half-height bottom sheet anchored to the screen bottom | ✅ |
| | 390px: Expand gives a full-height (92vh) sheet | ✅ |
| | 390px: the launcher sits above the tab bar | ✅ |
| | 1024px: the overlay sits under the 56px top bar and ends at the viewport bottom | ✅ after fix (§6.1 R2) |

**Not tested, as instructed:** image, video and audio input or output. Those controls don't render.

**Note on "streaming":** the backend doesn't stream yet. The preview simulates generation (thinking state, Stop, completion) to test the UI states and announcements, not real token streaming.

---

## 5. Accessibility findings

### 5.1 Verified in the browser

| Check | Result |
|---|---|
| Dialog: opens from the keyboard, focus moves inside, initial focus is **Cancel** | ✅ after fix (§6.1 R5) |
| Dialog: Escape closes it and returns focus to the trigger | ✅ |
| ConfirmDialog impact level: Cancel focused; confirm disabled until counts load | ✅ |
| ConfirmDialog typed level: focus starts in the text field; confirm enabled only on an exact match | ✅ |
| DropdownMenu: Enter opens it with the first item focused; arrow keys move; Escape returns focus | ✅ |
| Tabs: arrow keys move to and activate the next tab | ✅ |
| Tooltip: opens on keyboard focus and is exposed as `role="tooltip"` | ✅ (see the scroll limitation in §7) |
| Sheet: titled dialog, focus inside, Escape returns focus | ✅ |
| Toast: one viewport and one notifications region; the action button renders | ✅ |
| First Tab reaches "Skip to content", which becomes visible | ✅ |
| Keyboard focus shows a visible ring | ✅ |
| One `h1` and one `main` landmark; active nav item has `aria-current="page"` | ✅ |
| Every progress bar is named; the data table has a caption | ✅ |
| No visible icon-only button without a label | ✅ |
| `prefers-reduced-motion` collapses transitions and animations | ✅ |
| 390px: form inputs and the composer use 16px text | ✅ after fix (§6.1 R4) |
| 390px: every interactive target is at least 24×24px (WCAG 2.5.8) | ✅ after fix (§6.1 R6) |

### 5.2 Contrast

Computed from the token values (unchanged since the design-system phase):

- Text pairs: **5.3:1 to 15.7:1**.
- Form-field borders: **3.4:1** (the WCAG 1.4.11 minimum is 3:1).
- `--warning` (2.7:1) is only used for fills and borders; warning text uses `--warning-foreground` (11.2:1).
- `--accent-strong` (4.5:1) is only used for icons and accents.

### 5.3 Security-aware UI boundaries

Checked in the rendered preview. These components **display** decisions; they don't enforce them. **They do not fix any backend finding in the audit**: lessons are still public (A-7.3), instructors can still read all users (A-7.1), and so on.

| Check | Result |
|---|---|
| `StudentIdentity` has no phone field; no phone numbers appear in the teacher roster | ✅ |
| Email isn't in the page until "Show email" is used, and appears only for the student whose caller passed one | ✅ |
| The Teacher Preview banner says: not enrolled, nothing saved, ERA Tutor off | ✅ |
| The Admin Inspection banner is separate and names the Teacher Workspace boundary | ✅ |
| Unpublish and archive copy keeps student history ("Nothing is deleted"; "progress, submissions and grades are kept"); no wording implies deletion | ✅ |

Hiding the email in the UI isn't protection. The server must not send it unless policy allows (design system §7, rule 2).

---

## 6. Regressions found and fixes made

### 6.1 Caused by the design-system work, now fixed

| # | Problem | Impact | Fix | Verified by |
|---|---|---|---|---|
| **R1** | `Card` parts had responsive default padding (`p-4 sm:p-6`, `pt-0 sm:pt-0`). **73** existing cards pass their own padding (for example `p-5`); `tailwind-merge` kept the `sm:` defaults, so from 640px those cards got 24px padding and **`CardContent` lost its top padding** | Visible on existing pages from tablet width up | Padding now comes from one variable-based class (`p-[var(--card-padding)]`), so a caller's `p-*` replaces it at every width. `Section` had the same pattern and now uses `--section-padding` | `tailwind-merge` output for every override pattern in use |
| **R2** | `top-header` produced no CSS: `header` was only in the height scale, but `top-*` uses the spacing scale | The overlay assistant at 768–1279px was **1,823px tall** (twice the viewport); docked panel and rail had no sticky offset | Added `header` to the spacing scale | Overlay now 380 × 844; generated-CSS check |
| **R3** | Focus return on closing the assistant used `offsetParent`, which is always `null` for `position: fixed`. The floating launcher never counted as visible | On phones and tablets, closing the assistant dropped focus to `<body>` | Visibility is checked with `getClientRects()` | Browser focus test at 390px |
| **R4** | The 16px mobile rule for form fields was a bare element rule, so `.form-control` and `text-sm` overrode it on specificity. Fields and the composer were 14px on phones (iOS zooms below 16px). The old code had the same problem at 15.2px, but the design system promised 16px | iOS zooms on focus | A media rule on `.form-control`; the composer uses `text-base md:text-sm` | Computed font size at 390px |
| **R5** | `ConfirmDialog` cancelled Radix's initial focus for destructive dialogs, leaving focus **outside** the open dialog | Keyboard and screen-reader users start behind the overlay | Removed the override; Radix focuses Cancel (or the text field in the typed level) | Dialog focus tests |
| **R6** | Six controls were under 24px tall: "Show email", the sheet handle, timestamp links, "Show another hint", Copy and the chip remove button | Failed WCAG 2.5.8 target size | `min-h-6` / `size-6` / `h-6` on those controls | Target-size test at 390px |

The `/design-system` preview gained two development-only test aids: `?locale=uz` and a simulated answer (generating, Stop, completion). It still returns 404 in production.

### 6.2 Pre-existing issues found during the review (not changed)

| Issue | Evidence | Why not changed |
|---|---|---|
| **59 opacity classes produce no CSS** (for example `bg-card/72`, `bg-background/88`) because the steps aren't in Tailwind's opacity scale | The original code had **65**; none are in design-system files | Fixing them changes the look of 13 existing pages; better done when those screens are rebuilt |
| `src/app/error.tsx` renders its own `<html>` and `<body>` inside the root layout, without the font class | The error screen shows in a serif font; nested `<html>` is invalid | Error-handling behaviour; outside this review's scope |
| The public navbar brand truncates to "E" at 390px | `navbar.tsx` was unchanged except its background token; the truncation is built into its layout | Pre-existing layout; the design-system changes give it slightly more room |
| Production builds sometimes fail while downloading Google Fonts | Seen once before the design system (with Poppins) and once in this review; both passed on retry with no code change | Network or build environment. Consider self-hosting the font files |
| `Section` caller overrides were already ignored at some breakpoints before the design system | The old default had `sm:` and `lg:` steps | Fixed as part of R1, since Section was touched anyway |
| Orphaned dev-server processes on ports 3000 and 3100 | A permission check blocked stopping them earlier | Environment only; harmless, but those servers serve stale builds |

---

## 7. Known limitations

| Limitation | Effect | Recommendation |
|---|---|---|
| **No focus trap in the full-height mobile assistant sheet** | At 92vh, Tab can move to the page behind the sheet | Make the sheet modal at full height (Radix Dialog with `modal` only for `full`), when the lesson workspace (S5) is built |
| No drag gesture for the mobile sheet | Height changes use buttons (handle, Expand, Close), so no function is lost | Add a gesture later as an enhancement; keep the buttons |
| Buttons don't wrap | Labels over about 30 characters overflow at 320px (Russian stress test) | **Product decision**: either keep `nowrap` and set a label-length rule for translations, or allow wrapping on phones (`whitespace-normal`, auto height). Not changed here |
| Tooltips close when keyboard focus scrolls the page | Radix closes tooltips on scroll, and smooth scrolling keeps firing scroll events | Acceptable, since tooltips are supplementary and icon buttons have labels. Revisit if `scroll-behavior: smooth` is reconsidered |
| `DataTable` renders both the table and the card list (CSS hides one) | Twice the DOM for large tables; the hidden copy isn't exposed to assistive tech | Fine for current sizes; switch to rendering one layout if tables grow large |
| Formulas show LaTeX source | Readable by screen readers (spoken label), but not typeset | Decide on a math renderer (for example KaTeX) as a separate dependency decision |
| No real streaming from the AI backend | UI states are verified with a simulation | Verify again when the backend streams |
| Pages needing the database weren't rendered | Database offline (audit §0) | Visual pass once the new database exists |
| No dark mode | Light theme only | Out of scope |
| Security-aware components don't protect anything by themselves | The backend findings (D1–D12) remain | Fix them in audit Phase 1 before real content goes live |

---

## 8. Ready for Prompt 04?

**Recommendation: READY WITH KNOWN LIMITATIONS.**

The tokens, primitives, shell, assistant kit and security-aware components work in a real browser across the required widths and languages. Keyboard and focus behaviour is correct, and the regressions found are fixed. The design system is a sound base for building the Teacher and Admin workspaces.

Carry these into Prompt 04:
1. Decide the long-label rule for buttons (§7) before translating workspace screens.
2. Add the full-height sheet focus trap when the lesson workspace is built.
3. Don't treat the workspace navigation as access control. The backend fixes from audit Phase 1 (D1–D12) are still outstanding.
4. Use the DataTable and Card patterns as verified. Pass custom padding freely; it now overrides correctly.

This review didn't start Prompt 04, and no workspace screens were built.
