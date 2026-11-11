import { describe, expect, it } from "vitest";
import {
  createFromSearch,
  createSearch,
  listSearch,
  mergeSearch,
  statusListSearch,
  tabParam,
  tabPatch,
  tabSearch,
} from "./search";

interface Search {
  q?: string;
  status?: string;
  create?: boolean;
  page?: number;
  tags?: string[] | null;
}

describe("mergeSearch", () => {
  it.each<[string, Search, Partial<Search>, Partial<Search>]>([
    ["adds a value", {}, { q: "web" }, { q: "web" }],
    ["replaces a value", { q: "web" }, { q: "db" }, { q: "db" }],
    [
      "keeps the values the patch does not name",
      { q: "web", status: "ACTIVE" },
      { status: "ERROR" },
      { q: "web", status: "ERROR" },
    ],
    [
      "drops blank text",
      { q: "web", status: "ACTIVE" },
      { q: "" },
      { status: "ACTIVE" },
    ],
    ["drops a value set to undefined", { q: "web" }, { q: undefined }, {}],
    ["drops a value set to null", { tags: ["a"] }, { tags: null }, {}],
    [
      "drops a cleared flag",
      { q: "web", create: true },
      { create: false },
      { q: "web" },
    ],
    ["keeps a set flag", {}, { create: true }, { create: true }],
    ["keeps zero", {}, { page: 0 }, { page: 0 }],
    [
      "drops empty values already there",
      { q: "", status: "ACTIVE" },
      {},
      { status: "ACTIVE" },
    ],
  ])("%s", (_, previous, patch, expected) => {
    expect(mergeSearch(previous, patch)).toStrictEqual(expected);
  });

  it("leaves the current params untouched", () => {
    const previous: Search = { q: "web" };
    mergeSearch(previous, { q: "" });
    expect(previous).toStrictEqual({ q: "web" });
  });
});

describe("list search schemas", () => {
  it.each([
    ["listSearch", listSearch, { q: "web" }],
    ["statusListSearch", statusListSearch, { q: "web", status: "ERROR" }],
    ["createSearch", createSearch, { q: "web", create: true }],
    [
      "createFromSearch",
      createFromSearch,
      { q: "web", create: true, snapshot: "s1" },
    ],
  ])("%s carries the search text with its own params", (_, schema, params) => {
    expect(schema.parse(params)).toStrictEqual(params);
  });

  it("drops a malformed value instead of failing", () => {
    expect(createSearch.parse({ q: 42, create: "yes" })).toStrictEqual({
      q: undefined,
      create: undefined,
    });
  });

  it("carries the table's page, page size and sort", () => {
    const view = { page: 3, size: 50, sort: "name", order: "asc" };
    expect(listSearch.parse(view)).toStrictEqual(view);
  });

  it.each([
    ["a page below 1", { page: 0 }],
    ["a fractional page", { page: 1.5 }],
    ["a page written as text", { page: "two" }],
    ["an unknown order", { order: "up" }],
  ])("drops %s", (_, params) => {
    const parsed: Record<string, unknown> = listSearch.parse(params);
    expect(Object.values(parsed).every((value) => value === undefined)).toBe(
      true,
    );
  });
});

describe("tab search", () => {
  const tabs = tabSearch(["overview", "volumes", "log"]);

  it.each([
    ["one of the ids", { tab: "volumes" }, { tab: "volumes" }],
    ["no tab", {}, {}],
    ["an unknown id", { tab: "metrics" }, { tab: undefined }],
    ["a malformed value", { tab: 3 }, { tab: undefined }],
  ])("reads %s", (_, params, expected) => {
    expect(tabs.parse(params)).toStrictEqual(expected);
  });

  it("sits beside a route's other params", () => {
    const schema = listSearch.extend({ tab: tabParam(["values", "details"]) });
    expect(schema.parse({ q: "web", tab: "details" })).toStrictEqual({
      q: "web",
      tab: "details",
    });
  });

  it("clears the param for the first tab and sets it for any other", () => {
    expect(tabPatch("overview", "overview")).toStrictEqual({ tab: undefined });
    expect(tabPatch("log", "overview")).toStrictEqual({ tab: "log" });
  });
});
