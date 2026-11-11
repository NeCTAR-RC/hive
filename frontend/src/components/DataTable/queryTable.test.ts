import { describe, expect, it, vi } from "vitest";
import {
  listRows,
  queryTableProps,
  type ListQuery,
  type QueryTableOptions,
} from "./queryTable";

interface KeyPair {
  name: string;
}

const rows: KeyPair[] = [{ name: "laptop" }, { name: "ci" }];

const loading: ListQuery<KeyPair> = {
  data: undefined,
  isPending: true,
  isFetching: true,
  error: null,
};
const loaded: ListQuery<KeyPair> = {
  data: { items: rows },
  isPending: false,
  isFetching: false,
  error: null,
};
const refetching: ListQuery<KeyPair> = { ...loaded, isFetching: true };
const failure = new Error("Service unavailable");
const failed: ListQuery<KeyPair> = {
  data: undefined,
  isPending: false,
  isFetching: false,
  error: failure,
};
const plainArray: ListQuery<KeyPair> = { ...loaded, data: rows };

const refetch = () => undefined;
const noun: QueryTableOptions<KeyPair> = { noun: "key pairs" };

describe("queryTableProps", () => {
  it.each([
    ["while the first load runs", loading, undefined, true, true, null],
    ["once loaded", loaded, rows, false, false, null],
    ["while a refetch runs", refetching, rows, false, true, null],
    ["when the load failed", failed, undefined, false, false, failure],
    ["for a query returning the rows", plainArray, rows, false, false, null],
  ])(
    "derives rows and states %s",
    (_, query, expectedRows, isLoading, isFetching, error) => {
      const props = queryTableProps(query, noun, refetch);
      expect(props.rows).toBe(expectedRows);
      expect(props.isLoading).toBe(isLoading);
      expect(props.isFetching).toBe(isFetching);
      expect(props.error).toBe(error);
    },
  );

  it.each<[string, QueryTableOptions<KeyPair>, string, string]>([
    ["from the noun", noun, "No key pairs yet", "No key pairs match"],
    [
      "from the overrides",
      {
        noun: "objects",
        emptyTitle: "This folder is empty",
        noMatchTitle: "Nothing matches",
      },
      "This folder is empty",
      "Nothing matches",
    ],
  ])("titles the empty states %s", (_, options, emptyTitle, noMatchTitle) => {
    const props = queryTableProps(loaded, options, refetch);
    expect(props.emptyTitle).toBe(emptyTitle);
    expect(props.noMatchTitle).toBe(noMatchTitle);
  });

  it("retries and refreshes through the same refetch", () => {
    const props = queryTableProps(loaded, noun, refetch);
    expect(props.onRetry).toBe(refetch);
    expect(props.onRefresh).toBe(refetch);
  });

  it("leaves out Refresh for data that does not change", () => {
    const props = queryTableProps(loaded, { ...noun, refresh: false }, refetch);
    expect(props.onRetry).toBe(refetch);
    expect(props.onRefresh).toBeUndefined();
  });

  it("binds the search box to the list search", () => {
    const setText = vi.fn();
    const props = queryTableProps(
      loaded,
      {
        ...noun,
        search: { text: "ci", setText },
        placeholder: "Search key pairs",
      },
      refetch,
    );
    expect(props.search?.value).toBe("ci");
    expect(props.search?.placeholder).toBe("Search key pairs");
    props.search?.onChange("laptop");
    expect(setText).toHaveBeenCalledWith("laptop");
  });

  it("marks a search the server runs as remote", () => {
    const search = { text: "ubuntu", setText: vi.fn() };
    expect(
      queryTableProps(loaded, { ...noun, search }, refetch).search?.remote,
    ).toBeFalsy();
    expect(
      queryTableProps(loaded, { ...noun, search, remoteSearch: true }, refetch)
        .search?.remote,
    ).toBe(true);
  });

  it("has no search box without a list search", () => {
    expect(queryTableProps(loaded, noun, refetch).search).toBeUndefined();
  });

  it("passes the page's filter and its reset key through", () => {
    const filter = (row: KeyPair) => row.name !== "ci";
    const props = queryTableProps(
      loaded,
      { ...noun, filter, resetKey: "ACTIVE" },
      refetch,
    );
    expect(props.filter).toBe(filter);
    expect(props.resetKey).toBe("ACTIVE");
  });
});

describe("listRows", () => {
  it.each([
    ["nothing before the first load", undefined, undefined],
    ["the rows of an { items } envelope", { items: rows }, rows],
    ["a plain list as it is", rows, rows],
  ])("returns %s", (_, data, expected) => {
    expect(listRows(data)).toBe(expected);
  });
});
