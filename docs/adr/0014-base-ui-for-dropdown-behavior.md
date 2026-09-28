# Base UI provides the Dropdown component's behavior layer (#119)

Every component in the design system up to this point — `Button`, `Link`,
`TextInput` — is a plain styled element with no behavior beyond what the
DOM gives it natively. `AppNav`'s account menu (#119) is the first component
that needs real interactive behavior: a trigger that opens/closes a panel,
keyboard navigation between items, focus trapped inside the panel while
open and returned to the trigger on close, and the panel closing on an
outside click or `Escape`. Getting any one of those subtly wrong (a focus
trap that leaks, a click-outside handler that also fires on the trigger's
own click and immediately re-closes the panel, arrow keys that don't wrap)
is an easy, invisible bug — the kind that only surfaces for a keyboard or
screen-reader user, not in a quick visual check.

## Decision

**`Dropdown` is built on `@base-ui/react`'s `Menu` primitives**
(`Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`,
`Menu.Popup`, `Menu.Item`, `Menu.LinkItem`, `Menu.Separator`) for all of that behavior.
Base UI is headless — it renders unstyled elements with the right ARIA
roles and keyboard handling wired up, and `Dropdown` supplies every CSS
class itself, the same way `Dropdown` would if it were hand-rolled. This is
the project's first dependency on an external library for component
_behavior_, as opposed to build tooling or infrastructure.

## Considered Options

- **Hand-roll the disclosure pattern** (`aria-expanded` on the trigger,
  a `useEffect` outside-click/`Escape` listener, plain `Link`/`Button`
  children, no roving focus). Rejected — for a component whose whole job
  is to be accessible, writing and maintaining that logic ourselves is the
  exact risk described above, for a problem a well-tested library has
  already solved. A generic, reusable `Dropdown` is also more likely to
  gain uses (and edge cases) over time than a one-off would have been,
  which raises the cost of getting it wrong.
- **A different headless library** (e.g. Radix UI). Not seriously
  evaluated beyond confirming Base UI fits: headless, React 19-compatible,
  ships the primitives this component needs. Swapping libraries later is
  cheap precisely because Base UI is headless — `Dropdown`'s CSS and its
  public props to `AppNav` don't change, only its internal composition
  would.

## Consequences

- `@base-ui/react` is a new runtime dependency. Any future interactive
  component (a modal, a combobox, a tooltip) should default to reaching
  for it rather than hand-rolling equivalent behavior, unless it doesn't
  cover the case.
- `Dropdown` still owns 100% of its visual design — Base UI contributes no
  styling, so nothing about the design system's "compose from existing
  CSS, no hidden library styles" discipline changes.
- The dependency is confined to `Dropdown`'s own implementation; nothing
  about `AppNav`'s public props (`email`, `onLogout`) needs to change for
  callers.

## Related

- [#90](https://github.com/ianjmacintosh/dreamport/issues/90) — original
  "no dropdown" decision for `AppNav`, superseded by #119
- [#119](https://github.com/ianjmacintosh/dreamport/issues/119) — this
  decision's originating issue
- `docs/design-decisions.md` — the `Dropdown` and Phosphor icon-system
  entries this ADR is referenced from
