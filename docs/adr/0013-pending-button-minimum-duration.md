# A pending button holds its disabled/relabeled state for a minimum duration (#89)

`/app`'s Add and Delete buttons disable and relabel while their request is
in flight (docs/adr/0012's pattern, applied beyond the Turnstile-gated case
it was written for). Against local D1, that request often resolves in a
handful of milliseconds — fast enough that the disabled/relabeled state
flipped on and back off before a person could actually read it, which
looked like a flicker rather than a state change. Manual testing (#89)
caught this, then caught a second, sharper version of the same problem:
when the state change also unmounts an element (deleting a Product removes
its row, and the "Deleting…" button along with it), the row could vanish
the instant the request resolved — before any minimum-duration wait had
even run — which looked like the click had done nothing at all.

## Decision

**Any button using the ADR-0012 pending pattern holds that state for a
minimum duration (400ms), timed from the moment the request starts, not
from when it resolves.** `withMinimumDuration` wraps the async work and
waits out the rest of that floor before resolving. Critically, any UI
change that would remove the pending element itself (e.g. filtering a
Product out of the list) has to happen _after_ `withMinimumDuration`
resolves, not inside the timed callback — doing it inside would unmount the
row before the wait it's supposed to be honoring ever ran.

400ms was picked as a reasonable floor for a simple create/delete action,
not derived from a specific study — a candidate to revisit if it ever
feels wrong in either direction.

## Considered Options

- **No minimum duration; let the button flip states as fast as the network
  allows.** Rejected — this is the status quo problem: a fast local
  response degrades the deliberate pending-state signal into
  indistinguishable-from-a-glitch flicker.
- **A minimum duration enforced only on the visual state (disable the
  button for 400ms) while letting data changes (e.g. removing the row)
  happen immediately.** Rejected for delete specifically: the button _is_
  part of the row being removed, so decoupling "how long the button looks
  disabled" from "when the row disappears" doesn't help — the row taking
  the button with it is the actual flicker.

## Consequences

- Every add/delete now takes at least 400ms end-to-end, even against an
  instant backend. That's a deliberate trade of perceived responsiveness
  for a readable state change, not an oversight.
- Any future button adopting the ADR-0012 pending pattern should route its
  async work through `withMinimumDuration` (`src/routes/_appShell/app.tsx`)
  from the start, with any element-removal/replacement deferred until it
  resolves — not bolted on after a flicker is reported again.

## Related

- [docs/adr/0012](0012-disabled-submit-label-not-aria-disabled.md) — the
  disable+relabel pending-state mechanism this extends
- [#89](https://github.com/ianjmacintosh/dreamport/issues/89) — delete a
  Product, where this was found and fixed
