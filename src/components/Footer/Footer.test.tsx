import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import Link from "../Link";
import Footer from "./Footer";

const COPYRIGHT = "© 2026 Ian J. MacIntosh";

type FooterElement = ReactElement<{
  href?: string;
  external?: boolean;
  children?: ReactNode;
}>;

/**
 * Every element nested inside the footer, flattened depth-first. No DOM
 * renderer is available in the unit suite, so this reads the element tree
 * `Footer` returns directly — same approach `AppNav.test.tsx` uses.
 */
function descendants(node: ReactNode): FooterElement[] {
  return Children.toArray(node)
    .filter(isValidElement)
    .flatMap((child) => {
      const element = child as FooterElement;
      return [element, ...descendants(element.props.children)];
    });
}

function footerElements(props: Parameters<typeof Footer>[0] = {}) {
  return descendants(Footer(props).props.children);
}

function links(props: Parameters<typeof Footer>[0] = {}) {
  return footerElements(props).filter((el) => el.type === Link);
}

function headings(props: Parameters<typeof Footer>[0] = {}) {
  return footerElements(props)
    .filter((el) => el.type === "h2")
    .map((el) => el.props.children);
}

describe("Footer", () => {
  test("app: copyright plus Privacy and Terms, no headings", () => {
    const elements = footerElements({ variant: "app" });
    expect(elements.some((el) => el.props.children === COPYRIGHT)).toBe(true);
    expect(
      links({ variant: "app" }).map((l) => [l.props.children, l.props.href]),
    ).toEqual([
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ]);
    expect(headings({ variant: "app" })).toEqual([]);
  });

  test("defaults to the app variant", () => {
    expect(Footer()).toEqual(Footer({ variant: "app" }));
  });

  test("marketing: About, Contact, Privacy, Terms in that order", () => {
    expect(
      links({ variant: "marketing" }).map((l) => [
        l.props.children,
        l.props.href,
      ]),
    ).toEqual([
      ["About", "/about"],
      ["Contact", "https://ianjmacintosh.com/contact"],
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ]);
  });

  test("marketing: Contact is the only external link", () => {
    const external = links({ variant: "marketing" }).filter(
      (l) => l.props.external,
    );
    expect(external.map((l) => l.props.children)).toEqual(["Contact"]);
  });

  test("marketing: Dreamport and Learn More headings, plus the copyright", () => {
    expect(headings({ variant: "marketing" })).toEqual([
      "Dreamport",
      "Learn More",
    ]);
    expect(
      footerElements({ variant: "marketing" }).some(
        (el) => el.props.children === COPYRIGHT,
      ),
    ).toBe(true);
  });
});
