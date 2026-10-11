// Restore a backup into an existing volume, or into a new volume in a
// chosen zone and type (the Horizon fork's restore form, commit aed3e927b).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import {
  RadioInput,
  SelectInput,
  TextInput,
} from "../../../components/Form/fields";
import type { VolumeBackup } from "../../../lib/api/types";
import { formatGb } from "../../../lib/format";
import { notify } from "../../../lib/notify";
import { useRestoreBackup, volumeOptionsQuery } from "../api";
import { typesForZone } from "../volumes/rules";

const schema = z
  .object({
    target: z.enum(["new", "existing"]),
    volume_id: z.string(),
    name: z.string().trim().max(255, "At most 255 characters"),
    availability_zone: z.string(),
    volume_type: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.target === "existing" && !values.volume_id) {
      ctx.addIssue({
        code: "custom",
        path: ["volume_id"],
        message: "Choose a volume to restore into",
      });
    }
    if (values.target === "new" && !values.availability_zone) {
      ctx.addIssue({
        code: "custom",
        path: ["availability_zone"],
        message: "An availability zone is required",
      });
    }
  });

export function RestoreBackupDialog({
  projectId,
  backup,
  onClose,
}: {
  projectId: string;
  backup: VolumeBackup;
  onClose: () => void;
}) {
  const options = useQuery(volumeOptionsQuery(projectId));
  const restore = useRestoreBackup(projectId);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      target: "new",
      volume_id: "",
      name: "",
      availability_zone: backup.availability_zone ?? "",
      volume_type: "",
    },
  });
  const target = useWatch({ control: form.control, name: "target" });
  const zone = useWatch({ control: form.control, name: "availability_zone" });
  const types = useMemo(
    () => typesForZone(options.data, zone),
    [options.data, zone],
  );
  // Only an available volume at least as large as the backup can take it.
  const targets = (options.data?.volumes ?? []).filter(
    (v) =>
      v.status === "available" && (v.size_gb ?? 0) >= (backup.size_gb ?? 0),
  );

  const submit = form.handleSubmit((values) => {
    const body: Parameters<typeof restore.mutate>[0] = { backupId: backup.id };
    if (values.target === "existing") {
      body.volume_id = values.volume_id;
    } else {
      body.availability_zone = values.availability_zone;
      if (values.name) body.name = values.name;
      if (values.volume_type) body.volume_type = values.volume_type;
    }
    restore.mutate(body, {
      onSuccess: (result) => {
        notify.success(
          result.new_volume
            ? `Restoring backup ${backup.name || backup.id} into new volume ${result.volume?.name || result.volume_id}.`
            : `Restoring backup ${backup.name || backup.id} into the volume.`,
        );
        onClose();
      },
    });
  });

  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Restore backup ${backup.name || backup.id}`}
      submitLabel="Restore backup"
      size="lg"
      onSubmit={submit}
      isPending={restore.isPending}
      error={restore.error ?? options.error}
    >
      <p>
        The backup holds {formatGb(backup.size_gb)}
        {backup.volume_name ? ` from volume ${backup.volume_name}` : ""}.
      </p>
      <RadioInput
        control={form.control}
        name="target"
        label="Restore into"
        options={[
          { id: "new", label: "A new volume" },
          {
            id: "existing",
            label: "An existing volume (its contents are replaced)",
          },
        ]}
      />
      {target === "existing" ? (
        <SelectInput
          control={form.control}
          name="volume_id"
          label="Volume"
          options={targets.map((v) => ({
            id: v.id,
            label: `${v.name || v.id} (${formatGb(v.size_gb)}, ${v.availability_zone ?? "no zone"})`,
          }))}
          isRequired
          isDisabled={options.isPending}
          placeholder={
            options.isPending
              ? "Loading volumes..."
              : targets.length === 0
                ? "No available volume is large enough"
                : "Choose a volume"
          }
          description="Only available volumes at least as large as the backup are listed."
        />
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Volume name"
            description={`Leave blank for restore_backup_${backup.id}.`}
          />
          <SelectInput
            control={form.control}
            name="availability_zone"
            label="Availability zone"
            options={(options.data?.availability_zones ?? [])
              .filter((z) => z.available)
              .map((z) => ({ id: z.name, label: z.name }))}
            isRequired
            isDisabled={options.isPending}
            placeholder={
              options.isPending ? "Loading..." : "Choose an availability zone"
            }
          />
          {zone && (
            <SelectInput
              control={form.control}
              name="volume_type"
              label="Volume type"
              options={[
                { id: "", label: "Default volume type" },
                ...types.map((t) => ({ id: t.name, label: t.name })),
              ]}
              description={
                options.data?.has_zoned_types
                  ? `Showing the types available in ${zone}.`
                  : undefined
              }
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
