import { describe, expect, it } from "vitest";
import { ttlSeconds } from "./ttl";

describe("ttlSeconds", () => {
  it.each([[0], [3600], [undefined]])("accepts %s", (ttl) => {
    expect(ttlSeconds.safeParse(ttl).success).toBe(true);
  });

  it.each([[-1], [1.5], [NaN]])(
    "refuses %s in the field's own words",
    (ttl) => {
      const result = ttlSeconds.safeParse(ttl);
      expect(result.error?.issues[0]?.message).toBe(
        "Enter a whole number of seconds",
      );
    },
  );
});
