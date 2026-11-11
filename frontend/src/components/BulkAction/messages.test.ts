import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/errors";
import {
  DELETE,
  confirmTitle,
  errorReason,
  skippedNote,
  summarise,
  type Noun,
} from "./messages";

const KEY_PAIR: Noun = { one: "key pair", many: "key pairs" };
const name = (item: string) => item;
const refused = new ApiError(409, { message: "the key pair is in use" });

describe("confirmTitle", () => {
  it("names one item and counts several", () => {
    expect(confirmTitle(DELETE, ["web"], KEY_PAIR, name)).toBe(
      "Delete key pair web?",
    );
    expect(confirmTitle(DELETE, ["a", "b"], KEY_PAIR, name)).toBe(
      "Delete 2 key pairs?",
    );
  });
});

describe("summarise", () => {
  it.each([
    {
      case: "every item succeeded",
      outcome: { succeeded: ["a", "b", "c"], failed: [] },
      expected: { tone: "success", text: "Deleted 3 key pairs." },
    },
    {
      case: "the one item succeeded",
      outcome: { succeeded: ["web"], failed: [] },
      expected: { tone: "success", text: "Deleted key pair web." },
    },
    {
      case: "some items failed",
      outcome: {
        succeeded: ["a", "c", "e"],
        failed: [
          { item: "b", error: refused },
          { item: "d", error: new Error("later reason") },
        ],
      },
      expected: {
        tone: "danger",
        text: "Could not delete 2 of 5 key pairs: the key pair is in use",
      },
    },
    {
      case: "the one item failed",
      outcome: { succeeded: [], failed: [{ item: "web", error: refused }] },
      expected: {
        tone: "danger",
        text: "Could not delete key pair web: the key pair is in use",
      },
    },
    {
      case: "a failure without a reason",
      outcome: { succeeded: ["a"], failed: [{ item: "b", error: null }] },
      expected: { tone: "danger", text: "Could not delete 1 of 2 key pairs." },
    },
  ])("$case", ({ outcome, expected }) => {
    expect(summarise(outcome, DELETE, KEY_PAIR, name)).toEqual(expected);
  });
});

describe("errorReason", () => {
  it.each([
    { error: refused, reason: "the key pair is in use" },
    { error: "plain words", reason: "plain words" },
    { error: new Error(""), reason: null },
    { error: undefined, reason: null },
  ])("$error reads as $reason", ({ error, reason }) => {
    expect(errorReason(error)).toBe(reason);
  });
});

describe("skippedNote", () => {
  it("names every skipped item and why", () => {
    expect(
      skippedNote(["a", "b"], name, "not available in the current state"),
    ).toBe("Skipped a, b: not available in the current state.");
  });
});
