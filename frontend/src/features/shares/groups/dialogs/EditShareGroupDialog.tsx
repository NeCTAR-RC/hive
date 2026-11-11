// The edit share group dialog (manila-ui share_groups forms.py).
import type { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { ShareGroup } from "../../../../lib/api/types/shares";
import { useUpdateShareGroup } from "../../api";
import { nameSchema } from "./schema";

/** Changes a share group's name and description. */
export function EditShareGroupDialog({
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
      name: group.name ?? "",
      description: group.description ?? "",
    },
    mutation: useUpdateShareGroup(),
    toVariables: (values) => ({ id: group.id, ...values }),
    successMessage: (_updated, values) =>
      `Share group ${values.name} has been updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit ${group.name || group.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Name" isRequired />
      <TextAreaInput name="description" label="Description" />
    </FormDialog>
  );
}
