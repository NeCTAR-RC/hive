// The launch wizard's form: the schema, its value type and the behaviour
// shared by the wizard and its step components.
import { useEffect } from "react";
import { useWatch } from "react-hook-form";
import type { useForm } from "react-hook-form";
import { z } from "zod";
import type { LaunchOptions } from "../../../lib/api/types";
import { typesForZone } from "../../volumes/volumes/rules";
import { findImage, volumeSizeFloor } from "./launch";

export const launchSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter an instance name")
      .max(255, "At most 255 characters"),
    description: z.string().trim().max(255, "At most 255 characters"),
    availability_zone: z.string().min(1, "Choose an availability zone"),
    count: z
      .number({ message: "Enter how many instances to launch" })
      .int()
      .min(1, "At least 1")
      .max(100, "At most 100"),
    source_type: z.enum(["image", "snapshot", "volume", "volume_snapshot"]),
    source_id: z.string().min(1, "Choose a source"),
    delete_volume_on_termination: z.boolean(),
    // Horizon's "Create New Volume" for an image or snapshot source.
    create_volume: z.boolean(),
    volume_size_gb: z
      .number({ message: "Enter a volume size" })
      .int("Whole gigabytes only")
      .min(1, "At least 1 GB")
      .optional(),
    // Not sent: the floor the wizard keeps for the size, so the schema can
    // check it without reaching for the launch options.
    volume_size_min_gb: z.number(),
    // "" means the zone's default volume type.
    volume_type: z.string(),
    // Not sent: the chosen flavour class, kept here so it survives the
    // step panel being unmounted and mounted again.
    flavor_class: z.string(),
    flavor_id: z.string().min(1, "Choose a flavour"),
    networks: z.array(z.string()),
    ports: z.array(z.string()),
    security_groups: z.array(z.string()),
    key_name: z.string(),
    user_data: z.string().max(65535, "User data is limited to 64 KB"),
    server_group_id: z.string(),
    metadata: z.array(
      z.object({
        key: z.string().trim().min(1, "Enter a key").max(255),
        value: z.string().max(255),
      }),
    ),
  })
  .refine((v) => v.networks.length + v.ports.length > 0, {
    message: "Choose at least one network or port",
    path: ["networks"],
  })
  .superRefine((v, ctx) => {
    if (!v.create_volume) return;
    if (v.volume_size_gb === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["volume_size_gb"],
        message: "Enter a volume size",
      });
    } else if (v.volume_size_gb < v.volume_size_min_gb) {
      ctx.addIssue({
        code: "custom",
        path: ["volume_size_gb"],
        message: `The volume must be at least ${v.volume_size_min_gb} GB`,
      });
    }
  });

export type LaunchForm = z.infer<typeof launchSchema>;

export type LaunchFormApi = ReturnType<typeof useForm<LaunchForm>>;

/**
 * Clear the chosen source whenever the user picks another boot-source type:
 * an image id is not a volume id, and nova rejects the mix. Horizon's
 * source step clears its allocated source on a type change the same way,
 * and resets the new-volume toggle (source.controller.js
 * updateBootSourceSelection). A form reset (the deep link or the Nectar
 * defaults) carries no field name and is left alone.
 */
export function useSourceTypeReset(form: LaunchFormApi): void {
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name !== "source_type") return;
      form.setValue("source_id", "", { shouldDirty: true });
      form.setValue("delete_volume_on_termination", false, {
        shouldDirty: true,
      });
      form.setValue("create_volume", false, { shouldDirty: true });
      form.setValue("volume_size_gb", undefined, { shouldDirty: true });
      form.setValue("volume_type", "", { shouldDirty: true });
      form.clearErrors(["source_id", "volume_size_gb"]);
    });
    return () => subscription.unsubscribe();
  }, [form]);
}

/**
 * Keep the new-volume fields consistent with the rest of the form, as
 * Horizon's source step does: the size floor follows the chosen image
 * (source.controller.js checkVolumeForImage) and the flavour's root disk
 * (its flavour watcher), a size below the floor is raised to it, and a
 * volume type the chosen zone does not offer is dropped (the type picker
 * is Hive's own addition).
 */
export function useNewVolumeRules(
  form: LaunchFormApi,
  data: LaunchOptions | undefined,
): void {
  const [
    sourceType,
    sourceId,
    flavorId,
    createVolume,
    zone,
    volumeType,
    size,
    floor,
  ] = useWatch({
    control: form.control,
    name: [
      "source_type",
      "source_id",
      "flavor_id",
      "create_volume",
      "availability_zone",
      "volume_type",
      "volume_size_gb",
      "volume_size_min_gb",
    ],
  });
  useEffect(() => {
    if (!data) return;
    const image = findImage(data, sourceType, sourceId);
    const flavor = data.flavors?.find((f) => f.id === flavorId);
    const next = volumeSizeFloor(image, flavor);
    if (next !== floor) form.setValue("volume_size_min_gb", next);
    if (createVolume && (size === undefined || size < next)) {
      form.setValue("volume_size_gb", next, { shouldDirty: true });
    }
    if (
      volumeType &&
      !typesForZone(data, zone).some((t) => t.name === volumeType)
    ) {
      form.setValue("volume_type", "");
    }
  }, [
    data,
    form,
    sourceType,
    sourceId,
    flavorId,
    createVolume,
    zone,
    volumeType,
    size,
    floor,
  ]);
}

/** Focus the checked control in a group, else its first enabled one. */
export function focusTarget(container: HTMLElement | null) {
  if (!container) return null;
  return {
    focus: () => {
      const target =
        container.querySelector<HTMLElement>("input:checked") ??
        container.querySelector<HTMLElement>(
          'input:not(:disabled), [role="row"][aria-selected], tbody [role="row"]:not([aria-disabled="true"])',
        );
      target?.focus();
    },
  };
}
