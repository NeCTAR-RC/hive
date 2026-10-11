import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  apiFetch,
  buildUrl,
  readCookie,
  setUnauthenticatedHandler,
} from "./client";

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buildUrl", () => {
  it("drops empty values and encodes the rest", () => {
    expect(buildUrl("/api/x", { a: 1, b: "", c: undefined, d: "e f" })).toBe(
      "/api/x?a=1&d=e+f",
    );
    expect(buildUrl("/api/x")).toBe("/api/x");
  });
});

describe("apiFetch", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    document.cookie = "hive_csrf=token-123";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthenticatedHandler(null);
    fetchMock.mockReset();
  });

  it("reads the csrf cookie", () => {
    expect(readCookie("hive_csrf")).toBe("token-123");
    expect(readCookie("missing")).toBeUndefined();
  });

  it("sends the CSRF header on unsafe methods only", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await apiFetch("/api/thing", { method: "POST", json: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("X-CSRF-Token")).toBe("token-123");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init.credentials).toBe("same-origin");

    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await apiFetch("/api/thing");
    const [, getInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((getInit.headers as Headers).get("X-CSRF-Token")).toBeNull();
  });

  it("turns the error envelope into an ApiError and signals 401s", async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        error: "session_expired",
        message: "the login session has expired",
        request_id: "req-1",
        login_url: "https://accounts.test/login?return-path=x",
      }),
    );
    const error = await apiFetch("/api/me").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const api = error as ApiError;
    expect(api.status).toBe(401);
    expect(api.code).toBe("session_expired");
    expect(api.requestId).toBe("req-1");
    expect(api.loginUrl).toContain("accounts.test");
    expect(handler).toHaveBeenCalledWith(api);
  });

  it("returns undefined for 204 and wraps network failures", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await apiFetch("/api/auth/logout", { method: "POST" })).toBe(
      undefined,
    );
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await apiFetch("/api/me").catch((e: unknown) => e);
    expect((error as ApiError).code).toBe("network");
    expect((error as ApiError).status).toBe(0);
  });
});
