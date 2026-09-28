import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test, vi } from "vitest";

import AppNav from "./AppNav";

type NavElement = ReactElement<{
  href?: string;
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}>;

/**
 * Every element nested inside `AppNav`, flattened depth-first. No DOM
 * renderer is available in the unit suite, so this reads the element tree
 * `AppNav` returns directly — same approach `Header.test.tsx` uses — without
 * depending on how the row is grouped.
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

  test("shows the signed-in email", () => {
    const email = navElements("someone@example.com", () => {}).find(
      (el) => el.type === "span",
    );
    expect(email?.props.children).toBe("someone@example.com");
  });

  test("links to /app/settings", () => {
    const settingsLink = navElements("someone@example.com", () => {}).find(
      (el) => el.props.href === "/app/settings",
    );
    expect(settingsLink).toBeDefined();
    expect(settingsLink?.props.children).toBe("Settings");
  });

  test("calls onLogout when Log out is clicked", () => {
    const onLogout = vi.fn();
    const logoutButton = navElements("someone@example.com", onLogout).find(
      (el) => el.props.children === "Log out",
    );
    expect(logoutButton).toBeDefined();
    logoutButton?.props.onClick?.();
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
