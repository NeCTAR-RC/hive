// The edit share group snapshot dialog (manila-ui share_group_snapshots
// forms.py).
import type { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ShareGroupSnapshot } from "../../../../lib/api/types/shares";
import { useUpdateShareGroupSnapshot } from "../../api";
import { nameSchema } from "./schema";

/** Changes a share group snapshot's name and description. */
export function EditShareGroupSnapshotDialog({
  snapshot,
  onClose,
}: {
  snapshot: ShareGroupSnapshot;
  onClose: () => void;
}) {
  const { TextAreaInput, TextInput } = fieldsFor<z.infer<typeof nameSchema>>();
  const { dialog } = useMutationForm({
    schema: nameSchema,
    defaultValues: {
      name: snapshot.name ?? "",
      description: snapshot.description ?? "",
    },
    mutation: useUpdateShareGroupSnapshot(),
    toVariables: (values) => ({ id: snapshot.id, ...values }),
    successMessage: (_updated, values) =>
      `Share group snapshot ${values.name} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${snapshot.name || snapshot.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Name" isRequired />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
