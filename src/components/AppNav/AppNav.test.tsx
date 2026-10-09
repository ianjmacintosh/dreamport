import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test, vi } from "vitest";

import Dropdown from "../Dropdown";
import Link from "../Link";
import AppNav from "./AppNav";

type NavElement = ReactElement<{
  href?: string;
  className?: string;
  label?: ReactNode;
  "aria-label"?: string;
  current?: boolean;
  children?: ReactNode;
  onClick?: () => void;
}>;

/**
 * Every element nested inside `AppNav`, flattened depth-first. No DOM
 * renderer is available in the unit suite, so this reads the element tree
 * `AppNav` returns directly — same approach `Header.test.tsx` uses — without
 * depending on how the row is grouped. The Dropdowns' open/close/keyboard
 * behavior is Base UI's, covered end to end in `e2e/login.spec.ts`; which
 * of the two Dropdowns shows at a given width is CSS, not tested here.
 */
function descendants(node: ReactNode): NavElement[] {
  return Children.toArray(node)
    .filter(isValidElement)
    .flatMap((child) => {
      const element = child as NavElement;
      return [element, ...descendants(element.props.children)];
    });
}

function navElements({
  email = "someone@example.com",
  onLogout = () => {},
  pathname = "/app",
}: {
  email?: string;
  onLogout?: () => void;
  pathname?: string;
} = {}): NavElement[] {
  return descendants(AppNav({ email, onLogout, pathname }).props.children);
}

/** The visible text inside an element — its string children, recursively,
 * so an icon beside a label doesn't change what the label says. */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string"
        ? child
        : isValidElement(child)
          ? textOf((child as NavElement).props.children)
          : "",
    )
    .join("");
}

/** The link on the bar (not inside a menu) whose visible text is `text`. */
function barLink(elements: NavElement[], text: string) {
  return elements.find((el) => el.type === Link && textOf(el) === text);
}

/** A Dropdown, and its own items in panel order. */
function menu(found: NavElement | undefined) {
  const items = Children.toArray(found?.props.children).filter(
    isValidElement,
  ) as NavElement[];
  return { found, items };
}

/** The account Dropdown — the one whose trigger shows the email. */
function accountMenu(elements: NavElement[], email = "someone@example.com") {
  return menu(
    elements.find((el) => el.type === Dropdown && el.props.label === email),
  );
}

/** The phone ☰ Dropdown — the one whose trigger is named "Menu". */
function phoneMenu(elements: NavElement[]) {
  return menu(
    elements.find(
      (el) => el.type === Dropdown && el.props["aria-label"] === "Menu",
    ),
  );
}

describe("AppNav", () => {
  test("exists", () => {
    expect(AppNav).not.toBe(undefined);
  });

  test("shows the Dreamport wordmark first, linking to /app", () => {
    const links = navElements().filter((el) => el.type === Link);
    expect(textOf(links[0])).toBe("Dreamport");
    expect(links[0]?.props.href).toBe("/app");
  });

  test("never marks the wordmark current — it's the bar's, not a section", () => {
    expect(barLink(navElements(), "Dreamport")?.props.current).toBe(false);
  });

  test("links to the Products section (/app)", () => {
    expect(barLink(navElements(), "Products")?.props.href).toBe("/app");
  });

  test.each(["/app", "/app/products/abc123"])(
    "marks Products as the current section on %s",
    (pathname) => {
      const products = barLink(navElements({ pathname }), "Products");
      expect(products?.props.current).toBe(true);
    },
  );

  test.each(["/app/settings", "/app/paths", "/app/paths/abc123"])(
    "doesn't mark Products current on %s",
    (pathname) => {
      const products = barLink(navElements({ pathname }), "Products");
      expect(products?.props.current).toBe(false);
    },
  );

  test("links to Trailblazer (/app/paths) after Products", () => {
    const links = navElements().filter((el) => el.type === Link);
    const labels = links.map((el) => textOf(el));
    expect(labels.indexOf("Trailblazer")).toBe(labels.indexOf("Products") + 1);
    expect(barLink(navElements(), "Trailblazer")?.props.href).toBe(
      "/app/paths",
    );
  });

  test.each(["/app/paths", "/app/paths/abc123"])(
    "marks Trailblazer as the current section on %s",
    (pathname) => {
      const trailblazer = barLink(navElements({ pathname }), "Trailblazer");
      expect(trailblazer?.props.current).toBe(true);
    },
  );

  test.each(["/app", "/app/products/abc123", "/app/settings", "/app/pathsx"])(
    "doesn't mark Trailblazer current on %s",
    (pathname) => {
      const trailblazer = barLink(navElements({ pathname }), "Trailblazer");
      expect(trailblazer?.props.current).toBe(false);
    },
  );

  test("the account dropdown's trigger is the signed-in email", () => {
    expect(accountMenu(navElements()).found).toBeDefined();
  });

  test("the account dropdown holds Settings, a separator, then Log out", () => {
    const [settings, separator, logout] = accountMenu(navElements()).items;
    expect(settings.type).toBe(Dropdown.LinkItem);
    expect(settings.props.href).toBe("/app/settings");
    expect(textOf(settings)).toBe("Settings");
    expect(separator.type).toBe(Dropdown.Separator);
    expect(logout.type).toBe(Dropdown.Item);
    expect(textOf(logout)).toBe("Log out");
  });

  test("the phone menu lists Products and Trailblazer, then Settings and Log out under who you're signed in as", () => {
    const [products, trailblazer, separator, group] = phoneMenu(
      navElements({ pathname: "/app/paths/abc123" }),
    ).items;
    expect(products.type).toBe(Dropdown.LinkItem);
    expect(products.props.href).toBe("/app");
    expect(textOf(products)).toBe("Products");
    expect(products.props.current).toBe(false);
    expect(trailblazer.type).toBe(Dropdown.LinkItem);
    expect(trailblazer.props.href).toBe("/app/paths");
    expect(textOf(trailblazer)).toBe("Trailblazer");
    expect(trailblazer.props.current).toBe(true);
    expect(separator.type).toBe(Dropdown.Separator);
    expect(group.type).toBe(Dropdown.Group);
    expect(textOf(group.props.label)).toBe("Signed in as someone@example.com");
    const [settings, logout] = Children.toArray(group.props.children).filter(
      isValidElement,
    ) as NavElement[];
    expect(settings.props.href).toBe("/app/settings");
    expect(textOf(logout)).toBe("Log out");
  });

  test.each([
    ["the account menu", accountMenu],
    ["the phone menu", phoneMenu],
  ])("calls onLogout when Log out is chosen from %s", (_, which) => {
    const onLogout = vi.fn();
    const logout = descendants(
      which(navElements({ onLogout })).found?.props.children,
    ).find((el) => textOf(el) === "Log out");
    logout?.props.onClick?.();
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
