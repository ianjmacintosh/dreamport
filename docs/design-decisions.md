# Design decisions

One-liner rules for composing pages from the design system's existing
Components and Patterns (see `AGENTS.md`'s four-tier system). Each entry
here is a decision already made — during a sign-off conversation like #28's
or #90's — for a shape that recurs, not a one-off.

**These are binding, not advisory.** When a page's situation clearly matches
an entry below, build it directly — no sign-off round-trip needed, since
sign-off was already spent when the rule was written. A situation that
doesn't clearly match an existing entry still needs its own sign-off
conversation (AGENTS.md rule 3), the same as before this document existed.

Add an entry only once a sign-off conversation resolves something repeatable
— never speculatively, ahead of a real decision.

## Rules

- A form consisting of a single labelled field and a single attached action
  (e.g. an email field + "Send code") uses the `.field-row` pattern —
  the button sits beside the field, flush with its top/bottom edges, not
  stacked below it. Two or more buttons with no field attached use
  `.button-group` instead. See the style guide's "Field with action"
  section and docs/adr/0012 (decided in #28).

- A button that starts a request needing server confirmation (add, delete,
  any create/update/destroy action) disables and relabels to a
  present-participle string ("Adding…"/"Deleting…") while that request is
  in flight — native `disabled`, not `aria-disabled` (docs/adr/0012). That
  state holds for a minimum of 400ms, timed from when the request starts,
  via `withMinimumDuration`, so a fast response doesn't flicker the state
  instead of showing it — and any change that would remove the pending
  element itself (e.g. the row a delete button lives in) waits until after
  that minimum duration resolves, not before. See docs/adr/0013 (decided
  in #89).

- A signed-in page (e.g. `/app`, `/app/settings`) renders inside the
  `_appShell` layout — `AppNav` (email, a Settings link, Log out) plus the
  usual `Footer` — not the marketing `Header`/`_withFooter`. `Header` stays
  signed-out-only; it has no concept of a session. See
  `src/routes/_appShell.tsx` and `src/components/AppNav` (decided in #90).

- A destructive, irreversible action (delete account, delete a Product)
  uses a two-step reveal in place — resting state shows the action itself
  ("Delete"); clicking it swaps that control for "Confirm"/"Cancel" rather
  than performing the action — instead of a modal/dialog. A stray click
  can't trigger the irreversible step, and no dialog component is needed.
  Decided for delete-account in #26, reaffirmed generally (one confirming
  state per row, not just per page) for Product delete in #90.

- A row that pairs a name or display value with one attached action (a
  Product's own name + Delete, an Idea's own name + Edit/Delete) uses the
  `.list`/`.list-row` pattern — real `<ul>`/`<li>`, not `.field-row`
  (which is for a labelled input, not a display value). See `src/global.css`
  and the style guide's "Row with action" section (decided in #90, generalized
  off "Product" naming in #101).
