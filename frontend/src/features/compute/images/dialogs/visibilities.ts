// The image visibilities the create and edit image dialogs offer.
import type { Image } from "../../../../lib/api/types/compute";

/** The visibilities offered, private first as the default. */
export const VISIBILITIES: { id: Image["visibility"]; label: string }[] = [
  { id: "private", label: "Private (this project only)" },
  { id: "community", label: "Community (any project can find and use it)" },
];
