import { describe, expect, it } from "vitest";
import {
  firstStepWithError,
  isBefore,
  stepAfter,
  stepBefore,
  stepOrder,
} from "./steps";

const steps = {
  details: { fields: ["name", "vip_subnet_id"] },
  listener: { fields: ["create_listener", "listener"] },
  members: { fields: ["members"] },
};
const order = stepOrder(steps);

describe("wizard steps", () => {
  it("run in the order the record declares them", () => {
    expect(order).toStrictEqual(["details", "listener", "members"]);
  });

  it.each([
    ["details", "listener"],
    ["listener", "members"],
    ["members", "members"],
  ] as const)("Next from %s shows %s", (current, expected) => {
    expect(stepAfter(order, current)).toBe(expected);
  });

  it.each([
    ["members", "listener"],
    ["listener", "details"],
    ["details", "details"],
  ] as const)("Back from %s shows %s", (current, expected) => {
    expect(stepBefore(order, current)).toBe(expected);
  });

  it("opens only completed steps from the markers", () => {
    expect(isBefore(order, "details", "members")).toBe(true);
    expect(isBefore(order, "members", "members")).toBe(false);
    expect(isBefore(order, "members", "details")).toBe(false);
  });
});

describe("firstStepWithError", () => {
  it.each<[string, object, string | undefined]>([
    ["a top-level field", { vip_subnet_id: {} }, "details"],
    ["a nested part", { listener: { tls_ref: {} } }, "listener"],
    ["a field array item", { members: [{ address: {} }] }, "members"],
    [
      "the earliest of several",
      { members: [], listener: { protocol: {} } },
      "listener",
    ],
    ["a field no step lists", { unknown: {} }, undefined],
    ["no errors", {}, undefined],
  ])("finds %s", (_, errors, expected) => {
    expect(firstStepWithError(order, steps, errors)).toBe(expected);
  });

  it("counts a nested field for the step listing its root", () => {
    const nested = { pool: { fields: ["members.0.address"] } };
    expect(
      firstStepWithError(stepOrder(nested), nested, { members: [{}] }),
    ).toBe("pool");
  });
});
