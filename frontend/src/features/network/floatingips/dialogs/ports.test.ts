import { describe, expect, it } from "vitest";
import { checkPortPairing, checkPorts } from "./ports";

describe("checkPorts", () => {
  it.each(["22", " 2200:2210 ", "1", "65535", "80:80"])(
    "accepts %j",
    (value) => {
      expect(checkPorts(value)).toBeNull();
    },
  );

  it.each([
    { value: "", problem: "Enter a port, or a range as start:end" },
    { value: "ssh", problem: "Enter a port, or a range as start:end" },
    { value: "22-25", problem: "Enter a port, or a range as start:end" },
    { value: "0", problem: "Ports run from 1 to 65535" },
    { value: "65536", problem: "Ports run from 1 to 65535" },
    { value: "100:70000", problem: "Ports run from 1 to 65535" },
    {
      value: "2210:2200",
      problem: "The range start must not be after its end",
    },
  ])("rejects $value: $problem", ({ value, problem }) => {
    expect(checkPorts(value)).toBe(problem);
  });
});

describe("checkPortPairing", () => {
  it.each([
    ["2222", "22"],
    ["2200:2210", "22"],
    ["2200:2210", "3300:3310"],
    ["bad", "22:30"],
  ])("pairs %s with %s", (external, internal) => {
    expect(checkPortPairing(external, internal)).toBeNull();
  });

  it("refuses a range behind a single external port", () => {
    expect(checkPortPairing("2222", "22:23")).toBe(
      "The internal port must be a single port, as the external one is",
    );
  });

  it("refuses ranges of different lengths", () => {
    expect(checkPortPairing("2200:2210", "22:25")).toBe(
      "The internal port must be a single port or a range of 11 ports, as long as the external one",
    );
  });
});
