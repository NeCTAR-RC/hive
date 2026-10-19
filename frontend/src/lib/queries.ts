// Query and mutation definitions shared by routes and components. Keys are
// `['project', projectId, ...]` for anything project-scoped so a switch can
// drop the old project's data in one call.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch, setCsrfToken } from "./api/client";
import type {
  AllocationSummary,
  BannerItem,
  Me,
  NewsResponse,
  OutagesResponse,
  Profile,
  PublicConfig,
  RisksResponse,
  SessionProbe,
  UsageSummary,
} from "./api/types";

export const staleTimes = {
  session: Infinity,
  static: 10 * 60 * 1000,
  list: 15 * 1000,
  detail: 10 * 1000,
  quota: 5 * 60 * 1000,
  feed: 60 * 60 * 1000,
} as const;

export const configQuery = queryOptions({
  queryKey: ["config"],
  queryFn: ({ signal }) => apiFetch<PublicConfig>("/api/config", { signal }),
  staleTime: staleTimes.session,
  gcTime: Infinity,
});

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: ({ signal }) => apiFetch<SessionProbe>("/api/session", { signal }),
  staleTime: staleTimes.session,
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: ({ signal }) => apiFetch<Me>("/api/me", { signal }),
  staleTime: staleTimes.session,
});

export const profileQuery = queryOptions({
  queryKey: ["me", "profile"],
  queryFn: ({ signal }) => apiFetch<Profile>("/api/me/profile", { signal }),
  staleTime: staleTimes.static,
});

export const outagesQuery = queryOptions({
  queryKey: ["outages"],
  queryFn: ({ signal }) =>
    apiFetch<OutagesResponse>("/api/outages", { signal }),
  staleTime: staleTimes.feed,
});

export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: ({ signal }) => apiFetch<NewsResponse>("/api/news/ardc", { signal }),
  staleTime: staleTimes.feed,
});

export function allocationQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "allocation"],
    queryFn: ({ signal }) =>
      apiFetch<AllocationSummary>("/api/allocation/summary", { signal }),
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
    queryKey: ["project", projectId, "usage", params ?? null],
    queryFn: ({ signal }) =>
      apiFetch<UsageSummary>("/api/usage/summary", { query: params, signal }),
    staleTime: staleTimes.quota,
  });
}

export function risksQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "risks"],
    queryFn: ({ signal }) =>
      apiFetch<RisksResponse>("/api/security/risks", { signal }),
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
      const items = (await response.json()) as BannerItem[];
      return Array.isArray(items) && items.length > 0 ? items[0]! : null;
    },
    staleTime: staleTimes.feed,
    retry: false,
  });
}

export function useSwitchProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      apiFetch<Me>("/api/session/project", {
        method: "POST",
        json: { project_id: projectId },
      }),
    onSuccess: async (me) => {
      // Drop the old project's data before publishing the new `me`, so
      // components re-render straight into new-project fetches rather than
      // starting fetches that the removal would then throw away.
      queryClient.removeQueries({ queryKey: ["project"] });
      queryClient.setQueryData(meQuery.queryKey, me);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/logout", { method: "POST" }),
    onSettled: () => {
      setCsrfToken(null);
      queryClient.clear();
    },
  });
}
