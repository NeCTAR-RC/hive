import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiFetchText, buildUrl } from "./client";

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
    fetchMock.mockReset();
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

  it("turns the error envelope into an ApiError", async () => {
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
    expect(api.isAuth).toBe(true);
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

  it("reads a served file as text, and its failure as an ApiError", async () => {
    fetchMock.mockResolvedValue(
      new Response("-----BEGIN CERTIFICATE-----\n", {
        status: 200,
        headers: { "Content-Type": "application/x-pem-file" },
      }),
    );
    expect(await apiFetchText("/api/kubernetes/clusters/c-1/ca.pem")).toBe(
      "-----BEGIN CERTIFICATE-----\n",
    );
    fetchMock.mockResolvedValue(
      jsonResponse(409, {
        error: "conflict",
        message: "the cluster has no CA yet",
        request_id: "req-2",
      }),
    );
    const error = await apiFetchText("/api/x").catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(409);
  });
});
