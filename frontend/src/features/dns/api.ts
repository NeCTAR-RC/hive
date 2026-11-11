// Queries and mutations for the DNS panels (Designate), keyed by
// `queryKeys.dns`. Lists poll while anything is PENDING, and every write
// refreshes the whole service. Queries pass React Query's abort signal on,
// so leaving a page cancels its requests.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  RecordSet,
  RecordSetCreateRequest,
  RecordSetsResponse,
  Zone,
  ZoneCreateRequest,
  ZonesResponse,
} from "../../lib/api/types/dns";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";

const keys = queryKeys.dns;

const BASE = "/api/dns";

/** What any DNS write marks stale: the whole service, zones and records. */
export const dnsWriteKeys = [keys.service.all];

export function zonesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.zones.list(projectId),
    queryFn: getJson<ZonesResponse>(`${BASE}/zones`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((z) => z.is_transitional),
      ),
  });
}

export function recordSetsQuery(projectId: string, zoneId: string) {
  return queryOptions({
    queryKey: [...keys.zones.detail(projectId, zoneId), "recordsets"],
    queryFn: getJson<RecordSetsResponse>(`${BASE}/zones/${zoneId}/recordsets`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((r) => r.is_transitional) ||
          query.state.data?.zone.is_transitional,
      ),
  });
}

export function useCreateZone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ZoneCreateRequest) =>
      apiFetch<Zone>(`${BASE}/zones`, { method: "POST", json: body }),
    onSettled: () => void invalidate(...dnsWriteKeys),
  });
}

export function useUpdateZone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      email?: string;
      ttl?: number;
      description?: string;
    }) =>
      apiFetch<Zone>(`${BASE}/zones/${id}`, { method: "PATCH", json: body }),
    onSettled: () => void invalidate(...dnsWriteKeys),
  });
}

/** Deletes one zone with its record sets; a batch sends it per zone. */
export function deleteZone(zoneId: string) {
  return apiFetch<void>(`${BASE}/zones/${zoneId}`, { method: "DELETE" });
}

export function useCreateRecordSet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      zoneId,
      ...body
    }: RecordSetCreateRequest & { zoneId: string }) =>
      apiFetch<RecordSet>(`${BASE}/zones/${zoneId}/recordsets`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...dnsWriteKeys),
  });
}

export function useUpdateRecordSet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      zoneId,
      id,
      ...body
    }: {
      zoneId: string;
      id: string;
      records: string[];
      /** Null restores the zone's default TTL; left out keeps the current. */
      ttl?: number | null;
      description?: string;
    }) =>
      apiFetch<RecordSet>(`${BASE}/zones/${zoneId}/recordsets/${id}`, {
        method: "PUT",
        json: body,
      }),
    onSettled: () => void invalidate(...dnsWriteKeys),
  });
}

/** Deletes one record set of a zone; a batch sends it per record set. */
export function deleteRecordSet(zoneId: string, recordSetId: string) {
  return apiFetch<void>(`${BASE}/zones/${zoneId}/recordsets/${recordSetId}`, {
    method: "DELETE",
  });
}
