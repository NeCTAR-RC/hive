// Create backup (trove-dashboard database_backups/workflows): name, an
// active instance, description and an optional completed parent backup.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWatch } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import { maxLength } from "../../../../lib/validation";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbBackupsQuery, useCreateBackup } from "../../api";
import { parentBackups, validParentId } from "../../status";

const schema = z.object({
  name: maxLength(80).min(1, "Enter a backup name"),
  instance_id: z.string().min(1, "Choose an instance"),
  description: maxLength(512),
  parent_id: z.string(),
});

/**
 * Backs up an active instance. `instanceId` preselects the instance a link
 * came from; a parent backup makes the backup incremental. A parent
 * belongs to one instance, so choosing another instance clears it, and the
 * submit checks it once more against the backups as they are then.
 */
export function CreateBackupDialog({
  instanceId,
  onClose,
}: {
  instanceId: string | null;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const backups = useQuery(dbBackupsQuery(projectId));
  const instances = useMemo(
    () => backups.data?.instances ?? [],
    [backups.data],
  );
  const items = useMemo(() => backups.data?.items ?? [], [backups.data]);
  // The linked instance, else the only active one once the list loads.
  const preselected = useMemo(
    () => ({
      name: "",
      instance_id:
        instanceId ?? (instances.length === 1 ? (instances[0]?.id ?? "") : ""),
      description: "",
      parent_id: "",
    }),
    [instanceId, instances],
  );
  const { SelectInput, TextAreaInput, TextInput } =
    fieldsFor<z.infer<typeof schema>>();
  const { form, dialog } = useMutationForm({
    schema,
    values: preselected,
    mutation: useCreateBackup(),
    toVariables: (values) => {
      const parent = validParentId(items, values.instance_id, values.parent_id);
      return {
        name: values.name,
        instance_id: values.instance_id,
        ...(values.description ? { description: values.description } : {}),
        ...(parent ? { parent_id: parent } : {}),
      };
    },
    successMessage: (_backup, values) =>
      `Backup ${values.name} is being created.`,
    onDone: onClose,
  });
  const chosen = useWatch({ control: form.control, name: "instance_id" });
  const parents = parentBackups(items, chosen);
  const clearForeignParent = (instance: string) => {
    const parent = form.getValues("parent_id");
    if (validParentId(items, instance, parent) !== parent) {
      form.setValue("parent_id", "");
    }
  };
  return (
    <FormDialog
      {...dialog}
      title="Create backup"
      submitLabel="Create backup"
      isSubmitDisabled={instances.length === 0}
    >
      {backups.isPending ? (
        <SkeletonLines lines={3} />
      ) : backups.isError ? (
        <ErrorState
          error={backups.error}
          title="Could not load instances"
          onRetry={() => void backups.refetch()}
        />
      ) : instances.length === 0 ? (
        <Alert tone="info" role="status">
          No active database instances to back up.
        </Alert>
      ) : (
        <>
          <TextInput name="name" label="Backup name" isRequired />
          <SelectInput
            name="instance_id"
            label="Database instance"
            options={instances.map((i) => ({
              id: i.id,
              label: i.name || i.id,
            }))}
            onValueChange={clearForeignParent}
            isRequired
          />
          <TextAreaInput name="description" label="Description" />
          {parents.length > 0 && (
            <SelectInput
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
