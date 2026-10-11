// Create-volume rules the dialogs share, mirroring the backend's
// hive.nectar.volumes so the form can explain limits before submitting.
import type {
  VolumeLimits,
  VolumeOptions,
  VolumeSourceType,
} from "../../../lib/api/types";

const GIB = 1024 ** 3;

/** Gigabytes left in the quota, or null when the quota is unlimited. */
export function gigabytesAvailable(limits: VolumeLimits | undefined) {
  const max = limits?.maxTotalVolumeGigabytes;
  if (max === undefined || max < 0) return null;
  return Math.max(0, max - (limits?.totalGigabytesUsed ?? 0));
}

/** The types offered for a zone: every type when none names a zone. */
export function typesForZone(options: VolumeOptions | undefined, zone: string) {
  const types = options?.volume_types ?? [];
  if (!options?.has_zoned_types) return types;
  return types.filter((t) => !t.zones || t.zones.includes(zone));
}

/** The smallest volume a source allows, as Horizon's CreateForm checks. */
export function sizeFloor(
  options: VolumeOptions | undefined,
  source: VolumeSourceType | "none",
  sourceId: string,
): number {
  if (!options || source === "none" || !sourceId) return 1;
  if (source === "image") {
    const image = options.images.find((i) => i.id === sourceId);
    if (!image) return 1;
    return Math.max(1, Math.ceil((image.size ?? 0) / GIB), image.min_disk);
  }
  const list = source === "snapshot" ? options.snapshots : options.volumes;
  return Math.max(1, list.find((i) => i.id === sourceId)?.size_gb ?? 1);
}
