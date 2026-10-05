import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { describe, expect, test } from "vitest";

import Link from "../Link";
import Footer from "./Footer";

const COPYRIGHT = "© 2026 Dreamport";

type FooterElement = ReactElement<{
  href?: string;
  external?: boolean;
  className?: string;
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

/** The links inside the footer's link list (`<ul>`), leaving out any
 * link in running text such as the marketing blurb's. */
function listLinks(props: Parameters<typeof Footer>[0] = {}) {
  const list = footerElements(props).find((el) => el.type === "ul");
  return descendants(list?.props.children).filter((el) => el.type === Link);
}

function headings(props: Parameters<typeof Footer>[0] = {}) {
  return footerElements(props)
    .filter((el) => el.type === "h2")
    .map((el) => el.props.children);
}

describe("Footer", () => {
  test("app: copyright plus Privacy Policy, Terms of Service and Copyright, no headings", () => {
    const elements = footerElements({ variant: "app" });
    expect(elements.some((el) => el.props.children === COPYRIGHT)).toBe(true);
    expect(
      listLinks({ variant: "app" }).map((l) => [
        l.props.children,
        l.props.href,
      ]),
    ).toEqual([
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Copyright", "/copyright"],
    ]);
    expect(headings({ variant: "app" })).toEqual([]);
  });

  test("app: its links use the quiet link treatment", () => {
    expect(listLinks({ variant: "app" }).map((l) => l.props.className)).toEqual(
      ["link-quiet", "link-quiet", "link-quiet"],
    );
  });

  test("marketing: its links don't (the dark footer colors its own)", () => {
    expect(
      listLinks({ variant: "marketing" }).some(
        (l) => l.props.className === "link-quiet",
      ),
    ).toBe(false);
  });

  test("defaults to the app variant", () => {
    expect(Footer()).toEqual(Footer({ variant: "app" }));
  });

  test("marketing: Log In, About, Contact, Privacy, Terms, Copyright in that order", () => {
    expect(
      listLinks({ variant: "marketing" }).map((l) => [
        l.props.children,
        l.props.href,
      ]),
    ).toEqual([
      ["Log In", "/login"],
      ["About Dreamport", "/about"],
      ["Contact", "https://ianjmacintosh.com/contact"],
      ["Privacy Policy", "/privacy"],
      ["Terms of Service", "/terms"],
      ["Copyright", "/copyright"],
    ]);
  });

  test("marketing: Contact is the only external link", () => {
    const external = links({ variant: "marketing" }).filter(
      (l) => l.props.external,
    );
    expect(external.map((l) => l.props.children)).toEqual(["Contact"]);
  });

  test("marketing: the Dreamport blurb links to /login", () => {
    const blurb = footerElements({ variant: "marketing" }).find(
      (el) =>
        el.type === "p" &&
        descendants(el.props.children).some((child) => child.type === Link),
    );
    expect(
      descendants(blurb?.props.children)
        .filter((el) => el.type === Link)
        .map((l) => [l.props.children, l.props.href]),
    ).toEqual([["Log in", "/login"]]);
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
