// Every volume snapshot action behind one hook, as useVolumeActions:
// `run(action, snapshots)` navigates, runs the delete on the batch after
// asking, or opens the dialog that collects what the action needs. Create
// volume opens the create dialog over the current page, as Horizon's modal
// does, so closing it leaves the user where they were.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { VolumeSnapshot } from "../../../lib/api/types/volumes";
import { deleteSnapshot, volumeServiceWriteKeys } from "../api";
import { availableSnapshotActions, type SnapshotActionId } from "../status";
import { CreateBackupDialog } from "../volumes/dialogs/CreateBackupDialog";
import { CreateVolumeDialog } from "../volumes/dialogs/CreateVolumeDialog";
import { UpdateMetadataDialog } from "../volumes/dialogs/UpdateMetadataDialog";
import { EditSnapshotDialog } from "./dialogs/EditSnapshotDialog";

/** The actions that open a dialog collecting what they need. */
type DialogActionId = Exclude<SnapshotActionId, "delete" | "launch">;

type Dialog = { kind: DialogActionId; snapshot: VolumeSnapshot } | null;

const getId = (snapshot: VolumeSnapshot) => snapshot.id;
const getName = (snapshot: VolumeSnapshot) => snapshot.name || snapshot.id;

/**
 * The snapshot actions for a list, a detail page and a volume's snapshot
 * table. Delete runs on a batch, skipping the snapshots Horizon would not
 * delete now; every other action works on the first snapshot given.
 */
export function useSnapshotActions() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<VolumeSnapshot, "delete">({
    noun: { one: "snapshot", many: "snapshots" },
    name: getName,
    getId,
    invalidates: volumeServiceWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        body: <p>Deleted volume snapshots are not recoverable.</p>,
        eligible: (snapshot) =>
          allows(availableSnapshotActions(snapshot), "delete"),
        request: (snapshot) => deleteSnapshot(snapshot.id),
      },
    },
  });

  const run = (action: SnapshotActionId, snapshots: VolumeSnapshot[]) => {
    const [first] = snapshots;
    if (!first) return;
    switch (action) {
      case "delete":
        bulk.run("delete", snapshots);
        return;
      case "launch":
        void navigate({
          to: "/compute/instances/launch",
          search: { source: `volume_snapshot:${first.id}` },
        });
        return;
      default:
        setDialog({ kind: action, snapshot: first });
    }
  };

  const close = () => setDialog(null);

  let formDialog: ReactNode = null;
  if (dialog) {
    switch (dialog.kind) {
      case "create-volume":
        formDialog = (
          <CreateVolumeDialog
            initialSource={{ type: "snapshot", id: dialog.snapshot.id }}
            onClose={close}
          />
        );
        break;
      case "edit":
        formDialog = (
          <EditSnapshotDialog snapshot={dialog.snapshot} onClose={close} />
        );
        break;
      case "metadata":
        formDialog = (
          <UpdateMetadataDialog
            target={{ kind: "snapshot", id: dialog.snapshot.id }}
            name={getName(dialog.snapshot)}
            metadata={dialog.snapshot.metadata}
            onClose={close}
          />
        );
        break;
      case "backup":
        formDialog = (
          <CreateBackupDialog
            volume={{
              id: dialog.snapshot.volume_id ?? "",
              name:
                dialog.snapshot.volume_name ?? dialog.snapshot.volume_id ?? "",
              status: "available",
            }}
            snapshotId={dialog.snapshot.id}
            onClose={close}
          />
        );
        break;
    }
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
