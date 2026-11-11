import { describe, expect, it } from "vitest";
import { images } from "../../../mocks/compute/handlers";
import {
  availableImageActions,
  imageStatusTone,
  isImageTransitional,
  visibilityLabel,
} from "./presentation";

/** The mock fixture a case starts from; the cases override what matters. */
function first<T>(list: T[]): T {
  const [item] = list;
  if (!item) throw new Error("The mock fixture list is empty");
  return item;
}

describe("image status", () => {
  it.each([
    { status: "queued", tone: "progress", busy: true },
    { status: "saving", tone: "progress", busy: true },
    { status: "importing", tone: "progress", busy: true },
    { status: "uploading", tone: "progress", busy: true },
    { status: "active", tone: "success", busy: false },
    { status: "killed", tone: "danger", busy: false },
    { status: "deleted", tone: "danger", busy: false },
    { status: "deactivated", tone: "neutral", busy: false },
  ])("$status is $tone, polling: $busy", ({ status, tone, busy }) => {
    expect(imageStatusTone(status)).toBe(tone);
    expect(isImageTransitional({ status })).toBe(busy);
  });
});

describe("visibilityLabel", () => {
  const image = first(images);
  it.each([
    { visibility: "private", is_owner: true, label: "Project" },
    { visibility: "private", is_owner: false, label: "Private" },
    { visibility: "shared", is_owner: false, label: "Shared" },
    { visibility: "public", is_owner: false, label: "Public" },
    { visibility: "community", is_owner: false, label: "Community" },
  ] as const)("$visibility owned: $is_owner is $label", (row) => {
    expect(
      visibilityLabel({
        ...image,
        visibility: row.visibility,
        is_owner: row.is_owner,
      }),
    ).toBe(row.label);
  });
});

describe("availableImageActions", () => {
  const image = first(images);
  /** "id" for an enabled offer, "id: reason" for a disabled one. */
  const summary = (overrides: Partial<typeof image>) =>
    availableImageActions({ ...image, ...overrides }).map((o) =>
      o.isDisabled ? `${o.id}: ${o.disabledReason}` : o.id,
    );

  it.each([
    {
      case: "an own active image",
      overrides: { status: "active", is_owner: true, protected: false },
      expected: ["launch", "create-volume", "edit", "delete"],
    },
    {
      case: "an image still queued",
      overrides: { status: "queued", is_owner: true, protected: false },
      expected: [
        "launch: The image is not active yet",
        "create-volume: The image is not active yet",
        "edit",
        "delete",
      ],
    },
    {
      case: "another project's image",
      overrides: { status: "active", is_owner: false, protected: false },
      expected: [
        "launch",
        "create-volume",
        "edit: Only the owning project can edit this image",
        "delete: Only the owning project can delete this image",
      ],
    },
    {
      case: "a protected image",
      overrides: { status: "active", is_owner: false, protected: true },
      expected: [
        "launch",
        "create-volume",
        "edit: Only the owning project can edit this image",
        "delete: The image is protected",
      ],
    },
  ])("$case", ({ overrides, expected }) => {
    expect(summary(overrides)).toEqual(expected);
  });
});
