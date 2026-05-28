# Design System: ResuScore
**Stitch Project ID:** 17197979516716226787

## 1. Visual Theme & Atmosphere
A **clean, confident, and intelligent** aesthetic. The design radiates professionalism without feeling corporate — it's approachable yet data-driven. Generous whitespace breathes life into dense job-matching data. The overall mood is "trusted AI assistant" — not flashy, not cold, but warm and precise.

## 2. Color Palette & Roles

| Role | Name | Hex | Usage |
|------|------|-----|-------|
| **Primary** | Signal Blue | `#135bec` | CTA buttons, active links, score indicators, primary actions |
| **Primary Hover** | Deep Signal Blue | `#0f4cc7` | Button hover states, pressed states |
| **Background** | Cloud White | `#f8fafc` | Page backgrounds, main canvas |
| **Surface** | Pure White | `#ffffff` | Cards, modals, elevated surfaces |
| **Surface Alt** | Whisper Gray | `#f1f5f9` | Secondary backgrounds, input fields, sidebar |
| **Text Primary** | Ink Black | `#0f172a` | Headlines (H1, H2), primary body text |
| **Text Secondary** | Slate Gray | `#64748b` | Descriptions, secondary labels, timestamps |
| **Text Tertiary** | Soft Slate | `#94a3b8` | Placeholders, disabled text, metadata |
| **Border** | Frost Line | `#e2e8f0` | Card borders, dividers, input strokes |
| **Success** | Emerald Signal | `#10b981` | High match scores (80+), success states |
| **Warning** | Amber Signal | `#f59e0b` | Medium scores (60-79), caution states |
| **Danger** | Coral Signal | `#ef4444` | Low scores (<60), errors, destructive actions |
| **Info** | Sky Signal | `#3b82f6` | Information badges, tips, highlights |

## 3. Typography Rules

| Element | Font | Weight | Size | Letter-spacing |
|---------|------|--------|------|---------------|
| **H1** | Inter | 700 (Bold) | 48px / 3rem | -0.02em (tight) |
| **H2** | Inter | 600 (Semi-bold) | 32px / 2rem | -0.01em |
| **H3** | Inter | 600 (Semi-bold) | 24px / 1.5rem | normal |
| **H4** | Inter | 500 (Medium) | 18px / 1.125rem | normal |
| **Body** | Inter | 400 (Regular) | 16px / 1rem | normal |
| **Body Small** | Inter | 400 (Regular) | 14px / 0.875rem | normal |
| **Caption** | Inter | 500 (Medium) | 12px / 0.75rem | 0.02em (wide) |
| **Button** | Inter | 500 (Medium) | 14px / 0.875rem | 0.01em |

**Line height**: 1.5 for body, 1.2 for headings.

## 4. Component Stylings

### Buttons
- **Primary**: Signal Blue (#135bec) background, white text, 8px radius, 12px 24px padding, subtle shadow on hover
- **Secondary**: White background, Signal Blue border (1px), Signal Blue text, 8px radius
- **Ghost**: Transparent background, Slate Gray text, no border, hover → Whisper Gray bg
- **Danger**: Coral Signal background, white text

### Cards/Containers
- Pure White (#ffffff) background
- 1px Frost Line (#e2e8f0) border
- 8px rounded corners (consistent with Stitch `ROUND_EIGHT`)
- Subtle `0 1px 3px rgba(0,0,0,0.06)` shadow for elevation
- 24px internal padding

### Inputs/Forms
- Whisper Gray (#f1f5f9) background
- 1px Frost Line (#e2e8f0) border
- 8px rounded corners
- Focus: Signal Blue 2px ring
- 12px 16px padding

### Score Badges
- Circular or pill-shaped
- 80-100: Emerald Signal bg, white text → "Excellent Match"
- 60-79: Amber Signal bg, white text → "Good Match"
- Below 60: Coral Signal bg, white text → "Needs Work"

### Navigation
- Fixed top, Pure White bg, 1px bottom border Frost Line
- Logo left, nav links center, CTA right
- Active link: Signal Blue text + 2px bottom indicator

## 5. Layout Principles
- **8px grid system**: All spacing multiples of 8 (8, 16, 24, 32, 48, 64)
- **Max content width**: 1280px, centered
- **Sidebar width**: 280px (dashboard layout)
- **Card grid**: 1 col mobile → 2 col tablet → 3 col desktop
- **Generous whitespace**: 64px section gaps, 32px between cards
- **Mobile-first**: Designed for 375px, scales up

## 6. Design System Notes for Stitch Generation

When generating new screens in Stitch, include this block:

```
DESIGN SYSTEM (REQUIRED):
- Platform: Web, Desktop-first
- Theme: Light, clean, professional, data-driven
- Font: Inter (all weights)
- Background: Cloud White (#f8fafc)
- Surface: Pure White (#ffffff) for cards
- Primary Accent: Signal Blue (#135bec) for buttons and links
- Text Primary: Ink Black (#0f172a)
- Text Secondary: Slate Gray (#64748b)
- Borders: Frost Line (#e2e8f0), 1px solid
- Corners: 8px radius consistently
- Shadows: Subtle, 0 1px 3px rgba(0,0,0,0.06)
- Score colors: Green (#10b981) for 80+, Amber (#f59e0b) for 60-79, Red (#ef4444) for <60
```
