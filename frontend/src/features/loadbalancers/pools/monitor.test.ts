import { describe, expect, it } from "vitest";
import { monitorRetries } from "./monitor";

describe("monitorRetries", () => {
  it.each([
    ["writes both counts", 3, 2, "3 / 2"],
    ["writes a zero count", 0, 3, "0 / 3"],
    ["is empty without the up count", null, 3, ""],
    ["is empty without the down count", 3, null, ""],
  ])("%s", (_, up, down, expected) => {
    expect(monitorRetries({ max_retries: up, max_retries_down: down })).toBe(
      expected,
    );
  });
});
