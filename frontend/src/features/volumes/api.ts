// Queries and mutations for the Volumes panels, keyed by
// `queryKeys.volumes`. Attach and detach also touch the instance's volume
// list, and upload to image touches the images list.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Accepted, Items } from "../../lib/api/types/common";
import type {
  BackupCreateRequest,
  MetadataUpdateRequest,
  RestoreRequest,
  RestoreResult,
  RetypeRequest,
  SnapshotCreateRequest,
  TransferAcceptRequest,
  TransferCreateRequest,
  Volume,
  VolumeAttached,
  VolumeBackup,
  VolumeCreateRequest,
  VolumeExtended,
  VolumeLimits,
  VolumeMetadataSaved,
  VolumeOptions,
  VolumeSnapshot,
  VolumeTransferAccepted,
  VolumeTransferCreated,
  VolumeUpdateRequest,
  VolumeUploadedToImage,
} from "../../lib/api/types/volumes";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";
import { isTransitional } from "./status";

const keys = queryKeys.volumes;

export function volumesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.volumes.list(projectId),
    queryFn: getJson<Items<Volume>>("/api/volumes"),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.items.some(isTransitional)),
  });
}

export function volumeQuery(projectId: string, volumeId: string) {
  return queryOptions({
    queryKey: keys.volumes.detail(projectId, volumeId),
    queryFn: getJson<Volume>(`/api/volumes/${volumeId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data && isTransitional(query.state.data)),
  });
}

export function snapshotsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.snapshots.list(projectId),
    queryFn: getJson<Items<VolumeSnapshot>>("/api/volumes/snapshots"),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.items.some(isTransitional)),
  });
}

export function snapshotQuery(projectId: string, snapshotId: string) {
  return queryOptions({
    queryKey: keys.snapshots.detail(projectId, snapshotId),
    queryFn: getJson<VolumeSnapshot>(`/api/volumes/snapshots/${snapshotId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data && isTransitional(query.state.data)),
  });
}

export function backupsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.backups.list(projectId),
    queryFn: getJson<Items<VolumeBackup>>("/api/volumes/backups"),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.items.some(isTransitional)),
  });
}

export function backupQuery(projectId: string, backupId: string) {
  return queryOptions({
    queryKey: keys.backups.detail(projectId, backupId),
    queryFn: getJson<VolumeBackup>(`/api/volumes/backups/${backupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data && isTransitional(query.state.data)),
  });
}

export function volumeOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<VolumeOptions>("/api/volumes/options"),
    staleTime: staleTimes.list,
  });
}

export function volumeLimitsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.limits.all(projectId),
    queryFn: getJson<VolumeLimits>("/api/volumes/limits"),
    staleTime: staleTimes.quota,
  });
}

/**
 * What creating, extending or deleting a volume or snapshot (and creating
 * or restoring a backup) marks stale: the whole service, because the
 * lists read each other (a volume's `has_snapshots`, a snapshot's volume
 * name) and the project's limits count them all.
 */
export const volumeServiceWriteKeys = [keys.service.all];

/**
 * What deleting a backup marks stale: the backups, and the limits that
 * count them (Create backup greys out on the backup quota).
 */
export const backupWriteKeys = [keys.backups.all, keys.limits.all];

export function useCreateVolume() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: VolumeCreateRequest) =>
      apiFetch<Volume>("/api/volumes", { method: "POST", json: body }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}

export function useUpdateVolume() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      volumeId,
      ...body
    }: VolumeUpdateRequest & { volumeId: string }) =>
      apiFetch<Volume>(`/api/volumes/${volumeId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate(keys.volumes.all),
  });
}

/** What carries metadata here: a volume or a volume snapshot, by id. */
export interface MetadataTarget {
  kind: "volume" | "snapshot";
  id: string;
}

/**
 * Replaces the metadata of a volume or a snapshot; keys left out are
 * removed. Only the target's own kind is marked stale.
 */
export function useSetMetadata() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      kind,
      id,
      ...body
    }: MetadataTarget & MetadataUpdateRequest) =>
      apiFetch<VolumeMetadataSaved>(
        kind === "volume"
          ? `/api/volumes/${id}/metadata`
          : `/api/volumes/snapshots/${id}/metadata`,
        { method: "PUT", json: body },
      ),
    onSettled: (_data, _error, { kind }) =>
      invalidate(kind === "volume" ? keys.volumes.all : keys.snapshots.all),
  });
}

export function useRetypeVolume() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ volumeId, ...body }: RetypeRequest & { volumeId: string }) =>
      apiFetch<Accepted>(`/api/volumes/${volumeId}/retype`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(keys.volumes.all),
  });
}

/** Offers the volume to another project; the reply holds the one-time key. */
export function useCreateTransfer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      volumeId,
      ...body
    }: TransferCreateRequest & { volumeId: string }) =>
      apiFetch<VolumeTransferCreated>(`/api/volumes/${volumeId}/transfer`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(keys.volumes.all),
  });
}

/** Cancels the transfer waiting on one volume; a batch sends it per volume. */
export function cancelTransfer(volumeId: string) {
  return apiFetch<void>(`/api/volumes/${volumeId}/transfer`, {
    method: "DELETE",
  });
}

/**
 * Takes a volume another project offered. The volume and the quota it
 * uses arrive in this project, so the whole service is marked stale.
 */
export function useAcceptTransfer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: TransferAcceptRequest) =>
      apiFetch<VolumeTransferAccepted>("/api/volumes/transfers/accept", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}

/** Deletes one volume; a batch sends it per volume. */
export function deleteVolume(volumeId: string) {
  return apiFetch<void>(`/api/volumes/${volumeId}`, { method: "DELETE" });
}

export function useExtendVolume() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      volumeId,
      newSize,
    }: {
      volumeId: string;
      newSize: number;
    }) =>
      apiFetch<VolumeExtended>(`/api/volumes/${volumeId}/extend`, {
        method: "POST",
        json: { new_size: newSize },
      }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}

export function useAttachVolume() {
  const invalidate = useInvalidate();
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
      apiFetch<VolumeAttached>(`/api/volumes/${volumeId}/attach`, {
        method: "POST",
        json: { instance_id: instanceId, ...(device ? { device } : {}) },
      }),
    onSettled: () =>
      invalidate(keys.volumes.all, queryKeys.compute.instances.all),
  });
}

/** What attaching or detaching a volume marks stale: both sides. */
export const volumeAttachmentWriteKeys = [
  keys.volumes.all,
  queryKeys.compute.instances.all,
];

/** Detaches one volume from one instance. */
export function detachVolume({
  volumeId,
  instanceId,
}: {
  volumeId: string;
  instanceId: string;
}) {
  return apiFetch<Accepted>(`/api/volumes/${volumeId}/detach`, {
    method: "POST",
    json: { instance_id: instanceId },
  });
}

export function useDetachVolume() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: detachVolume,
    onSettled: () => invalidate(...volumeAttachmentWriteKeys),
  });
}

export function useUploadToImage() {
  const invalidate = useInvalidate();
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
      apiFetch<VolumeUploadedToImage>(
        `/api/volumes/${volumeId}/upload-to-image`,
        { method: "POST", json: body },
      ),
    onSettled: () => invalidate(keys.volumes.all, queryKeys.compute.images.all),
  });
}

export function useCreateSnapshot() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: SnapshotCreateRequest) =>
      apiFetch<VolumeSnapshot>("/api/volumes/snapshots", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}

export function useUpdateSnapshot() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.snapshots.all),
  });
}

/** Deletes one volume snapshot; a batch sends it per snapshot. */
export function deleteSnapshot(snapshotId: string) {
  return apiFetch<void>(`/api/volumes/snapshots/${snapshotId}`, {
    method: "DELETE",
  });
}

export function useCreateBackup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: BackupCreateRequest) =>
      apiFetch<VolumeBackup>("/api/volumes/backups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}

/** Deletes one volume backup; a batch sends it per backup. */
export function deleteBackup(backupId: string) {
  return apiFetch<void>(`/api/volumes/backups/${backupId}`, {
    method: "DELETE",
  });
}

export function useRestoreBackup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      backupId,
      ...body
    }: RestoreRequest & { backupId: string }) =>
      apiFetch<RestoreResult>(`/api/volumes/backups/${backupId}/restore`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...volumeServiceWriteKeys),
  });
}
