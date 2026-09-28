import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test, vi } from "vitest";

import Dropdown from "../Dropdown";
import AppNav from "./AppNav";

type DropdownElement = ReactElement<{ label?: unknown; children?: ReactNode }>;

/**
 * `AppNav`'s account `Dropdown` element. No DOM renderer is available in the
 * unit suite, so this reads the element tree `AppNav` returns directly —
 * same approach `Header.test.tsx` uses. The Dropdown's open/close/keyboard
 * behavior is Base UI's, covered end to end in `e2e/login.spec.ts`.
 */
function accountDropdown(email: string, onLogout: () => void): DropdownElement {
  const nav = AppNav({ email, onLogout });
  const content = nav.props.children as ReactElement<{
    children?: ReactNode;
  }>;
  const dropdown = Children.toArray(content.props.children).find(
    (child) => isValidElement(child) && child.type === Dropdown,
  );
  if (!isValidElement(dropdown)) throw new Error("no Dropdown in AppNav");
  return dropdown as DropdownElement;
}

function dropdownItems(email: string, onLogout: () => void) {
  return Children.toArray(
    accountDropdown(email, onLogout).props.children,
  ).filter(isValidElement) as ReactElement<{
    href?: string;
    onClick?: () => void;
    children?: unknown;
  }>[];
}

describe("AppNav", () => {
  test("exists", () => {
    expect(AppNav).not.toBe(undefined);
  });

  test("the account dropdown's trigger is the signed-in email", () => {
    const dropdown = accountDropdown("someone@example.com", () => {});
    expect(dropdown.props.label).toBe("someone@example.com");
  });

  test("the dropdown holds Settings, a separator, then Log out", () => {
    const [settings, separator, logout] = dropdownItems(
      "someone@example.com",
      () => {},
    );
    expect(settings.type).toBe(Dropdown.LinkItem);
    expect(settings.props.href).toBe("/app/settings");
    expect(settings.props.children).toBe("Settings");
    expect(separator.type).toBe(Dropdown.Separator);
    expect(logout.type).toBe(Dropdown.Item);
    expect(logout.props.children).toBe("Log out");
  });

  test("calls onLogout when Log out is chosen", () => {
    const onLogout = vi.fn();
    const logout = dropdownItems("someone@example.com", onLogout).at(-1);
    logout?.props.onClick?.();
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
