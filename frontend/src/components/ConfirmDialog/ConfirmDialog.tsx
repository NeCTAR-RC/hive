import { useState, type ReactNode } from "react";
import {
  Button,
  Dialog,
  FieldError,
  Label,
  Modal,
  TextField,
} from "@ardc-ui/react";
import { ErrorState } from "../ErrorState/ErrorState";
import { loadingProps } from "../buttonState";
import styles from "./ConfirmDialog.module.scss";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  isPending?: boolean;
  error?: unknown;
  /** Destructive actions can require the user to type this text first. */
  confirmText?: string;
}

/**
 * A yes-or-no question above the page. Destructive actions use the danger
 * tone and, for the irreversible ones, a typed confirmation.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  children,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
  isPending = false,
  error,
  confirmText,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  // Clear the typed text whenever the dialog closes, including when the
  // parent closes it after a successful confirm (derived state, set during
  // render), so the next dialog never opens pre-filled.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setTyped("");
  }
  const typedOk = !confirmText || typed.trim() === confirmText;
  const close = (open: boolean) => {
    if (isPending) return;
    onOpenChange(open);
  };
  return (
    <Modal isOpen={isOpen} onOpenChange={close} size="md" isDismissable>
      <Dialog
        title={title}
        closeLabel="Close"
        actions={
          <>
            <Button variant="secondary" slot="close" isDisabled={isPending}>
              Cancel
            </Button>
            {/* One element throughout, so focus stays on it while pending. */}
            <Button
              {...(tone === "danger" ? { tone: "danger" as const } : {})}
              {...loadingProps(isPending, "Working...")}
              isPending={isPending}
              isDisabled={!isPending && !typedOk}
              onPress={onConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <div className={styles.body}>
          {error ? (
            <ErrorState error={error} title="That did not work" />
          ) : null}
          {children}
          {confirmText && (
            <TextField
              value={typed}
              onChange={setTyped}
              isRequired
              validationBehavior="aria"
              autoComplete="off"
              isInvalid={typed.length > 0 && !typedOk}
            >
              <Label>
                Type <strong>{confirmText}</strong> to confirm
              </Label>
              <FieldError>The text does not match</FieldError>
            </TextField>
          )}
        </div>
      </Dialog>
    </Modal>
  );
}
