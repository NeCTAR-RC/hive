import { describe, expect, it, vi } from "vitest";
import { wakeMocks } from "./wake";

describe("wakeMocks", () => {
  it("leaves a worker that still answers the probe alone", async () => {
    const restart = vi.fn(() => Promise.resolve());
    const probe = () => Promise.resolve(new Response(null, { status: 204 }));
    await expect(wakeMocks({ probe, restart })).resolves.toBe(false);
    expect(restart).not.toHaveBeenCalled();
  });

  it("restarts when the dev server answered instead", async () => {
    const restart = vi.fn(() => Promise.resolve());
    const probe = () => Promise.resolve(new Response("<!doctype html>"));
    await expect(wakeMocks({ probe, restart })).resolves.toBe(true);
    expect(restart).toHaveBeenCalledOnce();
  });

  it("restarts when the probe fails outright", async () => {
    const restart = vi.fn(() => Promise.resolve());
    const probe = () => Promise.reject(new TypeError("Failed to fetch"));
    await expect(wakeMocks({ probe, restart })).resolves.toBe(true);
    expect(restart).toHaveBeenCalledOnce();
  });
});
