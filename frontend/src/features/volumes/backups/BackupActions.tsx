// Every volume backup action behind one hook, as useVolumeActions:
// `run(action, backups)` runs the delete on the batch after asking, or
// opens the restore dialog.
import { useState, type ReactNode } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { VolumeBackup } from "../../../lib/api/types/volumes";
import { backupWriteKeys, deleteBackup } from "../api";
import { availableBackupActions, type BackupActionId } from "../status";
import { RestoreBackupDialog } from "./dialogs/RestoreBackupDialog";

const getId = (backup: VolumeBackup) => backup.id;
const getName = (backup: VolumeBackup) => backup.name || backup.id;

/**
 * The backup actions for a list and a detail page alike. Delete runs on a
 * batch, skipping the backups Horizon would not delete now; restore works
 * on the first backup given.
 */
export function useBackupActions() {
  const [restoring, setRestoring] = useState<VolumeBackup | null>(null);
  const bulk = useBulkAction<VolumeBackup, "delete">({
    noun: { one: "backup", many: "backups" },
    name: getName,
    getId,
    invalidates: backupWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        body: <p>Deleted volume backups are not recoverable.</p>,
        eligible: (backup) => allows(availableBackupActions(backup), "delete"),
        request: (backup) => deleteBackup(backup.id),
      },
    },
  });

  const run = (action: BackupActionId, backups: VolumeBackup[]) => {
    const [first] = backups;
    if (!first) return;
    if (action === "delete") bulk.run("delete", backups);
    else setRestoring(first);
  };

  let formDialog: ReactNode = null;
  if (restoring) {
    formDialog = (
      <RestoreBackupDialog
        backup={restoring}
        onClose={() => setRestoring(null)}
      />
    );
  }

  return {
    run,
    dialogs: (
      <>
        {formDialog}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
