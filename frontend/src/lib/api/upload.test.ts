import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, setCsrfToken, UNAVAILABLE_MESSAGE } from "./client";
import { uploadFile } from "./upload";

// A minimal XMLHttpRequest double: records headers and lets the test settle
// the request the way the browser would.
class FakeXhr {
  static last: FakeXhr | null = null;
  headers: Record<string, string> = {};
  method = "";
  url = "";
  status = 0;
  responseType = "";
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;
  sent: unknown = null;
  aborted = false;

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
  send(body: unknown) {
    this.sent = body;
  }
  abort() {
    this.aborted = true;
    this.onabort?.();
    this.onloadend?.();
  }
  respond(status: number, text: string) {
    this.status = status;
    this.responseText = text;
    this.onload?.();
    this.onloadend?.();
  }
}

describe("uploadFile", () => {
  beforeEach(() => {
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    document.cookie = "hive_csrf=cookie-token";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setCsrfToken(null);
    FakeXhr.last = null;
  });

  it("PUTs the file with the CSRF header and reports progress", async () => {
    setCsrfToken("probe-token");
    const progress = vi.fn();
    const file = new Blob(["abc"]);
    const pending = uploadFile<{ ok: boolean }>("/api/upload/x", file, {
      onProgress: progress,
    });
    const xhr = FakeXhr.last!;
    expect(xhr.method).toBe("PUT");
    expect(xhr.headers["X-CSRF-Token"]).toBe("probe-token");
    expect(xhr.sent).toBe(file);
    xhr.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 3,
    } as ProgressEvent);
    expect(progress).toHaveBeenCalledWith(1, 3);
    xhr.respond(201, '{"ok":true}');
    await expect(pending).resolves.toEqual({ ok: true });
  });

  it("falls back to the cookie and maps error bodies", async () => {
    const pending = uploadFile("/api/upload/x", new Blob(["a"]));
    const xhr = FakeXhr.last!;
    expect(xhr.headers["X-CSRF-Token"]).toBe("cookie-token");
    xhr.respond(502, "<html>Bad Gateway</html>");
    const error = (await pending.catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe(UNAVAILABLE_MESSAGE);
  });

  it("aborts through the signal and drops its listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = uploadFile("/api/upload/x", new Blob(["a"]), {
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeXhr.last!.aborted).toBe(true);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
