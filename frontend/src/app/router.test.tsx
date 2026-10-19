import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import rows from "../../../backend/hive/data/horizon-redirects.json";
import {
  catchAllRoute,
  createAppRouter,
  isDocumentTarget,
  switchRoute,
} from "./router";

interface Row {
  from: string;
  to: string;
  kind: string;
}

const MAP = rows as Row[];

function concrete(to: string): string {
  return to.split("?")[0]!.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, "x");
}

type BeforeLoad = (options: Record<string, unknown>) => unknown;

function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("Horizon redirect targets", () => {
  const router = createAppRouter(new QueryClient());

  it("lands every page row on a route the SPA knows", () => {
    const pages = MAP.filter(
      (row) => row.kind === "page" && !isDocumentTarget(row.to),
    );
    expect(pages.length).toBeGreaterThan(100);
    // The check has teeth: an unknown path only reaches the catch-all.
    expect(router.getMatchedRoutes("/api-access/ec2")[2]?.id).toBe(
      catchAllRoute.id,
    );
    for (const row of pages) {
      const [, , found] = router.getMatchedRoutes(concrete(row.to));
      expect(found, `${row.from} -> ${row.to}`).toBeDefined();
      expect(found?.id, `${row.from} -> ${row.to}`).not.toBe(catchAllRoute.id);
    }
  });

  it("points every download row at the backend", () => {
    const downloads = MAP.filter((row) => row.kind === "download");
    expect(downloads.length).toBeGreaterThan(0);
    for (const row of downloads) {
      expect(isDocumentTarget(row.to), row.from).toBe(true);
    }
  });

  it("follows download rows with a full document load", () => {
    const beforeLoad = catchAllRoute.options
      .beforeLoad as unknown as BeforeLoad;
    const thrown = thrownBy(() =>
      beforeLoad({
        location: { pathname: "/project/api_access/openrc/", searchStr: "" },
      }),
    );
    expect(isRedirect(thrown)).toBe(true);
    const options = (thrown as { options: Record<string, unknown> }).options;
    expect(options.href).toBe("/api/api-access/openrc");
    expect(options.reloadDocument).toBe(true);
  });

  it("follows page rows inside the SPA", () => {
    const beforeLoad = catchAllRoute.options
      .beforeLoad as unknown as BeforeLoad;
    const thrown = thrownBy(() =>
      beforeLoad({
        location: { pathname: "/project/api_access/ec2/", searchStr: "" },
      }),
    );
    const options = (thrown as { options: Record<string, unknown> }).options;
    expect(options.href).toBe("/identity/credentials");
    expect(options.reloadDocument).toBeUndefined();
  });
});

describe("project switch route", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never switches on a hover preload", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const beforeLoad = switchRoute.options.beforeLoad as unknown as (
      options: Record<string, unknown>,
    ) => Promise<unknown>;
    const queryClient = new QueryClient();
    await beforeLoad({
      params: { projectId: "p2" },
      context: { queryClient },
      preload: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const thrown = await beforeLoad({
      params: { projectId: "p2" },
      context: { queryClient },
      preload: false,
    }).catch((error: unknown) => error);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(isRedirect(thrown)).toBe(true);
  });
});
