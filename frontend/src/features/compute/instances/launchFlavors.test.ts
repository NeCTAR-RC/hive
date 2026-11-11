import { describe, expect, it } from "vitest";
import type { Reservation } from "../../../lib/api/types/reservations";
import { launchOptions } from "../../../mocks/compute/handlers";
import {
  findLinkedFlavor,
  flavorDisplayName,
  flavorGroupId,
  flavorGroupMeta,
  flavorGroups,
  isReservationFlavor,
  launchZone,
  openFlavorGroup,
  OTHER_GROUP,
  RESERVED_GROUP,
} from "./launchFlavors";

const options = launchOptions();
const flavors = options.flavors ?? [];
const byId = (id: string) => flavors.find((f) => f.id === id)!;

describe("flavorGroupId", () => {
  it("groups by class, reservation flavours as reserved, the rest as other", () => {
    expect(flavorGroupId(byId("f-small"))).toBe("standard-v3");
    // The reservation flavour copied standard-v3 from its source flavour.
    expect(flavorGroupId(byId("r-f1"))).toBe(RESERVED_GROUP);
    expect(flavorGroupId(byId("f-test"))).toBe(OTHER_GROUP);
  });
});

describe("flavorGroups", () => {
  it("offers Reserved first, the described classes in order, then Other", () => {
    expect(
      flavorGroups(options.flavor_classes, flavors).map((g) => [
        g.id,
        g.title,
        g.count,
      ]),
    ).toEqual([
      [RESERVED_GROUP, "Reserved", 1],
      ["standard-v3", "Balanced (m3)", 2],
      ["tiny-v3", "Tiny (t3)", 1],
      ["preemptible", "Preemptible (p3)", 1],
      [OTHER_GROUP, "Other", 1],
    ]);
  });

  it("names the classes present by their raw names without a class list", () => {
    expect(flavorGroups(null, flavors).map((g) => g.title)).toEqual([
      "Reserved",
      "preemptible",
      "standard-v3",
      "tiny-v3",
      "Other",
    ]);
  });

  it("leaves out empty classes and groups", () => {
    const standard = flavors.filter((f) => f.flavor_class === "standard-v3");
    expect(
      flavorGroups(
        [{ id: "tiny-v3", title: "Tiny (t3)", description: null, count: 0 }],
        standard.filter((f) => !f.is_reservation),
      ),
    ).toEqual([]);
  });
});

describe("flavorGroupMeta", () => {
  it("counts the flavours and names the cheapest rate", () => {
    expect(flavorGroupMeta({ id: "standard-v3", count: 2 }, flavors)).toBe(
      "2 flavours, from 0.5 SU/hour",
    );
    expect(flavorGroupMeta({ id: "tiny-v3", count: 1 }, flavors)).toBe(
      "1 flavour, from 0.25 SU/hour",
    );
  });

  it("counts alone when no flavour has a rate", () => {
    const unrated = [{ ...byId("f-test"), su_rate: null }];
    expect(flavorGroupMeta({ id: OTHER_GROUP, count: 1 }, unrated)).toBe(
      "1 flavour",
    );
  });
});

describe("openFlavorGroup", () => {
  const groups = flavorGroups(options.flavor_classes, flavors);

  it("opens the card the user opened, else the chosen flavour's, else the first", () => {
    expect(openFlavorGroup(groups, "tiny-v3", byId("f-small"))).toBe("tiny-v3");
    expect(openFlavorGroup(groups, "", byId("f-small"))).toBe("standard-v3");
    expect(openFlavorGroup(groups, "", undefined)).toBe(RESERVED_GROUP);
    expect(openFlavorGroup([], "", undefined)).toBe("");
  });
});

describe("findLinkedFlavor", () => {
  it("finds a deep-linked flavour by id or name", () => {
    expect(findLinkedFlavor(flavors, "r-f1")?.id).toBe("r-f1");
    expect(findLinkedFlavor(flavors, "m3.medium")?.id).toBe("f-medium");
  });

  it("finds nothing for no link or a flavour the project cannot see", () => {
    expect(findLinkedFlavor(flavors, undefined)).toBeUndefined();
    expect(findLinkedFlavor(flavors, "r-gone")).toBeUndefined();
    expect(findLinkedFlavor(null, "r-f1")).toBeUndefined();
  });
});

describe("isReservationFlavor", () => {
  it("is true only for a listed reservation flavour", () => {
    expect(isReservationFlavor(flavors, "r-f1")).toBe(true);
    expect(isReservationFlavor(flavors, "f-small")).toBe(false);
    expect(isReservationFlavor(flavors, "")).toBe(false);
    expect(isReservationFlavor(null, "r-f1")).toBe(false);
  });
});

describe("launchZone", () => {
  it("sends the chosen zone, but none for a reservation flavour", () => {
    expect(launchZone(flavors, "f-small", "melbourne-qh2")).toBe(
      "melbourne-qh2",
    );
    expect(launchZone(flavors, "r-f1", "melbourne-qh2")).toBe("");
    expect(launchZone(flavors, "", "")).toBe("");
  });
});

describe("flavorDisplayName", () => {
  const reservation = {
    id: "res-1",
    compute_flavor: "r-f1",
    end: "2026-10-21T23:59:00+00:00",
    flavor: { name: "ardc.g3.xlarge" },
  } as Reservation;

  it("names a reservation flavour after its reservation and last day", () => {
    expect(flavorDisplayName(byId("r-f1"), [reservation])).toBe(
      "ardc.g3.xlarge reservation (until 21 Oct 2026)",
    );
  });

  it("keeps Nova's name until the reservation is listed, and for others", () => {
    expect(flavorDisplayName(byId("r-f1"), undefined)).toBe("reservation:r-f1");
    expect(flavorDisplayName(byId("r-f1"), [])).toBe("reservation:r-f1");
    expect(flavorDisplayName(byId("f-small"), [reservation])).toBe("m3.small");
  });
});
