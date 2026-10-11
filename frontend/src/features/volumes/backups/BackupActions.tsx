// Backup row actions behind one hook, as useVolumeActions.
import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { VolumeBackup } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDeleteBackups } from "../api";
import type { BackupActionId } from "../status";
import { RestoreBackupDialog } from "./RestoreBackupDialog";

type Dialog =
  | { kind: "delete"; backups: VolumeBackup[] }
  | { kind: "restore"; backup: VolumeBackup }
  | null;

export function useBackupActions(projectId: string): {
  run: (backup: VolumeBackup, action: BackupActionId) => void;
  runDelete: (backups: VolumeBackup[]) => void;
  dialogs: ReactNode;
} {
  const remove = useDeleteBackups(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const run = (backup: VolumeBackup, action: BackupActionId) => {
    if (action === "delete") setDialog({ kind: "delete", backups: [backup] });
    else setDialog({ kind: "restore", backup });
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { backups } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          backups.length === 1
            ? `Delete backup ${backups[0]?.name || backups[0]?.id}?`
            : `Delete ${backups.length} backups?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            backups.map((b) => b.id),
            {
              onSuccess: () => {
                notify.success(
                  backups.length === 1
                    ? `Deleting backup ${backups[0]?.name || backups[0]?.id}.`
                    : `Deleting ${backups.length} backups.`,
                );
                close();
              },
            },
          )
        }
      >
        <p>Deleted volume backups are not recoverable.</p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "restore") {
    dialogs = (
      <RestoreBackupDialog
        projectId={projectId}
        backup={dialog.backup}
        onClose={close}
      />
    );
  }

  return {
    run,
    runDelete: (backups) => setDialog({ kind: "delete", backups }),
    dialogs,
  };
}
