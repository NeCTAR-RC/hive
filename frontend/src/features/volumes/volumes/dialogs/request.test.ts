import { describe, expect, it } from "vitest";
import {
  backupCreateBody,
  snapshotCreateBody,
  volumeCreateBody,
  volumeUpdateBody,
} from "../../../../mocks/volumes/schemas";
import {
  backupCreateRequest,
  snapshotCreateRequest,
  volumeCreateRequest,
  volumeUpdateRequest,
} from "./request";
import type { CreateVolumeValues } from "./schema";

/** A blank create form with a zone chosen, as the dialog submits it. */
const blank: CreateVolumeValues = {
  name: "",
  description: "",
  source: "none",
  source_id: "",
  size: 1,
  availability_zone: "melbourne-qh2",
  volume_type: "",
};

describe("volumeCreateRequest", () => {
  it.each<{
    variant: string;
    values: CreateVolumeValues;
    body: object;
  }>([
    {
      variant: "a blank empty volume",
      values: blank,
      body: { size: 1, availability_zone: "melbourne-qh2" },
    },
    {
      variant: "a named empty volume of a chosen type",
      values: {
        ...blank,
        name: "data",
        description: "Scratch space",
        size: 10,
        volume_type: "standard",
      },
      body: {
        size: 10,
        name: "data",
        description: "Scratch space",
        availability_zone: "melbourne-qh2",
        volume_type: "standard",
      },
    },
    {
      variant: "an image source, which keeps the chosen zone and type",
      values: {
        ...blank,
        source: "image",
        source_id: "img-1",
        size: 5,
        volume_type: "standard",
      },
      body: {
        size: 5,
        source: { type: "image", id: "img-1" },
        availability_zone: "melbourne-qh2",
        volume_type: "standard",
      },
    },
    {
      variant: "a snapshot source, which fixes the zone and type",
      values: {
        ...blank,
        source: "snapshot",
        source_id: "snap-1",
        size: 20,
        volume_type: "standard",
      },
      body: { size: 20, source: { type: "snapshot", id: "snap-1" } },
    },
    {
      variant: "a volume source, which fixes the zone and type",
      values: {
        ...blank,
        source: "volume",
        source_id: "vol-1",
        size: 8,
        availability_zone: "",
      },
      body: { size: 8, source: { type: "volume", id: "vol-1" } },
    },
  ])("sends $variant", ({ values, body }) => {
    const request = volumeCreateRequest(values);
    expect(request).toEqual(body);
    expect(volumeCreateBody.parse(request)).toEqual(request);
  });
});

describe("volumeUpdateRequest", () => {
  const volume = { name: "data", description: null, bootable: false };
  const unchanged = { name: "data", description: "", bootable: false };

  it("sends nothing when no field changed", () => {
    expect(volumeUpdateRequest(volume, unchanged)).toBeNull();
    expect(
      volumeUpdateRequest(
        { ...volume, description: "Notes" },
        { ...unchanged, description: "Notes" },
      ),
    ).toBeNull();
  });

  it.each([
    {
      variant: "a new name",
      values: { ...unchanged, name: "renamed" },
      body: { name: "renamed" },
    },
    {
      variant: "a new description",
      values: { ...unchanged, description: "Notes" },
      body: { description: "Notes" },
    },
    {
      variant: "the bootable flag",
      values: { ...unchanged, bootable: true },
      body: { bootable: true },
    },
    {
      variant: "every field",
      values: { name: "renamed", description: "Notes", bootable: true },
      body: { name: "renamed", description: "Notes", bootable: true },
    },
  ])("sends only $variant", ({ values, body }) => {
    const request = volumeUpdateRequest(volume, values);
    expect(request).toEqual(body);
    expect(volumeUpdateBody.parse(request)).toEqual(request);
  });

  it("sends a cleared description as an empty string", () => {
    expect(
      volumeUpdateRequest({ ...volume, description: "Notes" }, unchanged),
    ).toEqual({ description: "" });
  });
});

describe("snapshotCreateRequest", () => {
  it.each([
    {
      variant: "a blank form as the volume alone",
      values: { name: "", description: "" },
      body: { volume_id: "vol-1" },
    },
    {
      variant: "a name and description",
      values: { name: "before-upgrade", description: "Nightly" },
      body: {
        volume_id: "vol-1",
        name: "before-upgrade",
        description: "Nightly",
      },
    },
  ])("sends $variant", ({ values, body }) => {
    const request = snapshotCreateRequest("vol-1", values);
    expect(request).toEqual(body);
    expect(snapshotCreateBody.parse(request)).toEqual(request);
  });
});

describe("backupCreateRequest", () => {
  const values = {
    name: "weekly",
    description: "",
    container: "",
    snapshot_id: "",
    incremental: false,
  };

  it.each([
    {
      variant: "a full backup of the volume to the default container",
      values,
      body: { volume_id: "vol-1", name: "weekly", incremental: false },
    },
    {
      variant: "an incremental backup of a snapshot to a named container",
      values: {
        name: "weekly",
        description: "Before the upgrade",
        container: "backups",
        snapshot_id: "snap-1",
        incremental: true,
      },
      body: {
        volume_id: "vol-1",
        name: "weekly",
        incremental: true,
        description: "Before the upgrade",
        container: "backups",
        snapshot_id: "snap-1",
      },
    },
  ])("sends $variant", ({ values, body }) => {
    const request = backupCreateRequest("vol-1", values);
    expect(request).toEqual(body);
    expect(backupCreateBody.parse(request)).toEqual(request);
  });
});
