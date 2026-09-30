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
  current?: boolean;
  children?: unknown;
}>;

/**
 * The links inside the header row. No DOM renderer is available in the
 * unit suite, so this reads the element tree `Header` returns directly — it
 * only depends on the header being one row of links, which is the whole
 * component.
 */
function headerLinks(): HeaderLink[] {
  const header = Header();
  const row = header.props.children as ReactElement<{ children?: ReactNode }>;
  return Children.toArray(row.props.children).filter(
    isValidElement,
  ) as HeaderLink[];
}

describe("Header", () => {
  test("exists", () => {
    expect(Header).not.toBe(undefined);
  });

  test("offers a bar-button Log In link to /login", () => {
    const login = headerLinks().find((l) => l.props.href === "/login");
    expect(login).toBeDefined();
    expect(login?.props.className).toContain("button--bar");
    expect(login?.props.children).toBe("Log In");
  });

  test("always shows the Dreamport wordmark, linking to /", () => {
    const wordmark = headerLinks().find((l) => l.props.href === "/");
    expect(wordmark).toBeDefined();
    expect(wordmark?.props.className).toBe("wordmark");
    expect(wordmark?.props.children).toBe("Dreamport");
    // Part of the bar, not a nav item — never "you are here" (#125).
    expect(wordmark?.props.current).toBe(false);
  });
});
