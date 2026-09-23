import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test, vi } from "vitest";

import AppNav from "./AppNav";

/**
 * The row of children inside `AppNav`'s content div. No DOM renderer is
 * available in the unit suite, so this reads the element tree `AppNav`
 * returns directly — same approach `Header.test.tsx` uses.
 */
function contentChildren(email: string, onLogout: () => void): ReactNode[] {
  const nav = AppNav({ email, onLogout });
  const content = nav.props.children as ReactElement<{
    children?: ReactNode;
  }>;
  return Children.toArray(content.props.children);
}

describe("AppNav", () => {
  test("exists", () => {
    expect(AppNav).not.toBe(undefined);
  });

  test("shows the signed-in email", () => {
    const children = contentChildren("someone@example.com", () => {});
    const email = children.find(
      (child) => isValidElement(child) && child.type === "span",
    ) as ReactElement<{ children?: unknown }> | undefined;
    expect(email?.props.children).toBe("someone@example.com");
  });

  test("links to /app/settings", () => {
    const children = contentChildren("someone@example.com", () => {});
    const settingsLink = children.find(
      (child) =>
        isValidElement(child) &&
        (child.props as { href?: string }).href === "/app/settings",
    ) as ReactElement<{ children?: unknown }> | undefined;
    expect(settingsLink).toBeDefined();
    expect(settingsLink?.props.children).toBe("Settings");
  });

  test("calls onLogout when Log out is clicked", () => {
    const onLogout = vi.fn();
    const children = contentChildren("someone@example.com", onLogout);
    const logoutButton = children.find(
      (child) =>
        isValidElement(child) &&
        (child.props as { children?: unknown }).children === "Log out",
    ) as ReactElement<{ onClick?: () => void }> | undefined;
    expect(logoutButton).toBeDefined();
    logoutButton?.props.onClick?.();
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
