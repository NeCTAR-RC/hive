// The form schemas of the volume dialogs and the values they collect, with
// the size rules the loaded options and the remaining quota add.
import { z } from "zod";
import type { Option } from "../../../../components/Form/fields/props";
import { keyValueSchema } from "../../../../components/Form/keyValue";
import type {
  RetypeMigrationPolicy,
  VolumeOptions,
} from "../../../../lib/api/types/volumes";
import { maxLength } from "../../../../lib/validation";
import { createSizeError, gigabytesAvailable, sizeFloor } from "../rules";

/** A name or description: trimmed, at most 255 characters. */
const NAME = maxLength(255);

/** The create form's field rules, whatever the options offer. */
const createFields = z
  .object({
    name: NAME,
    description: NAME,
    source: z.enum(["none", "image", "snapshot", "volume"]),
    source_id: z.string(),
    size: z.number().int().min(1, "At least 1 GB"),
    availability_zone: z.string(),
    volume_type: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.source !== "none" && !values.source_id) {
      ctx.addIssue({
        code: "custom",
        path: ["source_id"],
        message: "Choose a source",
      });
    }
    if (
      (values.source === "none" || values.source === "image") &&
      !values.availability_zone
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["availability_zone"],
        message: "An availability zone is required",
      });
    }
  });

export type CreateVolumeValues = z.infer<typeof createFields>;

/**
 * The create schema for the loaded options: on top of the field rules, the
 * size must cover the chosen source and fit the remaining quota, as
 * Horizon's CreateForm checks.
 */
export function createVolumeSchema(options: VolumeOptions | undefined) {
  const available = gigabytesAvailable(options?.limits);
  return createFields.superRefine((values, ctx) => {
    const floor = sizeFloor(options, values.source, values.source_id);
    const message = createSizeError(values.size, floor, available);
    if (message) ctx.addIssue({ code: "custom", path: ["size"], message });
  });
}

/** The edit form: name, description and the bootable flag. */
export const editVolumeSchema = z.object({
  name: NAME,
  description: NAME,
  bootable: z.boolean(),
});

export type EditVolumeValues = z.infer<typeof editVolumeSchema>;

/**
 * The extend form for a volume of `current` GB: the new size must be larger,
 * and the growth must fit the `available` quota (null when unlimited).
 */
export function extendVolumeSchema(current: number, available: number | null) {
  return z.object({
    new_size: z
      .number()
      .int()
      .min(current + 1, `New size must be greater than ${current} GB`)
      .refine((value) => available === null || value - current <= available, {
        message: `The volume can be extended to at most ${current + (available ?? 0)} GB with your remaining quota`,
      }),
  });
}

/** The attach form: an instance, and optionally the device name to ask for. */
export const attachVolumeSchema = z.object({
  instance_id: z.string().min(1, "Choose an instance"),
  device: maxLength(255).refine(
    (value) => value === "" || value.startsWith("/dev/"),
    {
      message: "Device names start with /dev/",
    },
  ),
});

export type AttachVolumeValues = z.infer<typeof attachVolumeSchema>;

/** The snapshot form: an optional name and description. */
export const createSnapshotSchema = z.object({
  name: NAME,
  description: NAME,
});

export type CreateSnapshotValues = z.infer<typeof createSnapshotSchema>;

/** The backup form: a name, and where and from what the backup is taken. */
export const createBackupSchema = z.object({
  name: NAME.min(1, "Enter a name"),
  description: NAME,
  container: NAME.refine((value) => !value.includes("/"), {
    message: "A container name cannot contain a slash",
  }),
  snapshot_id: z.string(),
  incremental: z.boolean(),
});

export type CreateBackupValues = z.infer<typeof createBackupSchema>;

/** Cinder's migration policies, as Horizon's RetypeForm words them. */
export const MIGRATION_POLICIES: (Option & { id: RetypeMigrationPolicy })[] = [
  { id: "never", label: "Never" },
  { id: "on-demand", label: "On demand" },
];

/** The change volume type form: a new type and the migration policy. */
export const retypeVolumeSchema = z.object({
  volume_type: z.string().min(1, "Choose a volume type"),
  migration_policy: z.enum(["never", "on-demand"]),
});

export type RetypeVolumeValues = z.infer<typeof retypeVolumeSchema>;

/** The update metadata form of a volume or a snapshot. */
export const metadataSchema = z.object({ entries: keyValueSchema });

export type MetadataValues = z.infer<typeof metadataSchema>;

/** The create transfer form: a name that is more than spaces. */
export const createTransferSchema = z.object({
  name: NAME.min(1, "Enter a transfer name"),
});

export type CreateTransferValues = z.infer<typeof createTransferSchema>;

/**
 * The accept transfer form: the transfer ID and authorisation key the
 * giving project passed on, at Cinder's lengths (Horizon's
 * AcceptTransferForm).
 */
export const acceptTransferSchema = z.object({
  transfer_id: z
    .string()
    .trim()
    .min(1, "Enter the transfer ID")
    .max(36, "A transfer ID has at most 36 characters"),
  auth_key: z
    .string()
    .trim()
    .min(1, "Enter the authorisation key")
    .max(16, "An authorisation key has at most 16 characters"),
});

export type AcceptTransferValues = z.infer<typeof acceptTransferSchema>;

/** The disk formats an image uploaded from a volume can take. */
export const DISK_FORMATS = ["raw", "qcow2", "vmdk", "vdi"] as const;

/** The upload-to-image form: the image's name and format. */
export const uploadToImageSchema = z.object({
  image_name: NAME.min(1, "Enter an image name"),
  disk_format: z.enum(DISK_FORMATS),
  force: z.boolean(),
});

export type UploadToImageValues = z.infer<typeof uploadToImageSchema>;
