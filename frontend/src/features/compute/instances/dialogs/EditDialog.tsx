// The edit instance dialog.
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { maxLength } from "../../../../lib/validation";
import { useUpdateInstance } from "../../api";
import type { InstanceDialogProps } from "./props";

const editSchema = z.object({
  name: maxLength(255).min(1, "Enter a name"),
  description: maxLength(255),
});

/** Renames the instance and edits its description. */
export function EditDialog({ instance, onClose }: InstanceDialogProps) {
  const { TextInput } = fieldsFor<z.infer<typeof editSchema>>();
  const { dialog } = useMutationForm({
    schema: editSchema,
    defaultValues: {
      name: instance.name,
      description: instance.description ?? "",
    },
    mutation: useUpdateInstance(),
    toVariables: (values) => ({
      instanceId: instance.id,
      name: values.name,
      description: values.description,
    }),
    successMessage: (_updated, values) => `Instance ${values.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title="Edit instance" submitLabel="Save">
      <TextInput name="name" label="Name" isRequired />
      <TextInput name="description" label="Description" />
    </FormDialog>
  );
}
