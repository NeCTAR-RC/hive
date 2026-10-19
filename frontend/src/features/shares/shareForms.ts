// Share and share group form models (manila-ui shares and share_groups
// forms.py): schemas, defaults and the field links between them, kept
// apart from the dialogs so they can be tested.
import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import type { Share, ShareDetail, ShareOptions } from "../../lib/api/types";

export const createShareSchema = z.object({
  name: z.string().trim().min(1, "Enter a share name").max(255),
  description: z.string().trim().max(255),
  protocol: z.string().min(1, "Choose a protocol"),
  size: z.number().int().min(1, "At least 1 GiB"),
  share_type: z.string().min(1, "Choose a share type"),
  availability_zone: z.string(),
  share_group_id: z.string(),
  snapshot_id: z.string(),
  metadata: z.string(),
  is_public: z.boolean(),
});

export type CreateShareValues = z.infer<typeof createShareSchema>;

/** Create share defaults: the first protocol, and the share type and
 * zone when there is only one to choose. */
export function createDefaults(
  data: ShareOptions | undefined,
  snapshotId: string | null,
): CreateShareValues {
  return {
    name: "",
    description: "",
    protocol: data?.protocols[0] ?? "",
    size: data?.snapshots.find((s) => s.id === snapshotId)?.size ?? 1,
    share_type:
      data?.share_types.length === 1 ? (data.share_types[0]?.name ?? "") : "",
    availability_zone:
      data?.availability_zones.length === 1
        ? (data.availability_zones[0] ?? "")
        : "",
    share_group_id: "",
    snapshot_id: snapshotId ?? "",
    metadata: "",
    is_public: false,
  };
}

/**
 * The one snapshot a share can be reverted to: the newest, as the backend
 * names it (`newest_snapshot_id` on the share detail, `newest_snapshot_ids`
 * in the options; Manila lists newest first, so list order is no guide).
 * Only an available snapshot (one the options list) can be offered.
 */
export function newestSnapshot(
  share: Share | ShareDetail,
  options: ShareOptions | undefined,
): { id: string; label: string } | null {
  const id =
    ("newest_snapshot_id" in share ? share.newest_snapshot_id : null) ??
    options?.newest_snapshot_ids?.[share.id] ??
    null;
  if (!id) return null;
  const snapshot = options?.snapshots.find((s) => s.id === id);
  if (!snapshot) return null;
  return { id, label: snapshot.name || snapshot.id };
}

/** A snapshot source pins the size to at least the snapshot's
 * (forms.py:88-110), when the user picks the source. */
export function useSnapshotSizePin(
  form: UseFormReturn<CreateShareValues>,
  data: ShareOptions | undefined,
) {
  const snapshots = data?.snapshots;
  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (name !== "snapshot_id") return;
      const picked = snapshots?.find((s) => s.id === values.snapshot_id);
      if (picked && (values.size ?? 0) < picked.size)
        form.setValue("size", picked.size, { shouldDirty: true });
    });
    return () => subscription.unsubscribe();
  }, [form, snapshots]);
}

export const createShareGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(255),
    description: z.string().trim().max(255),
    snapshot_id: z.string(),
    share_group_type_id: z.string(),
    share_types: z.array(z.string()),
    availability_zone: z.string(),
  })
  .superRefine((values, ctx) => {
    if (!values.snapshot_id && !values.share_group_type_id) {
      ctx.addIssue({
        code: "custom",
        path: ["share_group_type_id"],
        message: "Choose a share group type",
      });
    }
  });

export type CreateShareGroupValues = z.infer<typeof createShareGroupSchema>;

/** Share types belong to the group type: ticks made under one type must
 * not be submitted with another, so changing the type clears them. */
export function useShareTypesReset(
  form: UseFormReturn<CreateShareGroupValues>,
) {
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name === "share_group_type_id") form.setValue("share_types", []);
    });
    return () => subscription.unsubscribe();
  }, [form]);
}
