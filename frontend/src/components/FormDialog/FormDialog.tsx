import { useId, type FormEvent, type ReactNode } from "react";
import { Button, Dialog, Modal } from "@ardc-ui/react";
import type { ModalSize } from "@ardc-ui/react";
import { ErrorState } from "../ErrorState/ErrorState";
import styles from "./FormDialog.module.scss";

export interface FormDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  size?: ModalSize;
  submitLabel: string;
  submitTone?: "danger";
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending?: boolean;
  /** Keeps the submit button disabled, for a form the dialog itself can
   * tell is not valid yet (the reason belongs in the form body). */
  isSubmitDisabled?: boolean;
  error?: unknown;
  children: ReactNode;
}

/**
 * A modal holding a form. The submit button lives in the dialog's action
 * row and is tied to the form by id, so Enter in a field submits as usual.
 */
export function FormDialog({
  isOpen,
  onOpenChange,
  title,
  size = "md",
  submitLabel,
  submitTone,
  onSubmit,
  isPending = false,
  isSubmitDisabled = false,
  error,
  children,
}: FormDialogProps) {
  const formId = useId();
  const close = (open: boolean) => {
    if (isPending) return;
    onOpenChange(open);
  };
  return (
    <Modal isOpen={isOpen} onOpenChange={close} size={size} isDismissable>
      <Dialog
        title={title}
        closeLabel="Close"
        actions={
          <>
            <Button variant="secondary" slot="close" isDisabled={isPending}>
              Cancel
            </Button>
            {isPending ? (
              <Button
                {...(submitTone ? { tone: submitTone } : {})}
                state="loading"
                loadingText="Saving..."
                isDisabled
              >
                {submitLabel}
              </Button>
            ) : (
              <Button
                type="submit"
                form={formId}
                isDisabled={isSubmitDisabled}
                {...(submitTone ? { tone: submitTone } : {})}
              >
                {submitLabel}
              </Button>
            )}
          </>
        }
      >
        <form
          id={formId}
          onSubmit={onSubmit}
          noValidate
          className={styles.form}
        >
          {error ? <ErrorState error={error} title="Could not save" /> : null}
          {children}
        </form>
      </Dialog>
    </Modal>
  );
}
