import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api/client";
import { createQueryClient, shouldRetry } from "./query-client";

const expired = new ApiError(401, { error: "session_expired" });
const forbidden = new ApiError(403, { error: "forbidden" });

describe("createQueryClient", () => {
  it.each([
    ["a query 401", expired, 1],
    ["a query 403", forbidden, 0],
  ])("calls the session policy for %s %i time(s)", async (_, error, calls) => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    await client
      .fetchQuery({
        queryKey: ["me"],
        queryFn: () => Promise.reject(error),
        retry: false,
      })
      .catch(() => undefined);
    expect(onUnauthenticated).toHaveBeenCalledTimes(calls);
  });

  it("calls the session policy for a mutation 401, such as an upload", async () => {
    const onUnauthenticated = vi.fn();
    const client = createQueryClient({ onUnauthenticated });
    const upload = new MutationObserver(client, {
      mutationFn: () => Promise.reject(expired),
    });
    await upload.mutate().catch(() => undefined);
    expect(onUnauthenticated).toHaveBeenCalledWith(expired);
  });
});

describe("shouldRetry", () => {
  it.each([
    ["a network failure", new ApiError(0, {}), true],
    [
      "an upstream outage",
      new ApiError(502, { error: "upstream_error" }),
      true,
    ],
    [
      "a service the cloud does not run",
      new ApiError(501, { error: "service_not_enabled" }),
      false,
    ],
    ["a missing record", new ApiError(404, { error: "not_found" }), false],
    ["a refused request", forbidden, false],
    ["an error from outside the API", new Error("bug"), true],
  ])("retries %s: %s", (_, error, expected) => {
    expect(shouldRetry(0, error)).toBe(expected);
  });

  it("gives up after two retries", () => {
    expect(shouldRetry(2, new ApiError(503, {}))).toBe(false);
  });
});
