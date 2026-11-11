// The request bodies the mocked volume endpoints accept, each tied to the
// frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  BackupCreateRequest,
  MetadataUpdateRequest,
  RestoreRequest,
  RetypeRequest,
  SnapshotCreateRequest,
  TransferAcceptRequest,
  TransferCreateRequest,
  VolumeCreateRequest,
  VolumeUpdateRequest,
} from "../../lib/api/types/volumes";

const size = z.number().int().min(1);

export const volumeCreateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  size,
  availability_zone: z.string().optional(),
  volume_type: z.string().optional(),
  source: z
    .object({
      type: z.enum(["image", "snapshot", "volume"]),
      id: z.string().min(1),
    })
    .optional(),
}) satisfies z.ZodType<VolumeCreateRequest>;

export const volumeUpdateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  bootable: z.boolean().optional(),
}) satisfies z.ZodType<VolumeUpdateRequest>;

export const volumeExtendBody = z.object({ new_size: size });

export const volumeAttachBody = z.object({
  instance_id: z.string().min(1),
  device: z.string().optional(),
});

export const volumeDetachBody = z.object({ instance_id: z.string().min(1) });

export const uploadToImageBody = z.object({
  image_name: z.string().min(1),
  disk_format: z.string().min(1),
  force: z.boolean(),
});

export const retypeBody = z.object({
  volume_type: z.string().min(1),
  migration_policy: z.enum(["never", "on-demand"]).optional(),
}) satisfies z.ZodType<RetypeRequest>;

export const metadataBody = z.object({
  metadata: z.record(z.string().min(1).max(255), z.string().max(255)),
}) satisfies z.ZodType<MetadataUpdateRequest>;

export const transferCreateBody = z.object({
  name: z.string().trim().min(1).max(255),
}) satisfies z.ZodType<TransferCreateRequest>;

export const transferAcceptBody = z.object({
  transfer_id: z.string().trim().min(1).max(36),
  auth_key: z.string().trim().min(1).max(16),
}) satisfies z.ZodType<TransferAcceptRequest>;

export const snapshotCreateBody = z.object({
  volume_id: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
}) satisfies z.ZodType<SnapshotCreateRequest>;

export const snapshotUpdateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
});

export const backupCreateBody = z.object({
  volume_id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  container: z.string().optional(),
  snapshot_id: z.string().optional(),
  incremental: z.boolean().optional(),
}) satisfies z.ZodType<BackupCreateRequest>;

export const restoreBody = z.object({
  volume_id: z.string().optional(),
  name: z.string().optional(),
  availability_zone: z.string().optional(),
  volume_type: z.string().optional(),
}) satisfies z.ZodType<RestoreRequest>;
