// Usage Trend and Allocation Usage queries. The daily and by-type series
// come from the shared usage summary query; the per-instance breakdown and
// the allocation burn-down have their own endpoints.
import { queryOptions } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  AllocationUsage,
  UsageInstancesResponse,
  UsageOptions,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export const usageOptionsQuery = queryOptions({
  queryKey: ["usage", "options"],
  queryFn: ({ signal }) =>
    apiFetch<UsageOptions>("/api/usage/options", { signal }),
  staleTime: staleTimes.static,
});

export function usageInstancesQuery(
  projectId: string,
  begin: string,
  end: string,
) {
  return queryOptions({
    queryKey: ["project", projectId, "usage", "instances", begin, end],
    queryFn: ({ signal }) =>
      apiFetch<UsageInstancesResponse>("/api/usage/instances", {
        signal,
        query: { begin, end },
      }),
    staleTime: staleTimes.quota,
  });
}

export function allocationUsageQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "usage", "allocation"],
    queryFn: ({ signal }) =>
      apiFetch<AllocationUsage>("/api/usage/allocation", { signal }),
    staleTime: staleTimes.quota,
  });
}
