## Code Contribution

Run `npm run format` to format all files using Prettier before commiting

## Testing

Tests must only send email to an address defined in `TEST_EMAILS`
(`test/emails.ts`). Never write a recipient address literal into a test —
add a named entry to that object and reference it. Every address there sits
on a domain that cannot reach a real inbox.

## Design System Discipline

The design system has four tiers:

- **Primitive** — a design token (color, space, type) or the base styled
  element it produces (`.button`, `.input`, headings) in `global.css` /
  `tokens.css`.
- **Component** — built from primitives (`Button`, `Link`, `TextInput`).
  Lives in the component library.
- **Pattern** — a page (e.g. Homepage, Legal) composed _only_ by arranging
  existing components in plain document order. No page-specific CSS, no new
  visual identity — whatever spacing the cascade already gives is the
  spacing it gets.
- **Motif** — a deliberate, curated signature visual detail (e.g. a
  recurring shape or treatment that becomes part of the brand) added to the
  style guide. This is never something an agent infers from noticing
  repetition — it's a human design decision.

Rules for building or editing a page:

1. Compose pages from existing components only. Never add a new CSS file,
   new class, or inline style without asking first — not even a "small"
   layout tweak.
2. Never create a new component on your own, even one with zero new CSS.
   If you notice a composition of components repeating across pages, or a
   page seems to need a visual treatment that doesn't exist yet, flag it —
   don't build it. New components and motifs always require sign-off, since
   each one grows the app's surface area and maintenance cost.
3. When you believe a page genuinely needs visual elaboration beyond what
   existing components provide, stop and describe the proposal in words and
   wait for a decision before writing any code. Don't build a prototype or
   proposal branch first — an already-built proposal is harder to say no to
   than a plain description.

This applies everywhere in the app, not just the pattern library.

## Layout

Structural page layout — page shells, full-bleed sections, sticky
footers, breakout grids — is managed with CSS Grid, not Flexbox.
Flexbox is still fine for small component-internal alignment (e.g. a
button centering its icon and label), which isn't structural layout.

## Explaining Issues

When the user flags a warning or unexpected output, lead the answer with the
concrete source — which function or file causes it, and why, in one line —
before anything else. If it's worth fixing, follow with a clear choice: fix
it now, or after the current task is verified.

Example: "That's coming from `createAuth()` in `src/worker/auth.ts` —
expected, since `baseURL` isn't set. Fix now, or after we verify the flow?"
