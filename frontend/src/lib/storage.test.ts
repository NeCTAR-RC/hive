import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocal, writeLocal } from "./storage";

describe("local storage helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips JSON under the hive. prefix", () => {
    writeLocal("table.page-size", { size: 50 });
    expect(window.localStorage.getItem("hive.table.page-size")).toBe(
      '{"size":50}',
    );
    expect(readLocal("table.page-size", null)).toEqual({ size: 50 });
  });

  it("returns the fallback for missing or corrupt values", () => {
    expect(readLocal("missing", 25)).toBe(25);
    window.localStorage.setItem("hive.bad", "{not json");
    expect(readLocal("bad", "fallback")).toBe("fallback");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => writeLocal("x", 1)).not.toThrow();
    expect(readLocal("x", "fallback")).toBe("fallback");
  });
});
