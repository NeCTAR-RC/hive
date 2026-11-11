import { describe, expect, it } from "vitest";
import { createPageToasts } from "./pageToasts";

describe("createPageToasts", () => {
  it("leaves behind the toasts of other pages, once", () => {
    const toasts = createPageToasts();
    toasts.raised("a", "/network/networks/net-1");
    toasts.raised("b", "/network/floating-ips");
    expect(toasts.leftBehind("/network/floating-ips")).toEqual(["a"]);
    expect(toasts.leftBehind("/network/floating-ips")).toEqual([]);
    expect(toasts.leftBehind("/network/topology")).toEqual(["b"]);
  });

  it("forgets a toast the user closed", () => {
    const toasts = createPageToasts();
    toasts.raised("a", "/one");
    toasts.closed("a");
    expect(toasts.leftBehind("/two")).toEqual([]);
  });
});
