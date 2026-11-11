// Image status, visibility and row actions as the Images panel shows them.
import { offerActions, type ActionTable } from "../../../lib/actions";
import type { Image } from "../../../lib/api/types/compute";
import { defineStatus, humanise } from "../../../lib/status";

const readers = defineStatus({
  // The Glance statuses an image passes through on its way to active.
  transitional: ["queued", "saving", "importing", "uploading"],
  success: ["active"],
  danger: ["killed", "deleted"],
});

/**
 * Whether Glance is still working on the image, so its row and detail page
 * keep polling until it settles (Horizon's image table updates these rows).
 */
export function isImageTransitional(image: Pick<Image, "status">): boolean {
  return readers.isTransitional(image.status);
}

export const imageStatusTone = readers.tone;

/** "Project" for the project's own private images, otherwise sentence case. */
export function visibilityLabel(image: Image): string {
  if (image.visibility === "private")
    return image.is_owner ? "Project" : "Private";
  return humanise(image.visibility);
}

export type ImageActionId = "launch" | "create-volume" | "edit" | "delete";

const notActive = (image: Image) =>
  image.status !== "active" && "The image is not active yet";

/**
 * The image row menu, as Horizon's images/tables.py offers it: only an
 * active image launches or becomes a volume (CreateVolumeFromImage), and
 * only the owning project edits or deletes, never a protected image.
 */
const IMAGE_ACTIONS: ActionTable<ImageActionId, Image> = {
  rules: [
    { id: "launch", label: "Launch instance", checks: [notActive] },
    { id: "create-volume", label: "Create volume", checks: [notActive] },
    {
      id: "edit",
      label: "Edit image",
      checks: [
        (image) =>
          !image.is_owner && "Only the owning project can edit this image",
      ],
    },
    {
      id: "delete",
      label: "Delete image",
      tone: "danger",
      checks: [
        (image) => image.protected && "The image is protected",
        (image) =>
          !image.is_owner && "Only the owning project can delete this image",
      ],
    },
  ],
};

export function availableImageActions(image: Image) {
  return offerActions(IMAGE_ACTIONS, image);
}
