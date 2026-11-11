// Edit a network's name and admin state.
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { Network } from "../../../../lib/api/types/network";
import { useUpdateNetwork } from "../../api";
import { updateNetworkRequest } from "./request";
import { editNetworkSchema, type EditNetworkValues } from "./schema";

/**
 * The edit network dialog. The name field starts blank when the name is
 * just the id; only what changed is sent.
 */
export function EditNetworkDialog({
  network,
  onClose,
}: {
  network: Network;
  onClose: () => void;
}) {
  const { SwitchInput, TextInput } = fieldsFor<EditNetworkValues>();
  const { dialog } = useMutationForm({
    schema: editNetworkSchema,
    defaultValues: {
      name: network.name === network.id ? "" : network.name,
      admin_state_up: network.admin_state_up ?? true,
    },
    mutation: useUpdateNetwork(),
    toVariables: (values) => updateNetworkRequest(network, values),
    successMessage: (updated) =>
      `Network ${updated.name || updated.id} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit network ${network.name}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Network name" />
      <SwitchInput
        name="admin_state_up"
        label="Enable admin state (the network is up)"
      />
    </FormDialog>
  );
}
