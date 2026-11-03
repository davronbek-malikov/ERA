# ERA Design System

This document defines the shared visual language for ERA Academy. It exists to keep the product calm, readable, and consistent across marketing, learning, dashboard, and admin surfaces.

## Principles

- Content first
- Calm and trustworthy
- One clear primary action per area
- Reuse tokens and primitives before creating page-only styles
- Keep contrast, spacing, and hierarchy accessible on desktop and mobile

## Typography

Fonts are configured in [src/app/layout.tsx](../src/app/layout.tsx).

- Display font: `Poppins`
- Body font: `Inter`
- Display weights: `600`, `700`
- Body weights: `400`, `500`, `600`

Semantic text roles:

- Main heading:
  - Token: `--text-h1`
  - Class: `.page-title`
  - Use for the main page headline only
- Section heading:
  - Token: `--text-h2`
  - Class: `.section-title`
  - Use for section intros and major content blocks
- Subheading / card heading:
  - Token: `--text-h3`
  - Class: `.card-title`
  - Use for cards, panels, lesson groups, and sub-sections
- Body text:
  - Token: `--text-body`
  - Use for standard content and descriptions
- Small text / caption:
  - Token: `--text-small`
  - Class: `.text-caption`
  - Use for metadata, helper copy, and supportive labels

Shared text helpers live in [src/app/globals.css](../src/app/globals.css):

- `.page-title`
- `.section-title`
- `.card-title`
- `.page-lead`
- `.section-copy`
- `.eyebrow-label`
- `.metric-value`
- `.text-caption`

## Color System

Tokens are defined in [src/app/globals.css](../src/app/globals.css) and surfaced through [tailwind.config.ts](../tailwind.config.ts).

Core colors:

- Primary brand color:
  - Token: `--primary`
  - Use for main CTA, progress fills, active emphasis, and focus
- Accent color:
  - Token: `--accent`
  - Use sparingly for highlight chips, secondary emphasis, and warm contrast
- Neutral support color:
  - Token: `--secondary`
  - Use for quiet panels and supporting surfaces

Surface and text colors:

- Background: `--background`
- Card / surface: `--card`, `--surface`
- Muted surface: `--surface-muted`
- Elevated surface: `--surface-elevated`
- Primary text: `--foreground`
- Secondary / supporting text: `--muted-foreground`
- Border: `--border`

Status colors:

- Success: `--success`
- Warning: `--warning`
- Error: `--error`

Color rules:

- Use one main brand color and one accent color only
- Keep large surfaces light and readable
- Use muted text for support, not for primary content
- Reserve status colors for real status, not decoration

## Spacing System

ERA uses a repeatable 4px / 8px driven scale.

- `--space-1`: 4px
- `--space-2`: 8px
- `--space-3`: 12px
- `--space-4`: 16px
- `--space-5`: 20px
- `--space-6`: 24px
- `--space-8`: 32px
- `--space-10`: 40px
- `--space-12`: 48px
- `--space-14`: 56px
- `--space-18`: 72px

Usage rules:

- Section padding:
  - Mobile: 48px
  - Tablet: 64px
  - Desktop: 72px
- Card padding:
  - Standard: 24px
- Button height:
  - Small: 40px
  - Medium: 44px
  - Large: 48px
- Input height:
  - Standard: about 46px
- Heading to content gap:
  - Prefer 12px to 20px

## Radius and Shadows

Shared tokens:

- `--radius`: base component radius
- `--radius-lg`: larger card radius
- `--radius-xl`: hero / panel radius
- `--radius-pill`: fully rounded controls

Shared shadows:

- `--shadow-soft`
- `--shadow-panel`

Use softer shadows for content surfaces and reserve stronger panel shadows for hero cards and high-emphasis containers.

## Button System

Source: [src/components/ui/button.tsx](../src/components/ui/button.tsx)

Button sizes:

- Small:
  - Key: `sm`
  - Height: 40px
  - Compact actions, list items, utility controls
- Medium:
  - Key: `md` / default
  - Height: 44px
  - Standard CTAs, form actions
- Large:
  - Key: `lg`
  - Height: 48px
  - Hero CTAs, prominent conversion actions

Button variants:

- `default`
  - Main primary action
- `secondary`
  - Secondary filled action
- `outline`
  - Secondary bordered action
- `ghost`
  - Navigation and low-emphasis actions
- `danger`
  - Destructive actions only

Interaction requirements:

- Hover state on all variants
- Subtle active state with light press feedback
- Focus-visible ring for keyboard users
- Disabled opacity and pointer lock

## Input System

Sources:

- [src/components/ui/input.tsx](../src/components/ui/input.tsx)
- [src/components/ui/textarea.tsx](../src/components/ui/textarea.tsx)

Shared form styling is provided by `.form-control` in [src/app/globals.css](../src/app/globals.css).

Rules:

- Keep all inputs on the same radius family
- Use the same border, focus ring, and background treatment site-wide
- Prefer one shared select/input style over page-specific controls

## Shared Surfaces

Shared surface helpers in [src/app/globals.css](../src/app/globals.css):

- `.surface-card`
- `.surface-subtle`
- `.surface-panel`
- `.status-success`
- `.status-warning`
- `.status-error`

Use these utilities to reduce repeated one-off combinations of border, background, and shadow.

## Layout Primitives

Sources:

- [src/components/layout/container.tsx](../src/components/layout/container.tsx)
- [src/components/layout/section.tsx](../src/components/layout/section.tsx)

Layout rules:

- Max content width: 1160px
- Mobile side padding: 20px
- Tablet side padding: 24px
- Desktop side padding: 32px
- Default mobile-first single column
- Use 2-column layouts for heavier content
- Use 3-column grids only for small metrics or compact cards

## Site-Wide Application

The following areas now follow the shared system more closely:

- Public shell:
  - [src/components/layout/navbar.tsx](../src/components/layout/navbar.tsx)
  - [src/components/layout/footer.tsx](../src/components/layout/footer.tsx)
- Marketing:
  - [src/components/marketing/hero-section.tsx](../src/components/marketing/hero-section.tsx)
  - [src/components/marketing/section-heading.tsx](../src/components/marketing/section-heading.tsx)
  - [src/components/marketing/final-cta-section.tsx](../src/components/marketing/final-cta-section.tsx)
- Learning:
  - [src/components/courses/course-card.tsx](../src/components/courses/course-card.tsx)
  - [src/components/courses/course-filters.tsx](../src/components/courses/course-filters.tsx)
  - [src/components/courses/curriculum-list.tsx](../src/components/courses/curriculum-list.tsx)
  - [src/app/(public)/courses/page.tsx](../src/app/(public)/courses/page.tsx)
  - [src/app/(public)/courses/[courseSlug]/page.tsx](../src/app/(public)/courses/[courseSlug]/page.tsx)
  - [src/app/(public)/my-learning/page.tsx](../src/app/(public)/my-learning/page.tsx)
  - [src/app/(public)/sign-in/page.tsx](../src/app/(public)/sign-in/page.tsx)
- Admin foundation:
  - [src/components/admin/admin-page-header.tsx](../src/components/admin/admin-page-header.tsx)
  - [src/components/admin/stats-grid.tsx](../src/components/admin/stats-grid.tsx)

## Do / Don't

- Do keep hierarchy obvious
- Do keep cards and forms visually related
- Do reuse shared primitives before adding custom classes
- Do keep text widths controlled for readability
- Don't introduce new arbitrary heading sizes without strong reason
- Don't mix many unrelated radii on one screen
- Don't overuse gradients or saturated color blocks
- Don't style status colors as decoration
