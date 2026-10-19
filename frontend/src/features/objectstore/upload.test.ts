import { describe, expect, it } from "vitest";
import { objectName, runPool, sliceSegments, uploadError } from "./upload";
import { encodePath, objectPath } from "./api";

describe("object store uploads", () => {
  it("names objects under the current folder, keeping dropped folder paths", () => {
    const plain = new File(["x"], "notes.txt");
    expect(objectName("docs/", plain)).toBe("docs/notes.txt");
    const nested = new File(["x"], "a.txt");
    Object.defineProperty(nested, "webkitRelativePath", {
      value: "photos/2026/a.txt",
    });
    expect(objectName("", nested)).toBe("photos/2026/a.txt");
  });

  it("slices a file into the planned segments", () => {
    const file = new File(["0123456789"], "big.bin");
    const pieces = sliceSegments(file, {
      name: "big.bin",
      size: 10,
      url: null,
      manifest: true,
      segments: [
        {
          offset: 0,
          length: 4,
          path: "/c_segments/big.bin/1/00000000",
          url: "u0",
        },
        {
          offset: 4,
          length: 6,
          path: "/c_segments/big.bin/1/00000001",
          url: "u1",
        },
      ],
    });
    expect(pieces.map((p) => p.blob.size)).toEqual([4, 6]);
    expect(pieces[1]?.url).toBe("u1");
  });

  it("encodes object paths segment by segment", () => {
    expect(encodePath("docs/a b/c#1.txt")).toBe("docs/a%20b/c%231.txt");
    expect(objectPath("my container", "a/b")).toBe(
      "/api/object-store/containers/my%20container/objects/a/b",
    );
  });
});

describe("runPool", () => {
  it("keeps order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const tasks = [30, 10, 20, 5, 15].map((ms, index) => async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return index;
    });
    expect(await runPool(tasks, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("stops starting tasks after a failure", async () => {
    const started: number[] = [];
    const tasks = [0, 1, 2, 3].map((index) => async () => {
      started.push(index);
      if (index === 0) throw new Error("boom");
      return index;
    });
    await expect(runPool(tasks, 1)).rejects.toThrow("boom");
    expect(started).toEqual([0]);
  });
});

describe("uploadError", () => {
  it("uses the backend's message and validation details", () => {
    expect(
      uploadError(
        411,
        JSON.stringify({
          error: "length_required",
          message: "The upload needs a Content-Length header.",
        }),
      ).message,
    ).toBe("The upload needs a Content-Length header.");
    expect(
      uploadError(
        422,
        JSON.stringify({
          error: "validation_error",
          message: "invalid request",
          detail: [{ type: "x", loc: ["query"], msg: "bad name" }],
        }),
      ).message,
    ).toBe("invalid request: bad name");
  });

  it("falls back to the status for a body that is not the envelope", () => {
    expect(uploadError(502, "<html>").message).toBe(
      "upload failed with status 502",
    );
  });
});
