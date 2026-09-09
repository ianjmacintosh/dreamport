## Code Contribution

Every issue gets its own branch, and starting that branch is part of
picking up the issue — do it without being asked.

- **Cut from the current `origin/main`**, not local `main`. Local `main`
  lags (it isn't checked out or pulled during normal work), so branch with
  `git fetch origin && git checkout -b <branch> origin/main`.
- **Name it `<issue-number>-<short-kebab-slug>`** — e.g. issue #24
  "rate limiting on send-OTP" becomes `24-rate-limit-send-otp`. The slug is
  a few words describing the work, not the issue title verbatim. (Older
  `feat/` `fix/` `chore/` branches predate this rule; don't copy them.)
- **Don't leave the branch tracking `origin/main`.** `git checkout -b`
  from a remote ref sets that as upstream, which points a later `git push`
  at `main`. Run `git branch --unset-upstream` right after creating it so
  the first push creates the matching `origin/<branch>`.

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

## Logging

Never log a credential. Not in `console.*`, not in a thrown error's
message, not in a structured log field. That means:

- One-time sign-in codes (OTPs) and any token derived from one.
- Session tokens, session cookies, and raw `Cookie` / `Authorization`
  header values.
- `BETTER_AUTH_SECRET`, `TURNSTILE_SECRET_KEY`, `RESEND_API_KEY`, and any
  other API key or signing secret.
- Full email bodies (a sign-in email _is_ a credential in an envelope).

Log the identifier and the outcome instead — an email address or user id, a
verification identifier, a status code, "sent" / "rejected (bad token)" —
never the secret material itself. Worker logs fan out far wider and live far
longer than the auth database (dashboard readers, `wrangler tail`, Logpush,
SIEM, screenshots in tickets), so a credential in a log is a real exposure
even when the database is locked down. See issue #41.

## Explaining Issues

When the user flags a warning or unexpected output, lead the answer with the
concrete source — which function or file causes it, and why, in one line —
before anything else. If it's worth fixing, follow with a clear choice: fix
it now, or after the current task is verified.

Example: "That's coming from `createAuth()` in `src/worker/auth.ts` —
expected, since `baseURL` isn't set. Fix now, or after we verify the flow?"
