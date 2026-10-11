// Every volume action behind one hook: `run(volume, action)` either
// navigates, opens a confirmation, or opens the dialog that collects what
// the action needs. The hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "../../../components/ConfirmDialog/ConfirmDialog";
import type { Volume } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useDeleteVolumes } from "../api";
import type { VolumeActionId } from "../status";
import {
  CreateBackupDialog,
  CreateSnapshotDialog,
  EditVolumeDialog,
  ExtendVolumeDialog,
  ManageAttachmentsDialog,
  UploadToImageDialog,
} from "./VolumeDialogs";

type Dialog =
  | { kind: "delete"; volumes: Volume[] }
  | { kind: Exclude<VolumeActionId, "delete" | "launch">; volume: Volume }
  | null;

export function useVolumeActions(projectId: string): {
  run: (volume: Volume, action: VolumeActionId) => void;
  runDelete: (volumes: Volume[]) => void;
  dialogs: ReactNode;
} {
  const navigate = useNavigate();
  const remove = useDeleteVolumes(projectId);
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);

  const run = (volume: Volume, action: VolumeActionId) => {
    if (action === "launch") {
      void navigate({
        to: "/compute/instances/launch",
        search: { source: `volume:${volume.id}` },
      });
      return;
    }
    if (action === "delete") {
      setDialog({ kind: "delete", volumes: [volume] });
      return;
    }
    setDialog({ kind: action, volume });
  };

  const confirmDelete = (volumes: Volume[]) => {
    remove.mutate(
      volumes.map((v) => v.id),
      {
        onSuccess: () => {
          notify.success(
            volumes.length === 1
              ? `Deleting volume ${volumes[0]?.name || volumes[0]?.id}.`
              : `Deleting ${volumes.length} volumes.`,
          );
          close();
        },
      },
    );
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "delete") {
    const { volumes } = dialog;
    dialogs = (
      <ConfirmDialog
        isOpen
        onOpenChange={(open) => !open && close()}
        title={
          volumes.length === 1
            ? `Delete volume ${volumes[0]?.name || volumes[0]?.id}?`
            : `Delete ${volumes.length} volumes?`
        }
        confirmLabel="Delete"
        tone="danger"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => confirmDelete(volumes)}
      >
        <p>
          Deleted volumes are not recoverable. All data stored in{" "}
          {volumes.length === 1 ? "the volume" : "these volumes"} will be
          removed.
        </p>
      </ConfirmDialog>
    );
  } else if (dialog) {
    const { volume } = dialog;
    const props = { projectId, volume, onClose: close };
    switch (dialog.kind) {
      case "edit":
        dialogs = <EditVolumeDialog {...props} />;
        break;
      case "extend":
        dialogs = <ExtendVolumeDialog {...props} />;
        break;
      case "attachments":
        dialogs = <ManageAttachmentsDialog {...props} />;
        break;
      case "snapshot":
        dialogs = <CreateSnapshotDialog {...props} />;
        break;
      case "backup":
        dialogs = <CreateBackupDialog {...props} />;
        break;
      case "upload-to-image":
        dialogs = <UploadToImageDialog {...props} />;
        break;
    }
  }

  return {
    run,
    runDelete: (volumes) => setDialog({ kind: "delete", volumes }),
    dialogs,
  };
}
