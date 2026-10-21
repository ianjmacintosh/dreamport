import { expect, test } from "vitest";

import { parseReturnTo } from "./return-to";

test("keeps a path on this site, query and all", () => {
  expect(parseReturnTo("/app/paths/dream-sequence?version=1")).toBe(
    "/app/paths/dream-sequence?version=1",
  );
});

test("drops another site, a relative path, and anything that isn't text", () => {
  for (const value of [
    "//evil.example/app",
    "/\\evil.example/app",
    "/\t/evil.example/app",
    "/\n/evil.example/app",
    "\\/evil.example/app",
    "https://evil.example/app",
    "javascript:alert(1)",
    "app/paths",
    "",
    1,
    null,
    undefined,
  ]) {
    expect(parseReturnTo(value)).toBeUndefined();
  }
});
