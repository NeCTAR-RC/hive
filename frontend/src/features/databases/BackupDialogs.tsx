// Create backup (trove-dashboard database_backups/workflows): name, an
// active instance, description and an optional completed parent backup.
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import {
  SelectInput,
  TextAreaInput,
  TextInput,
} from "../../components/Form/fields";
import { FormDialog } from "../../components/FormDialog/FormDialog";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { notify } from "../../lib/notify";
import { dbBackupsQuery, useCreateBackup } from "./api";

const schema = z.object({
  name: z.string().trim().min(1, "Enter a backup name").max(80),
  instance_id: z.string().min(1, "Choose an instance"),
  description: z.string().trim().max(512),
  parent_id: z.string(),
});

export function CreateBackupDialog({
  projectId,
  instanceId,
  onClose,
}: {
  projectId: string;
  instanceId: string | null;
  onClose: () => void;
}) {
  const backups = useQuery(dbBackupsQuery(projectId));
  const create = useCreateBackup(projectId);
  const instances = backups.data?.instances ?? [];
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    values: {
      name: "",
      instance_id:
        instanceId ?? (instances.length === 1 ? (instances[0]?.id ?? "") : ""),
      description: "",
      parent_id: "",
    },
    resetOptions: { keepDirtyValues: true },
  });
  const chosen = useWatch({ control: form.control, name: "instance_id" });
  const parents = (backups.data?.items ?? []).filter(
    (b) => b.status === "COMPLETED" && b.instance_id === chosen,
  );
  const submit = form.handleSubmit((values) => {
    create.mutate(
      {
        name: values.name,
        instance_id: values.instance_id,
        ...(values.description ? { description: values.description } : {}),
        ...(values.parent_id ? { parent_id: values.parent_id } : {}),
      },
      {
        onSuccess: () => {
          notify.success(`Backup ${values.name} is being created.`);
          onClose();
        },
      },
    );
  });
  return (
    <FormDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title="Create backup"
      submitLabel="Create backup"
      onSubmit={submit}
      isPending={create.isPending}
      error={create.error}
    >
      {backups.isPending ? (
        <SkeletonLines lines={3} />
      ) : instances.length === 0 ? (
        <Alert tone="info" role="status">
          No active database instances to back up.
        </Alert>
      ) : (
        <>
          <TextInput
            control={form.control}
            name="name"
            label="Backup name"
            isRequired
          />
          <SelectInput
            control={form.control}
            name="instance_id"
            label="Database instance"
            options={instances.map((i) => ({
              id: i.id,
              label: i.name || i.id,
            }))}
            isRequired
          />
          <TextAreaInput
            control={form.control}
            name="description"
            label="Description"
            rows={2}
          />
          {parents.length > 0 && (
            <SelectInput
              control={form.control}
              name="parent_id"
              label="Parent backup"
              description="Choose a completed backup to take an incremental backup from."
              options={[
                { id: "", label: "None (full backup)" },
                ...parents.map((b) => ({ id: b.id, label: b.name || b.id })),
              ]}
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
