import { describe, expect, it } from "vitest";
import { objectName, sliceSegments } from "./upload";
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
