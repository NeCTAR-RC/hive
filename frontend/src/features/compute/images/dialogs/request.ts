// The requests the image dialogs send: the create body and the edit's
// changed fields, custom properties included.
import type { KeyValueEntry } from "../../../../components/Form/keyValue";
import type {
  Image,
  ImageCreateRequest,
} from "../../../../lib/api/types/compute";
import type { ImageUpdateBody } from "../../api";

/** The create image form's values the request is built from. */
export interface ImageCreateValues {
  name: string;
  source: "file" | "url";
  source_url: string;
  disk_format: string;
  visibility: "private" | "community";
  min_disk: number;
  min_ram: number;
  protected: boolean;
}

/**
 * Glance pairs the Amazon kernel, ramdisk and machine disk formats with the
 * container format of the same name; every other image is "bare"
 * (openstack_dashboard/api/glance.py `create_image_metadata`).
 */
const AMAZON_FORMATS: ReadonlySet<string> = new Set(["ami", "aki", "ari"]);

export function containerFormat(diskFormat: string): string {
  return AMAZON_FORMATS.has(diskFormat) ? diskFormat : "bare";
}

/**
 * The create body: the chosen disk format in its container format, with
 * the source URL only for an image the service imports (a file is uploaded
 * after).
 */
export function createImageRequest(
  values: ImageCreateValues,
): ImageCreateRequest {
  return {
    name: values.name,
    disk_format: values.disk_format,
    container_format: containerFormat(values.disk_format),
    visibility: values.visibility,
    min_disk: values.min_disk,
    min_ram: values.min_ram,
    protected: values.protected,
    properties: {},
    ...(values.source === "url" ? { source_url: values.source_url } : {}),
  };
}

/** The edit image form's values. */
export interface ImageEditValues {
  name: string;
  description: string;
  visibility: Image["visibility"];
  min_disk: number;
  min_ram: number;
  protected: boolean;
  /** The custom properties but the description, as key and value rows. */
  properties: KeyValueEntry[];
}

/**
 * Glance keeps an image's description as a custom property, as Horizon's
 * image forms write it.
 */
export const DESCRIPTION = "description";

/** The image's text properties, which the edit form can change. */
function textProperties(image: Image): Record<string, string> {
  return Object.fromEntries(
    Object.entries(image.properties).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** The image's description, or blank. */
export function imageDescription(image: Image): string {
  return textProperties(image)[DESCRIPTION] ?? "";
}

/**
 * The image's custom properties as the form's rows, by key, without the
 * description (its own field). Properties that are not text stay out of
 * the form and are left as they are.
 */
export function propertyRows(image: Image): KeyValueEntry[] {
  return Object.entries(textProperties(image))
    .filter(([key]) => key !== DESCRIPTION)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({ key, value }));
}

/**
 * The property changes an edit makes: a new or changed value is set, and a
 * property the form no longer holds (or a cleared description) is sent
 * as null, which removes it. Null when no property changed.
 */
export function propertiesPatch(
  image: Image,
  values: Pick<ImageEditValues, "description" | "properties">,
): Record<string, string | null> | null {
  const before = textProperties(image);
  const after: Record<string, string> = Object.fromEntries(
    values.properties.map((row) => [row.key.trim(), row.value]),
  );
  if (values.description.trim()) after[DESCRIPTION] = values.description.trim();
  const patch: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) patch[key] = value;
  }
  for (const key of Object.keys(before)) {
    if (!(key in after)) patch[key] = null;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The update for an edited image: only the fields that differ from the
 * image (a missing minimum counts as 0) and the property changes, or null
 * when nothing changed.
 */
export function updateImageRequest(
  image: Image,
  values: ImageEditValues,
): ImageUpdateBody | null {
  const body: ImageUpdateBody = { imageId: image.id };
  if (values.name !== image.name) body.name = values.name;
  if (values.visibility !== image.visibility)
    body.visibility = values.visibility;
  if (values.min_disk !== (image.min_disk ?? 0))
    body.min_disk = values.min_disk;
  if (values.min_ram !== (image.min_ram ?? 0)) body.min_ram = values.min_ram;
  if (values.protected !== image.protected) body.protected = values.protected;
  const properties = propertiesPatch(image, values);
  if (properties) body.properties = properties;
  return Object.keys(body).length === 1 ? null : body;
}
