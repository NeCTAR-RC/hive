// Usage Trend and Allocation Usage queries. The daily and by-type series
// come from the shared usage summary query; the per-instance breakdown and
// the allocation burn-down have their own endpoints.
import { queryOptions } from "@tanstack/react-query";
import type {
  AllocationUsage,
  UsageInstancesResponse,
  UsageOptions,
} from "../../lib/api/types/usage";
import { getJson, staleTimes } from "../../lib/queries";
import { queryKeys, userKeys } from "../../lib/queryKeys";

const keys = queryKeys.usage;

export const usageOptionsQuery = queryOptions({
  queryKey: userKeys.usageOptions.all(),
  queryFn: getJson<UsageOptions>("/api/usage/options"),
  staleTime: staleTimes.static,
});

export function usageInstancesQuery(
  projectId: string,
  begin: string,
  end: string,
) {
  return queryOptions({
    queryKey: keys.instances.list(projectId, { begin, end }),
    queryFn: getJson<UsageInstancesResponse>("/api/usage/instances", {
      begin,
      end,
    }),
    staleTime: staleTimes.quota,
  });
}

export function allocationUsageQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.allocation.all(projectId),
    queryFn: getJson<AllocationUsage>("/api/usage/allocation"),
    staleTime: staleTimes.quota,
  });
}
