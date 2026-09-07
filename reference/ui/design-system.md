# Recap Studio Design System

A design system for the contractor-facing recap capture application. This is a
utility tool used in the field, not a marketing surface. It must feel fast,
trustworthy, and unambiguous. The wedding-blog editorial voice (warm, narrative)
belongs to the published blog content, not to this app's UI chrome.

## 1. Principles

1. Clarity over decoration. Every screen has one primary action.
2. Flat, not flashy. No gradients, no faux-3D, no drop-shadow heavy chrome.
3. Status is always visible. Recording, processing, and delivery state are never ambiguous.
4. Neutral base, single accent. Color is used to communicate state and hierarchy, not mood.
5. Built for one hand, one thumb. Mobile is a first-class target, not a squeeze-down of desktop.

## 2. Color

### Neutral scale (UI structure, text, borders)

| Token | Hex | Usage |
|---|---|---|
| `--n-0` | `#ffffff` | Surfaces, cards |
| `--n-50` | `#f6f7f8` | App background |
| `--n-100` | `#eceef1` | Subtle fills, table stripes |
| `--n-200` | `#dde1e6` | Borders, dividers |
| `--n-300` | `#c3c9d1` | Disabled borders |
| `--n-400` | `#98a1ac` | Placeholder text, icons |
| `--n-500` | `#707986` | Secondary text |
| `--n-600` | `#4d5561` | Body text (secondary emphasis) |
| `--n-700` | `#343b45` | Body text (primary) |
| `--n-800` | `#20252b` | Headings |
| `--n-900` | `#12161a` | Max contrast text |

### Brand accent (single accent, used sparingly and intentionally)

| Token | Hex | Usage |
|---|---|---|
| `--a-50` | `#fbeee7` | Accent tint backgrounds |
| `--a-100` | `#f5d9c8` | Hover tint |
| `--a-400` | `#d97a45` | Active/hover accent |
| `--a-500` | `#c15a2e` | Primary accent (buttons, links, focus) |
| `--a-600` | `#9c4522` | Accent pressed state |

### Semantic colors

| Token | Hex | Meaning |
|---|---|---|
| `--success-500` | `#1e8e5a` | Sent, complete, healthy |
| `--success-100` | `#e2f5ea` | Success tint background |
| `--warning-500` | `#b1780f` | Needs attention, retry |
| `--warning-100` | `#faedd4` | Warning tint background |
| `--danger-500` | `#c53a2a` | Failure, blocking error |
| `--danger-100` | `#fbe2de` | Danger tint background |
| `--info-500` | `#2f5fd6` | Informational status |
| `--info-100` | `#e5ecfd` | Info tint background |

Rule: the accent color is reserved for the single primary action per screen and
for active/selected state. It is never used for large background fills.

## 3. Typography

Single typeface, hierarchy through size/weight, not multiple fonts.

`font-family: "Inter", "SF Pro Text", "Segoe UI", system-ui, sans-serif;`

| Token | Size / Line height | Weight | Usage |
|---|---|---|---|
| `--text-display` | 30px / 38px | 700 | Screen titles |
| `--text-h2` | 20px / 28px | 700 | Section headings |
| `--text-h3` | 16px / 24px | 600 | Card titles |
| `--text-body` | 15px / 22px | 400 | Body copy |
| `--text-label` | 13px / 18px | 600 | Form labels, buttons |
| `--text-caption` | 12px / 16px | 500 | Meta text, timestamps |
| `--text-overline` | 11px / 16px | 700, uppercase, 0.08em tracking | Kicker labels |

UI copy rules:
1. Plain, direct language: "Send recap", not "Initiate transmission".
2. No internal system vocabulary in contractor-facing copy (no "pipeline", "schema", "stage").
3. Always name the destination explicitly when relevant ("Sent to Michael").

## 4. Spacing & Layout

8px base grid.

`--space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;`
`--space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px;`

Layout rules:
1. Max content width 1080px on desktop, single column always on mobile.
2. One primary card per screen state. Avoid multi-panel dashboards for contractor flows.
3. Mobile primary action is anchored to the bottom of the viewport, not buried in a scroll.

## 5. Radius & Elevation

Flat-first. Borders define structure; shadow is reserved for temporary/overlay
surfaces only (toasts, menus), never for buttons or resting cards.

`--radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px; --radius-full: 999px;`

`--elevation-0: none;`
`--elevation-1: 0 1px 2px rgba(18, 22, 26, 0.06);` (cards, resting state)
`--elevation-2: 0 8px 24px rgba(18, 22, 26, 0.12);` (menus, toasts only)

## 6. Motion

`--motion-fast: 120ms ease;`
`--motion-base: 200ms ease;`

1. State transitions use `--motion-base`.
2. Hover/press feedback uses `--motion-fast`.
3. No bounce, no elastic easing, no skeuomorphic depth animation.

## 7. Components

### Buttons
- `btn-primary`: solid `--a-500` fill, white text, flat, no shadow.
- `btn-secondary`: white fill, `--n-200` border, `--n-700` text.
- `btn-ghost`: transparent, text-only, for tertiary actions.
- `btn-danger`: solid `--danger-500`, for destructive/blocking actions only.
- All buttons: `border-radius: var(--radius-full)` for primary actions, `var(--radius-md)` for utility actions in toolbars.
- Focus state is always visible: `outline: 2px solid var(--a-500); outline-offset: 2px;`. Never `outline: none` without a replacement.

### Record Control
- Flat filled circle, solid `--a-500`, no gradient, no drop shadow.
- State communicated by label + color, not depth: Ready (neutral outline), Recording (solid accent + pulsing ring), Processing (disabled state).

### Status Stepper
- Horizontal on desktop, vertical on mobile.
- States: `pending` (neutral), `active` (accent, animated), `done` (success check).

### Badges
- Pill shaped, tint background + solid text of the same hue family.
- Used for session status only: Sent, Processing, Needs Follow-up, Needs Retry.

### Cards
- White surface, `--n-200` border, `--radius-lg`, `--elevation-1` only.
- No nested card-in-card shadows.

### Forms
- Label above input, `--text-label`.
- Input: `--n-0` background, `--n-200` border, `--radius-md`, focus ring `--a-500`.

## 8. Accessibility

1. Minimum contrast 4.5:1 for body text, 3:1 for large text/icons.
2. All interactive elements have visible focus states.
3. Waveform/level indicators must have a text-equivalent status (Good, Fair, Poor), not color alone.
4. Status must never rely on color alone; use icon + label + color together.

## 9. What This Replaces

The previous UI direction reused the marketing site's warm/serif editorial
styling (parchment gradients, ornate radial buttons, script-adjacent serif
headings) directly in the operational tool. This system intentionally separates
"brand voice for published blog content" from "interface design for an internal
production tool." The blog can stay warm and narrative. The app should read as
fast, modern, and precise.
