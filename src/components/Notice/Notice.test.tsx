import { isValidElement, type ReactElement } from "react";
import { describe, expect, test } from "vitest";

import Notice from "./Notice";

type Element = ReactElement<{ "aria-hidden"?: string; children?: unknown }>;

describe("Notice", () => {
  test("is a status region, its icon hidden from screen readers and its sentences kept as given", () => {
    const sentences = [<p key="a">Version 1 is published.</p>];
    const notice = Notice({ children: sentences }) as Element;
    const [icon, body] = notice.props.children as Element[];

    expect(notice.props).toMatchObject({ role: "status" });
    expect(isValidElement(icon) && icon.props["aria-hidden"]).toBe("true");
    expect(body.props.children).toBe(sentences);
  });
});
