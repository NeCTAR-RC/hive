// The images an instance dialog offers (rebuild, rescue), from the launch
// options.
import type { LaunchOptions } from "../../../../lib/api/types/compute";

/** One image choice, as a select lists it. */
export interface ImageChoice {
  id: string;
  label: string;
}

/**
 * The images and snapshots by name. Community images stay out unless the
 * instance already runs one (`currentImageId`), as in the launch wizard;
 * only launch images carry that flag, snapshots never hide.
 */
export function imageChoices(
  options: Pick<LaunchOptions, "images" | "snapshots"> | undefined,
  currentImageId: string | undefined,
): ImageChoice[] {
  const shown = (options?.images ?? []).filter(
    (image) => !image.hidden_until_search || image.id === currentImageId,
  );
  return [...shown, ...(options?.snapshots ?? [])]
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((image) => ({
      id: image.id,
      label: `${image.name ?? image.id}${image.is_snapshot ? " (snapshot)" : ""}`,
    }));
}
