import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getJson,
  meQuery,
  pollDelay,
  pollWhile,
  POLL_GIVE_UP_MS,
  POLL_MAX_MS,
  pollIntervals,
  sessionQuery,
  switchProject,
} from "./queries";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("./api/client", () => ({ apiFetch }));
const setCsrfToken = vi.hoisted(() => vi.fn());
vi.mock("./api/http", () => ({ setCsrfToken }));

afterEach(() => {
  apiFetch.mockReset();
  setCsrfToken.mockReset();
});

const MINUTE = 60 * 1000;

describe("pollDelay", () => {
  it.each([
    ["just started", 0, pollIntervals.standard],
    ["busy under a minute", 40 * 1000, pollIntervals.standard],
    ["busy two minutes", 2 * MINUTE, 12 * 1000],
    ["busy half an hour", 30 * MINUTE, POLL_MAX_MS],
    ["busy an hour", POLL_GIVE_UP_MS, false],
  ])("%s: polls after %j ms", (_, busyFor, expected) => {
    expect(pollDelay(busyFor, pollIntervals.standard)).toBe(expected);
  });

  it("never polls faster than the query's own interval", () => {
    expect(pollDelay(2 * MINUTE, 30 * 1000)).toBe(30 * 1000);
  });
});

describe("pollWhile", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll a query with nothing in transition", () => {
    expect(pollWhile({}, false)).toBe(false);
    expect(pollWhile({}, undefined)).toBe(false);
  });

  it("polls at the interval, then backs off while the query stays busy", () => {
    const query = {};
    expect(pollWhile(query, true)).toBe(pollIntervals.standard);
    expect(pollWhile(query, true, 3000)).toBe(3000);
    vi.advanceTimersByTime(5 * MINUTE);
    expect(pollWhile(query, true)).toBe(30 * 1000);
    vi.advanceTimersByTime(POLL_GIVE_UP_MS);
    expect(pollWhile(query, true)).toBe(false);
  });

  it("starts afresh once the query has settled", () => {
    const query = {};
    pollWhile(query, true);
    vi.advanceTimersByTime(30 * MINUTE);
    expect(pollWhile(query, false)).toBe(false);
    expect(pollWhile(query, true)).toBe(pollIntervals.standard);
  });

  it("times each query on its own", () => {
    const slow = {};
    pollWhile(slow, true);
    vi.advanceTimersByTime(30 * MINUTE);
    expect(pollWhile(slow, true)).toBe(POLL_MAX_MS);
    expect(pollWhile({}, true)).toBe(pollIntervals.standard);
  });
});

describe("getJson", () => {
  it("forwards the query's abort signal, so cancelling aborts the request", async () => {
    const client = new QueryClient();
    let seen: AbortSignal | undefined;
    apiFetch.mockImplementation(
      (_path: string, init: { signal: AbortSignal }) => {
        seen = init.signal;
        return new Promise(() => {});
      },
    );
    // Cancelling rejects the fetch with a CancelledError; that is expected.
    const fetching = client
      .fetchQuery({
        queryKey: ["outages"],
        queryFn: getJson("/api/outages", { limit: 5 }),
      })
      .catch(() => undefined);
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(apiFetch).toHaveBeenCalledWith("/api/outages", {
      query: { limit: 5 },
      signal: seen,
    });

    await client.cancelQueries({ queryKey: ["outages"] });
    await fetching;
    expect(seen?.aborted).toBe(true);
  });
});

describe("switchProject", () => {
  it("cancels and removes the old project's queries, keeping app-wide data", async () => {
    const client = new QueryClient();
    const me = { project: { id: "p2" } };
    client.setQueryData(["config"], { site: "test" });
    client.setQueryData(["project", "p1", "instances"], []);
    const cancel = vi.spyOn(client, "cancelQueries");
    const remove = vi.spyOn(client, "removeQueries");
    apiFetch.mockResolvedValue(me);

    await expect(switchProject(client, "p2")).resolves.toBe(me);

    expect(apiFetch).toHaveBeenCalledWith("/api/session/project", {
      method: "POST",
      json: { project_id: "p2" },
    });
    expect(cancel).toHaveBeenCalledWith({ queryKey: ["project"] });
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(
      remove.mock.invocationCallOrder[0] ?? 0,
    );
    expect(client.getQueryData(["project", "p1", "instances"])).toBeUndefined();
    expect(client.getQueryData(["config"])).toEqual({ site: "test" });
    expect(client.getQueryData(meQuery.queryKey)).toBe(me);
  });
});

describe("sessionQuery", () => {
  const signal = new AbortController().signal;
  const probe = () =>
    (sessionQuery.queryFn as (context: { signal: AbortSignal }) => unknown)({
      signal,
    });

  it("records the session's CSRF token from the probe", async () => {
    apiFetch.mockResolvedValue({ authenticated: true, csrf_token: "probed" });
    await probe();
    expect(apiFetch).toHaveBeenCalledWith("/api/session", { signal });
    expect(setCsrfToken).toHaveBeenLastCalledWith("probed");
  });

  it("clears the token when there is no session", async () => {
    apiFetch.mockResolvedValue({ authenticated: false, login_url: "/login" });
    await probe();
    expect(setCsrfToken).toHaveBeenLastCalledWith(null);
  });
});
