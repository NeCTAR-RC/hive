// What the receiving project needs for a new volume transfer (Horizon
// volumes/forms.py ShowTransferForm), shown once.
import { Alert, Button, Dialog, Modal } from "@ardc-ui/react";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import type { VolumeTransferCreated } from "../../../../lib/api/types/volumes";

/**
 * The transfer's ID and authorisation key, each with a copy button. Cinder
 * never returns the key again, so the dialog says to copy it now.
 */
export function TransferCreatedDialog({
  transfer,
  onClose,
}: {
  transfer: VolumeTransferCreated;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      isDismissable
    >
      <Dialog
        title={`Transfer ${transfer.name ?? transfer.id} created`}
        closeLabel="Close"
        actions={<Button slot="close">Close</Button>}
      >
        <Alert tone="warning" role="status">
          Copy the transfer ID and authorisation key now. The key is not shown
          again after you close this dialog.
        </Alert>
        <p>
          Someone in the receiving project accepts the transfer with both
          values: Volumes, then Accept transfer. You can cancel the transfer
          from the volume&apos;s menu until it is accepted.
        </p>
        <CodeBlock text={transfer.id} label="Transfer ID" wrap />
        <CodeBlock text={transfer.auth_key} label="Authorisation key" wrap />
      </Dialog>
    </Modal>
  );
}
