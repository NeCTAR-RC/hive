import { describe, expect, it } from "vitest";
import { extendError, type ExtendBounds } from "./extend";

const window: ExtendBounds = {
  currentEnd: "2026-10-20",
  minEnd: "2026-10-21",
  maxEnd: "2026-10-28",
};

describe("extendError", () => {
  it.each(["2026-10-21", "2026-10-25", "2026-10-28"])("accepts %s", (end) => {
    expect(extendError(end, window)).toBeNull();
  });

  it("asks for a date when there is none", () => {
    expect(extendError("", window)).toBe("Choose a new end date");
  });

  it("refuses the current end and earlier days", () => {
    expect(extendError("2026-10-20", window)).toBe(
      "Choose a day after the current end",
    );
    expect(extendError("2026-10-01", window)).toBe(
      "Choose a day after the current end",
    );
  });

  it("names the window for a day past it", () => {
    expect(extendError("2026-10-29", window)).toBe(
      "Choose a date from 21 Oct 2026 to 28 Oct 2026",
    );
  });

  it("names the one bound the window has", () => {
    expect(extendError("2026-10-29", { ...window, minEnd: null })).toBe(
      "Choose a date up to 28 Oct 2026",
    );
    expect(extendError("2026-10-21", { ...window, minEnd: "2026-10-23" })).toBe(
      "Choose a date from 23 Oct 2026 to 28 Oct 2026",
    );
    expect(
      extendError("2026-10-21", {
        ...window,
        minEnd: "2026-10-23",
        maxEnd: null,
      }),
    ).toBe("Choose 23 Oct 2026 or a later date");
  });

  it("checks only the current end until the window has loaded", () => {
    const loading = {
      currentEnd: "2026-10-20",
      minEnd: undefined,
      maxEnd: undefined,
    };
    expect(extendError("2026-12-31", loading)).toBeNull();
    expect(extendError("2026-10-19", loading)).toBe(
      "Choose a day after the current end",
    );
  });
});
