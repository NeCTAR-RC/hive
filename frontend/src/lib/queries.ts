// Query and mutation definitions shared by routes and components. Keys are
// `['project', projectId, ...]` for anything project-scoped so a switch can
// drop the old project's data in one call.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "./api/client";
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
  queryFn: () => apiFetch<PublicConfig>("/api/config"),
  staleTime: staleTimes.session,
  gcTime: Infinity,
});

export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: () => apiFetch<SessionProbe>("/api/session"),
  staleTime: staleTimes.session,
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: () => apiFetch<Me>("/api/me"),
  staleTime: staleTimes.session,
});

export const profileQuery = queryOptions({
  queryKey: ["me", "profile"],
  queryFn: () => apiFetch<Profile>("/api/me/profile"),
  staleTime: staleTimes.static,
});

export const outagesQuery = queryOptions({
  queryKey: ["outages"],
  queryFn: () => apiFetch<OutagesResponse>("/api/outages"),
  staleTime: staleTimes.feed,
});

export const newsQuery = queryOptions({
  queryKey: ["news"],
  queryFn: () => apiFetch<NewsResponse>("/api/news/ardc"),
  staleTime: staleTimes.feed,
});

export function allocationQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "allocation"],
    queryFn: () => apiFetch<AllocationSummary>("/api/allocation/summary"),
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
    queryFn: () =>
      apiFetch<UsageSummary>("/api/usage/summary", { query: params }),
    staleTime: staleTimes.quota,
  });
}

export function risksQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "risks"],
    queryFn: () => apiFetch<RisksResponse>("/api/security/risks"),
    staleTime: staleTimes.list,
  });
}

export function bannerQuery(url: string | null) {
  return queryOptions({
    queryKey: ["banner", url],
    queryFn: async () => {
      if (!url) return null;
      const response = await fetch(url, { cache: "no-store" });
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
      queryClient.setQueryData(meQuery.queryKey, me);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.removeQueries({ queryKey: ["project"] });
    },
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
