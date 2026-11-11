// Pure rules of the launch wizard: the source deep link, Nectar's network
// default, the source list each boot source type offers and what an empty
// one says, the flavours too small for an image, the quota a launch needs,
// the smallest new boot volume and the types it can take, and the user
// data size limit. The flavour classes live in launchFlavors.ts.
import type {
  ComputeLimits,
  Flavor,
  Image,
  LaunchOptions,
  LaunchSourceType,
} from "../../../lib/api/types/compute";
import type { Network } from "../../../lib/api/types/network";
import type { VolumeType } from "../../../lib/api/types/volumes";
import { formatBytes, formatGb, formatMb } from "../../../lib/format";
import { quotaPair, type QuotaPair } from "../../../lib/quota";

/**
 * The boot source a deep link names (`?source=<type>:<id>`, as the image
 * and volume pages link to the wizard), or null when the value is missing
 * or not a known type with an id.
 */
export function parseSource(
  value: string | undefined,
): { type: LaunchSourceType; id: string } | null {
  if (!value) return null;
  const [type, id] = value.split(":", 2);
  if (!id) return null;
  if (!["image", "snapshot", "volume", "volume_snapshot"].includes(type ?? ""))
    return null;
  return { type: type as LaunchSourceType, id };
}

/**
 * The note under the zone field while the chosen source is a volume: the
 * zone it lives in, which is the only zone it can boot an instance in.
 */
export function volumeZoneNote(
  options: Pick<LaunchOptions, "volumes">,
  type: LaunchSourceType,
  id: string,
): string | null {
  if (type !== "volume") return null;
  const volume = options.volumes?.find((v) => v.id === id);
  if (!volume?.availability_zone) return null;
  return `The volume ${volume.name} is in ${volume.availability_zone}, and a volume can only boot an instance in its own zone.`;
}

/**
 * The networks preselected when the wizard opens, as Horizon's launch dialog
 * applies them (launch-instance-model.service.js onGetNetworks, Gerrit change
 * 71399): the classic network when it is offered, otherwise a network only
 * when it is the sole choice.
 */
export function defaultNetworkIds(
  networks: Pick<Network, "id" | "is_classic">[] | null | undefined,
): string[] {
  const offered = networks ?? [];
  const classic = offered.find((network) => network.is_classic);
  if (classic) return [classic.id];
  const only = offered.length === 1 ? offered[0] : undefined;
  return only ? [only.id] : [];
}

/**
 * The chosen networks in the order the form keeps them, which is the
 * instance's interface order, each with its name; a network the options do
 * not list keeps its id as its name, so reordering never drops it.
 */
export function chosenNetworks(
  networks: Pick<Network, "id" | "name" | "is_classic">[] | null | undefined,
  ids: string[],
): { id: string; name: string; isClassic: boolean }[] {
  return ids.map((id) => {
    const network = networks?.find((n) => n.id === id);
    return {
      id,
      name: network?.name ?? id,
      isClassic: network?.is_classic ?? false,
    };
  });
}

/** The parts of the launch options the source step lists from. */
export type SourceOptions = Pick<
  LaunchOptions,
  "images" | "snapshots" | "volumes" | "volume_snapshots"
>;

/** One row of the source step's radio list. */
export interface SourceItem {
  id: string;
  name: string;
  meta: string;
  /** Community images stay out of the list until the user searches. */
  hiddenUntilSearch: boolean;
}

/** A short "visibility, size, minimums" line for an image or snapshot. */
function imageMeta(image: Image): string {
  const parts = [
    image.is_snapshot ? "snapshot" : image.visibility,
    formatBytes(image.size),
    image.min_disk ? `min disk ${image.min_disk} GB` : "",
    image.min_ram ? `min RAM ${formatMb(image.min_ram)}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

/** Images or snapshots as source rows, by name; `hidden` reads the flag. */
function imageItems<T extends Image>(
  images: T[],
  hidden: (image: T) => boolean,
): SourceItem[] {
  return images
    .map((image) => ({
      id: image.id,
      name: image.name ?? image.id,
      meta: imageMeta(image),
      hiddenUntilSearch: hidden(image),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every source of a type that can boot in the chosen zone, before any
 * search. Volumes are zone bound (Nova attaches them only in their own
 * zone), so a volume shows when it has no zone or the wizard has none yet.
 */
function candidates(
  options: SourceOptions,
  type: LaunchSourceType,
  zone: string,
): SourceItem[] {
  switch (type) {
    case "image":
      return imageItems(
        options.images ?? [],
        (image) => image.hidden_until_search,
      );
    case "snapshot":
      return imageItems(options.snapshots ?? [], () => false);
    case "volume":
      return (options.volumes ?? [])
        .filter(
          (volume) =>
            !zone ||
            !volume.availability_zone ||
            volume.availability_zone === zone,
        )
        .map((volume) => ({
          id: volume.id,
          name: volume.name,
          meta: `${formatGb(volume.size_gb)}${volume.availability_zone ? `, ${volume.availability_zone}` : ""}`,
          hiddenUntilSearch: false,
        }));
    case "volume_snapshot":
      return (options.volume_snapshots ?? []).map((snapshot) => ({
        id: snapshot.id,
        name: snapshot.name,
        meta: formatGb(snapshot.size_gb),
        hiddenUntilSearch: false,
      }));
  }
}

/**
 * The sources the source step lists for a type, zone and search text:
 * names matching the search (case-insensitive), with community images
 * hidden until there is a search, as Horizon's source step does. The
 * chosen source stays listed whatever the search shows, so its checked
 * radio is never hidden; a volume outside the zone is still left out.
 */
export function sourceItems(
  options: SourceOptions,
  type: LaunchSourceType,
  zone: string,
  search: string,
  chosenId: string,
): SourceItem[] {
  const needle = search.trim().toLowerCase();
  return candidates(options, type, zone).filter(
    (item) =>
      item.id === chosenId ||
      (needle
        ? item.name.toLowerCase().includes(needle)
        : !item.hiddenUntilSearch),
  );
}

/**
 * The chosen source as the source step's "Selected" line and the summary
 * name it, whatever zone it is in, or undefined when none is chosen or the
 * options do not list it.
 */
export function findSourceItem(
  options: SourceOptions,
  type: LaunchSourceType,
  id: string,
): SourceItem | undefined {
  if (!id) return undefined;
  return candidates(options, type, "").find((item) => item.id === id);
}

/**
 * Whether the chosen source is one the wizard offers for the chosen type
 * and zone. A source chosen under another type or zone is not, and
 * launching with it would boot the wrong thing or be rejected by Nova.
 */
export function isSourceOffered(
  options: SourceOptions,
  type: LaunchSourceType,
  zone: string,
  id: string,
): boolean {
  return candidates(options, type, zone).some((item) => item.id === id);
}

/**
 * What the source list says when it lists nothing: the search matched
 * nothing, or the project has no source of the type. Volumes boot only in
 * their own zone, so an empty volume list in a chosen zone says so.
 */
export function emptySourceText(
  type: LaunchSourceType,
  zone: string,
  search: string,
): string {
  if (search.trim()) return "Nothing matches your search.";
  switch (type) {
    case "image":
      return "No images are available to this project.";
    case "snapshot":
      return "This project has no instance snapshots.";
    case "volume":
      return zone
        ? `No bootable volumes in ${zone}. A volume boots an instance only in its own zone: choose another zone on the Details step, or make a volume in ${zone} bootable.`
        : "This project has no bootable volumes. A volume must be available and marked bootable.";
    case "volume_snapshot":
      return "This project has no volume snapshots.";
  }
}

/** The figures under a limit, as "8 of 32 in use". */
function inUse(
  { used, max }: QuotaPair,
  format: (value: number) => string = String,
): string {
  return `${format(used)} of ${max === null ? "unlimited" : format(max)} in use`;
}

/** How much of a quota is left, or null when it is unlimited. */
function left({ used, max }: QuotaPair): number | null {
  return max === null ? null : Math.max(0, max - used);
}

/**
 * Why the project cannot launch `count` more instances, or null when it
 * can (or the quota is unlimited or unknown).
 */
export function instanceQuotaProblem(
  limits: ComputeLimits | null | undefined,
  count: number,
): string | null {
  const instances = quotaPair(
    limits,
    "maxTotalInstances",
    "totalInstancesUsed",
  );
  const room = left(instances);
  if (room === null || count <= room) return null;
  return room === 0
    ? `Your project has no room for another instance (${inUse(instances)}). Free up quota first.`
    : `Your project can launch ${room} more ${room === 1 ? "instance" : "instances"} (${inUse(instances)}). Reduce the count or free up quota.`;
}

/**
 * Why `count` instances of `flavor` do not fit the project's vCPU or RAM
 * quota, or null when they fit (or the quota is unlimited or unknown), as
 * Horizon's flavour step flags a flavour over quota.
 */
export function flavorQuotaProblem(
  limits: ComputeLimits | null | undefined,
  flavor: Pick<Flavor, "vcpus" | "ram_mb">,
  count: number,
): string | null {
  const many =
    count > 1
      ? `${count} instances of this flavour need`
      : "This flavour needs";
  const cores = quotaPair(limits, "maxTotalCores", "totalCoresUsed");
  const coresLeft = left(cores);
  const vcpus = (flavor.vcpus ?? 0) * count;
  if (coresLeft !== null && vcpus > coresLeft) {
    return `${many} ${vcpus} vCPUs; your project has ${coresLeft} left (${inUse(cores)}).`;
  }
  const ram = quotaPair(limits, "maxTotalRAMSize", "totalRAMUsed");
  const ramLeft = left(ram);
  const mb = (flavor.ram_mb ?? 0) * count;
  if (ramLeft !== null && mb > ramLeft) {
    return `${many} ${formatMb(mb)} of RAM; your project has ${formatMb(ramLeft)} left (${inUse(ram, formatMb)}).`;
  }
  return null;
}

/** Bytes in a gigabyte, as Glance and Horizon count image sizes. */
const GIB = 1024 ** 3;

/**
 * The smallest new volume an image or snapshot needs, in GB: its size
 * rounded up, or its minimum disk when larger (Horizon's source step,
 * checkVolumeForImage; the backend checks the same).
 */
function imageVolumeFloor(
  image: Pick<Image, "size" | "min_disk"> | undefined,
): number {
  const sizeGb = Math.ceil((image?.size ?? 0) / GIB);
  return Math.max(sizeGb, image?.min_disk ?? 0, 1);
}

/**
 * The smallest new boot volume, in GB: what the image needs, raised to the
 * chosen flavour's root disk, as Horizon's source step raises the size when
 * the flavour changes (source.controller.js, its flavour watcher).
 */
export function volumeSizeFloor(
  image: Pick<Image, "size" | "min_disk"> | undefined,
  flavor: Pick<Flavor, "disk_gb"> | undefined,
): number {
  return Math.max(imageVolumeFloor(image), flavor?.disk_gb ?? 0);
}

/**
 * The new volume's size field description: the floor, and when the
 * flavour's root disk raises it, both reasons.
 */
export function volumeSizeNote(
  image: Pick<Image, "size" | "min_disk"> | undefined,
  flavor: Pick<Flavor, "name" | "disk_gb"> | undefined,
): string {
  const fromImage = imageVolumeFloor(image);
  const floor = volumeSizeFloor(image, flavor);
  if (!flavor?.disk_gb) return `At least ${floor} GB for this source.`;
  return `At least ${floor} GB: the source needs ${fromImage} GB and the ${flavor.name} flavour's root disk is ${flavor.disk_gb} GB.`;
}

/**
 * The volume types a new boot volume can take in a zone: every type, or
 * when types name zones, those serving the zone. The same rule as the
 * volume panels' `typesForZone` (features/volumes/volumes/rules.ts), over
 * the launch options.
 */
export function volumeTypesForZone(
  options: Pick<LaunchOptions, "volume_types" | "has_zoned_types">,
  zone: string,
): VolumeType[] {
  const types = options.volume_types ?? [];
  if (!options.has_zoned_types) return types;
  return types.filter((t) => !t.zones || t.zones.includes(zone));
}

/**
 * Why a flavour is too small for the chosen image or snapshot, or null when
 * it fits (or no image is chosen). A flavour with no root disk boots from a
 * volume, and so does any flavour when a new volume is chosen: then only
 * its RAM is checked against the image's minimum.
 */
export function flavorTooSmall(
  flavor: Pick<Flavor, "disk_gb" | "ram_mb">,
  image: Pick<Image, "min_disk" | "min_ram"> | undefined,
  newVolume: boolean,
): string | null {
  if (!image) return null;
  if (
    !newVolume &&
    image.min_disk &&
    flavor.disk_gb !== null &&
    flavor.disk_gb > 0 &&
    flavor.disk_gb < image.min_disk
  ) {
    return `Disk is smaller than the image's minimum (${image.min_disk} GB)`;
  }
  if (
    image.min_ram &&
    flavor.ram_mb !== null &&
    flavor.ram_mb < image.min_ram
  ) {
    return `RAM is below the image's minimum (${formatMb(image.min_ram)})`;
  }
  return null;
}

/** Nova's limit on the base64-encoded user data, in characters. */
const USER_DATA_ENCODED_LIMIT = 65535;

/**
 * Whether a customisation script is over Nova's user data limit. The
 * backend sends the script's UTF-8 bytes base64 encoded
 * (backend/hive/services/compute.py, launch), and Nova caps that encoding
 * at 65535 characters, so the script itself may hold at most 49149 bytes.
 */
export function userDataTooLarge(script: string): boolean {
  const bytes = new TextEncoder().encode(script).length;
  return 4 * Math.ceil(bytes / 3) > USER_DATA_ENCODED_LIMIT;
}
