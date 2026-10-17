---
name: Daymark
description: A calm, compact business app for running a job search; Tsenta-close application workspace inside a sidebar shell.
colors:
  bg: "#f6f7f8"
  surface: "#ffffff"
  surface-muted: "#f1f3f2"
  line: "#e4e7e5"
  line-strong: "#cfd5d1"
  text: "#14201b"
  text-muted: "#5d6963"
  text-faint: "#8a958f"
  brand: "#173b2d"
  brand-hover: "#244e3c"
  brand-soft: "#eaf2ed"
  focus: "#2f7a57"
  success: "#177245"
  success-soft: "#e6f5ec"
  warning: "#8a5a00"
  warning-soft: "#fff4dc"
  danger: "#b3261e"
  danger-soft: "#fdecea"
  info: "#1f5fa8"
  info-soft: "#e8f0fa"
typography:
  family: "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif"
  mono: "ui-monospace, SFMono-Regular, Menlo, monospace"
  page-title: { fontSize: "22px", fontWeight: 650, letterSpacing: "-0.02em" }
  section-title: { fontSize: "15px", fontWeight: 600 }
  body: { fontSize: "13.5px", lineHeight: 1.55 }
  label: { fontSize: "12px", fontWeight: 500 }
  caption: { fontSize: "11.5px" }
rounded: { control: "8px", card: "12px", pill: "999px" }
spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px" }
layout: { sidebar: "248px", sidebar-collapsed: "64px", content-max: "1240px", topbar: "56px" }
---

# Daymark design system

One family (Inter), one accent (forest), neutral surfaces. This replaces the four legacy stylesheets (now in `public-legacy/`, served at `/legacy`). Tokens live in `web/src/index.css` as CSS variables and are exposed to Tailwind as `bg-surface`, `text-muted`, `border-line`, `bg-brand`, etc.

## Principles
- **One application, one current action.** Every record shows its stage and a single primary next action.
- **Evidence over claims.** Never display success the server has not confirmed; "submitted" requires receipt evidence.
- **Quiet chrome.** White surfaces, 1px lines, almost no shadow. Colour is reserved for status and the primary action.
- **Dense but breathable.** 13.5px body, 36–40px controls, 8px grid.

## Colour
Forest (`brand`) is the only accent: primary buttons, active nav, focus-adjacent selection. Status colours (success / warning / danger / info) always pair with a text label and a soft tinted background; never colour alone.

## Layout
Light sidebar (248px, collapsible to 64px; slide-over drawer under 1024px), 56px top bar (search / ⌘K, worker status, queue depth, notifications), content max 1240px. Sidebar groups: Work, Mail & Calendar, Materials, System. Detail opens in a right drawer from tables; the application workspace is a full page with tabs.

## Components
Button (primary / secondary / ghost / danger), Badge (status tones), Card, Table, Tabs (Radix), Dialog and Drawer (Radix, replace `prompt()`/`confirm()`), Command palette (cmdk, ⌘K), Skeleton, EmptyState, ErrorState (with retry), Toast-free inline status. All interactive elements: 2px focus ring in `focus` with 2px offset; `aria-current="page"` on active nav.

## Responsive and a11y
375px is a first-class width: sidebar becomes a drawer, tables collapse to stacked rows, tabs scroll horizontally, touch targets ≥ 40px. Everything is reachable by keyboard; skip-link to main; reduced-motion respected. Mail uses Gmail-style keys (j/k, o, e, r, c, /).

## Motion
Only 120–160ms opacity/transform transitions; skeleton shimmer disabled under `prefers-reduced-motion`.
