# The Turnstile-gated submit disables natively, with the label as the explanation (#28)

`/login`'s email-step submit button depends on a Cloudflare Turnstile token
that isn't available the instant the page loads — the widget has to fetch and
resolve its own challenge first, which takes a visible beat even with
Cloudflare's always-pass test key. Before this decision, that gap was
invisible: the button looked normal and clickable, and clicking it before the
token existed produced an inline error ("Complete the challenge, then try
again.") rather than a signal that the button itself was doing anything.
Separately, the button used to sit below the widget in the vertical flow; it
now sits beside the email field (`.field-row`), which puts it in view — and
looking clickable — before the widget below it has had any chance to resolve.

## Decision

**The button disables via the plain `disabled` attribute — not
`aria-disabled` — and its label states why**, cycling through three states
also used for its own in-flight submit (already established for the
send/verify pending state before this ADR):

- No token yet: disabled, labelled "Verifying you're human…"
- Token present: enabled, "Send code"
- Submitting: disabled, "Sending…"

The label carries the explanation. No separate `aria-describedby` wiring was
added for the not-ready state, because there is nothing left for it to say
that the accessible name doesn't already say.

## Considered Options

- **`aria-disabled="true"` instead of native `disabled`.** Rejected. Keeping
  the button focusable would require the app to also intercept and swallow
  Enter/Space/click on it manually (the browser won't refuse the interaction
  on its own), for a benefit — discoverability via sequential Tab order —
  that a screen reader's non-linear element-type navigation (rotor/virtual
  cursor) already provides for a natively `disabled` control. Native
  `disabled` was simpler and consistent with the pending-state mechanism this
  page already had.
- **Leave the button always enabled and rely solely on the existing inline
  error** ("Complete the challenge, then try again.") **for the too-early
  case.** Rejected — it only fires after a failed click, so a user landing on
  a still-loading widget gets no signal until they've already tried and
  failed once. The label makes the state visible before that failure can
  happen.
- **A separate status line (e.g. a small "Waiting for security check…" caption
  near the widget) instead of changing the button's own label.** Rejected as
  an extra element for no real gain — the button is the thing the state
  actually gates, so putting the explanation on the button itself keeps
  "why can't I click this" and "the thing I can't click" in one place, and
  reuses the label-swap mechanism already built for the pending state instead
  of adding a second one.

## Consequences

- Any future submit button gated on an async precondition (not just
  Turnstile) has a established pattern to match: native `disabled` + a label
  that says what's being waited on, rather than a silent disabled control or
  a new `aria-disabled` convention.
- The button's accessible name changes three times over one interaction
  (loading → ready → submitting label swaps). That's already true of the
  existing pending-state behavior this reuses; no new screen-reader
  announcement behavior is introduced by this decision.

## Related

- [#28](https://github.com/ianjmacintosh/dreamport/issues/28) — the
  design-system pass this shipped in
- [#50](https://github.com/ianjmacintosh/dreamport/issues/50) — introduced the
  site header's own `.button`-on-`<Link>` primitive fix, part of the same
  ticket
