import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import Radio from "./Radio";

describe("Radio", () => {
  test("is a real radio input carrying its name, value and checked state", () => {
    const html = renderToStaticMarkup(
      <Radio name="access" value="free" checked readOnly />,
    );
    expect(html).toMatch(/<input[^>]*type="radio"/);
    expect(html).toMatch(/name="access"/);
    expect(html).toMatch(/value="free"/);
    expect(html).toMatch(/checked=""/);
  });
});
