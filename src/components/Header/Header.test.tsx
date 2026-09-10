import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import Header from "./Header";

type HeaderLink = ReactElement<{
  href: string;
  className?: string;
  children?: unknown;
}>;

/**
 * The links inside the header row for a given `showWordmark` prop. No DOM
 * renderer is available in the unit suite, so this reads the element tree
 * `Header` returns directly — it only depends on the header being one row
 * of links, which is the whole component.
 */
function headerLinks(props: { showWordmark?: boolean }): HeaderLink[] {
  const header = Header(props);
  const row = header.props.children as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(row.props.children).filter(
    isValidElement,
  ) as HeaderLink[];
}

describe("Header", () => {
  test("exists", () => {
    expect(Header).not.toBe(undefined);
  });

  test("always offers a primary-button Log in link to /login", () => {
    for (const props of [{}, { showWordmark: true }, { showWordmark: false }]) {
      const login = headerLinks(props).find((l) => l.props.href === "/login");
      expect(login).toBeDefined();
      expect(login?.props.className).toContain("button--primary");
      expect(login?.props.children).toBe("Log in");
    }
  });

  test("shows the Dreamport wordmark link to / by default", () => {
    expect(headerLinks({}).some((l) => l.props.href === "/")).toBe(true);
  });

  test("omits the wordmark link when showWordmark is false", () => {
    expect(
      headerLinks({ showWordmark: false }).some((l) => l.props.href === "/"),
    ).toBe(false);
  });
});
