import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import { csrfHeader, readCookie, setCsrfToken, xhrPut } from "./http";

/** The parts of XMLHttpRequest xhrPut uses, driven by the test. */
class FakeXhr {
  static last: FakeXhr | null = null;
  method = "";
  url = "";
  responseType = "";
  withCredentials = false;
  status = 0;
  responseText = "";
  headers: Record<string, string> = {};
  responseHeaders: Record<string, string> = {};
  sent: unknown = null;
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getResponseHeader(name: string) {
    return this.responseHeaders[name] ?? null;
  }
  send(body: unknown) {
    this.sent = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  progress(loaded: number, total: number) {
    this.upload.onprogress?.(
      new ProgressEvent("progress", { lengthComputable: true, loaded, total }),
    );
  }
  respond(status: number, text = "", headers: Record<string, string> = {}) {
    this.status = status;
    this.responseText = text;
    this.responseHeaders = headers;
    this.onload?.();
  }
}

function lastXhr(): FakeXhr {
  if (!FakeXhr.last) throw new Error("no request was made");
  return FakeXhr.last;
}

beforeEach(() => {
  FakeXhr.last = null;
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  document.cookie = "hive_csrf=token-123";
});

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(null);
});

describe("CSRF", () => {
  it("reads the cookie into the header", () => {
    expect(readCookie("hive_csrf")).toBe("token-123");
    expect(readCookie("missing")).toBeUndefined();
    expect(csrfHeader()).toEqual({ "X-CSRF-Token": "token-123" });
  });

  it("prefers the session probe's token, whatever the cookie is named", () => {
    setCsrfToken("probed-456");
    expect(csrfHeader()).toEqual({ "X-CSRF-Token": "probed-456" });
    setCsrfToken(undefined);
    expect(csrfHeader()).toEqual({ "X-CSRF-Token": "token-123" });
  });
});

describe("xhrPut", () => {
  const body = new Blob(["hello"]);

  it("sends the body and headers, reports progress and resolves on 2xx", async () => {
    const onProgress = vi.fn();
    const result = xhrPut("/api/upload", body, {
      headers: { "Content-Type": "text/plain" },
      onProgress,
      withCredentials: true,
    });
    const xhr = lastXhr();
    xhr.progress(2, 5);
    xhr.respond(201, '{"ok":true}', { ETag: '"abc"' });

    await expect(result).resolves.toEqual({
      text: '{"ok":true}',
      etag: '"abc"',
    });
    expect([xhr.method, xhr.url, xhr.withCredentials]).toEqual([
      "PUT",
      "/api/upload",
      true,
    ]);
    expect(xhr.headers).toEqual({ "Content-Type": "text/plain" });
    expect(xhr.sent).toBe(body);
    expect(onProgress).toHaveBeenCalledWith(2, 5);
  });

  it("rejects a 401 with the backend's ApiError", async () => {
    const result = xhrPut("/api/upload", body);
    lastXhr().respond(
      401,
      JSON.stringify({ error: "session_expired", message: "expired" }),
    );
    const error = await result.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).isAuth).toBe(true);
  });

  it("rejects a network failure as a network ApiError", async () => {
    const result = xhrPut("/api/upload", body);
    lastXhr().onerror?.();
    await expect(result).rejects.toMatchObject({ status: 0, code: "network" });
  });

  it("aborts with the signal and stops listening once settled", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = xhrPut("/api/upload", body, { signal: controller.signal });
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(lastXhr().aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("removes its abort listener after a normal finish", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = xhrPut("/api/upload", body, { signal: controller.signal });
    lastXhr().respond(204);
    await result;
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
    controller.abort();
    expect(lastXhr().aborted).toBe(false);
  });

  it("does not start when the signal has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      xhrPut("/api/upload", body, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last).toBeNull();
  });
});
