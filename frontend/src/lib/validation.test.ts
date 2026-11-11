import { describe, expect, it } from "vitest";
import { maxLength, tooLongMessage } from "./validation";

/** The first message the schema gives for `value`, or null when it passes. */
function messageFor(schema: ReturnType<typeof maxLength>, value: string) {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

describe("maxLength", () => {
  it("accepts text up to the limit and says how long it may be", () => {
    const schema = maxLength(5);
    expect(messageFor(schema, "abcde")).toBeNull();
    expect(messageFor(schema, "abcdef")).toBe("Use 5 characters or fewer");
    expect(tooLongMessage(255)).toBe("Use 255 characters or fewer");
  });

  it("trims before counting unless told not to", () => {
    expect(maxLength(3).parse("  abc  ")).toBe("abc");
    expect(messageFor(maxLength(3, { trim: false }), " abc")).toBe(
      "Use 3 characters or fewer",
    );
    expect(maxLength(5, { trim: false }).parse(" ab ")).toBe(" ab ");
  });

  it("chains further rules after the limit", () => {
    const schema = maxLength(10).min(1, "Enter a name");
    expect(messageFor(schema, "")).toBe("Enter a name");
    expect(messageFor(schema, "x".repeat(11))).toBe(
      "Use 10 characters or fewer",
    );
  });
});
