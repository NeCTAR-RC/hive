// Query and mutation definitions shared by routes and components, and the
// freshness and polling vocabulary every feature's queries use. Project
// keys come from queryKeys.ts, all under `['project', projectId, ...]`, so
// a switch can drop the old project's data in one call.
import {
  queryOptions,
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { apiFetch, type ApiInit } from "./api/client";
import { setCsrfToken } from "./api/http";
import type { ProfileReply } from "./api/types/account";
import type {
  BannerItem,
  NewsResponse,
  OutagesResponse,
} from "./api/types/home";
import type { RisksResponse } from "./api/types/security";
import type { Me, PublicConfig, SessionProbe } from "./api/types/session";
import type { AllocationSummary, UsageSummary } from "./api/types/usage";
import { queryKeys } from "./queryKeys";

export const staleTimes = {
  /** Always refetch on mount: choices a form must not offer stale. */
  none: 0,
  session: Infinity,
  static: 10 * 60 * 1000,
  list: 15 * 1000,
  detail: 10 * 1000,
  quota: 5 * 60 * 1000,
  feed: 60 * 60 * 1000,
} as const;

/**
 * How often a list or detail refreshes while something in it is changing:
 * `standard` unless the service is known to settle faster (a reservation
 * leaves PENDING_CREATE within seconds) or slower (a Kubernetes cluster
 * takes minutes to build).
 */
export const pollIntervals = {
  quick: 3000,
  standard: 5000,
  slow: 10 * 1000,
} as const;

/** The slowest a long-running change is polled, once backed off. */
export const POLL_MAX_MS = 60 * 1000;

/** After this long in a transitional state a resource is stuck: stop. */
export const POLL_GIVE_UP_MS = 60 * 60 * 1000;

/**
 * The next poll's delay for something busy for `busyForMs`: `intervalMs` at
 * first, then a tenth of the time already waited (a change that has taken
 * ten minutes will not finish in the next five seconds), never slower than
 * POLL_MAX_MS, and no polling at all once POLL_GIVE_UP_MS has passed.
 */
export function pollDelay(
  busyForMs: number,
  intervalMs: number,
): number | false {
  if (busyForMs >= POLL_GIVE_UP_MS) return false;
  return Math.min(
    POLL_MAX_MS,
    Math.max(intervalMs, Math.round(busyForMs / 10)),
  );
}

/** When each polled query first reported something transitional. */
const busySince = new WeakMap<object, number>();

/**
 * A `refetchInterval` result for `query`: poll while `busy`, backing off
 * the longer it stays busy (see pollDelay), and stop once nothing is in a
 * transitional state. A stuck query that stopped polling still refreshes on
 * window focus or when its page is opened again.
 */
export function pollWhile(
  query: object,
  busy: boolean | undefined,
  intervalMs: number = pollIntervals.standard,
): number | false {
  if (!busy) {
    busySince.delete(query);
    return false;
  }
  const now = Date.now();
  const since = busySince.get(query) ?? now;
  busySince.set(query, since);
  return pollDelay(now - since, intervalMs);
}

/**
 * A query function for a GET that forwards React Query's abort signal, so
 * leaving a page or changing the key cancels the request in flight.
 */
export function getJson<T>(path: string, query?: ApiInit["query"]) {
  return ({ signal }: { signal: AbortSignal }) =>
    apiFetch<T>(path, { query, signal });
}

export const configQuery = queryOptions({
  queryKey: ["config"],
  queryFn: getJson<PublicConfig>("/api/config"),
  staleTime: staleTimes.session,
  gcTime: Infinity,
});

/**
 * The session and the user, which the dashboard layout's `beforeLoad`
 * checks before every page (`ensureQueryData`). They are kept for the life
 * of the app (`gcTime: Infinity`), as the config is: dropped after an idle
 * spell, the next page change would fetch them again inside `beforeLoad`,
 * and a failure there (a 502 from a busy upstream) replaces the whole app,
 * shell included, with the route error. A session that has ended still
 * shows itself through the 401 of the page's own requests. The probe also
 * carries the session's CSRF token, which every unsafe request then sends.
 */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async ({ signal }) => {
    const probe = await apiFetch<SessionProbe>("/api/session", { signal });
    setCsrfToken(probe.authenticated ? probe.csrf_token : null);
    return probe;
  },
  staleTime: staleTimes.session,
  gcTime: Infinity,
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: getJson<Me>("/api/me"),
  staleTime: staleTimes.session,
  gcTime: Infinity,
});

export const profileQuery = queryOptions({
  queryKey: ["me", "profile"],
  queryFn: getJson<ProfileReply>("/api/me/profile"),
  staleTime: staleTimes.static,
});

export const outagesQuery = queryOptions({
  queryKey: ["outages"],
  queryFn: getJson<OutagesResponse>("/api/outages"),
  staleTime: staleTimes.feed,
});

export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: getJson<NewsResponse>("/api/news/ardc"),
  staleTime: staleTimes.feed,
});

export function allocationQuery(projectId: string) {
  return queryOptions({
    queryKey: queryKeys.allocation.summary.all(projectId),
    queryFn: getJson<AllocationSummary>("/api/allocation/summary"),
    staleTime: staleTimes.quota,
  });
}

// A type alias (not an interface) so it satisfies the query record type.
export type UsageParams = {
  begin?: string;
  end?: string;
  /** CloudKitty groupby, such as "time-1d" for one row per day. */
  groupby?: string;
  type?: string;
};

export function usageQuery(projectId: string, params?: UsageParams) {
  return queryOptions({
    queryKey: queryKeys.usage.summary.list(projectId, params),
    queryFn: getJson<UsageSummary>("/api/usage/summary", params),
    staleTime: staleTimes.quota,
  });
}

export function risksQuery(projectId: string) {
  return queryOptions({
    queryKey: queryKeys.security.risks.all(projectId),
    queryFn: getJson<RisksResponse>("/api/security/risks"),
    staleTime: staleTimes.list,
  });
}

export function bannerQuery(url: string | null) {
  return queryOptions({
    queryKey: ["banner", url],
    queryFn: async ({ signal }) => {
      if (!url) return null;
      const response = await fetch(url, { cache: "no-store", signal });
      if (!response.ok) return null;
      // The feed is a third-party JSON list; its first item is current.
      const items = (await response.json()) as BannerItem[] | null;
      return Array.isArray(items) ? (items[0] ?? null) : null;
    },
    staleTime: staleTimes.feed,
    retry: false,
  });
}

/**
 * Makes `projectId` the session's project, the one way the app switches
 * (the sidebar switcher and Horizon's /auth/switch/<id>/ both use it).
 * In-flight project queries are cancelled before the old project's data is
 * removed, so a late response can never land after the switch; app-wide
 * data such as the config survives.
 */
export async function switchProject(
  queryClient: QueryClient,
  projectId: string,
): Promise<Me> {
  const me = await apiFetch<Me>("/api/session/project", {
    method: "POST",
    json: { project_id: projectId },
  });
  await queryClient.cancelQueries({ queryKey: ["project"] });
  queryClient.removeQueries({ queryKey: ["project"] });
  queryClient.setQueryData(meQuery.queryKey, me);
  await queryClient.invalidateQueries({ queryKey: ["session"] });
  return me;
}

export function useSwitchProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => switchProject(queryClient, projectId),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
