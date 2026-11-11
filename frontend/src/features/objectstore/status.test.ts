import { describe, expect, it } from "vitest";
import type { Container, StoreObject } from "../../lib/api/types/objectstore";
import { availableContainerActions, availableObjectActions } from "./status";

const FILE: StoreObject = {
  name: "photos/a.jpg",
  basename: "a.jpg",
  is_folder: false,
  bytes: 1024,
  content_type: "image/jpeg",
  hash: null,
  last_modified: null,
};

const FOLDER: StoreObject = {
  ...FILE,
  name: "photos/",
  basename: "photos",
  is_folder: true,
  bytes: 0,
  content_type: "application/directory",
};

/** The reason each offer is disabled, or null when it can run. */
function reasons(offers: { id: string; disabledReason?: string }[]) {
  return Object.fromEntries(
    offers.map((offer) => [offer.id, offer.disabledReason ?? null]),
  );
}

describe("container actions", () => {
  const container: Container = {
    name: "backups",
    object_count: 0,
    bytes: 0,
    public_url: "",
  };

  /** Each offer's label. */
  const labels = (offers: { id: string; label: string }[]) =>
    Object.fromEntries(offers.map((offer) => [offer.id, offer.label]));

  it("deletes a container, naming the objects that go with it", () => {
    expect(reasons(availableContainerActions(container))).toEqual({
      open: null,
      delete: null,
    });
    expect(labels(availableContainerActions(container))).toEqual({
      open: "Open",
      delete: "Delete container",
    });
    expect(
      labels(availableContainerActions({ ...container, object_count: 1200 })),
    ).toEqual({
      open: "Open",
      delete: "Delete container and its 1,200 objects",
    });
    expect(
      labels(availableContainerActions({ ...container, object_count: 1 })),
    ).toEqual({ open: "Open", delete: "Delete container and its 1 object" });
  });
});

describe("object actions", () => {
  it("gives a folder its own menu", () => {
    expect(availableObjectActions(FOLDER).map((offer) => offer.label)).toEqual([
      "Open folder",
      "Delete folder and contents",
    ]);
  });

  it("copies an object unless it is empty", () => {
    expect(reasons(availableObjectActions(FILE))).toEqual({
      download: null,
      details: null,
      copy: null,
      delete: null,
    });
    expect(reasons(availableObjectActions({ ...FILE, bytes: 0 })).copy).toBe(
      "Empty objects cannot be copied",
    );
  });
});
