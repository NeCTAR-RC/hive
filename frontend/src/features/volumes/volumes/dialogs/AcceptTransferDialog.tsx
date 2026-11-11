// The accept transfer dialog (Horizon volumes/forms.py AcceptTransferForm):
// takes a volume another project offered into this one.
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { useAcceptTransfer } from "../../api";
import { acceptTransferSchema, type AcceptTransferValues } from "./schema";

const { TextInput } = fieldsFor<AcceptTransferValues>();

/** Accepts a volume transfer with the ID and key the giving project sent. */
export function AcceptTransferDialog({ onClose }: { onClose: () => void }) {
  const { dialog } = useMutationForm({
    schema: acceptTransferSchema,
    defaultValues: { transfer_id: "", auth_key: "" },
    mutation: useAcceptTransfer(),
    toVariables: (values) => values,
    successMessage: (transfer) =>
      `Accepted transfer ${transfer.name ?? transfer.id}. The volume is now in this project.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title="Accept volume transfer"
      submitLabel="Accept transfer"
    >
      <p>
        Enter the transfer ID and authorisation key from the project giving the
        volume. The volume then counts against this project&apos;s quota.
      </p>
      <TextInput name="transfer_id" label="Transfer ID" isRequired />
      <TextInput name="auth_key" label="Authorisation key" isRequired />
    </FormDialog>
  );
}
