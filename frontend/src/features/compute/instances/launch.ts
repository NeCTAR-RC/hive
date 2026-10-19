// Launch wizard rules shared by the page, its steps and their tests. The
// defaults follow Horizon's launch dialog (launch-instance-model.service.js
// onGetNetworks, Gerrit change 71399): the classic network is preselected
// when it is offered, otherwise a network is preselected only when it is
// the sole choice.
import type {
  ComputeLimits,
  Flavor,
  FlavorClass,
  Image,
  LaunchOptions,
  LaunchSourceType,
  LaunchVolume,
  Network,
  Reservation,
} from "../../../lib/api/types";
import { formatBytes, formatGb, formatMb } from "../../../lib/format";

export const GIB = 1024 ** 3;

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
 * Why a flavour cannot be launched within the project's compute quota, or
 * null when it fits. Horizon's flavour step greys out a flavour whose cores
 * or RAM times the instance count exceed what is left
 * (launch-instance/flavor/flavor.controller.js getErrorMessages). An
 * unlimited (negative) or unreported limit never blocks.
 */
export function flavorQuotaProblem(
  flavor: { vcpus: number | null; ram_mb: number | null },
  limits: ComputeLimits | null | undefined,
  count: number,
): string | null {
  const instances = Number.isFinite(count) && count > 0 ? count : 1;
  const left = (max: number | undefined, used: number | undefined) =>
    max === undefined || max < 0 ? Infinity : max - (used ?? 0);
  const cores = left(limits?.maxTotalCores, limits?.totalCoresUsed);
  if ((flavor.vcpus ?? 0) * instances > cores) {
    return "Needs more vCPUs than your quota has left";
  }
  const ram = left(limits?.maxTotalRAMSize, limits?.totalRAMUsed);
  if ((flavor.ram_mb ?? 0) * instances > ram) {
    return "Needs more RAM than your quota has left";
  }
  return null;
}

/** The image or instance snapshot a source choice names, if any. */
export function findImage(
  data: LaunchOptions,
  type: LaunchSourceType | undefined,
  id: string | undefined,
): Image | undefined {
  if (!id || (type !== "image" && type !== "snapshot")) return undefined;
  const list = (type === "image" ? data.images : data.snapshots) ?? [];
  return list.find((image) => image.id === id);
}

/**
 * The smallest volume an image can boot from, as Horizon's source step
 * floors it (source.controller.js checkVolumeForImage: the image rounded up
 * to whole gigabytes, or its min_disk, whichever is larger) and its flavour
 * watcher raises it (never below the flavour's root disk).
 */
export function volumeSizeFloor(
  image: Pick<Image, "size" | "min_disk"> | undefined,
  flavor: Pick<Flavor, "disk_gb"> | undefined,
): number {
  const fromImage = image
    ? Math.max(Math.ceil((image.size ?? 0) / GIB), image.min_disk ?? 0)
    : 0;
  const fromFlavor =
    flavor?.disk_gb !== null && flavor?.disk_gb !== undefined
      ? flavor.disk_gb
      : 0;
  return Math.max(1, fromImage, fromFlavor);
}

export const RESERVED_GROUP = "reserved";
export const OTHER_GROUP = "other";

/**
 * The class chooser group a flavour sits in. A reservation flavour is
 * grouped as reserved whatever class Blazar copied onto it from the
 * source flavour; a flavour with no class is "other".
 */
export function flavorGroupId(
  flavor: Pick<Flavor, "flavor_class" | "is_reservation">,
): string {
  if (flavor.is_reservation) return RESERVED_GROUP;
  return flavor.flavor_class || OTHER_GROUP;
}

export interface FlavorGroup {
  id: string;
  title: string;
  description: string | null;
  count: number;
}

/**
 * The groups the flavour step offers: Reserved first when the project has
 * reservation flavours (a reservation hand-off lands there), then the
 * classes the backend describes in its order, then Other for flavours
 * with no class. Without the backend's class list the classes present are
 * offered under their raw names.
 */
export function flavorGroups(
  classes: FlavorClass[] | null | undefined,
  flavors: Flavor[],
): FlavorGroup[] {
  const groups: FlavorGroup[] = [];
  const reserved = flavors.filter((f) => f.is_reservation).length;
  if (reserved) {
    groups.push({
      id: RESERVED_GROUP,
      title: "Reserved",
      description: "Flavours from your project's active reservations.",
      count: reserved,
    });
  }
  if (classes) {
    groups.push(...classes.filter((c) => c.count > 0));
  } else {
    const counts = new Map<string, number>();
    for (const flavor of flavors) {
      if (flavor.is_reservation || !flavor.flavor_class) continue;
      counts.set(
        flavor.flavor_class,
        (counts.get(flavor.flavor_class) ?? 0) + 1,
      );
    }
    groups.push(
      ...[...counts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, count]) => ({ id, title: id, description: null, count })),
    );
  }
  const other = flavors.filter(
    (f) => !f.is_reservation && !f.flavor_class,
  ).length;
  if (other) {
    groups.push({
      id: OTHER_GROUP,
      title: "Other",
      description: null,
      count: other,
    });
  }
  return groups;
}

/**
 * The zone a launch is sent with: "" (the scheduler chooses, Horizon's
 * "Any Availability Zone") when none is chosen, and always "" for a
 * reservation flavour, whose reserved hosts decide where it runs. The
 * backend drops the zone for a reservation flavour as well.
 */
export function launchZone(
  flavors: Pick<Flavor, "id" | "is_reservation">[] | null | undefined,
  flavorId: string,
  zone: string,
): string {
  const flavor = flavors?.find((f) => f.id === flavorId);
  return flavor?.is_reservation ? "" : zone;
}

/** The warre reservation a reservation flavour belongs to, if listed. */
export function reservationForFlavor(
  flavor: Pick<Flavor, "id" | "is_reservation">,
  reservations: Reservation[] | undefined,
): Reservation | undefined {
  if (!flavor.is_reservation) return undefined;
  return reservations?.find((r) => r.compute_flavor === flavor.id);
}

/**
 * How the wizard names a flavour: a reservation flavour by its warre
 * reservation's flavour and end date ("ardc.g3.xlarge reservation (until
 * 21 Oct 2026)") once the reservations list is available, otherwise the
 * nova name.
 */
export function flavorDisplayName(
  flavor: Pick<Flavor, "id" | "name" | "is_reservation">,
  reservations: Reservation[] | undefined,
  formatEnd: (value: string) => string,
): string {
  const reservation = reservationForFlavor(flavor, reservations);
  if (!reservation) return flavor.name;
  const until = reservation.end ? ` (until ${formatEnd(reservation.end)})` : "";
  return `${reservation.flavor.name} reservation${until}`;
}

export interface SourceItem {
  id: string;
  name: string;
  meta: string;
}

export function imageMeta(image: Image): string {
  const parts = [
    image.is_snapshot ? "snapshot" : image.visibility,
    formatBytes(image.size),
    image.min_disk ? `min disk ${image.min_disk} GB` : "",
    image.min_ram ? `min RAM ${formatMb(image.min_ram)}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

export function volumeMeta(volume: LaunchVolume): string {
  return `${formatGb(volume.size_gb)}${
    volume.availability_zone ? `, ${volume.availability_zone}` : ""
  }`;
}

/** The chosen source as the step and the summary name it. */
export function findSourceItem(
  data: LaunchOptions,
  type: LaunchSourceType | undefined,
  id: string | undefined,
): SourceItem | undefined {
  if (!id || !type) return undefined;
  switch (type) {
    case "image":
    case "snapshot": {
      const image = findImage(data, type, id);
      return image
        ? { id, name: image.name ?? image.id, meta: imageMeta(image) }
        : undefined;
    }
    case "volume": {
      const volume = (data.volumes ?? []).find((v) => v.id === id);
      return volume
        ? { id, name: volume.name, meta: volumeMeta(volume) }
        : undefined;
    }
    default: {
      const snapshot = (data.volume_snapshots ?? []).find((s) => s.id === id);
      return snapshot
        ? { id, name: snapshot.name, meta: formatGb(snapshot.size_gb) }
        : undefined;
    }
  }
}
