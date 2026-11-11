// The edit share snapshot dialog (manila-ui share_snapshots/forms.py).
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ShareSnapshot } from "../../../../lib/api/types/shares";
import { maxLength } from "../../../../lib/validation";
import { useUpdateSnapshot } from "../../api";

const editSchema = z.object({
  name: maxLength(255).min(1, "Enter a snapshot name"),
  description: maxLength(255),
});

/** Changes a share snapshot's name and description. */
export function EditSnapshotDialog({
  snapshot,
  onClose,
}: {
  snapshot: ShareSnapshot;
  onClose: () => void;
}) {
  const { TextAreaInput, TextInput } = fieldsFor<z.infer<typeof editSchema>>();
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      name: snapshot.name ?? "",
      description: snapshot.description ?? "",
    },
    mutation: useUpdateSnapshot(),
    toVariables: (values) => ({ id: snapshot.id, ...values }),
    successMessage: (_updated, values) =>
      `Snapshot ${values.name} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${snapshot.name || snapshot.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Snapshot name" isRequired />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
