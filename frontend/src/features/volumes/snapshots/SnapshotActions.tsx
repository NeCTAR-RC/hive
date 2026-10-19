// Snapshot row actions behind one hook, as useVolumeActions.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { VolumeSnapshot } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDeleteSnapshots } from "../api";
import type { SnapshotActionId } from "../status";
import { CreateBackupDialog } from "../volumes/VolumeDialogs";
import { EditSnapshotDialog } from "./SnapshotDialogs";

type Dialog =
  | { kind: "delete"; snapshots: VolumeSnapshot[] }
  | { kind: "edit" | "backup"; snapshot: VolumeSnapshot }
  | null;

export function useSnapshotActions(projectId: string): {
  run: (snapshot: VolumeSnapshot, action: SnapshotActionId) => void;
  runDelete: (snapshots: VolumeSnapshot[]) => void;
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const remove = useDeleteSnapshots(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const run = (snapshot: VolumeSnapshot, action: SnapshotActionId) => {
    switch (action) {
      case "create-volume":
        void navigate({
          to: "/storage/volumes",
          search: { create: true, snapshot: snapshot.id },
        });
        return;
      case "launch":
        void navigate({
          to: "/compute/instances/launch",
          search: { source: `volume_snapshot:${snapshot.id}` },
        });
        return;
      case "delete":
        setDialog({ kind: "delete", snapshots: [snapshot] });
        return;
      default:
        setDialog({ kind: action, snapshot });
    }
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { snapshots } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          snapshots.length === 1
            ? `Delete snapshot ${snapshots[0]?.name || snapshots[0]?.id}?`
            : `Delete ${snapshots.length} snapshots?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(
            snapshots.map((s) => s.id),
            {
              onSuccess: () => {
                notify.success(
                  snapshots.length === 1
                    ? `Deleting snapshot ${snapshots[0]?.name || snapshots[0]?.id}.`
                    : `Deleting ${snapshots.length} snapshots.`,
                );
                close();
              },
            },
          )
        }
      >
        <p>Deleted volume snapshots are not recoverable.</p>
      </ConfirmDialog>
    );
  } else if (dialog?.kind === "edit") {
    dialogs = (
      <EditSnapshotDialog
        projectId={projectId}
        snapshot={dialog.snapshot}
        onClose={close}
      />
    );
  } else if (dialog?.kind === "backup" && dialog.snapshot.volume_id) {
    dialogs = (
      <CreateBackupDialog
        projectId={projectId}
        volume={{
          id: dialog.snapshot.volume_id,
          name: dialog.snapshot.volume_name ?? dialog.snapshot.volume_id,
          status: "available",
        }}
        snapshotId={dialog.snapshot.id}
        onClose={close}
      />
    );
  }

  return {
    run,
    runDelete: (snapshots) => setDialog({ kind: "delete", snapshots }),
    dialogs,
  };
}
