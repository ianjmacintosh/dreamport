import { describe, expect, test } from "vitest";

import Homepage from "./Homepage";

describe("Homepage", () => {
  test("exists", () => {
    expect(Homepage).not.toBe(undefined);
  });
});
