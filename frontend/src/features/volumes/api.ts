// Queries and mutations for the Volumes panels, keyed under
// `['project', pid, 'volumes', ...]`. Attach and detach also touch the
// instance's volume list, and upload to image touches the images list.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  BackupCreateRequest,
  Instance,
  Items,
  Paginated,
  RestoreRequest,
  RestoreResult,
  SnapshotCreateRequest,
  Volume,
  VolumeBackup,
  VolumeCreateRequest,
  VolumeLimits,
  VolumeOptions,
  VolumeSnapshot,
  VolumeUpdateRequest,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";
import { isTransitional } from "./status";

export function volumesKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "volumes", ...rest] as const;
}

const POLL_MS = 5000;

export function volumesQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "list"),
    queryFn: () => apiFetch<Items<Volume>>("/api/volumes"),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some(isTransitional) ? POLL_MS : false,
  });
}

export function volumeQuery(projectId: string, volumeId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "list", volumeId),
    queryFn: () => apiFetch<Volume>(`/api/volumes/${volumeId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? POLL_MS : false,
  });
}

export function snapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "snapshots"),
    queryFn: () => apiFetch<Items<VolumeSnapshot>>("/api/volumes/snapshots"),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some(isTransitional) ? POLL_MS : false,
  });
}

export function snapshotQuery(projectId: string, snapshotId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "snapshots", snapshotId),
    queryFn: () =>
      apiFetch<VolumeSnapshot>(`/api/volumes/snapshots/${snapshotId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? POLL_MS : false,
  });
}

export function backupsQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "backups"),
    queryFn: () => apiFetch<Items<VolumeBackup>>("/api/volumes/backups"),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some(isTransitional) ? POLL_MS : false,
  });
}

export function backupQuery(projectId: string, backupId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "backups", backupId),
    queryFn: () => apiFetch<VolumeBackup>(`/api/volumes/backups/${backupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? POLL_MS : false,
  });
}

export function volumeOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "options"),
    queryFn: () => apiFetch<VolumeOptions>("/api/volumes/options"),
    staleTime: staleTimes.list,
  });
}

export function volumeLimitsQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "limits"),
    queryFn: () => apiFetch<VolumeLimits>("/api/volumes/limits"),
    staleTime: staleTimes.quota,
  });
}

/** The project's instances, for the Attached To column and the attach
 * picker; kept under the volumes key so this feature owns its cache. */
export function attachableInstancesQuery(projectId: string) {
  return queryOptions({
    queryKey: volumesKey(projectId, "instances"),
    queryFn: () =>
      apiFetch<Paginated<Instance>>("/api/compute/instances", {
        query: { limit: 1000 },
      }),
    staleTime: staleTimes.list,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return (...rest: unknown[]) =>
    queryClient.invalidateQueries({ queryKey: volumesKey(projectId, ...rest) });
}

// Attach, detach and upload to image change what the Compute panels show
// too (an instance's volumes, the images list), so those keys go stale.
function useInvalidateCompute(projectId: string) {
  const queryClient = useQueryClient();
  return (resource: string) =>
    queryClient.invalidateQueries({
      queryKey: ["project", projectId, "compute", resource],
    });
}

async function deleteAll(paths: string[]) {
  const results = await Promise.allSettled(
    paths.map((path) => apiFetch<void>(path, { method: "DELETE" })),
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}

export function useCreateVolume(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: VolumeCreateRequest) =>
      apiFetch<Volume>("/api/volumes", { method: "POST", json: body }),
    onSettled: () => invalidate(),
  });
}

export function useUpdateVolume(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      volumeId,
      ...body
    }: VolumeUpdateRequest & { volumeId: string }) =>
      apiFetch<Volume>(`/api/volumes/${volumeId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("list"),
  });
}

export function useDeleteVolumes(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/volumes/${id}`)),
    onSettled: () => invalidate(),
  });
}

export function useExtendVolume(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      volumeId,
      newSize,
    }: {
      volumeId: string;
      newSize: number;
    }) =>
      apiFetch<{ status: string }>(`/api/volumes/${volumeId}/extend`, {
        method: "POST",
        json: { new_size: newSize },
      }),
    onSettled: () => invalidate(),
  });
}

export function useAttachVolume(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: ({
      volumeId,
      instanceId,
      device,
    }: {
      volumeId: string;
      instanceId: string;
      device?: string;
    }) =>
      apiFetch<{ status: string; device: string | null }>(
        `/api/volumes/${volumeId}/attach`,
        {
          method: "POST",
          json: { instance_id: instanceId, ...(device ? { device } : {}) },
        },
      ),
    onSettled: async () => {
      await invalidate("list");
      await invalidateCompute("instances");
    },
  });
}

export function useDetachVolume(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: ({
      volumeId,
      instanceId,
    }: {
      volumeId: string;
      instanceId: string;
    }) =>
      apiFetch<{ status: string }>(`/api/volumes/${volumeId}/detach`, {
        method: "POST",
        json: { instance_id: instanceId },
      }),
    onSettled: async () => {
      await invalidate("list");
      await invalidateCompute("instances");
    },
  });
}

export function useUploadToImage(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: ({
      volumeId,
      ...body
    }: {
      volumeId: string;
      image_name: string;
      disk_format: string;
      force: boolean;
    }) =>
      apiFetch<{ status: string; image_id: string | null }>(
        `/api/volumes/${volumeId}/upload-to-image`,
        { method: "POST", json: body },
      ),
    onSettled: async () => {
      await invalidate("list");
      await invalidateCompute("images");
    },
  });
}

export function useCreateSnapshot(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: SnapshotCreateRequest) =>
      apiFetch<VolumeSnapshot>("/api/volumes/snapshots", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(),
  });
}

export function useUpdateSnapshot(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      snapshotId,
      ...body
    }: {
      snapshotId: string;
      name?: string;
      description?: string;
    }) =>
      apiFetch<VolumeSnapshot>(`/api/volumes/snapshots/${snapshotId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("snapshots"),
  });
}

export function useDeleteSnapshots(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/volumes/snapshots/${id}`)),
    onSettled: () => invalidate(),
  });
}

export function useCreateBackup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: BackupCreateRequest) =>
      apiFetch<VolumeBackup>("/api/volumes/backups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(),
  });
}

export function useDeleteBackups(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/volumes/backups/${id}`)),
    onSettled: () => invalidate("backups"),
  });
}

export function useRestoreBackup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      backupId,
      ...body
    }: RestoreRequest & { backupId: string }) =>
      apiFetch<RestoreResult>(`/api/volumes/backups/${backupId}/restore`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(),
  });
}
