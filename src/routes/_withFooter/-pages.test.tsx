import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import Link from "../../components/Link";
import { Route as HomeRoute } from "./index";
import { Route as AboutRoute } from "./about";
import { Route as PrivacyRoute } from "./privacy";
import { Route as TermsRoute } from "./terms";
import { Route as CopyrightRoute } from "./copyright";

// The `-` prefix keeps TanStack Router's file-based routing from treating
// this file as a route of its own.

type PageElement = ReactElement<{ children?: ReactNode }>;

/** Render a static page's element tree (no DOM renderer in the unit suite,
 * same approach as the component tests) and return its `<h1>` text. */
function h1Of(route: { options: { component?: unknown } }): ReactNode {
  const tree = (route.options.component as () => PageElement)();
  const find = (node: ReactNode): PageElement | undefined => {
    for (const child of Children.toArray(node)) {
      if (!isValidElement(child)) continue;
      const el = child as PageElement;
      if (el.type === "h1") return el;
      const nested = find(el.props.children);
      if (nested) return nested;
    }
  };
  return find(tree)?.props.children;
}

/** Every `Link` in a static page's element tree, as [text, href]. */
function linksOf(route: { options: { component?: unknown } }) {
  const tree = (route.options.component as () => PageElement)();
  const walk = (node: ReactNode): PageElement[] =>
    Children.toArray(node)
      .filter(isValidElement)
      .flatMap((child) => {
        const el = child as PageElement;
        return [el, ...walk(el.props.children)];
      });
  return walk(tree)
    .filter((el) => el.type === Link)
    .map((el) => [el.props.children, (el.props as { href?: string }).href]);
}

describe("signed-out info pages", () => {
  test("/ links Start now to /login", () => {
    expect(linksOf(HomeRoute)).toEqual([["Start now", "/login"]]);
  });

  test("/about renders its heading", () => {
    expect(h1Of(AboutRoute)).toBe("About Dreamport");
  });

  test("/privacy renders its heading", () => {
    expect(h1Of(PrivacyRoute)).toBe("Privacy Policy");
  });

  test("/terms renders its heading", () => {
    expect(h1Of(TermsRoute)).toBe("Terms of Service");
  });

  test("/copyright renders its heading", () => {
    expect(h1Of(CopyrightRoute)).toBe("Copyright");
  });

  test("/copyright links the source code and its GPLv3 license", () => {
    const hrefs = linksOf(CopyrightRoute).map(([, href]) => href);
    expect(hrefs).toContain("https://github.com/ianjmacintosh/dreamport");
    expect(hrefs).toContain("https://www.gnu.org/licenses/gpl-3.0.html");
  });

  test("/copyright links CC BY-SA 3.0 for the Lean Canvas adaptation", () => {
    const hrefs = linksOf(CopyrightRoute).map(([, href]) => href);
    expect(hrefs).toContain("https://creativecommons.org/licenses/by-sa/3.0/");
  });
});
