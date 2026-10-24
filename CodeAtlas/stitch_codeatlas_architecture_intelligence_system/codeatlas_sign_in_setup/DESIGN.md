---
name: CodeAtlas Intelligence
colors:
  surface: '#10141a'
  surface-dim: '#10141a'
  surface-bright: '#353940'
  surface-container-lowest: '#0a0e14'
  surface-container-low: '#181c22'
  surface-container: '#1c2026'
  surface-container-high: '#262a31'
  surface-container-highest: '#31353c'
  on-surface: '#dfe2eb'
  on-surface-variant: '#e4beb9'
  inverse-surface: '#dfe2eb'
  inverse-on-surface: '#2d3137'
  outline: '#ab8985'
  outline-variant: '#5b403d'
  surface-tint: '#ffb4ac'
  primary: '#ffb4ac'
  on-primary: '#690006'
  primary-container: '#ff544c'
  on-primary-container: '#5c0005'
  inverse-primary: '#bb171c'
  secondary: '#acc7ff'
  on-secondary: '#002f68'
  secondary-container: '#026ee4'
  on-secondary-container: '#f8f8ff'
  tertiary: '#53d8e2'
  on-tertiary: '#00363a'
  tertiary-container: '#00a0a9'
  on-tertiary-container: '#002f32'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad6'
  primary-fixed-dim: '#ffb4ac'
  on-primary-fixed: '#410002'
  on-primary-fixed-variant: '#93000d'
  secondary-fixed: '#d7e2ff'
  secondary-fixed-dim: '#acc7ff'
  on-secondary-fixed: '#001a40'
  on-secondary-fixed-variant: '#004492'
  tertiary-fixed: '#76f5ff'
  tertiary-fixed-dim: '#53d8e2'
  on-tertiary-fixed: '#002022'
  on-tertiary-fixed-variant: '#004f54'
  background: '#10141a'
  on-background: '#dfe2eb'
  surface-variant: '#31353c'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
  body-default:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-compact:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  body-bold:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  code-default:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  code-compact:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  mono-metric:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  micro-label:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.06em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-mobile: 0.5rem
  margin: 1rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for staff-plus architects, principal engineers, and technical leadership conducting codebase telemetry, dependency graphing, and architectural audits. The interface communicates surgical precision, computational density, and deliberate control.

The aesthetic fuses **IDE-Grade Functionalism** with **High-Contrast Minimalism**. It eliminates ornamental artifacts—no blurs, no ambient glows, no marketing-driven micro-interactions, and no skeuomorphic gradients. Depth is communicated strictly through planar surface tiers and disciplined 1px mechanical borders. The emotional tone is authoritative, analytical, and low-latency, allowing dense architectural data trees, graph visualizations, and syntax traces to take center stage without visual fatigue.

## Colors

The palette operates on a strict functional token structure optimized for high contrast, deep concentration, and legibility over long engineering sessions.

### Surface Tiers
- **Canvas Base (`#0D1117`):** Lowest foundational level for main workspace grids, infinite canvas viewers, and graph viewports.
- **Surface Layer 1 (`#161B22`):** Structural anchors; primary left sidebars, collapsable docks, file trees, and static bottom panels.
- **Surface Layer 2 (`#21262D`):** Information containers; inspect cards, detail drawers, modals, and metric grouping cards.
- **Surface Interactive / Hover (`#30363D`):** Active hover states, interactive table rows, pressed tabs, and muted button surfaces.

### Text & Interface Hierarchy
- **Text Primary (`#F0F6FC`):** Direct outputs, primary node names, headings, active selections, and code tokens.
- **Text Secondary (`#8B949E`):** Field labels, file tree depths, secondary metrics, and metadata.
- **Text Muted (`#6E7681`):** Inactive icons, line numbers, disabled triggers, and structural guides.

### Accents & Telemetry
- **Primary Action (`#E53935` / Hover `#FF5252`):** Mission-critical triggers, destructive operations, and architectural violation highlights.
- **Accent Interactive (`#2F81F7` / Focus `#58A6FF`):** Dependency selection edges, focus rings, link anchors, and terminal links.
- **Secondary Telemetry (`#39C5CF`):** Asynchronous queues, network pipelines, thread metrics, and diagnostic indicators.
- **Semantic State:** Success (`#3FB950`), Warning (`#D29922`), Danger / Failure (`#F85149`).

## Typography

The type hierarchy enforces a strict programmatic division: **Inter** handles narrative structure, dialog headers, and interface scaffolding; **JetBrains Mono** handles all technical, structural, and computational data.

- **JetBrains Mono Enforcement:** Strictly applied to code tokens, relative and absolute paths (`src/kernel/mem.rs`), numeric metrics (`14.2ms`, `99.98%`), git commit hashes, micro-badges, and uppercase section trackers.
- **Uppercase Micro-Labels:** Set at 11px with `0.06em` letter-spacing in JetBrains Mono (`text-transform: uppercase`). Used for panel section labels, table column titles, schema badges, and operational status flags.
- **Dense Proportions:** Default body copy is clamped to 12px–13px with tight, controlled line heights to maximize visible information density per viewport without horizontal compression.

## Layout & Spacing

The layout model is anchored by a **Fluid Multi-Pane Dock System** rather than a typical editorial column grid. The interface prioritizes maximize-available-canvas logic, utilizing collapsible fixed-width sidebars, multi-tier status bars, and floating or docked inspection panels.

- **Desktop Density:** Uses a tight 4px baseline sub-grid (`0.25rem` increments). Main workspaces maximize surface visibility with fixed structural rails (Sidebar: 280px, Terminal/Audit Drawer: 320px) and a continuous fluid visualization center.
- **Tablet & Compact Reflow (<1024px):** Auxiliary panels automatically collapse into floating flyout drawers anchored to viewport edges. The central canvas retains uninterrupted aspect ratios.
- **Mobile (<768px):** Structural panels drop into sliding full-height sheets; dense table rows switch to stacked key-value pairs formatted in `JetBrains Mono`.

## Elevation & Depth

Visual depth is strictly planar and architectural:

- **Zero Drop-Shadows:** There are no soft ambient shadows, tinted blur radii, or marketing elevation layers.
- **1px Planar Separators:** All boundary definition is executed via a solid `1px` border set to `#30363D`. When an element ascends in hierarchy (e.g., a modal overlay or floating contextual inspector), it uses background elevation (`#21262D`) enclosed by `#30363D`, not box shadows.
- **Focus Rings:** Unclipped, sharp `2px` rings in `#58A6FF` with `0px` offset ensure accessibility without introducing light dissipation or soft edges.
- **Backdrop Rules:** Modals and diagnostic overlays utilize `#0D1117` at 80% opacity with zero backdrop-filter blur to preserve GPU performance and maintain visual sharpness.

## Shapes

The design language uses sharp, compact geometries. 

- Interactive buttons, form inputs, tooltips, and badges utilize an exact `6px` radius (`0.375rem`), moving to `8px` (`0.5rem`) only on primary overlay cards and outer modal structures.
- Structural panels, docking bars, splitters, and canvas boundaries utilize hard zero-radius boundaries (`0px`) where they meet adjacent screen edges or canvas borders to create an integrated IDE appearance.

## Components

### Buttons & Triggers
- **Primary Action:** Solid `#E53935`, text `#F0F6FC` (bold Inter 12px), 6px radius, padding `6px 12px`. Hover state: `#FF5252`. Active: `#D32F2F`. Zero gradients or shadows.
- **Secondary / Ghost:** Transparent background with 1px solid `#30363D`, text `#F0F6FC`. Hover: `#30363D` background. Active: `#21262D`.
- **Icon Buttons:** Fixed 28x28px squares, 1px solid transparent borders. Hover: background `#30363D`, border `#30363D`.

### Chips, Tags & Micro-Badges
- Composed strictly with JetBrains Mono (11px, `micro-label`).
- Enclosed with 1px border `#30363D`, surface `#161B22`, text `#8B949E`, padding `2px 6px`, 4px radius.
- Status variants map direct border color accents: Success (`#3FB950`), Warning (`#D29922`), Danger (`#F85149`) with 10% opacity fills.

### Lists & Tree Views
- High-density rows (24px height per item in file trees, 32px in data tables).
- Tree node indentation: Strict 12px multiples connected by 1px solid vertical guides in `#30363D`.
- Hover state: Row-wide background `#161B22` with immediate `#30363D` border highlight; selected row: `#21262D` surface with a 2px left border accent in `#2F81F7`.

### Form Inputs & Telemetry Filters
- Height clamped to 28px for compact density. Background `#0D1117`, border 1px solid `#30363D`, text `#F0F6FC` (JetBrains Mono 12px).
- Focus state: Border color transitions directly to `#58A6FF` without ambient glow. Placeholder: `#6E7681`.

### Surface Cards & Inspector Panels
- Background `#21262D`, enclosed by 1px solid `#30363D`, radius 6px to 8px.
- Internal headers use 32px fixed height, `#161B22` background, separated by a 1px solid bottom border (`#30363D`), housing `micro-label` titles.

### Code Blocks & Trace Panes
- Background `#0D1117`, border 1px solid `#30363D`. Line numbers in `#6E7681` (compact JetBrains Mono 11px), code in `#F0F6FC` (12px). Active highlight row: background `#161B22` with a 2px `#2F81F7` left border indicator.