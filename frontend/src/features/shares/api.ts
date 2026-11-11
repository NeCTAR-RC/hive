// Queries and mutations for the Share panels (Manila), keyed by
// `queryKeys.shares`. Lists poll while anything is busy, and every write
// refreshes the whole service.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  SecurityService,
  SecurityServiceRequest,
  SecurityServiceUpdate,
  Share,
  ShareAccessResponse,
  ShareAccessRule,
  ShareCreateRequest,
  ShareDetail,
  ShareGroup,
  ShareGroupDetail,
  ShareGroupSnapshot,
  ShareMetadataSaved,
  ShareOptions,
  ShareSnapshot,
  ShareSnapshotDetail,
  ShareSnapshotsResponse,
  SharesResponse,
} from "../../lib/api/types/shares";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";

const keys = queryKeys.shares;

const BASE = "/api/shares";
function pollWhileAnyBusy<T extends { is_transitional: boolean }>(query: {
  state: { data?: Items<T> | undefined };
}) {
  return pollWhile(
    query,
    query.state.data?.items.some((i) => i.is_transitional),
  );
}

export function shareOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<ShareOptions>(`${BASE}/options`),
    staleTime: staleTimes.list,
  });
}

export function sharesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.shares.list(projectId),
    queryFn: getJson<SharesResponse>(`${BASE}/shares`),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileAnyBusy,
  });
}

export function shareQuery(projectId: string, shareId: string) {
  return queryOptions({
    queryKey: keys.shares.detail(projectId, shareId),
    queryFn: getJson<ShareDetail>(`${BASE}/shares/${shareId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function shareAccessQuery(projectId: string, shareId: string) {
  return queryOptions({
    queryKey: [...keys.shares.detail(projectId, shareId), "access"],
    queryFn: getJson<ShareAccessResponse>(`${BASE}/shares/${shareId}/access`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((r) =>
          ["queued_to_apply", "applying", "queued_to_deny", "denying"].includes(
            r.state ?? "",
          ),
        ),
      ),
  });
}

export function shareSnapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.snapshots.list(projectId),
    queryFn: getJson<ShareSnapshotsResponse>(`${BASE}/snapshots`),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileAnyBusy,
  });
}

export function shareSnapshotQuery(projectId: string, snapshotId: string) {
  return queryOptions({
    queryKey: keys.snapshots.detail(projectId, snapshotId),
    queryFn: getJson<ShareSnapshotDetail>(`${BASE}/snapshots/${snapshotId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function securityServicesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.securityServices.list(projectId),
    queryFn: getJson<Items<SecurityService> & { types: string[] }>(
      `${BASE}/security-services`,
    ),
    staleTime: staleTimes.list,
  });
}

export function securityServiceQuery(projectId: string, serviceId: string) {
  return queryOptions({
    queryKey: keys.securityServices.detail(projectId, serviceId),
    queryFn: getJson<SecurityService>(`${BASE}/security-services/${serviceId}`),
    staleTime: staleTimes.detail,
  });
}

export function shareGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.groups.list(projectId),
    queryFn: getJson<Items<ShareGroup>>(`${BASE}/groups`),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileAnyBusy,
  });
}

export function shareGroupQuery(projectId: string, groupId: string) {
  return queryOptions({
    queryKey: keys.groups.detail(projectId, groupId),
    queryFn: getJson<ShareGroupDetail>(`${BASE}/groups/${groupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function shareGroupSnapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.groupSnapshots.list(projectId),
    queryFn: getJson<Items<ShareGroupSnapshot>>(`${BASE}/group-snapshots`),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileAnyBusy,
  });
}

/** What every Manila write makes stale: the whole service. */
export const shareWriteKeys = [keys.service.all];

/** A mutation that refreshes every Manila query once it settles. */
function useSimpleMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void invalidate(...shareWriteKeys),
  });
}

export function useCreateShare() {
  return useSimpleMutation((body: ShareCreateRequest) =>
    apiFetch<Share>(`${BASE}/shares`, { method: "POST", json: body }),
  );
}

export function useUpdateShare() {
  return useSimpleMutation(
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

export function useSetShareMetadata() {
  return useSimpleMutation(
    ({ id, metadata }: { id: string; metadata: string }) =>
      apiFetch<ShareMetadataSaved>(`${BASE}/shares/${id}/metadata`, {
        method: "PUT",
        json: { metadata },
      }),
  );
}

export function useResizeShare() {
  return useSimpleMutation(({ id, size }: { id: string; size: number }) =>
    apiFetch<unknown>(`${BASE}/shares/${id}/resize`, {
      method: "POST",
      json: { size },
    }),
  );
}

export function useRevertShare() {
  return useSimpleMutation(
    ({ id, snapshotId }: { id: string; snapshotId: string }) =>
      apiFetch<unknown>(`${BASE}/shares/${id}/revert`, {
        method: "POST",
        json: { snapshot_id: snapshotId },
      }),
  );
}

/** Deletes one share; a batch sends it per share. */
export function deleteShare(id: string) {
  return apiFetch<void>(`${BASE}/shares/${id}`, { method: "DELETE" });
}

export function useAllowAccess() {
  return useSimpleMutation(
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

/** Removes one access rule from a share. */
export function denyAccess(shareId: string, accessId: string) {
  return apiFetch<void>(`${BASE}/shares/${shareId}/access/${accessId}`, {
    method: "DELETE",
  });
}

export function useCreateSnapshot() {
  return useSimpleMutation(
    (body: { share_id: string; name: string; description?: string }) =>
      apiFetch<ShareSnapshot>(`${BASE}/snapshots`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useUpdateSnapshot() {
  return useSimpleMutation(
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareSnapshot>(`${BASE}/snapshots/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

/** Deletes one share snapshot. */
export function deleteSnapshot(id: string) {
  return apiFetch<void>(`${BASE}/snapshots/${id}`, { method: "DELETE" });
}

export function useSnapshotAllowAccess() {
  return useSimpleMutation(
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

/** Removes one access rule from a mountable share snapshot. */
export function denySnapshotAccess(snapshotId: string, accessId: string) {
  return apiFetch<void>(`${BASE}/snapshots/${snapshotId}/access/${accessId}`, {
    method: "DELETE",
  });
}

export function useCreateSecurityService() {
  return useSimpleMutation((body: SecurityServiceRequest) =>
    apiFetch<SecurityService>(`${BASE}/security-services`, {
      method: "POST",
      json: body,
    }),
  );
}

export function useUpdateSecurityService() {
  return useSimpleMutation(
    ({ id, ...body }: SecurityServiceUpdate & { id: string }) =>
      apiFetch<SecurityService>(`${BASE}/security-services/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

/** Deletes one security service. */
export function deleteSecurityService(id: string) {
  return apiFetch<void>(`${BASE}/security-services/${id}`, {
    method: "DELETE",
  });
}

export function useCreateShareGroup() {
  return useSimpleMutation(
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

export function useUpdateShareGroup() {
  return useSimpleMutation(
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareGroup>(`${BASE}/groups/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

/** Deletes one (empty) share group. */
export function deleteShareGroup(id: string) {
  return apiFetch<void>(`${BASE}/groups/${id}`, { method: "DELETE" });
}

export function useCreateShareGroupSnapshot() {
  return useSimpleMutation(
    (body: { share_group_id: string; name: string; description?: string }) =>
      apiFetch<ShareGroupSnapshot>(`${BASE}/group-snapshots`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useUpdateShareGroupSnapshot() {
  return useSimpleMutation(
    ({ id, ...body }: { id: string; name?: string; description?: string }) =>
      apiFetch<ShareGroupSnapshot>(`${BASE}/group-snapshots/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

/** Deletes one share group snapshot. */
export function deleteShareGroupSnapshot(id: string) {
  return apiFetch<void>(`${BASE}/group-snapshots/${id}`, { method: "DELETE" });
}
