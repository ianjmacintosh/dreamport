import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test, vi } from "vitest";

import Dropdown from "../Dropdown";
import AppNav from "./AppNav";

type NavElement = ReactElement<{
  href?: string;
  className?: string;
  label?: unknown;
  children?: ReactNode;
  onClick?: () => void;
}>;

/**
 * Every element nested inside `AppNav`, flattened depth-first. No DOM
 * renderer is available in the unit suite, so this reads the element tree
 * `AppNav` returns directly — same approach `Header.test.tsx` uses — without
 * depending on how the row is grouped. The account Dropdown's
 * open/close/keyboard behavior is Base UI's, covered end to end in
 * `e2e/login.spec.ts`.
 */
function descendants(node: ReactNode): NavElement[] {
  return Children.toArray(node)
    .filter(isValidElement)
    .flatMap((child) => {
      const element = child as NavElement;
      return [element, ...descendants(element.props.children)];
    });
}

function navElements(email: string, onLogout: () => void): NavElement[] {
  return descendants(AppNav({ email, onLogout }).props.children);
}

/** The account `Dropdown`'s own items, in panel order. */
function dropdownItems(email: string, onLogout: () => void): NavElement[] {
  const dropdown = navElements(email, onLogout).find(
    (el) => el.type === Dropdown,
  );
  return Children.toArray(dropdown?.props.children).filter(
    isValidElement,
  ) as NavElement[];
}

describe("AppNav", () => {
  test("exists", () => {
    expect(AppNav).not.toBe(undefined);
  });

  test("shows the Dreamport wordmark first, linking to /app", () => {
    const elements = navElements("someone@example.com", () => {});
    const links = elements.filter((el) => el.props.href !== undefined);
    expect(links[0]?.props.href).toBe("/app");
    expect(links[0]?.props.className).toBe("wordmark");
    expect(links[0]?.props.children).toBe("Dreamport");
  });

  test("the account dropdown's trigger is the signed-in email", () => {
    const dropdown = navElements("someone@example.com", () => {}).find(
      (el) => el.type === Dropdown,
    );
    expect(dropdown?.props.label).toBe("someone@example.com");
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
