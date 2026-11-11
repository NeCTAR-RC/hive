// The create transfer dialog (Horizon volumes/forms.py CreateTransferForm):
// names a transfer that offers the volume to another project.
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type {
  Volume,
  VolumeTransferCreated,
} from "../../../../lib/api/types/volumes";
import { useCreateTransfer } from "../../api";
import { createTransferSchema, type CreateTransferValues } from "./schema";

const { TextInput } = fieldsFor<CreateTransferValues>();

/**
 * Creates a transfer of the volume and hands it to the page through
 * `onCreated`, so the page can show its ID and key once.
 */
export function CreateTransferDialog({
  volume,
  onCreated,
  onClose,
}: {
  volume: Volume;
  onCreated: (transfer: VolumeTransferCreated) => void;
  onClose: () => void;
}) {
  const name = volume.name || volume.id;
  const { dialog } = useMutationForm({
    schema: createTransferSchema,
    defaultValues: { name: "" },
    mutation: useCreateTransfer(),
    toVariables: (values) => ({ volumeId: volume.id, name: values.name }),
    successMessage: (transfer) =>
      `Created transfer ${transfer.name ?? transfer.id} for volume ${name}.`,
    onSuccess: (transfer) => onCreated(transfer),
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Create transfer of ${name}`}
      submitLabel="Create transfer"
    >
      <p>
        A transfer gives this volume to another project. The next step shows a
        transfer ID and an authorisation key: pass both to someone in the
        receiving project, who accepts the transfer on their Volumes page. Until
        then the volume cannot be used here.
      </p>
      <TextInput name="name" label="Transfer name" isRequired />
    </FormDialog>
  );
}
