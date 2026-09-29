import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";

import Link from "../Link";

interface DropdownProps {
  /** The trigger's visible content (e.g. the signed-in User's email in
   * `AppNav`, or an icon). A chevron is appended after it — callers don't
   * add one — unless `chevron` is false. */
  label: ReactNode;
  /** The trigger's accessible name, for a `label` with no text of its own
   * (e.g. an icon-only menu button). */
  "aria-label"?: string;
  /** Show the chevron after the label. Defaults to true; an icon that
   * already reads as "opens a menu" (e.g. a ☰) can drop it. */
  chevron?: boolean;
  /** The trigger is a `.button`; this picks its variant, same as
   * `Button`'s. `"nav"` is the tinted look for the header bar (`AppNav`);
   * `"secondary"` (the default) is the outlined one used everywhere else. */
  variant?: "secondary" | "nav";
  /** An extra class on the trigger, for a caller placing it in its own
   * layout (e.g. `AppNav` showing one trigger per breakpoint). */
  className?: string;
  /** The panel's contents: `Dropdown.Item`, `Dropdown.LinkItem` and
   * `Dropdown.Separator`, in the order they should appear. */
  children: ReactNode;
}

/**
 * A trigger that opens a panel of actions — generic and reusable, not tied
 * to `AppNav`'s account menu (#119). All behavior (focus moving into the
 * panel and back to the trigger on close, arrow-key navigation between
 * items, closing on `Escape` or an outside click) comes from Base UI's
 * `Menu` primitives, per ADR-0014; every class below is this component's
 * own, styled in global.css — Base UI renders unstyled.
 */
export function Dropdown({
  label,
  "aria-label": ariaLabel,
  chevron = true,
  variant = "secondary",
  className,
  children,
}: DropdownProps) {
  const classes = [
    "button",
    `button--${variant}`,
    "dropdown-trigger",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Menu.Root>
      <Menu.Trigger className={classes} aria-label={ariaLabel}>
        <span className="dropdown-trigger-label">{label}</span>
        {chevron && <DropdownChevron />}
      </Menu.Trigger>
      <Menu.Portal>
        {/* Aligned to the trigger's end edge so a trigger sitting at the
            right of a bar opens its panel inward, not off-screen. */}
        <Menu.Positioner
          className="dropdown-positioner"
          align="end"
          sideOffset={8}
        >
          <Menu.Popup className="dropdown-popup">{children}</Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * The trigger's chevron — this component's own asset rather than Phosphor's
 * `CaretDown` (a scoped exception, see docs/design-decisions.md): Phosphor's
 * caret is one closed path, but opening the panel folds the two strokes
 * independently from a down- to an up-chevron, which needs them as separate
 * elements. Proportions and stroke weight follow Phosphor's regular caret
 * (256 viewBox, 16-unit round stroke) so it sits with the other icons.
 *
 * Each wing pivots on the shared vertex (128, 168); the `g` slides the
 * whole shape up as they fold so it stays centred — see
 * `.dropdown-chevron-*` in global.css.
 */
function DropdownChevron() {
  return (
    <svg
      viewBox="0 0 256 256"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <g className="dropdown-chevron">
        <line
          className="dropdown-chevron-wing dropdown-chevron-wing--left"
          x1="48"
          y1="88"
          x2="128"
          y2="168"
        />
        <line
          className="dropdown-chevron-wing dropdown-chevron-wing--right"
          x1="208"
          y1="88"
          x2="128"
          y2="168"
        />
      </g>
    </svg>
  );
}

interface DropdownItemProps {
  /** Called when the item is chosen, by click or by keyboard. */
  onClick: () => void;
  children: ReactNode;
}

/** An action in the panel (e.g. Log out). Closes the panel when chosen. */
function DropdownItem({ onClick, children }: DropdownItemProps) {
  return (
    <Menu.Item className="dropdown-item" onClick={onClick}>
      {children}
    </Menu.Item>
  );
}

interface DropdownLinkItemProps {
  href: string;
  /** Whether the item is the page the User is on (`aria-current="page"`,
   * shown bold) — e.g. the current section in `AppNav`'s phone menu, which
   * spans more pages than its own `href`. Left out, the router decides
   * from `href` (see `Link`). */
  current?: boolean;
  children: ReactNode;
}

/** A navigation in the panel (e.g. Settings) — a real link, rendered
 * through `Link` so internal hrefs go through the router. */
function DropdownLinkItem({ href, current, children }: DropdownLinkItemProps) {
  return (
    <Menu.LinkItem
      className="dropdown-item"
      closeOnClick
      render={<Link href={href} current={current} />}
    >
      {children}
    </Menu.LinkItem>
  );
}

/** A divider between groups of items. */
function DropdownSeparator() {
  return <Menu.Separator className="dropdown-separator" />;
}

interface DropdownGroupProps {
  /** Non-interactive text heading the group (e.g. "Signed in as …") —
   * read out as the group's name, never focused or chosen. */
  label: ReactNode;
  children: ReactNode;
}

/** A labelled run of items: the label is plain text, not an item. */
function DropdownGroup({ label, children }: DropdownGroupProps) {
  return (
    <Menu.Group>
      <Menu.GroupLabel className="dropdown-group-label">
        {label}
      </Menu.GroupLabel>
      {children}
    </Menu.Group>
  );
}

Dropdown.Item = DropdownItem;
Dropdown.LinkItem = DropdownLinkItem;
Dropdown.Separator = DropdownSeparator;
Dropdown.Group = DropdownGroup;

export default Dropdown;
