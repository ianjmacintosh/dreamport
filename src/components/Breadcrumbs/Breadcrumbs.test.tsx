import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import Breadcrumbs from "./Breadcrumbs";

// The real `Link` needs a router. This stand-in renders what `Link` itself
// does with `current` (see `Link.tsx`), and flags a `current` left out, which
// would hand the choice to the router.
vi.mock("../Link", () => ({
  default: ({
    href,
    current,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    current?: boolean;
  }) => (
    <a
      href={href}
      aria-current={current ? "page" : undefined}
      data-router-decides={current === undefined ? "" : undefined}
      {...rest}
    />
  ),
}));

function render(...args: Parameters<typeof Breadcrumbs>) {
  return renderToStaticMarkup(<Breadcrumbs {...args[0]} />);
}

const worksheetTrail = {
  trail: [
    { label: "Products", href: "/app" },
    { label: "Tarot", href: "/app/products/p1" },
    { label: "Journey", href: "/app/products/p1/journey" },
  ],
  current: "Product Summary",
} satisfies Parameters<typeof Breadcrumbs>[0];

describe("Breadcrumbs", () => {
  test("is a navigation landmark named Breadcrumb, holding an ordered list", () => {
    expect(render(worksheetTrail)).toMatch(
      /^<nav aria-label="Breadcrumb"[^>]*>.*<ol[^>]*>.*<\/ol>.*<\/nav>$/,
    );
  });

  test("links every ancestor, root first, never marked as the current page", () => {
    const html = render(worksheetTrail);
    const links = [...html.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)];
    expect(links.map(([, , text]) => text)).toEqual([
      "Products",
      "Tarot",
      "Journey",
    ]);
    expect(
      links.map(([, attrs]) => attrs.match(/href="([^"]*)"/)?.[1]),
    ).toEqual(["/app", "/app/products/p1", "/app/products/p1/journey"]);
    for (const [, attrs] of links) {
      expect(attrs).not.toContain("aria-current");
      expect(attrs).not.toContain("data-router-decides");
    }
  });

  test("ends with the current page, unlinked and aria-current=page", () => {
    const items = render(worksheetTrail).match(/<li[^>]*>.*?<\/li>/g) ?? [];
    expect(items).toHaveLength(4);
    const last = items.at(-1) ?? "";
    expect(last).not.toContain("<a");
    expect(last).toMatch(
      /<span[^>]*aria-current="page"[^>]*>Product Summary<\/span>/,
    );
  });

  test("puts a separator after each ancestor, hidden from screen readers, and none after the current page", () => {
    const items = render(worksheetTrail).match(/<li[^>]*>.*?<\/li>/g) ?? [];
    for (const item of items.slice(0, -1)) {
      expect(item).toMatch(/<\/a><svg[^>]*aria-hidden="true"/);
    }
    expect(items.at(-1)).not.toContain("<svg");
  });

  test("also links up to the parent page alone, for phones", () => {
    const up = render(worksheetTrail).match(
      /<a ([^>]*class="breadcrumbs-up"[^>]*)>(.*?)<\/a>/,
    );
    expect(up?.[1]).toContain('href="/app/products/p1/journey"');
    expect(up?.[1]).not.toContain("aria-current");
    expect(up?.[1]).not.toContain("data-router-decides");
    expect(up?.[2]).toMatch(
      /<svg[^>]*aria-hidden="true".*>Back to Journey<\/span>$/,
    );
  });
});
