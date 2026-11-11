// Pure rules of the launch wizard's flavours: the class cards the flavour
// step offers and which one is open, the flavour a deep link names, how a
// reservation flavour is named, and the zone a reservation flavour sends.
import type { Flavor, FlavorClass } from "../../../lib/api/types/compute";
import type { Reservation } from "../../../lib/api/types/reservations";
import { formatSuRate } from "../../../lib/format";
import { formatReservedDays } from "../../reservations/days";

/** The card of reservation flavours, whatever class they copied. */
export const RESERVED_GROUP = "reserved";

/** The card of flavours with no class. */
export const OTHER_GROUP = "other";

/**
 * The card a flavour is listed under. A reservation flavour is grouped as
 * reserved whatever class Blazar copied onto it from its source flavour; a
 * flavour with no class is "other".
 */
export function flavorGroupId(
  flavor: Pick<Flavor, "flavor_class" | "is_reservation">,
): string {
  if (flavor.is_reservation) return RESERVED_GROUP;
  return flavor.flavor_class || OTHER_GROUP;
}

/** One card of the flavour step: a class and its flavour count. */
export interface FlavorGroup {
  id: string;
  title: string;
  description: string | null;
  count: number;
}

/**
 * The cards the flavour step offers: Reserved first when the project has
 * reservation flavours (a reservation hand-off lands there), then the
 * classes the backend describes in its order, then Other for flavours with
 * no class. Without the backend's class list the classes present are
 * offered under their raw names, by name.
 */
export function flavorGroups(
  classes: FlavorClass[] | null | undefined,
  flavors: Pick<Flavor, "flavor_class" | "is_reservation">[],
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
 * The card's short line: how many flavours it holds and the cheapest rate
 * among them, as "2 flavours, from 0.5 SU/hour".
 */
export function flavorGroupMeta(
  group: Pick<FlavorGroup, "id" | "count">,
  flavors: Pick<Flavor, "flavor_class" | "is_reservation" | "su_rate">[],
): string {
  const count = `${group.count} ${group.count === 1 ? "flavour" : "flavours"}`;
  const rates = flavors
    .filter((f) => flavorGroupId(f) === group.id && f.su_rate !== null)
    .map((f) => f.su_rate as number);
  return rates.length
    ? `${count}, from ${formatSuRate(Math.min(...rates))}`
    : count;
}

/**
 * The card the flavour step shows open: the one the user opened, else the
 * chosen (or deep-linked) flavour's, else the first on offer.
 */
export function openFlavorGroup(
  groups: Pick<FlavorGroup, "id">[],
  opened: string,
  chosen: Pick<Flavor, "flavor_class" | "is_reservation"> | undefined,
): string {
  if (opened) return opened;
  if (chosen) return flavorGroupId(chosen);
  return groups[0]?.id ?? "";
}

/**
 * The flavour a `?flavor=` deep link names, by id or by name (the
 * reservation pages hand over the reservation's flavour), or undefined
 * when the project cannot see it.
 */
export function findLinkedFlavor<T extends Pick<Flavor, "id" | "name">>(
  flavors: T[] | null | undefined,
  value: string | undefined,
): T | undefined {
  if (!value) return undefined;
  return flavors?.find((f) => f.id === value || f.name === value);
}

/** Whether the chosen flavour is a reservation's, which sets the zone. */
export function isReservationFlavor(
  flavors: Pick<Flavor, "id" | "is_reservation">[] | null | undefined,
  flavorId: string,
): boolean {
  return Boolean(flavors?.find((f) => f.id === flavorId)?.is_reservation);
}

/**
 * The zone a launch is sent with: the chosen zone ("" for any zone), but
 * always "" for a reservation flavour, whose reserved hosts decide where it
 * runs. The backend drops the zone for a reservation flavour as well
 * (backend/hive/nectar/flavors.py, launch_zone).
 */
export function launchZone(
  flavors: Pick<Flavor, "id" | "is_reservation">[] | null | undefined,
  flavorId: string,
  zone: string,
): string {
  return isReservationFlavor(flavors, flavorId) ? "" : zone;
}

/** The reservation a reservation flavour belongs to, if it is listed. */
export function reservationForFlavor(
  flavor: Pick<Flavor, "id" | "is_reservation">,
  reservations: Reservation[] | undefined,
): Reservation | undefined {
  if (!flavor.is_reservation) return undefined;
  return reservations?.find((r) => r.compute_flavor === flavor.id);
}

/**
 * How the wizard names a flavour: a reservation flavour by its
 * reservation's flavour and last reserved day, in UTC as the reservation
 * pages show it ("ardc.g3.xlarge reservation (until 21 Oct 2026)"), once
 * the reservations are listed; otherwise Nova's name.
 */
export function flavorDisplayName(
  flavor: Pick<Flavor, "id" | "name" | "is_reservation">,
  reservations: Reservation[] | undefined,
): string {
  const reservation = reservationForFlavor(flavor, reservations);
  if (!reservation) return flavor.name;
  const lastDay = formatReservedDays(reservation.end, reservation.end);
  const name = reservation.flavor.name ?? flavor.name;
  return `${name} reservation${lastDay ? ` (until ${lastDay})` : ""}`;
}
