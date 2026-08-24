import { describe, expect, test } from "vitest";

import App from "./App";

describe("App", () => {
  test("exists", () => {
    expect(App).not.toBe(undefined);
  });
});
