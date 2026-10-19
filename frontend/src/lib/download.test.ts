import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText, downloadUrl } from "./download";

describe("download helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("saves text through a temporary object URL", async () => {
    vi.useFakeTimers();
    const created: Blob[] = [];
    const createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:hive/1";
    });
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });

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

  it("saves a same-origin URL with an optional filename", () => {
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this);
    });
    downloadUrl("/api/reservations/r1/calendar.ics", "r1.ics");
    downloadUrl("/api/api-access/openrc");
    expect(clicks.map((a) => a.getAttribute("href"))).toEqual([
      "/api/reservations/r1/calendar.ics",
      "/api/api-access/openrc",
    ]);
    expect(clicks.map((a) => a.download)).toEqual(["r1.ics", ""]);
    expect(clicks.every((a) => !a.isConnected)).toBe(true);
  });
});
