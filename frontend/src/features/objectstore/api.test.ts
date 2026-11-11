import { describe, expect, it } from "vitest";
import type {
  ObjectListing,
  StoreObject,
} from "../../lib/api/types/objectstore";
import { deleteOutcome, joinListing, nextMarker } from "./api";

/** An object or folder row named `name`. */
function row(name: string): StoreObject {
  const folder = name.endsWith("/");
  return {
    name,
    basename: name.replace(/\/$/, "").split("/").pop() ?? name,
    is_folder: folder,
    bytes: folder ? 0 : 1,
    content_type: null,
    hash: null,
    last_modified: null,
  };
}

describe("deleteOutcome", () => {
  const a = row("docs/a.txt");
  const b = row("docs/b.txt");
  const photos = row("docs/photos/");

  it("succeeds on every object when nothing failed", () => {
    expect(
      deleteOutcome("box", [a, photos], { deleted: 5, failed: [] }),
    ).toEqual({ succeeded: [a, photos], failed: [] });
  });

  it("maps a failed name back to its object, with no reason", () => {
    expect(
      deleteOutcome("box", [a, b], { deleted: 1, failed: ["docs/b.txt"] }),
    ).toEqual({ succeeded: [a], failed: [{ item: b, error: undefined }] });
  });

  it("reads Swift's quoted paths and fails the folder they were in", () => {
    const outcome = deleteOutcome("my box", [a, photos], {
      deleted: 3,
      failed: ["/my%20box/docs/photos/big%20one.jpg"],
    });
    expect(outcome.succeeded).toEqual([a]);
    expect(outcome.failed.map(({ item }) => item)).toEqual([photos]);
  });

  it("does not fail a folder for a sibling that shares its prefix", () => {
    const outcome = deleteOutcome("box", [photos], {
      deleted: 0,
      failed: ["docs/photos-old.jpg"],
    });
    expect(outcome.failed).toEqual([]);
  });
});

describe("folder pages", () => {
  /** A listing page holding `names`. */
  function page(names: string[], next: string | null): ObjectListing {
    return {
      container: "box",
      prefix: "",
      items: names.map(row),
      has_more: next !== null,
      next_marker: next,
    };
  }

  it("asks for the page after a full one, by its marker", () => {
    expect(nextMarker(page(["a", "b"], "b"))).toBe("b");
    expect(nextMarker(page(["c"], null))).toBeNull();
  });

  it("reads the loaded pages as one list", () => {
    expect(
      joinListing({
        pages: [page(["a", "b"], "b"), page(["c"], null)],
      }).items.map((item) => item.name),
    ).toEqual(["a", "b", "c"]);
  });
});
