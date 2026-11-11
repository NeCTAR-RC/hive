import { beforeEach, describe, expect, it, vi } from "vitest";
import { xhrPut } from "./http";
import { uploadFile } from "./upload";

// The transport itself is covered in http.test.ts; here only what
// uploadFile hands it and what it makes of the answer.
vi.mock("./http", async (importActual) => ({
  ...(await importActual<typeof import("./http")>()),
  xhrPut: vi.fn(),
}));

const put = vi.mocked(xhrPut);

beforeEach(() => {
  put.mockReset();
  document.cookie = "hive_csrf=token-123";
});

describe("uploadFile", () => {
  it("PUTs the file as octet-stream with the CSRF header and cookies", async () => {
    put.mockResolvedValue({ text: "{}", etag: null });
    const file = new Blob(["image bytes"]);
    const onProgress = vi.fn();
    const signal = new AbortController().signal;

    await uploadFile("/api/image/images/img-1/file", file, {
      onProgress,
      signal,
    });

    expect(put).toHaveBeenCalledExactlyOnceWith(
      "/api/image/images/img-1/file",
      file,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/octet-stream",
          "X-CSRF-Token": "token-123",
        },
        onProgress,
        signal,
        withCredentials: true,
      },
    );
  });

  it("passes no progress callback or signal when none is given", async () => {
    put.mockResolvedValue({ text: "", etag: null });
    await uploadFile("/api/upload", new Blob([]));
    expect(put).toHaveBeenCalledWith(
      "/api/upload",
      expect.any(Blob),
      expect.objectContaining({ onProgress: undefined, signal: undefined }),
    );
  });

  it.each([
    [
      "the parsed JSON body",
      '{"id":"img-1","status":"active"}',
      { id: "img-1", status: "active" },
    ],
    ["null for an empty body", "", null],
    ["null for a body that is not JSON", "<html>", null],
  ])("returns %s", async (_, text, expected) => {
    put.mockResolvedValue({ text, etag: null });
    await expect(uploadFile("/api/upload", new Blob([]))).resolves.toEqual(
      expected,
    );
  });

  it("rejects with the transport's error", async () => {
    const failure = new Error("upload failed");
    put.mockRejectedValue(failure);
    await expect(uploadFile("/api/upload", new Blob([]))).rejects.toBe(failure);
  });
});
