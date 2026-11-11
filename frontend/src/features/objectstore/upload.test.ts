import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/client";
import {
  objectName,
  runPool,
  sliceSegments,
  uploadErrorMessage,
} from "./upload";
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
  it("runs at most the limit at once and keeps the order", async () => {
    let running = 0;
    let most = 0;
    const tasks = [30, 10, 20, 5, 15].map((ms, index) => async () => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, ms));
      running -= 1;
      return index;
    });
    await expect(runPool(tasks, 3)).resolves.toEqual([0, 1, 2, 3, 4]);
    expect(most).toBe(3);
  });

  it("stops starting tasks after the first failure", async () => {
    const started: number[] = [];
    const tasks = [0, 1, 2, 3].map((index) => async () => {
      started.push(index);
      if (index === 0) throw new Error("refused");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return index;
    });
    await expect(runPool(tasks, 1)).rejects.toThrow("refused");
    expect(started).toEqual([0]);
  });
});

describe("uploadErrorMessage", () => {
  it("adds each field message of a refused request", () => {
    const error = new ApiError(422, {
      error: "validation_error",
      message: "Request validation failed",
      detail: [
        { loc: ["query", "filename"], msg: "String too long" },
        { loc: ["path"], msg: "Invalid name" },
      ],
    });
    expect(uploadErrorMessage(error)).toBe(
      "Request validation failed: String too long; Invalid name",
    );
  });

  it("keeps any other message as it is", () => {
    expect(
      uploadErrorMessage(
        new ApiError(411, {
          error: "length_required",
          message: "The upload needs a Content-Length header.",
        }),
      ),
    ).toBe("The upload needs a Content-Length header.");
    expect(uploadErrorMessage(new Error("cancelled"))).toBe("cancelled");
  });
});
