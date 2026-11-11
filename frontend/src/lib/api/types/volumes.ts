/**
 * Volumes (Cinder): volumes, snapshots, backups and volume types.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type VolumeAttachment = Schemas["VolumeAttachment"];

/**
 * A volume; `has_snapshots` is null when the listing did not check, and
 * `fault` is read only by the detail of a volume in an error status.
 */
export type Volume = Schemas["Volume"];
export type VolumeFault = Schemas["VolumeFault"];

export type VolumeSnapshot = Schemas["VolumeSnapshot"];
export type VolumeBackup = Schemas["VolumeBackup"];

/** A volume type; `zones` lists the zones it is limited to, null for any. */
export type VolumeType = Schemas["VolumeType"];

export type VolumeLimits = Schemas["VolumeLimits"];
export type VolumeOptionImage = Schemas["VolumeOptionImage"];
export type VolumeOptions = Schemas["VolumeOptions"];
export type VolumeSourceType = Schemas["VolumeSource"]["type"];

/** The create body (the backend's `VolumeCreate`). */
export type VolumeCreateRequest = Schemas["VolumeCreate"];

/** The edit body (the backend's `VolumeUpdate`). */
export type VolumeUpdateRequest = Schemas["VolumeUpdate"];

/** The snapshot create body (the backend's `VolumeSnapshotCreate`). */
export type SnapshotCreateRequest = Schemas["VolumeSnapshotCreate"];

/** The backup create body (the backend's `VolumeBackupCreate`). */
export type BackupCreateRequest = Schemas["VolumeBackupCreate"];

/** The change volume type body (the backend's `RetypeRequest`). */
export type RetypeRequest = Schemas["RetypeRequest"];
export type RetypeMigrationPolicy = NonNullable<
  RetypeRequest["migration_policy"]
>;

/** The metadata body of a volume or a snapshot (the backend's `MetadataUpdate`). */
export type MetadataUpdateRequest = Schemas["MetadataUpdate"];
export type VolumeMetadataSaved = Schemas["VolumeMetadataSaved"];

/** The create transfer body (the backend's `TransferCreate`). */
export type TransferCreateRequest = Schemas["TransferCreate"];

/** The accept transfer body (the backend's `TransferAccept`). */
export type TransferAcceptRequest = Schemas["TransferAccept"];
export type VolumeTransferCreated = Schemas["VolumeTransferCreated"];
export type VolumeTransferAccepted = Schemas["VolumeTransferAccepted"];

export type RestoreRequest = Schemas["RestoreRequest"];
export type VolumeExtended = Schemas["VolumeExtended"];
export type VolumeAttached = Schemas["VolumeAttached"];
export type VolumeUploadedToImage = Schemas["VolumeUploadedToImage"];

/**
 * The reply to a backup restore: the backend's `RestoreResult`, or
 * `RestoreResultNewVolume` (with the new `volume`) when the restore
 * created a volume.
 */
export type RestoreResult =
  Schemas["RestoreResult"] | Schemas["RestoreResultNewVolume"];
