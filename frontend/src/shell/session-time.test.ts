import { describe, expect, it } from "vitest";
import { secondsLeft, warningMinutes } from "./session-time";

/** A session the server says ends an hour after it answered. */
const SESSION = { expires_at: 1_000_000 + 3600, server_time: 1_000_000 };

describe("secondsLeft", () => {
  it.each([
    ["just received", 0, 3600],
    ["50 minutes later", 50 * 60, 600],
    ["after the session ended", 2 * 3600, -3600],
  ])("%s", (_, elapsedS, expected) => {
    const receivedAt = 5_000_000;
    expect(secondsLeft(SESSION, receivedAt, receivedAt + elapsedS * 1000)).toBe(
      expected,
    );
  });

  it("ignores how far the browser clock is from the server's", () => {
    // The browser's clock reads a day ahead of the server's.
    const receivedAt = (SESSION.server_time + 86_400) * 1000;
    expect(secondsLeft(SESSION, receivedAt, receivedAt + 60_000)).toBe(3540);
  });

  it("never counts time before the answer arrived", () => {
    expect(secondsLeft(SESSION, 5_000_000, 4_000_000)).toBe(3600);
  });
});

describe("warningMinutes", () => {
  it.each([
    [601, null],
    [600, 10],
    [89, 1],
    [20, 1],
    [-5, 1],
  ])("%j seconds left warns with %j minutes", (left, expected) => {
    expect(warningMinutes(left)).toBe(expected);
  });
});
