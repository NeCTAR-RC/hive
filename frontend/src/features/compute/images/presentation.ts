import type { Image } from "../../../lib/api/types";

export function imageStatusTone(status: string) {
  switch (status) {
    case "active":
      return "success" as const;
    case "queued":
    case "saving":
    case "importing":
    case "uploading":
      return "progress" as const;
    case "killed":
    case "deleted":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function visibilityLabel(image: Image): string {
  if (image.visibility === "private")
    return image.is_owner ? "Project" : "Private";
  if (image.visibility === "shared") return "Shared";
  return image.visibility.charAt(0).toUpperCase() + image.visibility.slice(1);
}

// Glance pairs the Amazon kernel, ramdisk and machine formats with the
// container format of the same name; everything else is "bare"
// (openstack_dashboard/api/glance.py create_image_metadata).
const AMAZON_FORMATS = new Set(["ami", "aki", "ari"]);

export function containerFormat(diskFormat: string): string {
  return AMAZON_FORMATS.has(diskFormat) ? diskFormat : "bare";
}
