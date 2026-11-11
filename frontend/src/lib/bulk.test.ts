import { describe, expect, it } from "vitest";
import { settleAll, splitEligible } from "./bulk";

/** Resolves after `ms`, so the cases can finish out of order. */
const after = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("settleAll", () => {
  it("keeps the items' order whatever order they finish in", async () => {
    const outcome = await settleAll([30, 10, 20], (ms) => after(ms));
    expect(outcome).toEqual({ succeeded: [30, 10, 20], failed: [] });
  });

  it("attempts every item and returns each rejection as a value", async () => {
    const attempted: string[] = [];
    const refused = new Error("in use");
    const outcome = await settleAll(["a", "b", "c", "d"], (name) => {
      attempted.push(name);
      return name === "b" || name === "d"
        ? Promise.reject(refused)
        : Promise.resolve();
    });
    expect(attempted).toEqual(["a", "b", "c", "d"]);
    expect(outcome.succeeded).toEqual(["a", "c"]);
    expect(outcome.failed).toEqual([
      { item: "b", error: refused },
      { item: "d", error: refused },
    ]);
  });

  it("captures a synchronous throw and a non-Error rejection", async () => {
    const outcome = await settleAll([1, 2], (n) => {
      if (n === 1) throw new Error("sync");
      // A rejection that is not an Error is what this case checks.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return Promise.reject("plain");
    });
    expect(outcome.succeeded).toEqual([]);
    expect(outcome.failed.map((f) => f.item)).toEqual([1, 2]);
    expect((outcome.failed[0]?.error as Error).message).toBe("sync");
    expect(outcome.failed[1]?.error).toBe("plain");
  });

  it("settles an empty batch at once", async () => {
    expect(await settleAll([], () => after(1))).toEqual({
      succeeded: [],
      failed: [],
    });
  });
});

describe("splitEligible", () => {
  it("keeps the selection's order in both lists", () => {
    expect(splitEligible([1, 2, 3, 4, 5], (n) => n % 2 === 1)).toEqual({
      eligible: [1, 3, 5],
      skipped: [2, 4],
    });
  });
});
