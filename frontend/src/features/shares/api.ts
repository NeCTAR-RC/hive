// Queries and mutations for the Share panels (Manila), keyed under
// `['project', pid, 'manila', ...]`. Lists poll while anything is busy.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  ShareAccessRule,
  Items,
  SecurityService,
  SecurityServiceRequest,
  Share,
  ShareAccessResponse,
  ShareCreateRequest,
  ShareDetail,
  ShareGroup,
  ShareGroupDetail,
  ShareGroupSnapshot,
  ShareOptions,
  ShareSnapshot,
  ShareSnapshotDetail,
  ShareSnapshotsResponse,
  SharesResponse,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function manilaKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "manila", ...rest] as const;
}

const BASE = "/api/shares";
const POLL_MS = 5000;

function pollWhile<T extends { is_transitional: boolean }>(
  data: Items<T> | undefined,
) {
  return data?.items.some((i) => i.is_transitional) ? POLL_MS : false;
}

export function shareOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "options"),
    queryFn: () => apiFetch<ShareOptions>(`${BASE}/options`),
    staleTime: staleTimes.list,
  });
}

export function sharesQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "shares"),
    queryFn: () => apiFetch<SharesResponse>(`${BASE}/shares`),
    staleTime: staleTimes.list,
    refetchInterval: (query) => pollWhile(query.state.data),
  });
}

export function shareQuery(projectId: string, shareId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "share", shareId),
    queryFn: () => apiFetch<ShareDetail>(`${BASE}/shares/${shareId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function shareAccessQuery(projectId: string, shareId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "share", shareId, "access"),
    queryFn: () =>
      apiFetch<ShareAccessResponse>(`${BASE}/shares/${shareId}/access`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) =>
        ["queued_to_apply", "applying", "queued_to_deny", "denying"].includes(
          r.state ?? "",
        ),
      )
        ? POLL_MS
        : false,
  });
}

export function shareSnapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "snapshots"),
    queryFn: () => apiFetch<ShareSnapshotsResponse>(`${BASE}/snapshots`),
    staleTime: staleTimes.list,
    refetchInterval: (query) => pollWhile(query.state.data),
  });
}

export function shareSnapshotQuery(projectId: string, snapshotId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "snapshot", snapshotId),
    queryFn: () =>
      apiFetch<ShareSnapshotDetail>(`${BASE}/snapshots/${snapshotId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function securityServicesQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "security-services"),
    queryFn: () =>
      apiFetch<Items<SecurityService> & { types: string[] }>(
        `${BASE}/security-services`,
      ),
    staleTime: staleTimes.list,
  });
}

export function securityServiceQuery(projectId: string, serviceId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "security-service", serviceId),
    queryFn: () =>
      apiFetch<SecurityService>(`${BASE}/security-services/${serviceId}`),
    staleTime: staleTimes.detail,
  });
}

export function shareGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "groups"),
    queryFn: () => apiFetch<Items<ShareGroup>>(`${BASE}/groups`),
    staleTime: staleTimes.list,
    refetchInterval: (query) => pollWhile(query.state.data),
  });
}

export function shareGroupQuery(projectId: string, groupId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "group", groupId),
    queryFn: () => apiFetch<ShareGroupDetail>(`${BASE}/groups/${groupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function shareGroupSnapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: manilaKey(projectId, "group-snapshots"),
    queryFn: () =>
      apiFetch<Items<ShareGroupSnapshot>>(`${BASE}/group-snapshots`),
    staleTime: staleTimes.list,
    refetchInterval: (query) => pollWhile(query.state.data),
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: manilaKey(projectId) });
}

function useSimpleMutation<TArgs, TResult>(
  projectId: string,
  fn: (args: TArgs) => Promise<TResult>,
) {
  const invalidate = useInvalidate(projectId);
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export function useCreateShare(projectId: string) {
  return useSimpleMutation(projectId, (body: ShareCreateRequest) =>
    apiFetch<Share>(`${BASE}/shares`, { method: "POST", json: body }),
  );
}

export function useUpdateShare(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      is_public?: boolean;
    }) =>
      apiFetch<Share>(`${BASE}/shares/${id}`, { method: "PATCH", json: body }),
  );
}

export function useSetShareMetadata(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, metadata }: { id: string; metadata: string }) =>
      apiFetch<{ metadata: Record<string, string> }>(
        `${BASE}/shares/${id}/metadata`,
        { method: "PUT", json: { metadata } },
      ),
  );
}

export function useResizeShare(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, size }: { id: string; size: number }) =>
      apiFetch<unknown>(`${BASE}/shares/${id}/resize`, {
        method: "POST",
        json: { size },
      }),
  );
}

export function useRevertShare(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, snapshotId }: { id: string; snapshotId: string }) =>
      apiFetch<unknown>(`${BASE}/shares/${id}/revert`, {
        method: "POST",
        json: { snapshot_id: snapshotId },
      }),
  );
}

export function useDeleteShare(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/shares/${id}`, { method: "DELETE" }),
  );
}

export function useAllowAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      shareId,
      ...body
    }: {
      shareId: string;
      access_type: string;
      access_to: string;
      access_level: string;
    }) =>
      apiFetch<ShareAccessRule>(`${BASE}/shares/${shareId}/access`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useDenyAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ shareId, accessId }: { shareId: string; accessId: string }) =>
      apiFetch<void>(`${BASE}/shares/${shareId}/access/${accessId}`, {
        method: "DELETE",
      }),
  );
}

export function useCreateSnapshot(projectId: string) {
  return useSimpleMutation(
    projectId,
    (body: { share_id: string; name: string; description?: string }) =>
      apiFetch<ShareSnapshot>(`${BASE}/snapshots`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useUpdateSnapshot(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareSnapshot>(`${BASE}/snapshots/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

export function useDeleteSnapshot(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/snapshots/${id}`, { method: "DELETE" }),
  );
}

export function useSnapshotAllowAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      snapshotId,
      ...body
    }: {
      snapshotId: string;
      access_type: string;
      access_to: string;
    }) =>
      apiFetch<unknown>(`${BASE}/snapshots/${snapshotId}/access`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useSnapshotDenyAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ snapshotId, accessId }: { snapshotId: string; accessId: string }) =>
      apiFetch<void>(`${BASE}/snapshots/${snapshotId}/access/${accessId}`, {
        method: "DELETE",
      }),
  );
}

export function useCreateSecurityService(projectId: string) {
  return useSimpleMutation(projectId, (body: SecurityServiceRequest) =>
    apiFetch<SecurityService>(`${BASE}/security-services`, {
      method: "POST",
      json: body,
    }),
  );
}

export function useUpdateSecurityService(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, ...body }: SecurityServiceRequest & { id: string }) =>
      apiFetch<SecurityService>(`${BASE}/security-services/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

export function useDeleteSecurityService(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/security-services/${id}`, { method: "DELETE" }),
  );
}

export function useCreateShareGroup(projectId: string) {
  return useSimpleMutation(
    projectId,
    (body: {
      name: string;
      description?: string;
      share_group_type_id?: string;
      share_types?: string[];
      availability_zone?: string;
      snapshot_id?: string;
    }) =>
      apiFetch<ShareGroup>(`${BASE}/groups`, { method: "POST", json: body }),
  );
}

export function useUpdateShareGroup(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareGroup>(`${BASE}/groups/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

export function useDeleteShareGroup(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/groups/${id}`, { method: "DELETE" }),
  );
}

export function useCreateShareGroupSnapshot(projectId: string) {
  return useSimpleMutation(
    projectId,
    (body: { share_group_id: string; name: string; description?: string }) =>
      apiFetch<ShareGroupSnapshot>(`${BASE}/group-snapshots`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useUpdateShareGroupSnapshot(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareGroupSnapshot>(`${BASE}/group-snapshots/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

export function useDeleteShareGroupSnapshot(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/group-snapshots/${id}`, { method: "DELETE" }),
  );
}
