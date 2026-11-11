// Volume rules the dialogs and the list share: the create and retype limits,
// mirroring the backend's hive.nectar.volumes so the form can explain them
// before submitting, the sources, types, instances and snapshots each dialog
// offers, and the quota that blocks a new volume.
import type { Option } from "../../../components/Form/fields/props";
import type { Instance } from "../../../lib/api/types/compute";
import type {
  Volume,
  VolumeLimits,
  VolumeOptions,
  VolumeSnapshot,
  VolumeSourceType,
} from "../../../lib/api/types/volumes";
import { formatBytes, formatGb } from "../../../lib/format";
import { statusLabel } from "../status";

const GIB = 1024 ** 3;

/** What a new volume starts from: a source, or nothing for an empty one. */
export type VolumeSource = VolumeSourceType | "none";

/** The kinds of source the create dialog offers, in Horizon's order. */
export const VOLUME_SOURCES: { id: VolumeSource; label: string }[] = [
  { id: "none", label: "No source (empty volume)" },
  { id: "image", label: "Image" },
  { id: "snapshot", label: "Volume snapshot" },
  { id: "volume", label: "Another volume" },
];

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

/** How a volume type reads in a picker: its name, then its description. */
export function typeLabel(type: { name: string; description: string | null }) {
  return type.description ? `${type.name} (${type.description})` : type.name;
}

/**
 * The types a volume can change to: every type but its own, and, when
 * types name zones, only those that serve the volume's zone (the backend's
 * `VolumeRules.retype_body` refuses the others).
 */
export function retypeChoices(
  options: VolumeOptions | undefined,
  volume: Pick<Volume, "volume_type" | "availability_zone">,
): Option[] {
  const types = volume.availability_zone
    ? typesForZone(options, volume.availability_zone)
    : (options?.volume_types ?? []);
  return types
    .filter((t) => t.name !== volume.volume_type)
    .map((t) => ({ id: t.name, label: typeLabel(t) }));
}

/** The smallest volume a source allows, as Horizon's CreateForm checks. */
export function sizeFloor(
  options: VolumeOptions | undefined,
  source: VolumeSource,
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

/**
 * Why a new volume of `size` GB cannot be created, or null when it can: the
 * size must cover the source and fit the remaining quota, as Horizon's
 * CreateForm checks.
 */
export function createSizeError(
  size: number,
  floor: number,
  available: number | null,
): string | null {
  if (size < floor) {
    return `The volume size cannot be less than the source size (${floor} GB)`;
  }
  if (available !== null && size > available) {
    return `A ${size} GB volume cannot be created: ${available} GB of your quota is available`;
  }
  return null;
}

/** A snapshot or volume source fixes the new volume's zone and type. */
export function inheritsPlacement(source: VolumeSource) {
  return source === "snapshot" || source === "volume";
}

/**
 * The sources of the chosen kind, each labelled with its size so the user
 * sees the floor it sets.
 */
export function sourceChoices(
  options: VolumeOptions | undefined,
  source: VolumeSource,
): Option[] {
  if (!options) return [];
  if (source === "image")
    return options.images.map((i) => ({
      id: i.id,
      label: `${i.name ?? i.id}${i.is_snapshot ? " (instance snapshot)" : ""}${i.size ? ` (${formatBytes(i.size)})` : ""}`,
    }));
  if (source === "snapshot")
    return options.snapshots.map((s) => ({
      id: s.id,
      label: `${s.name || s.id} (${formatGb(s.size_gb)})`,
    }));
  if (source === "volume")
    return options.volumes.map((v) => ({
      id: v.id,
      label: `${v.name || v.id} (${formatGb(v.size_gb)})`,
    }));
  return [];
}

/**
 * Why no volume can be created now, or null when the quota allows one: the
 * list's create button is disabled with this reason.
 */
export function createQuotaReason(limits: VolumeLimits | undefined) {
  if (!limits) return null;
  const maxVolumes = limits.maxTotalVolumes ?? -1;
  if (maxVolumes >= 0 && (limits.totalVolumesUsed ?? 0) >= maxVolumes)
    return "You are using all of your available volumes";
  const maxGb = limits.maxTotalVolumeGigabytes ?? -1;
  if (maxGb >= 0 && (limits.totalGigabytesUsed ?? 0) >= maxGb)
    return "You are using all of your volume storage quota";
  return null;
}

/** Whether the volume can take another attachment: it is free or multi-attach. */
export function canAttachMore(
  volume: Pick<Volume, "attachments" | "multiattach">,
) {
  return volume.attachments.length === 0 || volume.multiattach;
}

/**
 * Why the volume cannot be attached to another instance now, or null when
 * it can: it must be settled (available or in use), and free or
 * multi-attach. A detach in progress says so, so the user waits rather
 * than closes the dialog.
 */
export function attachBlockReason(
  volume: Pick<Volume, "status" | "attachments" | "multiattach">,
): string | null {
  if (volume.status !== "available" && volume.status !== "in-use") {
    return `The volume is ${statusLabel(volume.status).toLowerCase()}. You can attach it once it is available.`;
  }
  if (!canAttachMore(volume)) {
    return "Detach the volume before attaching it to another instance.";
  }
  return null;
}

/** The instance statuses a volume can be attached in. */
const ATTACH_READY = new Set(["ACTIVE", "SHUTOFF"]);

/** The instances the volume can be attached to: active or shut off, and not holding it yet. */
export function attachCandidates<T extends Pick<Instance, "id" | "status">>(
  instances: T[],
  volume: Pick<Volume, "attachments">,
): T[] {
  const attached = new Set(volume.attachments.map((a) => a.server_id));
  return instances.filter(
    (i) => ATTACH_READY.has(i.status) && !attached.has(i.id),
  );
}

/**
 * Whether the volume can be attached to the instance by zone: Cinder
 * attaches only within the volume's availability zone. A zone unknown on
 * either side is not held against the instance.
 */
export function inVolumeZone(
  instance: Pick<Instance, "availability_zone">,
  volume: Pick<Volume, "availability_zone">,
): boolean {
  return (
    !volume.availability_zone ||
    !instance.availability_zone ||
    instance.availability_zone === volume.availability_zone
  );
}

/**
 * The attach picker's choices: every candidate, with those in another zone
 * listed but disabled and saying where they are, so the user sees why an
 * instance cannot be chosen.
 */
export function attachOptions(
  candidates: Pick<Instance, "id" | "name" | "status" | "availability_zone">[],
  volume: Pick<Volume, "availability_zone">,
): Option[] {
  return candidates.map((instance) =>
    inVolumeZone(instance, volume)
      ? {
          id: instance.id,
          label: `${instance.name} (${instance.status.toLowerCase()})`,
        }
      : {
          id: instance.id,
          label: `${instance.name} (in ${instance.availability_zone}, another zone)`,
          isDisabled: true,
        },
  );
}

/** The snapshots a backup of the volume can be taken from: its available ones. */
export function backupSnapshots<
  T extends Pick<VolumeSnapshot, "volume_id" | "status">,
>(snapshots: T[], volumeId: string): T[] {
  return snapshots.filter(
    (s) => s.volume_id === volumeId && s.status === "available",
  );
}
