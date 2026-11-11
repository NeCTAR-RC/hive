// The create backup dialog for one volume, or for one of its snapshots.
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Volume } from "../../../../lib/api/types/volumes";
import { formatGb } from "../../../../lib/format";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { snapshotsQuery, useCreateBackup } from "../../api";
import { backupSnapshots } from "../rules";
import { backupCreateRequest } from "./request";
import { createBackupSchema, type CreateBackupValues } from "./schema";

/**
 * Backs up a volume, or one of its available snapshots for a consistent
 * copy. The snapshots page opens it with `snapshotId` preselected; from a
 * volume, an attached volume gets a warning instead.
 */
export function CreateBackupDialog({
  volume,
  snapshotId,
  onClose,
}: {
  volume: Pick<Volume, "id" | "name" | "status">;
  snapshotId?: string | undefined;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const snapshots = useQuery(snapshotsQuery(projectId));
  const forVolume = backupSnapshots(snapshots.data?.items ?? [], volume.id);
  const { SelectInput, SwitchInput, TextAreaInput, TextInput } =
    fieldsFor<CreateBackupValues>();
  const { dialog } = useMutationForm({
    schema: createBackupSchema,
    defaultValues: {
      name: "",
      description: "",
      container: "",
      snapshot_id: snapshotId ?? "",
      incremental: false,
    },
    mutation: useCreateBackup(),
    toVariables: (values) => backupCreateRequest(volume.id, values),
    successMessage: (backup) => `Creating backup ${backup.name || backup.id}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Create backup of ${volume.name || volume.id}`}
      submitLabel="Create backup"
    >
      {volume.status === "in-use" && !snapshotId && (
        <Alert tone="warning" title="The volume is attached">
          The backup is taken while the volume is in use. Back up a snapshot
          instead for a consistent copy.
        </Alert>
      )}
      <TextInput name="name" label="Backup name" isRequired />
      <TextAreaInput name="description" label="Description" />
      <TextInput
        name="container"
        label="Container"
        description="The object store container that holds the backup. Leave blank for the default."
      />
      <SelectInput
        name="snapshot_id"
        label="Snapshot to back up"
        options={[
          { id: "", label: "The volume itself" },
          ...forVolume.map((s) => ({
            id: s.id,
            label: `${s.name || s.id} (${formatGb(s.size_gb)})`,
          })),
        ]}
        isDisabled={snapshots.isPending}
        description="Back up a snapshot of this volume instead of its current contents."
      />
      <SwitchInput
        name="incremental"
        label="Incremental (store only what changed since the previous backup)"
      />
    </FormDialog>
  );
}
