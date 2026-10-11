// Queries and mutations for the DNS panels (Designate), keyed under
// `['project', pid, 'dns', ...]`. Lists poll while anything is PENDING.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  RecordSet,
  RecordSetCreateRequest,
  RecordSetsResponse,
  Zone,
  ZoneCreateRequest,
  ZonesResponse,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function dnsKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "dns", ...rest] as const;
}

const BASE = "/api/dns";
const POLL_MS = 5000;

export function zonesQuery(projectId: string) {
  return queryOptions({
    queryKey: dnsKey(projectId, "zones"),
    queryFn: () => apiFetch<ZonesResponse>(`${BASE}/zones`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((z) => z.is_transitional) ? POLL_MS : false,
  });
}

export function recordSetsQuery(projectId: string, zoneId: string) {
  return queryOptions({
    queryKey: dnsKey(projectId, "recordsets", zoneId),
    queryFn: () =>
      apiFetch<RecordSetsResponse>(`${BASE}/zones/${zoneId}/recordsets`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.is_transitional) ||
      query.state.data?.zone.is_transitional
        ? POLL_MS
        : false,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: dnsKey(projectId) });
}

export function useCreateZone(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: ZoneCreateRequest) =>
      apiFetch<Zone>(`${BASE}/zones`, { method: "POST", json: body }),
    onSuccess: invalidate,
  });
}

export function useUpdateZone(projectId: string) {
  const invalidate = useInvalidate(projectId);
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
    onSuccess: invalidate,
  });
}

export function useDeleteZone(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/zones/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateRecordSet(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      zoneId,
      ...body
    }: RecordSetCreateRequest & { zoneId: string }) =>
      apiFetch<RecordSet>(`${BASE}/zones/${zoneId}/recordsets`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateRecordSet(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      zoneId,
      id,
      ...body
    }: {
      zoneId: string;
      id: string;
      records: string[];
      ttl?: number;
      description?: string;
    }) =>
      apiFetch<RecordSet>(`${BASE}/zones/${zoneId}/recordsets/${id}`, {
        method: "PUT",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteRecordSet(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ zoneId, id }: { zoneId: string; id: string }) =>
      apiFetch<void>(`${BASE}/zones/${zoneId}/recordsets/${id}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}
