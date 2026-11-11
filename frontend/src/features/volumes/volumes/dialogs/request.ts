// The request bodies the volume dialogs send, built from their form values:
// blank optional fields are left out so the backend applies its defaults.
import type {
  BackupCreateRequest,
  SnapshotCreateRequest,
  Volume,
  VolumeCreateRequest,
  VolumeUpdateRequest,
} from "../../../../lib/api/types/volumes";
import { inheritsPlacement } from "../rules";
import type {
  CreateBackupValues,
  CreateSnapshotValues,
  CreateVolumeValues,
  EditVolumeValues,
} from "./schema";

/**
 * The create request: the source when one is chosen, and the zone and type
 * only when the source does not fix them.
 */
export function volumeCreateRequest(
  values: CreateVolumeValues,
): VolumeCreateRequest {
  const body: VolumeCreateRequest = { size: values.size };
  if (values.name) body.name = values.name;
  if (values.description) body.description = values.description;
  if (values.source !== "none") {
    body.source = { type: values.source, id: values.source_id };
  }
  if (!inheritsPlacement(values.source)) {
    body.availability_zone = values.availability_zone;
    if (values.volume_type) body.volume_type = values.volume_type;
  }
  return body;
}

/**
 * The update request: only the fields that differ from the volume, or null
 * when nothing changed and there is nothing to send.
 */
export function volumeUpdateRequest(
  volume: Pick<Volume, "name" | "description" | "bootable">,
  values: EditVolumeValues,
): VolumeUpdateRequest | null {
  const body: VolumeUpdateRequest = {};
  if (values.name !== volume.name) body.name = values.name;
  if (values.description !== (volume.description ?? ""))
    body.description = values.description;
  if (values.bootable !== volume.bootable) body.bootable = values.bootable;
  return Object.keys(body).length === 0 ? null : body;
}

/** The snapshot request for the volume, with the name and description given. */
export function snapshotCreateRequest(
  volumeId: string,
  values: CreateSnapshotValues,
): SnapshotCreateRequest {
  return {
    volume_id: volumeId,
    ...(values.name ? { name: values.name } : {}),
    ...(values.description ? { description: values.description } : {}),
  };
}

/**
 * The backup request for the volume: the container and snapshot only when
 * chosen, so a blank container means the default one.
 */
export function backupCreateRequest(
  volumeId: string,
  values: CreateBackupValues,
): BackupCreateRequest {
  return {
    volume_id: volumeId,
    name: values.name,
    incremental: values.incremental,
    ...(values.description ? { description: values.description } : {}),
    ...(values.container ? { container: values.container } : {}),
    ...(values.snapshot_id ? { snapshot_id: values.snapshot_id } : {}),
  };
}
