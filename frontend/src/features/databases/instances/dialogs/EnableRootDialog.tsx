// Enable root (trove-dashboard databases/forms.py with the Nectar patches): creates or
// resets the root account and shows its password once.
import { useForm } from "react-hook-form";
import { Button, Dialog, Modal } from "@ardc-ui/react";
import { CodeBlock } from "../../../../components/CodeBlock/CodeBlock";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import type { DbInstance } from "../../../../lib/api/types/databases";
import { notify } from "../../../../lib/notify";
import { useEnableRoot } from "../../api";

/**
 * Enables root on the instance, or resets its password, then shows the
 * credentials once in the same dialog.
 */
export function EnableRootDialog({
  instance,
  onClose,
}: {
  instance: DbInstance;
  onClose: () => void;
}) {
  const enable = useEnableRoot();
  // useForm directly: after a success the password shows once in its own
  // dialog, where useMutationForm would close.
  const form = useForm<Record<string, never>>({ defaultValues: {} });
  if (enable.data) {
    // Nothing is left to cancel once root is enabled, so the dialog that
    // shows the password has one way out, as the application credential
    // secret dialog does.
    return (
      <Modal isOpen onOpenChange={(open) => !open && onClose()} isDismissable>
        <Dialog
          title="Root password"
          closeLabel="Close"
          actions={<Button slot="close">Done</Button>}
        >
          <p>This password is shown once. Store it somewhere safe.</p>
          <CodeBlock
            text={`${enable.data.name ?? "root"}:${enable.data.password ?? ""}`}
            label="Root credentials"
          />
        </Dialog>
      </Modal>
    );
  }
  return (
    <FormDialog
      form={form}
      onValid={() =>
        enable.mutate(instance.id, {
          onSuccess: () =>
            notify.success("Root access enabled. Copy the password now."),
        })
      }
      onClose={onClose}
      title={`Enable root on ${instance.name || instance.id}`}
      submitLabel="Enable root"
      isPending={enable.isPending}
      error={enable.error}
    >
      <p>
        A root (superuser) account is created with a generated password.
        Enabling it again resets the password.
      </p>
    </FormDialog>
  );
}
