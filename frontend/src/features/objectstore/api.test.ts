import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { ObjectListing } from "../../lib/api/types";
import { objectsQuery } from "./api";

function page(names: string[], next: string | null): ObjectListing {
  return {
    container: "c",
    prefix: "",
    items: names.map((name) => ({
      name,
      basename: name,
      is_folder: false,
      bytes: 1,
      content_type: null,
      last_modified: null,
    })) as ObjectListing["items"],
    has_more: next !== null,
    next_marker: next,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("objectsQuery paging", () => {
  it("asks for the next page from the last marker", () => {
    const options = objectsQuery("p1", "c", "");
    const next = options.getNextPageParam;
    expect(next(page(["a"], "a"), [], null, [null])).toBe("a");
    expect(next(page(["b"], null), [], "a", [null, "a"])).toBeNull();
  });

  it("sends the marker and joins the pages", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        urls.push(url);
        const body = url.includes("marker=")
          ? page(["c", "d"], null)
          : page(["a", "b"], "b");
        return Promise.resolve(new Response(JSON.stringify(body)));
      }),
    );
    const client = new QueryClient();
    const options = objectsQuery("p1", "c", "docs");
    const data = await client.fetchInfiniteQuery({ ...options, pages: 2 });
    expect(data.pages.flatMap((p) => p.items.map((i) => i.name))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(urls[0]).toBe("/api/object-store/containers/c/objects?path=docs");
    expect(urls.at(-1)).toBe(
      "/api/object-store/containers/c/objects?path=docs&marker=b",
    );
  });
});
