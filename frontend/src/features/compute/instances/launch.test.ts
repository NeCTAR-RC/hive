import { describe, expect, it } from "vitest";
import { defaultNetworkIds } from "./launch";

const classic = { id: "classic", is_classic: true };
const alpha = { id: "a", is_classic: false };
const bravo = { id: "b", is_classic: false };

describe("defaultNetworkIds", () => {
  it("preselects the classic network wherever it sits", () => {
    expect(defaultNetworkIds([alpha, classic, bravo])).toEqual(["classic"]);
  });

  it("preselects a network only when it is the sole choice", () => {
    expect(defaultNetworkIds([alpha])).toEqual(["a"]);
    expect(defaultNetworkIds([alpha, bravo])).toEqual([]);
  });

  it("selects nothing when no network is offered", () => {
    expect(defaultNetworkIds([])).toEqual([]);
    expect(defaultNetworkIds(null)).toEqual([]);
    expect(defaultNetworkIds(undefined)).toEqual([]);
  });
});
