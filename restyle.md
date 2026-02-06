# Minimalist Social Media App – Layout & UX Spec

## Design Philosophy

- Minimalist, dense, calm UI
- No blocky cards, no oversized components
- One primary surface visible at a time
- Secondary features live in drawers or overlays
- Content-first, UI stays quiet

Avoid:

- Large rounded cards
- Excessive padding or spacing
- Multiple panels competing for attention
- Bright colors, gradients, heavy shadows

---

## Core Layout (Desktop)

### Grid Structure

- **Left navigation rail:** fixed, 64px wide
- **Main content area:** centered, max-width 720–760px
- No persistent right column

---

## Left Navigation Rail

- Icons only (no labels by default)
- Tooltip labels on hover
- Expand labels only if user explicitly toggles

Icons (top to bottom):

- Home / Feed
- Search / Explore
- Messages (badge dot only)
- Live / Streams
- Notifications
- Profile / Settings

---

## Main Content Area

This area displays **one mode at a time**.

### Feed Mode

- Top composer:
  - Minimal (1–2 lines)
  - Expands on focus
- Feed items:
  - No card backgrounds
  - Subtle 1px dividers or spacing
  - Dense, text-first layout
  - Media allowed but constrained to feed width
- Infinite scroll

---

### Messaging Mode (Full Page)

- Replaces feed entirely
- No extra sidebars by default
- Clean, compact message spacing
- Focus on readability and flow

---

### Live Stream Mode

- Video centered in main content
- Max width aligned with feed
- Live chat hidden by default
- Chat toggles in as a right-side overlay
- Support mini-player when navigating away

---

## Drawers & Overlays (Critical)

Secondary features must NOT permanently affect layout.

### Messaging Drawer

- Slides in from right
- Width: 320–360px
- One conversation at a time
- Does not resize or shift main content
- Full messaging page exists but drawer handles most usage

---

### Live Chat Drawer

- Hidden by default
- Appears only when toggled
- Auto-hides on scroll
- Right-side overlay on desktop
- Slide-up panel on mobile

---

### Notifications

- Top-right dropdown panel
- Compact list
- No full-page notifications unless explicitly navigated

## Visual Density Rules

### Spacing

- Use an 8 / 12 / 16px spacing system
- Avoid padding >16px unless necessary
- Tight vertical rhythm preferred

### Typography

- Base font size: 14–15px
- Slightly tighter line-height than default
- Use font weight and color for hierarchy, not size

### Shape & Color

- Border radius: 6–8px max (or none)
- Mostly grayscale UI
- Single accent color for:
  - Links
  - Active states
  - Primary actions
- No gradients
- Shadows only if functional

---

## Mobile Layout

- Single-column content
- Bottom navigation bar (4–5 icons max)
- Messages: full screen
- Streams: full screen
- Chat: swipe-in panel

---

## Feature Priority Rules

Always visible:

- Main content (feed / messages / stream)
- Navigation

One interaction away:

- Messaging
- Live streams

Hidden until needed:

- Live chat
- Notifications
- Recommendations

---

## Non-Negotiable UX Rule

If a UI element is not core content, it must be hidden by default.

---

## Implementation Notes

- Prefer drawers and overlays over multi-column layouts
- Keep center content width constrained at all times
- Ensure smooth transitions between modes
- Default to calm, distraction-free presentation
