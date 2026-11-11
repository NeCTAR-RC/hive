import { describe, expect, it } from "vitest";
import type { Image, LaunchImage } from "../../../../lib/api/types/compute";
import { imageChoices } from "./imageChoices";

const base = {
  status: "active",
  visibility: "public",
  owner: "p",
  is_owner: false,
  size: 1,
  disk_format: "qcow2",
  container_format: "bare",
  min_disk: 0,
  min_ram: 0,
  created_at: null,
  updated_at: null,
  protected: false,
  checksum: null,
  os_distro: null,
  os_version: null,
  tags: [],
  properties: {},
} satisfies Omit<Image, "id" | "name" | "is_snapshot">;

const launchImage = (
  id: string,
  name: string,
  hidden = false,
): LaunchImage => ({
  ...base,
  id,
  name,
  is_snapshot: false,
  hidden_until_search: hidden,
});

describe("imageChoices", () => {
  const options = {
    images: [
      launchImage("img-u", "Ubuntu"),
      launchImage("img-c", "community-thing", true),
    ],
    snapshots: [{ ...base, id: "snap", name: "backup", is_snapshot: true }],
  };

  it("lists images and snapshots by name, community images left out", () => {
    expect(imageChoices(options, undefined)).toEqual([
      { id: "snap", label: "backup (snapshot)" },
      { id: "img-u", label: "Ubuntu" },
    ]);
  });

  it("keeps the community image the instance runs", () => {
    expect(imageChoices(options, "img-c").map((c) => c.id)).toContain("img-c");
  });

  it("is empty while the options load", () => {
    expect(imageChoices(undefined, undefined)).toEqual([]);
  });
});
