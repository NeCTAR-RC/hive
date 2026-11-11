import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api/errors";
import { detailState, type DetailQuery } from "./detailState";

const failed = (error: unknown): DetailQuery => ({ status: "error", error });

describe("detailState", () => {
  it.each<[string, DetailQuery, boolean, string]>([
    ["loading", { status: "pending", error: null }, false, "loading"],
    ["a found record", { status: "success", error: null }, true, "ready"],
    [
      "a list without the record",
      { status: "success", error: null },
      false,
      "missing",
    ],
    [
      "a 404",
      failed(new ApiError(404, { error: "not_found" })),
      false,
      "missing",
    ],
    [
      "a disabled service",
      failed(new ApiError(501, { error: "service_not_enabled" })),
      false,
      "unavailable",
    ],
    [
      "any other failure",
      failed(new ApiError(502, { error: "upstream_error" })),
      false,
      "failed",
    ],
    [
      "a failure that is not an ApiError",
      failed(new Error("boom")),
      false,
      "failed",
    ],
    [
      "a record deleted while the page polls it",
      failed(new ApiError(404, { error: "not_found" })),
      true,
      "missing",
    ],
  ])("reads %s", (_, query, found, expected) => {
    expect(detailState(query, found)).toBe(expected);
  });
});
