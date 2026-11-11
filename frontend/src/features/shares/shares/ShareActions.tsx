// Every share action behind one hook, for the list and the detail page:
// `run(action, shares)` opens the form dialog an action needs, goes to the
// share's access rules, or deletes the batch after one confirmation. The
// hook returns the dialogs to render and the props for the shares table.
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { DELETE } from "../../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkTableProps,
} from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Share } from "../../../lib/api/types/shares";
import { deleteShare, shareWriteKeys } from "../api";
import { CreateSnapshotDialog } from "./dialogs/CreateSnapshotDialog";
import { EditShareDialog } from "./dialogs/EditShareDialog";
import { MetadataDialog } from "./dialogs/MetadataDialog";
import { ResizeShareDialog } from "./dialogs/ResizeShareDialog";
import { RevertShareDialog } from "./dialogs/RevertShareDialog";
import { availableShareActions, type ShareActionId } from "../status";

/** The actions that open a form dialog for one share. */
type DialogActionId = Exclude<ShareActionId, "rules" | "delete">;

type Dialog = { kind: DialogActionId; share: Share } | null;

const getId = (share: Share) => share.id;
const getName = (share: Share) => share.name || share.id;

/**
 * The share actions. `onDeleted` runs after a delete in which at least one
 * share went: the detail page passes it to leave for the list.
 */
export function useShareActions(onDeleted?: () => void): {
  run: (action: ShareActionId, shares: Share[]) => void;
  dialogs: ReactNode;
  tableProps: BulkTableProps;
} {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<Share, "delete">({
    noun: { one: "share", many: "shares" },
    name: getName,
    getId,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (share) => deleteShare(share.id),
        body: <p>The data on the share is lost. This cannot be undone.</p>,
        eligible: (share) => allows(availableShareActions(share), "delete"),
        skippedWhy: "they are busy or still have snapshots",
        onSucceeded: onDeleted,
      },
    },
  });

  const run = (action: ShareActionId, shares: Share[]) => {
    const [first] = shares;
    if (!first) return;
    if (action === "delete") {
      bulk.run("delete", shares);
    } else if (action === "rules") {
      void navigate({
        to: "/shares/shares/$shareId",
        params: { shareId: first.id },
        search: { tab: "rules" },
      });
    } else {
      setDialog({ kind: action, share: first });
    }
  };

  const close = () => setDialog(null);
  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditShareDialog share={dialog.share} onClose={close} />;
  } else if (dialog?.kind === "resize") {
    formDialog = <ResizeShareDialog share={dialog.share} onClose={close} />;
  } else if (dialog?.kind === "revert") {
    formDialog = <RevertShareDialog share={dialog.share} onClose={close} />;
  } else if (dialog?.kind === "snapshot") {
    formDialog = <CreateSnapshotDialog share={dialog.share} onClose={close} />;
  } else if (dialog?.kind === "metadata") {
    formDialog = <MetadataDialog share={dialog.share} onClose={close} />;
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
