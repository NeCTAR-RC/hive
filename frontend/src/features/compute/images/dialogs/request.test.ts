import { describe, expect, it } from "vitest";
import { images } from "../../../../mocks/compute/handlers";
import {
  imageCreateBody,
  imageUpdateBody,
} from "../../../../mocks/compute/schemas";
import {
  containerFormat,
  createImageRequest,
  imageDescription,
  propertyRows,
  updateImageRequest,
  type ImageCreateValues,
  type ImageEditValues,
} from "./request";

const fromFile: ImageCreateValues = {
  name: "my-image",
  source: "file",
  source_url: "",
  disk_format: "qcow2",
  visibility: "private",
  min_disk: 0,
  min_ram: 0,
  protected: false,
};

describe("createImageRequest", () => {
  it("creates an empty image for a file uploaded afterwards", () => {
    const body = createImageRequest(fromFile);
    expect(body).toEqual({
      name: "my-image",
      disk_format: "qcow2",
      container_format: "bare",
      visibility: "private",
      min_disk: 0,
      min_ram: 0,
      protected: false,
      properties: {},
    });
    expect(imageCreateBody.safeParse(body).success).toBe(true);
  });

  it("sends the URL for an image the service imports", () => {
    const body = createImageRequest({
      ...fromFile,
      source: "url",
      source_url: "https://example.org/rocky.qcow2",
      disk_format: "raw",
      visibility: "community",
      min_disk: 20,
      min_ram: 2048,
      protected: true,
    });
    expect(body).toEqual({
      name: "my-image",
      source_url: "https://example.org/rocky.qcow2",
      disk_format: "raw",
      container_format: "bare",
      visibility: "community",
      min_disk: 20,
      min_ram: 2048,
      protected: true,
      properties: {},
    });
    expect(imageCreateBody.safeParse(body).success).toBe(true);
  });

  it("pairs the Amazon disk formats with their own container format", () => {
    expect(containerFormat("ami")).toBe("ami");
    expect(containerFormat("aki")).toBe("aki");
    expect(containerFormat("ari")).toBe("ari");
    expect(containerFormat("qcow2")).toBe("bare");
    const body = createImageRequest({ ...fromFile, disk_format: "ami" });
    expect(body.container_format).toBe("ami");
    expect(imageCreateBody.safeParse(body).success).toBe(true);
  });

  it("leaves a URL typed before switching to a file out", () => {
    const body = createImageRequest({
      ...fromFile,
      source_url: "https://example.org/rocky.qcow2",
    });
    expect(body).not.toHaveProperty("source_url");
  });
});

describe("updateImageRequest", () => {
  const image = images.find((i) => i.id === "img-mine")!;
  const unchanged: ImageEditValues = {
    name: image.name ?? "",
    visibility: image.visibility,
    min_disk: image.min_disk ?? 0,
    min_ram: image.min_ram ?? 0,
    protected: image.protected,
    description: "",
    properties: [],
  };

  it("sends nothing when no field changed", () => {
    expect(updateImageRequest(image, unchanged)).toBeNull();
  });

  it("counts a missing minimum as 0", () => {
    const bare = { ...image, min_disk: null, min_ram: null };
    const values = { ...unchanged, min_disk: 0, min_ram: 0 };
    expect(updateImageRequest(bare, values)).toBeNull();
  });

  it.each([
    { name: "the name", change: { name: "renamed" } },
    { name: "the visibility", change: { visibility: "community" } },
    { name: "the minimum disk", change: { min_disk: 40 } },
    { name: "the minimum RAM", change: { min_ram: 8192 } },
    { name: "the protection", change: { protected: !image.protected } },
  ] as const)("sends only $name when it alone changed", ({ change }) => {
    const request = updateImageRequest(image, { ...unchanged, ...change });
    expect(request).toEqual({ imageId: "img-mine", ...change });
    // The PATCH body is the request less imageId, which the schema strips.
    expect(imageUpdateBody.safeParse(request).success).toBe(true);
  });

  it("sends every changed field together", () => {
    expect(
      updateImageRequest(image, {
        ...unchanged,
        name: "renamed",
        visibility: "community",
        min_disk: 40,
        min_ram: 8192,
        protected: !image.protected,
      }),
    ).toEqual({
      imageId: "img-mine",
      name: "renamed",
      visibility: "community",
      min_disk: 40,
      min_ram: 8192,
      protected: !image.protected,
    });
  });
});

describe("image properties in the edit", () => {
  const image = {
    ...images.find((i) => i.id === "img-mine")!,
    properties: {
      description: "Web server",
      os_distro: "ubuntu",
      hw_rng_model: "virtio",
      sizes: [1, 2],
    },
  };
  const values = (change: Partial<ImageEditValues>): ImageEditValues => ({
    name: image.name ?? "",
    visibility: image.visibility,
    min_disk: image.min_disk ?? 0,
    min_ram: image.min_ram ?? 0,
    protected: image.protected,
    description: imageDescription(image),
    properties: propertyRows(image),
    ...change,
  });

  it("lists the text properties by key, the description apart", () => {
    expect(imageDescription(image)).toBe("Web server");
    expect(propertyRows(image)).toEqual([
      { key: "hw_rng_model", value: "virtio" },
      { key: "os_distro", value: "ubuntu" },
    ]);
  });

  it("sends nothing when the properties are as they were", () => {
    expect(updateImageRequest(image, values({}))).toBeNull();
  });

  it("sets new and changed properties and removes dropped ones", () => {
    const request = updateImageRequest(
      image,
      values({
        description: "",
        properties: [
          { key: "os_distro", value: "debian" },
          { key: "os_version", value: "12" },
        ],
      }),
    );
    expect(request).toEqual({
      imageId: image.id,
      properties: {
        os_distro: "debian",
        os_version: "12",
        description: null,
        hw_rng_model: null,
      },
    });
    expect(imageUpdateBody.safeParse(request).success).toBe(true);
  });
});
