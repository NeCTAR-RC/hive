// The edit snapshot dialog: a volume snapshot's name and description.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { VolumeSnapshot } from "../../../../lib/api/types/volumes";
import { maxLength } from "../../../../lib/validation";
import { useUpdateSnapshot } from "../../api";

const schema = z.object({
  name: maxLength(255),
  description: maxLength(255),
});

const { TextAreaInput, TextInput } = fieldsFor<z.infer<typeof schema>>();

/**
 * Edits a snapshot's name and description. Only the changed fields are
 * sent; with nothing changed the dialog closes without a request.
 */
export function EditSnapshotDialog({
  snapshot,
  onClose,
}: {
  snapshot: VolumeSnapshot;
  onClose: () => void;
}) {
  const update = useUpdateSnapshot();
  const { dialog } = useMutationForm({
    schema,
    defaultValues: {
      name: snapshot.name,
      description: snapshot.description ?? "",
    },
    mutation: update,
    toVariables: (values) => {
      const body: Parameters<typeof update.mutate>[0] = {
        snapshotId: snapshot.id,
      };
      if (values.name !== snapshot.name) body.name = values.name;
      if (values.description !== (snapshot.description ?? ""))
        body.description = values.description;
      return Object.keys(body).length === 1 ? null : body;
    },
    successMessage: (updated) =>
      `Snapshot ${updated.name || updated.id} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit snapshot ${snapshot.name || snapshot.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Snapshot name" />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
