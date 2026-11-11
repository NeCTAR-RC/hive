// The create snapshot dialog for one volume.
import { Alert } from "@ardc-ui/react";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { Volume } from "../../../../lib/api/types/volumes";
import { useCreateSnapshot } from "../../api";
import { snapshotCreateRequest } from "./request";
import { createSnapshotSchema, type CreateSnapshotValues } from "./schema";

/**
 * Snapshots a volume, warning first when it is attached: the snapshot then
 * misses data the instance has not written to disk yet.
 */
export function CreateSnapshotDialog({
  volume,
  onClose,
}: {
  volume: Volume;
  onClose: () => void;
}) {
  const { TextAreaInput, TextInput } = fieldsFor<CreateSnapshotValues>();
  const { dialog } = useMutationForm({
    schema: createSnapshotSchema,
    defaultValues: { name: "", description: "" },
    mutation: useCreateSnapshot(),
    toVariables: (values) => snapshotCreateRequest(volume.id, values),
    successMessage: (snapshot) =>
      `Creating snapshot ${snapshot.name || snapshot.id} of ${volume.name || volume.id}.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Create snapshot of ${volume.name || volume.id}`}
      submitLabel="Create snapshot"
    >
      {volume.status === "in-use" && (
        <Alert tone="warning" title="The volume is attached">
          The snapshot is taken while the volume is in use. Data not yet written
          to disk by the instance will be missing from it.
        </Alert>
      )}
      <TextInput name="name" label="Snapshot name" />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
