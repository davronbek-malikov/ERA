# ERA Academy: Design System

**Version:** 1.1, 5 November 2026 (verified; see [`ERA_DESIGN_SYSTEM_VERIFICATION.md`](ERA_DESIGN_SYSTEM_VERIFICATION.md))
**Applies to:** the public site and the Student, Teacher and Admin workspaces.
**Read with:** [`ERA_INFORMATION_ARCHITECTURE.md`](ERA_INFORMATION_ARCHITECTURE.md) (screens, navigation, access rules) and [`ERA_PRODUCT_AUDIT.md`](ERA_PRODUCT_AUDIT.md) (risks).

This is the single design system for ERA. It replaces `docs/design-system.md`, which now points here.

---

## 1. Principles

1. **Calm and flat.** A white surface, a 1px border, and spacing do the work. No decorative gradients; shadows only for things that float (menus, dialogs, sheets, toasts).
2. **One primary action per area.** Medium buttons by default. Large buttons only for the one main call to action on a page.
3. **Few colours, used for meaning.** Deep blue for action and focus, teal for the assistant and gentle highlights, neutrals for everything else. Green, amber and red only for real status.
4. **Same language, different structure.** All three workspaces share tokens, components and the shell. They differ only in navigation and content (IA §4).
5. **Accessible by default.** WCAG 2.2 AA is a requirement, not a polish step (§8).
6. **Visibility isn't permission.** No component decides access. Components show what the server has already authorized (§7).

---

## 2. How it's implemented

| Layer | Where | Notes |
|---|---|---|
| Tokens | `src/app/globals.css` (`:root`) | CSS variables. The only place colours and sizes are defined |
| Tailwind mapping | `tailwind.config.ts` | Exposes tokens as classes: `bg-primary`, `text-muted-foreground`, `rounded-xl`, `w-sidebar`, `z-overlay`, `text-page` |
| Primitives | `src/components/ui/*` | Built with `class-variance-authority` and `cn()` (`src/lib/utils.ts`), the patterns already in the project |
| Behaviour | Radix primitives | The project already used `@radix-ui/react-dialog`. This phase added `react-dropdown-menu`, `react-tabs`, `react-tooltip` and `react-toast` from the **same family** for accessible menus, tabs, tooltips and toasts. This isn't a second component library: Radix provides behaviour only, and all styling comes from ERA tokens |
| Layout | `src/components/layout/*` | `AppShell`, `WorkspacePage`, `PageHeader`, `Container`, `Section` |
| Domain components | `src/components/education/*`, `src/components/assistant/*` | Security-aware learning components and the AI assistant kit |
| Preview | `/design-system` (development only) | Renders every component with sample data. Returns 404 in production |

**Rule:** don't write hex values, `rgba()`, palette classes (`bg-blue-500`) or arbitrary sizes (`rounded-[1.4rem]`) in components. Use a token, or add one here first.

---

## 3. Design tokens

### 3.1 Colour

Values are HSL in `globals.css`. Contrast is measured against white (`--surface`) and the page background.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--primary` | `#1F4CAD` | Primary buttons, links, active navigation, focus ring, progress | 7.8:1 on white; white text on it 7.8:1 |
| `--primary-foreground` | `#FFFFFF` | Text on primary | |
| `--accent-strong` | `#1F847A` | Teal: assistant icon, example rule, highlights. **Icons and accents only, not small text** | 4.5:1 |
| `--accent` | `#E9F6F4` | Teal tint background (preview banner, accent badge) | |
| `--accent-foreground` | `#115F59` | Text on the teal tint | 6.8:1 on `--accent` |
| `--background` | `#F9FAFB` | Page background | |
| `--surface`, `--card` | `#FFFFFF` | Cards, panels, inputs | |
| `--muted`, `--surface-muted` | `#F3F4F6` | Quiet areas, skeletons, table header | |
| `--secondary` | `#EDEFF2` | Secondary button, neutral badge, user message | |
| `--foreground` | `#1E232F` | Body text (charcoal) | 15.7:1 |
| `--secondary-foreground` | `#2E3442` | Text on secondary | 12.5:1 |
| `--muted-foreground` | `#5D636F` | Supporting text, labels, captions | 6.0:1 on white, 5.5:1 on muted |
| `--border` | `#E2E4E9` | Card, table and section dividers (decorative) | |
| `--input` | `#848B9A` | Form-field and outline-button borders | **3.4:1** (WCAG 1.4.11 needs 3:1) |
| `--ring` | = primary | Focus ring | |
| `--success` | `#1F7A50` | Success text, icons, fills | 5.3:1 |
| `--warning` | `#E18B09` | Warning **fills and borders only** | 2.7:1, so never text |
| `--warning-foreground` | `#5C300A` | Warning text | 11.2:1 |
| `--error` | `#C32222` | Error text, destructive buttons, invalid fields | 5.9:1; white on it 5.9:1 |
| `--info` | = primary | Informational status | |

**Status tints** use the semantic colour at low opacity: `bg-error/5` with `border-error/20` and `text-error`. The same pattern applies to `success` and `warning` (with `text-warning-foreground`).

### 3.2 Typography

**Font:** Inter, loaded with `next/font` in the `latin`, `latin-ext`, `cyrillic` and `cyrillic-ext` subsets, weights 400/500/600. One family for headings and body. It covers English, Uzbek Latin (including `oʻ`, `gʻ` and the modifier letters) and Cyrillic (Uzbek Cyrillic and Russian).

Poppins was removed: it has no Cyrillic glyphs. `--font-display` is now an alias of the body font, so existing `font-display` classes keep working.

| Role | Class / Tailwind | Desktop (≥768px) | Mobile | Weight | Use |
|---|---|---:|---:|---|---|
| Display | `.display-title` / `text-display` | 40px | 30px | 600 | **Public homepage hero only** (the one exception) |
| Page heading | `.page-title` / `text-page` / `h1` | **28px** | **24px** | 600 | One per page |
| Section heading | `.section-title` / `text-section` / `h2` | **20px** | **18px** | 600 | Sections, dialog and sheet titles |
| Card title | `.card-title` / `text-title` / `h3` | 16px | 16px | 600 | Cards, panels, groups |
| Body | `body` / `text-body` / `text-sm` | **14px** | **14px** | 400 | All running text; line height 1.6 |
| Small | `.text-caption` / `text-small` / `text-xs` | 12px | 12px | 400–500 | Metadata, hints, badges, table headers |

- Weights: **400** regular, **500** medium (labels, buttons, navigation), **600** semibold (headings). No 700.
- Headings use letter-spacing −0.01em; body text uses normal spacing.
- Paragraphs are limited to 70 characters wide; `page-lead` and `section-copy` to 42rem.
- Form fields use **16px text on phones** (below 768px), so iOS doesn't zoom when a field is focused.
- Uzbek runs about 20–35% longer than English. Buttons and tabs must not have fixed widths.

### 3.3 Spacing

A 4px base. Use Tailwind's scale (`1` = 4px) limited to these steps:

| Step | px | Tailwind | Typical use |
|---|---:|---|---|
| 1 | 4 | `1` | Icon-to-text in chips |
| 2 | 8 | `2` | Gap inside button groups, between form label and field (6px `1.5` allowed) |
| 3 | 12 | `3` | Card list gaps, compact padding |
| 4 | 16 | `4` | Card padding on phones, form field gaps, page padding on phones |
| 6 | 24 | `6` | Card padding from tablet up, page header spacing, dialog padding |
| 8 | 32 | `8` | Section gaps, page padding on desktop |
| 12 | 48 | `12` | Large section rhythm on public pages |

| Area | Rule |
|---|---|
| Page padding | 16px phones · 24px tablet · 32px desktop (`px-4 md:px-6 lg:px-8`) |
| Workspace page | `py-6 lg:py-8`, inside `WorkspacePage` |
| Public section rhythm | 32px phones, 48px from tablet: `--section-padding` (`Section`). A caller's own `py-*`/`pt-*`/`pb-*` always wins |
| Sidebar | 12px horizontal padding; nav items 36px tall with 4px gaps; 24px between groups |
| Cards | 16px padding on phones, 24px from `sm`: `--card-padding`. A caller's own `p-*` always wins |
| Forms | 16px between fields; 6px label to field; hint and error 6px below |
| Dialogs | 24px padding, 16px between blocks |
| Page header | 24px below the header block |

### 3.4 Radius

| Token | Value | Tailwind | Use |
|---|---:|---|---|
| `--radius` | 8px | `rounded-lg` | Buttons, inputs, selects, small tiles, menu items (`rounded-md` 6px) |
| `--radius-lg` | 12px | `rounded-xl` | Cards, tables, alerts, dropdown panels |
| `--radius-xl` | 16px | `rounded-2xl` | Dialogs, bottom sheets |
| `--radius-pill` | full | `rounded-full` | Badges, avatars, progress bars only |

Don't nest the same radius more than twice. Inner elements use a smaller radius than their container.

### 3.5 Elevation

| Token | Value | Use |
|---|---|---|
| none | — | Default for cards, tables, panels (border only) |
| `shadow-soft` | `0 1px 2px rgba(16,24,40,.05)` | Optional lift for a single raised element |
| `shadow-panel` | `0 8px 24px rgba(16,24,40,.08)` | Floating layers: dropdowns, dialogs, sheets, toasts, the assistant overlay |

### 3.6 Layout tokens

| Token | Value | Tailwind |
|---|---:|---|
| `--header-height` | 56px | `h-header`, `top-header` (in the spacing scale, so every spacing utility exists) |
| `--card-padding` | 16px → 24px from 640px | used by `Card` parts |
| `--section-padding` | 32px → 48px from 768px | used by `Section` |
| `--sidebar-width` | 240px | `w-sidebar` |
| `--sidebar-rail` | 64px | `w-sidebar-rail` |
| `--assistant-width` | 380px | `w-assistant` |
| `--assistant-rail` | 56px | `w-assistant-rail` |
| `--content-max` | 1200px | `max-w-content` (default page width; also the `container` max) |
| `--content-narrow` | 720px | `max-w-narrow` (forms, reading, settings) |

### 3.7 Breakpoints

Tailwind defaults, as in IA §4.1:

| Name | Min width | Shell behaviour |
|---|---:|---|
| Phone | 0 | Top bar, bottom tab bar (Student, Teacher) or drawer menu (Admin); assistant as a bottom sheet |
| `md` tablet | 768px | Sidebar as a 64px icon rail; assistant overlays from the right |
| `lg` desktop | 1024px | Full 240px sidebar (collapsible to the rail) |
| `xl` wide | 1280px | Assistant docks beside the content and collapses to a 56px rail |

### 3.8 Layers and motion

| Layer | z-index | Tailwind |
|---|---:|---|
| Top bar, sidebar, mobile tab bar | 30 | `z-header`, `z-sidebar` |
| Assistant panel and launcher | 40 | `z-assistant` |
| Overlays: dialog, sheet, dropdown | 50 | `z-overlay` |
| Toasts, tooltips | 60 | `z-toast` |

Motion: `duration-fast` (120ms) for hover and colour, `duration-base` (200ms) for panels and sheets, easing `--ease-standard`. When `prefers-reduced-motion` is set, all animation and transition durations collapse to near zero (in `globals.css`).

---

## 4. Components

Every component uses the tokens above. "Existing" means it was already in the project and has been restyled with its public API kept. "New" means added in this phase.

### 4.1 Actions

**Button** (`ui/button.tsx`, existing; restyled, `loading` added)

| Size | Height | Padding | Font | Use |
|---|---:|---:|---:|---|
| `sm` | 32px | 12px | 12px | Table rows, toolbars, inline actions |
| `md` (default) | 40px | 16px | 14px | Almost everything |
| `lg` | 48px | 20px | 14px | The single main call to action on a page or a mobile primary action |
| `icon-sm` / `icon` / `icon-lg` | 32 / 40 / 48px square | — | — | Icon-only buttons (must have `aria-label`) |

| Variant | Look | Use |
|---|---|---|
| `primary` (default; alias `default`) | Blue fill, white text | One per area |
| `secondary` | Grey fill | Secondary filled action |
| `outline` | White, `--input` border | Secondary action next to a primary |
| `ghost` | Text only, grey hover | Toolbars, navigation, low emphasis |
| `destructive` (alias `danger`) | Red fill | Delete and other irreversible actions, inside a confirmation |

- **States:** hover darkens the fill by 10% (or fills with `muted` for outline and ghost); focus shows a 2px `ring` with a 2px offset; disabled is 50% opacity with no pointer events; `loading` shows a spinner before the label, disables the button and sets `aria-busy`.
- **Icons:** 16px, 8px gap, always before the label. Links styled as buttons use `buttonVariants()`.
- **Radius:** 8px for every button.

**DropdownMenu** (`ui/dropdown-menu.tsx`, new, Radix): row menus (⋯), account menu. Items are 36px tall. `destructive` items are red and are placed last, after a separator. Keyboard: arrow keys, Enter, Esc, type-ahead.

### 4.2 Forms

| Component | File | Spec |
|---|---|---|
| **Input** | `ui/input.tsx` (existing) | 40px tall, 8px radius, 12px horizontal padding, `--input` border; 16px text below 768px (set on `.form-control`, so it wins over utilities). Hover darkens the border; focus uses the primary border plus a 3px ring at 18% opacity. `aria-invalid="true"` turns the border red. Disabled uses a muted background |
| **Textarea** | `ui/textarea.tsx` (existing) | Same styling, at least 128px tall |
| **Select** | `ui/select.tsx` (new) | **Native** `<select>` styled as an input with a chevron. Native keeps the phone picker and full keyboard support. Use DropdownMenu for actions, not for form values |
| **Field** + **Label** | `ui/field.tsx` (new) | Label above (14px medium), a required asterisk, a hint (12px muted) and an error (12px red) below. Use `fieldDescribedBy(id, …)` for the control's `aria-describedby` and set `aria-invalid` when there's an error |

Rules: validate on blur and on submit; move focus to the first error; long editors autosave (IA §9.5).

### 4.3 Containers

| Component | File | Spec |
|---|---|---|
| **Card** | `ui/card.tsx` (existing) | 12px radius, 1px border, white, **no shadow**. Header and content padding come from `--card-padding` (16px on phones, 24px from `sm`). Padding is a single variable-based class, so a caller's `p-*` replaces it completely at every width. `CardTitle` uses `.card-title` |
| **Dialog** | `ui/dialog.tsx` (existing) | Up to 512px wide, 16px radius, 24px padding, `shadow-panel`, a 40% charcoal overlay, a section-heading title. The close button has a visible focus ring. For decisions only |
| **ConfirmDialog** | `ui/confirm-dialog.tsx` (new) | The three levels from IA §2.6 and §9.9. **Standard:** question plus consequence plus a named action. **Impact:** pass `impact` (or `null` while loading); confirm stays disabled until the counts load. **Typed:** pass `confirmPhrase`; confirm is enabled only on an exact match. Destructive dialogs never focus the confirm button by default. Works with `onConfirm` or a server action (`formAction` plus hidden `fields`) |
| **Sheet** (drawer) | `ui/sheet.tsx` (new, Radix Dialog) | `right`: 480px quick view or edit. `left`: mobile navigation. `bottom`: mobile filters and menus (16px top radius, safe-area padding). Title required (it can be visually hidden) |
| **Tabs** | `ui/tabs.tsx` (new, Radix) | Underline tabs, 40px tall, scroll horizontally on narrow screens; the active tab has a 2px primary underline. Keyboard: arrow keys |
| **Tooltip** | `ui/tooltip.tsx` (new, Radix) | Dark, 12px, 300ms delay; opens on hover and keyboard focus. **Supplementary only**: never the only place for information, since touch screens can't hover. Radix closes it on scroll, so it may not appear when keyboard focus scrolls the page to reach the trigger |

### 4.4 Data display

| Component | File | Spec |
|---|---|---|
| **Table** parts | `ui/table.tsx` (new) | A bordered 12px container; header row on `muted` at 12px medium; rows 1px divided with a hover tint; cells 16px horizontal and 12px vertical padding; `scope="col"` headers |
| **DataTable** | `ui/table.tsx` (new) | A real `<table>` from `md` up; **stacked cards on phones**. Mark one column `mobile: "title"`, others `detail` or `hidden` (3–4 fields per card). Requires a `caption` (screen readers). The empty state replaces the rows while the header stays. Optional `rowActions` |
| **Badge** | `ui/badge.tsx` (existing; new variants) | Pill, 12px medium. Variants: `neutral` (default), `primary`, `accent`, `success`, `warning`, `error`, `outline`. Old names `default` and `secondary` still work. Now a `<span>` (was a `<div>`), so it can sit inline in text |
| **Progress** | `ui/feedback.tsx` (new) | 6px pill bar with `role="progressbar"` and an accessible label. Always show the number next to it |
| **Kbd** | `ui/feedback.tsx` (new) | Keyboard shortcut hint |

### 4.5 Feedback

| Component | File | Spec |
|---|---|---|
| **Toast** | `ui/toast.tsx` (new, Radix) | Call `toast({ title, description?, variant?, action? })` from any client component. One `<Toaster />` is mounted in the root layout. Bottom-right on desktop, top on phones; 5 seconds; one optional action (for example Undo); errors are announced assertively, others politely |
| **Alert** | `ui/feedback.tsx` (new) | Inline banner: `info`, `success`, `warning`, `error`. Icon plus title plus text plus an optional action. `role="alert"` for errors, `role="status"` otherwise |
| **Skeleton** | `ui/feedback.tsx` (new) | `bg-muted` with a pulse. Match the final layout's shape so nothing shifts |
| **Spinner** | `ui/spinner.tsx` (new) | Inside buttons and inline statuses only. Never a full-page spinner |
| **EmptyState** | `shared/empty-state.tsx` (existing; restyled) | Dashed border, optional icon, title, one sentence, at most one action. The existing `actionLabel` and `actionHref` props still work; a new `action` slot takes a custom element |
| **AccessDenied** | `shared/access-denied.tsx` (new) | The 403 state with one useful next step. It only displays a decision the server already made |
| **PageLoading** | `shared/page-loading.tsx` (existing; restyled) | Skeleton for the route `loading.tsx` files |

### 4.6 Layout and navigation

| Component | File | Spec |
|---|---|---|
| **AppShell** | `layout/app-shell.tsx` (new) | One shell for all workspaces. **Sidebar:** 240px from `lg`, 64px icon rail at `md`, collapsible on desktop (tooltips on rail items). **Top bar:** 56px, sticky, holds the page actions (search, notifications, assistant toggle, account menu). **Phones:** a bottom tab bar (≤5 items, icon plus label, 56px tall) or, when `mobileTabs` is omitted (Admin), a left drawer. Includes a "Skip to content" link and `main#main-content`. `assistant` slot for the docked assistant |
| **SidebarNav** | inside AppShell | Items 36px; active item `bg-primary/10 text-primary` with `aria-current="page"`; optional count badge; groups with 12px labels |
| **WorkspacePage** | `layout/app-shell.tsx` (new) | Page padding and width: `default` 1200px, `narrow` 720px, `full` |
| **PageHeader** | `layout/page-header.tsx` (new) | Breadcrumbs (from tablet up), optional eyebrow, page title (one `h1`), description, and actions on the right (they stack under the title on phones). `AdminPageHeader` now renders it |
| **Container** / **Section** | `layout/*` (existing) | Container widths `default` (1200px) or `narrow` (720px) with the page-padding rule; Section uses the public rhythm |

**Navigation rule:** pass only the items the server's policy allows (IA §2.1). The shell renders what it's given; it is **not** an access check.

---

## 5. Educational AI components

The kit is `src/components/assistant/*`. One panel and composer serve the **ERA Tutor** (students), **ERA Assistant** (teachers) and **Admin Assistant**. No backend behaviour was changed. The existing lesson chat (`components/era/lesson-chat.tsx`) keeps working and can move to this kit when S5 is rebuilt.

### 5.1 Panel and composer

| Component | Spec |
|---|---|
| **AssistantPanel** | `kind` sets the name and the privacy line. **Wide (≥1280px):** docked, 380px, in AppShell's `assistant` slot; collapses to a 56px rail. **768–1279px:** right overlay under the top bar; collapses to a floating "Ask ERA" button. **Phones:** a bottom sheet with **peek** (input only), **half** (50vh, below a sticky video) and **full** (92vh) heights. The handle and the header have real buttons for changing height, so no gesture is required. The header shows the name, the **"Can see"** context chips, New conversation, History and Collapse. Esc collapses. Focus moves to the composer on open and returns to the launcher on close. `announcement` feeds one polite live region **once per finished answer**, not per streamed token |
| **AssistantComposer** | Auto-growing textarea (up to about 6 lines); Enter sends, Shift+Enter adds a line; IME-safe. Removable **context chips** (timestamp, selection, formula). A counter appears in the last 200 characters (limit 3,000). Send becomes **Stop** while generating. `footnote` holds the privacy line |
| **ContextChip** | 24px chip with an icon and a label; removable chips have a labelled × button. Chips describe context the **server** authorized; they never grant it |
| **AssistantMessage** | User messages: right-aligned grey bubbles, at most 85% wide. Assistant answers: full width with no bubble, under a small "✦ ERA Tutor" label, so structured blocks have room |
| **AssistantStatus** | `thinking`, `rate-limited` (seconds from the server), `quota-reached` (reset time from the server), `offline`, `error` (with Retry), `not-permitted`, `unavailable` |

### 5.2 Response blocks

`AssistantParts` renders an answer made of typed parts (`types.ts`). Each part has its own component:

| Part / component | Purpose | Learning rule |
|---|---|---|
| `concept` / **ConceptExplanation** | Name, one-paragraph summary, optional bullet details | Start from understanding |
| `steps` / **GuidedSteps** | Numbered solution steps | **Reveals one step at a time** with "Try the next step yourself before revealing it". "Show all steps" is available but secondary |
| `hint` / **HintCard** | Progressive hints | One hint at a time; "Show another hint" |
| `example` / **ExampleBlock** | Worked example, with a teal left rule | |
| `formula` / **FormulaBlock** | A formula with a **spoken form** (`role="math"`, `aria-label`) | Today it shows the LaTeX source in a monospace block. A renderer can replace the inner element later without changing callers (§10) |
| `code` / **CodeBlock** | Language label, Copy button (announces "Copied"), horizontally scrollable and keyboard-focusable | |
| `citation` / **LessonCitation** | "From the lesson: Lesson 3 · Key points" chip, optionally a link | Grounds answers in the course |
| `timestamp` / **TimestampLink** | "▶ 4:32" button that seeks the video through `onSeek`; plain text when there's no player | |
| `feedback` / **AttemptFeedback** | Feedback on **the student's own attempt**: what went well, what to revisit, what to try next | Never a replacement answer |
| — / **LearningGuardrailNotice** | Shown in the tutor during homework | "ERA can explain ideas, give hints and check your thinking. It won't write graded homework answers for you." (OD-8) |

The components shape how answers are presented. **Stopping the tutor from writing graded answers is the AI backend's job** (prompting and policy), which is out of scope here.

### 5.3 Multimodal readiness (not implemented)

ERA is **text-first**. The kit is ready to extend without changing callers:

- `AttachmentKind = "image" | "video" | "audio"` is reserved. The composer shows **no** attachment controls by default. Passing `enabledAttachments={["image"]}` shows that button, which only calls `onAttachRequest(kind)`. There's no upload, storage or processing in this phase.
- Voice input: a microphone button appears **only** when `onVoiceRequest` is passed.
- Attached items display as chips through the `attachments` prop.
- New **output** kinds (for example audio or images) are added as members of the `AssistantPart` union with a matching case in `AssistantParts`. The `never` check makes TypeScript flag any renderer that doesn't handle a new kind.

---

## 6. Security-aware components

These encode the IA's access rules in the UI. They **display** decisions; the server **makes** them (IA §2.1).

| Component | File | Rule it encodes |
|---|---|---|
| **StudentIdentity** | `education/student-identity.tsx` | A teacher-facing student shows **name** (with initials). `TeacherVisibleStudent` has **no phone field**: phone numbers are never shown to teachers. Email is **hidden by default** behind "Show email", and only renders if the caller passes it. Callers must pass `email` only when the server policy allows it (OD-3); hiding it in the UI isn't protection |
| **CourseProgressCell** | same file | Course-specific progress (percent, lessons done/total, progress bar). It's always scoped to one course, matching "teachers see a student only through their own course" (IA §2.5) |
| **LessonModeBanner** | `education/lesson-mode-banner.tsx` | Three distinct modes. **Student Lesson Mode** shows no banner. **Teacher Preview** shows a teal banner: "You aren't enrolled, nothing you do here is saved, and ERA Tutor is turned off". So preview never implies enrollment and never turns on the Student Tutor. **Admin inspection** shows an amber banner stating it's outside the Teacher Workspace and that changes affect the live course. The mode comes from the server |
| **CourseStatusBadge** | `education/course-status.tsx` | Draft, Published, Archived (the schema's `PublicationStatus`) |
| **CourseStatusConsequences** | same file | Separate copy for **publish**, **unpublish**, **archive** and **restore**. Unpublishing hides the course from the catalog and stops new enrollment, while enrolled students keep access (provisional OD-4) and nothing is deleted. Archiving removes the course from lists and lesson access, but **progress, submissions and grades are kept and stay visible**. Neither deletes student records |
| **ConfirmDialog** | `ui/confirm-dialog.tsx` | Impact and typed confirmation for destructive actions (IA §2.6). A UX safeguard only; the server still authorizes |
| **AccessDenied** | `shared/access-denied.tsx` | A 403 page. Use `notFound()` instead when the user mustn't learn that the record exists |

Assistant privacy lines (`privacyNote(kind)`): Student "Only you can see this conversation. Your teacher can't." · Teacher "ERA Assistant uses only your own courses." · Admin "Aggregate data only. No private conversations."

---

## 7. Security rules for UI work

1. **Frontend visibility is never authorization.** Hiding a link, button, column or field doesn't protect it. Every page, action and API checks on the server (IA §2.1, §2.8).
2. **Don't fetch what can't be shown.** If a teacher may not see an email, the query mustn't select it. `StudentIdentity` hides email by default, but that's a courtesy, not a control.
3. **Teacher Preview is not Student Lesson Mode.** Preview doesn't create an enrollment, doesn't save progress, and doesn't mount the Student ERA Tutor. Use `LessonModeBanner mode="teacher-preview"`.
4. **Admin inspection stays in the Admin Workspace.** Admins reviewing another teacher's course do it from `/admin` with `LessonModeBanner mode="admin-inspection"`, never by entering the Teacher Workspace (IA D12).
5. **Archiving keeps history.** Never design archive or unpublish flows that silently delete progress, submissions or grades.
6. **No private-data views.** No "View chats" item for teachers or admins (IA §2.4).

---

## 8. Accessibility requirements

WCAG 2.2 AA. What the system already provides, and what screens must still do:

| Area | Built into the system | Screens must |
|---|---|---|
| Contrast | Text tokens 5.3–15.7:1; form-field borders 3.4:1; warning text uses the dark token | Never put `--warning` or `--accent-strong` on small text |
| Focus | A visible 2px ring on every interactive primitive; Radix manages focus in dialogs, sheets, menus and tabs; the assistant returns focus to its launcher | Not remove outlines; keep a logical tab order |
| Keyboard | Menus, tabs, dialogs and sheets fully keyboard operable; Esc closes; the composer uses Enter / Shift+Enter; the sheet height has buttons, not only a drag gesture | Give every icon-only button an `aria-label` |
| Screen readers | Skip link; `aria-current` in navigation; `role="progressbar"` with labels; table captions; `role="math"` with spoken formulas; live regions for toasts, statuses and one-per-answer assistant announcements; spinners hidden from screen readers | Use one `h1` per page (PageHeader); label every field (Field) |
| Targets | Every interactive element at least 24×24px (WCAG 2.5.8), including text buttons, chips and timestamps; buttons at least 32px; mobile tab items 56px; menu items 36px | Use `md` (40px) or `lg` for primary mobile actions |
| Motion | `prefers-reduced-motion` disables animation and transitions | Not start video or animations automatically |
| Text | Relative sizes; 16px inputs on phones; no fixed-width text containers | Support Uzbek length; allow browser zoom to 200% |
| Forms | `aria-invalid` styling; hint and error ids through `fieldDescribedBy` | Move focus to the first error after submit |

**Not yet covered (see §10):** focus trapping when the mobile assistant sheet is at full height; drag gestures for the sheet; math rendering beyond LaTeX source with spoken text; tooltips closing when keyboard focus scrolls the page; buttons don't wrap, so very long labels (about 30+ characters) overflow at 320px.

---

## 9. Responsive decisions

- **Mobile first.** Every component works at 320px wide.
- **Tables become cards** below 768px (`DataTable`).
- **Navigation:** bottom tab bar for Student and Teacher on phones; a drawer for Admin (desktop-first; IA §5.4).
- **Sidebar:** icon rail on tablets, full on desktop, collapsible.
- **Assistant:** bottom sheet on phones, overlay on tablet and desktop, docked on wide screens (§5.1).
- **Page headers:** actions wrap under the title on phones; breadcrumbs only from tablet up.
- **Toasts:** top on phones (clear of the tab bar and the sheet), bottom-right on desktop.
- **Safe areas:** the tab bar and bottom sheets respect `env(safe-area-inset-bottom)`.

---

## 10. Implementation notes and remaining work

### What changed in the existing app

| Change | Scope |
|---|---|
| Tokens redefined (colour, type, radius, shadow) | Every page, automatically, through existing classes (`page-title`, `card-title`, `form-control`, `surface-*`, `status-*`, Tailwind colour names) |
| Font: Poppins + Inter → Inter only, with Cyrillic | Root layout |
| Accent changed from warm amber to teal | Existing `bg-accent` badges and highlights |
| Decorative body glow and the root-layout radial gradient removed | Root layout, `globals.css` |
| 80 hard-coded radii replaced with `rounded-lg` or `rounded-xl` | 20 files |
| 35 inline gradients replaced with flat tokens (`bg-card`, `bg-muted`, `bg-primary`, `bg-warning`, `bg-success/10`), plus one Tailwind gradient in the FAQ | 20 files |
| 431 palette colour classes replaced with semantic tokens (rose → error, emerald → success, amber → warning, `bg-white` → `bg-card`) | 44 files |
| Homepage hero uses `display-title` | `hero-section.tsx` |
| Toaster mounted globally | Root layout |

### Deliberately left as they are
- `text-white`, `border-white/…` and `slate-*` classes on dark panels and video backgrounds (about 77 uses). They're correct on dark surfaces; migrate them when those screens are rebuilt.
- Image overlays (`linear-gradient` over course thumbnails), which keep text readable on photos, and the generated social-share image.
- Uppercase, letter-spaced eyebrow text that's written inline on some pages (`text-xs uppercase tracking-[0.16em]`). It isn't part of the system; replace it with `.eyebrow-label` when those pages are redesigned.
- The current lesson chat, admin forms and public page layouts. They're restyled through tokens but **not restructured**: rebuilding the 42 IA screens is a later phase.

### Remaining issues and dependencies
1. **Visual review needed.** Builds and page renders were verified automatically. The look on real devices (especially the denser 14px body text and the teal accent on existing marketing pages) needs a human design review.
2. **Math rendering.** `FormulaBlock` shows LaTeX source plus a spoken form. Typeset math needs a renderer (for example KaTeX), which is a new dependency and should be a separate decision.
3. **Mobile sheet focus trap and drag gestures.** Not implemented. The sheet is non-modal at peek and half height (so the video stays usable), and buttons cover every height change.
4. **Existing lesson chat** (`era/lesson-chat.tsx`) and the ERA Guide bot still use their own markup. Move them to the assistant kit when screen S5 is built.
5. **Dark mode** isn't defined (`darkMode: "class"` is configured, but there are no dark tokens).
6. **Provisional product decisions** this system reflects:
   - **Bunny Stream** is the preferred video-hosting candidate, not a commitment. No component depends on a provider.
   - **AI quotas** are configurable pilot defaults (OD-12). `AssistantStatus` takes the limits and reset times from the server.
   - **Unpublish versus archive** consequences follow OD-4, which is still provisional.
7. **Backend dependencies** from the IA remain (D1–D12, S-codes). The security-aware components are ready, but they protect nothing until those fixes land.

### Adding a component
1. Check `src/components/ui` and this document first.
2. Use tokens only. If something is missing, add a token in `globals.css`, map it in `tailwind.config.ts`, and document it here.
3. Build behaviour on Radix where an accessible primitive exists; don't add another UI library.
4. Provide English and Uzbek strings (a `copy` object keyed by `Locale`, as the education and assistant components do).
5. Add it to the `/design-system` preview.
