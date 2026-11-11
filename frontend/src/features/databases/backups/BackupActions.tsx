// Every database backup action behind one hook, shared by the backups list,
// the backup page and an instance's Backups tab: `run(action, backups)`
// deletes the batch after asking, or starts a launch restoring the first
// backup. The hook returns the dialogs to render.
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import type { DbBackup } from "../../../lib/api/types/databases";
import { databaseWrites, deleteDbBackup } from "../api";
import type { DbBackupActionId } from "../status";

const getId = (backup: DbBackup) => backup.id;
const getName = (backup: DbBackup) => backup.name || backup.id;

/**
 * The backup actions. `onDeleted` runs once a delete has removed at least
 * one backup, so the backup page can go back to the list.
 */
export function useBackupActions(onDeleted?: () => void) {
  const navigate = useNavigate();
  const bulk = useBulkAction<DbBackup, "delete">({
    noun: { one: "backup", many: "backups" },
    name: getName,
    getId,
    invalidates: databaseWrites.backups,
    actions: {
      delete: {
        verb: DELETE,
        body: <p>Incremental backups that depend on it become unusable.</p>,
        request: (backup) => deleteDbBackup(backup.id),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: DbBackupActionId, backups: DbBackup[]) => {
    const [backup] = backups;
    if (action === "delete") {
      bulk.run(action, backups);
    } else if (backup) {
      void navigate({
        to: "/databases/instances/new",
        search: { backup: backup.id },
      });
    }
  };

  return { run, dialogs: bulk.dialog, tableProps: bulk.tableProps };
}
