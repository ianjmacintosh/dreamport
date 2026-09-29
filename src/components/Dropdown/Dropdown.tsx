import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";

import Link from "../Link";

interface DropdownProps {
  /** The trigger's visible text (e.g. the signed-in User's email in
   * `AppNav`). A chevron is appended after it — callers don't add one. */
  label: ReactNode;
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
export function Dropdown({ label, children }: DropdownProps) {
  return (
    <Menu.Root>
      <Menu.Trigger className="dropdown-trigger">
        <span className="dropdown-trigger-label">{label}</span>
        <DropdownChevron />
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
  children: ReactNode;
}

/** A navigation in the panel (e.g. Settings) — a real link, rendered
 * through `Link` so internal hrefs go through the router. */
function DropdownLinkItem({ href, children }: DropdownLinkItemProps) {
  return (
    <Menu.LinkItem
      className="dropdown-item"
      closeOnClick
      render={<Link href={href} />}
    >
      {children}
    </Menu.LinkItem>
  );
}

/** A divider between groups of items. */
function DropdownSeparator() {
  return <Menu.Separator className="dropdown-separator" />;
}

Dropdown.Item = DropdownItem;
Dropdown.LinkItem = DropdownLinkItem;
Dropdown.Separator = DropdownSeparator;

export default Dropdown;
