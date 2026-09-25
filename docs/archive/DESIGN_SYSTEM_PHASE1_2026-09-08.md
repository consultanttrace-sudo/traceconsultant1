# TRACE Consultant OS — Phase 1 Design System

## Typography
- Display/UI: Inter
- Dense numeric/technical values: IBM Plex Mono
- Numeric values use tabular numerals.

## Color roles
- Background: soft neutral canvas
- Surface: white / elevated white
- Ink: deep neutral
- Muted: neutral gray
- Accent: TRACE orange
- Positive: green
- Warning: amber
- Danger: red

Colors are semantic tokens; modules should not invent one-off colors for the same state.

## Surfaces
- Card radius: 12–20px depending on hierarchy.
- Primary surfaces use subtle borders and low-elevation shadows.
- Hero surfaces may use restrained gradients; avoid excessive glassmorphism.

## Interaction
- Focus-visible outlines are mandatory.
- Buttons expose hover/pressed/disabled states.
- Micro-motion should be short and purposeful.
- `prefers-reduced-motion: reduce` disables non-essential animation.

## Layout
- Desktop: fixed sidebar + persistent topbar.
- Mobile: topbar + bottom navigation.
- Content should have consistent max-width and vertical rhythm.

## Intelligence UI
Use compact inline markers such as `?`, `Evidence`, `Confidence`, `Source`, and `Why?` instead of permanent AI paragraphs.

## Data visualization
- Prefer 2D charts for finance/business analytics.
- Use 3D only when it communicates a real spatial relationship or business concept better than 2D.
- Every chart needs title, period/context, units, and source or calculation note where applicable.
