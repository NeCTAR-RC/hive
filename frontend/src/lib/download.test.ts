import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadText, downloadUrl } from "./download";

/** The anchors the helpers click, in order. */
let clicks: HTMLAnchorElement[] = [];

beforeEach(() => {
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push(this);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("downloadText", () => {
  it("saves text through a temporary object URL, released afterwards", async () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:hive/1";
    });
    const revokeObjectURL = vi.fn();
    // jsdom has no object URLs; a URL class with the two statics stands in.
    vi.stubGlobal(
      "URL",
      Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
    );

    downloadText("key.pem", "PRIVATE", "application/x-pem-file");

    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.download).toBe("key.pem");
    expect(clicks[0]!.href).toBe("blob:hive/1");
    expect(clicks[0]!.isConnected).toBe(false);
    expect(created[0]!.type).toBe("application/x-pem-file");
    expect(await created[0]!.text()).toBe("PRIVATE");
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:hive/1");
  });
});

describe("downloadUrl", () => {
  it("saves a same-origin URL, with a filename when one is given", () => {
    downloadUrl("/api/reservations/r1/calendar.ics", "r1.ics");
    downloadUrl("/api/api-access/openrc");
    expect(clicks.map((anchor) => anchor.getAttribute("href"))).toEqual([
      "/api/reservations/r1/calendar.ics",
      "/api/api-access/openrc",
    ]);
    expect(clicks.map((anchor) => anchor.download)).toEqual(["r1.ics", ""]);
    expect(clicks.every((anchor) => !anchor.isConnected)).toBe(true);
  });
});
