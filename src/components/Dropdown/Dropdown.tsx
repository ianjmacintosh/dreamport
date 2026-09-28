import type { ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { CaretDownIcon } from "@phosphor-icons/react";

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
        <CaretDownIcon className="dropdown-trigger-icon" aria-hidden="true" />
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
