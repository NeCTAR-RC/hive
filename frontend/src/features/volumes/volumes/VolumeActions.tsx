// Every volume action behind one hook: `run(action, volumes)` navigates,
// runs the delete or the transfer cancel on the batch after asking, or
// opens the dialog that collects what the action needs. The hook returns
// the dialogs to render.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  DELETE,
  describeItems,
  type Verb,
} from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type {
  Volume,
  VolumeTransferCreated,
} from "../../../lib/api/types/volumes";
import { cancelTransfer, deleteVolume, volumeServiceWriteKeys } from "../api";
import { availableVolumeActions, type VolumeActionId } from "../status";
import { CreateBackupDialog } from "./dialogs/CreateBackupDialog";
import { CreateSnapshotDialog } from "./dialogs/CreateSnapshotDialog";
import { CreateTransferDialog } from "./dialogs/CreateTransferDialog";
import { EditVolumeDialog } from "./dialogs/EditVolumeDialog";
import { ExtendVolumeDialog } from "./dialogs/ExtendVolumeDialog";
import { ManageAttachmentsDialog } from "./dialogs/ManageAttachmentsDialog";
import { RetypeVolumeDialog } from "./dialogs/RetypeVolumeDialog";
import { TransferCreatedDialog } from "./dialogs/TransferCreatedDialog";
import { UpdateMetadataDialog } from "./dialogs/UpdateMetadataDialog";
import { UploadToImageDialog } from "./dialogs/UploadToImageDialog";

/** The actions that run on a batch after asking. */
type BulkActionId = "delete" | "cancel-transfer";

/** The actions that open a dialog collecting what they need. */
type DialogActionId = Exclude<VolumeActionId, BulkActionId | "launch">;

type Dialog = { kind: DialogActionId; volume: Volume } | null;

/** Horizon's DeleteTransfer, worded as its "Cancel Transfer" label. */
const CANCEL_TRANSFER: Verb = {
  label: "Cancel transfer",
  done: "Cancelled the transfer of",
  failed: "cancel the transfer of",
};

const NOUN = { one: "volume", many: "volumes" };

const getId = (volume: Volume) => volume.id;
const getName = (volume: Volume) => volume.name || volume.id;

/**
 * The volume actions for a list and a detail page alike. Delete and Cancel
 * transfer run on a batch, skipping the volumes Horizon would not act on
 * now; every other action works on the first volume given. A new
 * transfer's ID and key show in a dialog of their own once it is created.
 */
export function useVolumeActions() {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [transfer, setTransfer] = useState<VolumeTransferCreated | null>(null);
  const bulk = useBulkAction<Volume, BulkActionId>({
    noun: NOUN,
    name: getName,
    getId,
    invalidates: volumeServiceWriteKeys,
    actions: {
      "cancel-transfer": {
        verb: CANCEL_TRANSFER,
        title: (volumes) =>
          `Cancel the transfer of ${describeItems(volumes, NOUN, getName)}?`,
        body: (
          <p>
            The transfer ID and authorisation key stop working, and the volume
            can be used in this project again.
          </p>
        ),
        eligible: (volume) =>
          allows(availableVolumeActions(volume), "cancel-transfer"),
        request: (volume) => cancelTransfer(volume.id),
      },
      delete: {
        verb: DELETE,
        body: (volumes) => (
          <p>
            Deleted volumes are not recoverable. All data stored in{" "}
            {volumes.length === 1 ? "the volume" : "these volumes"} will be
            removed.
          </p>
        ),
        eligible: (volume) => allows(availableVolumeActions(volume), "delete"),
        request: (volume) => deleteVolume(volume.id),
      },
    },
  });

  const run = (action: VolumeActionId, volumes: Volume[]) => {
    const [first] = volumes;
    if (!first) return;
    if (action === "delete" || action === "cancel-transfer") {
      bulk.run(action, volumes);
    } else if (action === "launch") {
      void navigate({
        to: "/compute/instances/launch",
        search: { source: `volume:${first.id}` },
      });
    } else {
      setDialog({ kind: action, volume: first });
    }
  };

  const close = () => setDialog(null);

  let formDialog: ReactNode = null;
  if (dialog) {
    const props = { volume: dialog.volume, onClose: close };
    switch (dialog.kind) {
      case "edit":
        formDialog = <EditVolumeDialog {...props} />;
        break;
      case "extend":
        formDialog = <ExtendVolumeDialog {...props} />;
        break;
      case "attachments":
        formDialog = <ManageAttachmentsDialog {...props} />;
        break;
      case "snapshot":
        formDialog = <CreateSnapshotDialog {...props} />;
        break;
      case "backup":
        formDialog = <CreateBackupDialog {...props} />;
        break;
      case "retype":
        formDialog = <RetypeVolumeDialog {...props} />;
        break;
      case "upload-to-image":
        formDialog = <UploadToImageDialog {...props} />;
        break;
      case "transfer":
        formDialog = (
          <CreateTransferDialog {...props} onCreated={setTransfer} />
        );
        break;
      case "metadata":
        formDialog = (
          <UpdateMetadataDialog
            target={{ kind: "volume", id: dialog.volume.id }}
            name={getName(dialog.volume)}
            metadata={dialog.volume.metadata}
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
        {transfer && (
          <TransferCreatedDialog
            transfer={transfer}
            onClose={() => setTransfer(null)}
          />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
