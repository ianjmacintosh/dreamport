import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import { Route as AboutRoute } from "./about";
import { Route as PrivacyRoute } from "./privacy";
import { Route as TermsRoute } from "./terms";

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

describe("signed-out info pages", () => {
  test("/about renders its heading", () => {
    expect(h1Of(AboutRoute)).toBe("About Dreamport");
  });

  test("/privacy renders its heading", () => {
    expect(h1Of(PrivacyRoute)).toBe("Privacy Policy");
  });

  test("/terms renders its heading", () => {
    expect(h1Of(TermsRoute)).toBe("Terms of Service");
  });
});
