import type { ReactNode } from "react";
import { DialogActions } from "../Dialog/DialogActions";
import { DialogFrame } from "../Dialog/DialogFrame";
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
}

/**
 * A yes-or-no question above the page; destructive actions use the danger
 * tone. The question names what the action touches, as Horizon's does, and
 * never asks the user to type a name. A confirmed request reports its
 * outcome in a toast (see `useBulkAction`), so the dialog shows no error.
 *
 * Like every dialog, its content exists only while it is open, so it starts
 * fresh on every open.
 */
export function ConfirmDialog({ isOpen, ...props }: ConfirmDialogProps) {
  return isOpen ? <OpenConfirmDialog {...props} /> : null;
}

/** The open dialog; mounted on every open, so its state starts fresh. */
function OpenConfirmDialog({
  onOpenChange,
  title,
  children,
  confirmLabel = "Confirm",
  tone = "danger",
  onConfirm,
  isPending = false,
}: Omit<ConfirmDialogProps, "isOpen">) {
  return (
    <DialogFrame
      onClose={() => onOpenChange(false)}
      isPending={isPending}
      title={title}
      actions={
        <DialogActions
          label={confirmLabel}
          pendingLabel="Working..."
          tone={tone === "danger" ? "danger" : undefined}
          isPending={isPending}
          onPress={onConfirm}
        />
      }
    >
      <div className={styles.body}>{children}</div>
    </DialogFrame>
  );
}
