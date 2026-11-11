import { describe, expect, it } from "vitest";
import {
  defineStatus,
  enumLabel,
  heatActivity,
  heatStatus,
  humanise,
} from "./status";

describe("humanise", () => {
  it.each([
    ["ACTIVE", "Active"],
    ["NO_MONITOR", "No monitor"],
    ["in-use", "In use"],
    ["error_extending", "Error extending"],
    ["key_pairs", "Key pairs"],
    ["REDIRECT_TO_URL", "Redirect to URL"],
    ["SOURCE_IP_PORT", "Source IP port"],
    ["HTTP_COOKIE", "HTTP cookie"],
    ["", ""],
  ])("%j reads %j", (raw, expected) => {
    expect(humanise(raw)).toBe(expected);
  });
});

describe("enumLabel", () => {
  it("spaces out underscores and keeps the case", () => {
    expect(enumLabel("ROUND_ROBIN")).toBe("ROUND ROBIN");
    expect(enumLabel("TLS-HELLO")).toBe("TLS-HELLO");
    expect(enumLabel("SHUTOFF")).toBe("SHUTOFF");
  });
});

describe("heatStatus", () => {
  it.each([
    ["CREATE_IN_PROGRESS", "progress", "Create in progress", true],
    ["UPDATE_COMPLETE", "success", "Update complete", false],
    ["ROLLBACK_FAILED", "danger", "Rollback failed", false],
    ["DELETE_COMPLETE", "neutral", "Delete complete", false],
    ["INIT", "neutral", "INIT", false],
    [null, "neutral", "Unknown", false],
    [undefined, "neutral", "Unknown", false],
  ])("%s reads %s, %s", (status, tone, label, isTransitional) => {
    expect(heatStatus(status)).toEqual({ tone, label, isTransitional });
  });
});

describe("heatActivity", () => {
  it.each([
    ["CREATE_IN_PROGRESS", "being created"],
    ["ROLLBACK_IN_PROGRESS", "being rolled back"],
    ["SUSPEND_IN_PROGRESS", "being suspended"],
    ["CREATE_FAILED", null],
    ["SUSPEND_COMPLETE", null],
    ["PAUSE_IN_PROGRESS", null],
    [null, null],
  ])("%s reads %j", (status, expected) => {
    expect(heatActivity(status)).toBe(expected);
  });
});

describe("defineStatus", () => {
  const status = defineStatus({
    transitional: ["BUILD", "ACTIVE_PENDING"],
    success: ["ACTIVE", "ACTIVE_PENDING"],
    info: ["ATTACHED"],
    warning: ["PAUSED"],
    danger: (value) => value.startsWith("ERROR"),
    neutral: ["DOWN"],
    labels: { BUILD: "Building" },
  });

  it.each([
    ["BUILD", "progress"],
    ["ACTIVE", "success"],
    ["ATTACHED", "info"],
    ["PAUSED", "warning"],
    ["ERROR_DELETING", "danger"],
    ["DOWN", "neutral"],
    ["SOMETHING_ELSE", "neutral"],
    [null, "neutral"],
  ])("%s takes the %s tone", (raw, tone) => {
    expect(status.tone(raw)).toBe(tone);
  });

  it("reads a busy status as busy, even when another list names it", () => {
    expect(status.tone("ACTIVE_PENDING")).toBe("progress");
    expect(status.isTransitional("ACTIVE_PENDING")).toBe(true);
    expect(status.isTransitional("ACTIVE")).toBe(false);
    expect(status.isTransitional(null)).toBe(false);
  });

  it("labels from the table, then in sentence case", () => {
    expect(status.label("BUILD")).toBe("Building");
    expect(status.label("ERROR_DELETING")).toBe("Error deleting");
    expect(status.label(undefined)).toBe("Unknown");
  });

  it("gives an unnamed status its own tone, label and missing word", () => {
    const other = defineStatus({
      success: ["ACTIVE"],
      otherwise: "info",
      unlisted: "as-is",
      missing: "",
    });
    expect(other.tone("MIGRATING")).toBe("info");
    expect(other.tone("")).toBe("neutral");
    expect(other.label("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(other.label(null)).toBe("");
  });
});
