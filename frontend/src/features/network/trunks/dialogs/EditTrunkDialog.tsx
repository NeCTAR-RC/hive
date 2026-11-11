// Edit a trunk's name, description and admin state.
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Trunk } from "../../../../lib/api/types/network";
import { useUpdateTrunk } from "../../api";
import { updateTrunkRequest } from "./request";
import { editTrunkSchema, type EditTrunkValues } from "./schema";

/** The edit trunk dialog; only what changed is sent. */
export function EditTrunkDialog({
  trunk,
  onClose,
}: {
  trunk: Trunk;
  onClose: () => void;
}) {
  const { SwitchInput, TextInput } = fieldsFor<EditTrunkValues>();
  const { dialog } = useMutationForm({
    schema: editTrunkSchema,
    defaultValues: {
      name: trunk.name,
      description: trunk.description,
      admin_state_up: trunk.admin_state_up ?? true,
    },
    mutation: useUpdateTrunk(),
    toVariables: (values) => updateTrunkRequest(trunk, values),
    successMessage: (updated) => `Trunk ${updated.name || updated.id} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit trunk ${trunk.name || trunk.id}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Trunk name" />
      <TextInput name="description" label="Description" />
      <SwitchInput
        name="admin_state_up"
        label="Enable admin state (the trunk is up)"
      />
    </FormDialog>
  );
}
