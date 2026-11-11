import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import rows from "../../../backend/hive/data/horizon-redirects.json";
import { createAppRouter } from "./router";
import { catchAllRoute, switchRoute } from "./routes";

interface Row {
  from: string;
  to: string;
  kind: string;
}

const MAP = rows as Row[];

/** A row's target as a real path: every parameter and splat filled. */
function concrete(to: string): string {
  return to
    .split("?")[0]!
    .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "x")
    .replace("*", "x");
}

/** A route's `beforeLoad`, called as the router would call it. */
type BeforeLoad = (options: Record<string, unknown>) => Promise<unknown>;

const catchAllBeforeLoad = catchAllRoute.options
  .beforeLoad as unknown as BeforeLoad;
const switchBeforeLoad = switchRoute.options
  .beforeLoad as unknown as BeforeLoad;

/** What the catch-all throws for a path no route claims. */
function followFromCatchAll(pathname: string) {
  return catchAllBeforeLoad({
    location: { pathname, searchStr: "" },
    context: { queryClient: new QueryClient() },
  }).catch((error: unknown) => error);
}

describe("Horizon redirect targets", () => {
  const router = createAppRouter(new QueryClient());

  it("lands every page row on a route the SPA knows", () => {
    const pages = MAP.filter((row) => row.kind === "page");
    expect(pages.length).toBeGreaterThan(100);
    // The check has teeth: an unknown path only reaches the catch-all.
    expect(router.getMatchedRoutes("/api-access/ec2")[2]?.id).toBe(
      catchAllRoute.id,
    );
    for (const row of pages) {
      const [, , found] = router.getMatchedRoutes(concrete(row.to));
      expect(found?.id, `${row.from} -> ${row.to}`).toBeDefined();
      expect(found?.id, `${row.from} -> ${row.to}`).not.toBe(catchAllRoute.id);
    }
  });

  it("points every download row at the backend", () => {
    const downloads = MAP.filter((row) => row.kind === "download");
    expect(downloads.length).toBeGreaterThan(0);
    for (const row of downloads) {
      expect(row.to.startsWith("/api/"), row.from).toBe(true);
    }
  });

  it("follows a download row with a full document load", async () => {
    const thrown = await followFromCatchAll("/project/api_access/openrc/");
    expect(isRedirect(thrown)).toBe(true);
    const { options } = thrown as { options: Record<string, unknown> };
    expect(options.href).toBe("/api/api-access/openrc");
    expect(options.reloadDocument).toBe(true);
  });

  it("follows a page row inside the SPA", async () => {
    const thrown = await followFromCatchAll("/project/api_access/ec2/");
    expect(isRedirect(thrown)).toBe(true);
    const { options } = thrown as { options: Record<string, unknown> };
    expect(options.href).toBe("/identity/credentials");
    expect(options.reloadDocument).toBe(false);
  });
});

describe("project switch route", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never switches on a preload, and replaces itself in the history", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const context = { queryClient: new QueryClient() };
    const params = { projectId: "p2" };

    await switchBeforeLoad({ params, context, preload: true });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const thrown = await switchBeforeLoad({
      params,
      context,
      preload: false,
    }).catch((error: unknown) => error);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(isRedirect(thrown)).toBe(true);
    const { options } = thrown as { options: Record<string, unknown> };
    expect(options.to).toBe("/");
    expect(options.replace).toBe(true);
  });
});
