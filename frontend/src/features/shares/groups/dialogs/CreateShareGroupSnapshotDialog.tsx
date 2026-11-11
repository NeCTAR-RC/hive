// The create share group snapshot dialog (manila-ui share_group_snapshots
// forms.py).
import type { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ShareGroup } from "../../../../lib/api/types/shares";
import { useCreateShareGroupSnapshot } from "../../api";
import { nameSchema } from "./schema";

/** Snapshots every share in a share group together. */
export function CreateShareGroupSnapshotDialog({
  group,
  onClose,
}: {
  group: ShareGroup;
  onClose: () => void;
}) {
  const { TextAreaInput, TextInput } = fieldsFor<z.infer<typeof nameSchema>>();
  const { dialog } = useMutationForm({
    schema: nameSchema,
    defaultValues: {
      name: `${group.name || group.id}-snapshot`,
      description: "",
    },
    mutation: useCreateShareGroupSnapshot(),
    toVariables: (values) => ({
      share_group_id: group.id,
      name: values.name,
      ...(values.description ? { description: values.description } : {}),
    }),
    successMessage: (_snapshot, values) =>
      `Share group snapshot ${values.name} is being created.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Create snapshot of ${group.name || group.id}`}
      submitLabel="Create snapshot"
    >
      <TextInput name="name" label="Snapshot name" isRequired />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
