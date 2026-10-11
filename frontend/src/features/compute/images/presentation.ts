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
