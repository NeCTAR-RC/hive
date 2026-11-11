import type { ReactNode } from "react";
import { Dialog, Modal } from "@ardc-ui/react";
import type { ModalSize } from "@ardc-ui/react";

/**
 * The library `Modal` and `Dialog`, as shipped, for a task that ends in a
 * request. The frame is open for as long as it is mounted; every way of
 * closing it (Escape, the close button, a click outside, Cancel) calls
 * `onClose`, except while `isPending`, so the user cannot lose track of a
 * request that is still running.
 */
export function DialogFrame({
  onClose,
  isPending,
  title,
  size = "md",
  actions,
  children,
}: {
  onClose: () => void;
  isPending: boolean;
  title: string;
  size?: ModalSize;
  actions: ReactNode;
  children: ReactNode;
}) {
  const close = (open: boolean) => {
    if (!open && !isPending) onClose();
  };
  return (
    <Modal isOpen onOpenChange={close} size={size} isDismissable>
      <Dialog title={title} closeLabel="Close" actions={actions}>
        {children}
      </Dialog>
    </Modal>
  );
}
