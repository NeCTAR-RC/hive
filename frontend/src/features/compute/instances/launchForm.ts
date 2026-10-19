// The launch wizard's form: the schema, its value type and the behaviour
// shared by the wizard and its step components.
import { useEffect } from "react";
import type { useForm } from "react-hook-form";
import { z } from "zod";

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
  });

export type LaunchForm = z.infer<typeof launchSchema>;

export type LaunchFormApi = ReturnType<typeof useForm<LaunchForm>>;

/**
 * Clear the chosen source whenever the user picks another boot-source type:
 * an image id is not a volume id, and nova rejects the mix. Horizon's
 * source step clears its allocated source on a type change the same way
 * (source.controller.js updateBootSourceSelection). A form reset (the deep
 * link or the Nectar defaults) carries no field name and is left alone.
 */
export function useSourceTypeReset(form: LaunchFormApi): void {
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (name !== "source_type") return;
      form.setValue("source_id", "", { shouldDirty: true });
      form.setValue("delete_volume_on_termination", false, {
        shouldDirty: true,
      });
      form.clearErrors("source_id");
    });
    return () => subscription.unsubscribe();
  }, [form]);
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
