// Every share group action behind one hook, for the list and the detail
// page: `run(action, groups)` opens the form dialog an action needs, or
// deletes the batch after one confirmation. The hook returns the dialogs
// to render and the props for the share groups table.
import { useState, type ReactNode } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import {
  useBulkAction,
  type BulkTableProps,
} from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { ShareGroup } from "../../../lib/api/types/shares";
import { deleteShareGroup, shareWriteKeys } from "../api";
import { CreateShareGroupSnapshotDialog } from "./dialogs/CreateShareGroupSnapshotDialog";
import { EditShareGroupDialog } from "./dialogs/EditShareGroupDialog";
import { availableShareGroupActions, type ShareGroupActionId } from "../status";

type Dialog = { kind: "snapshot" | "edit"; group: ShareGroup } | null;

const getId = (group: ShareGroup) => group.id;
const getName = (group: ShareGroup) => group.name || group.id;

/**
 * The share group actions. `onDeleted` runs after a delete in which at
 * least one group went: the detail page passes it to leave for the list.
 */
export function useShareGroupActions(onDeleted?: () => void): {
  run: (action: ShareGroupActionId, groups: ShareGroup[]) => void;
  dialogs: ReactNode;
  tableProps: BulkTableProps;
} {
  const [dialog, setDialog] = useState<Dialog>(null);
  const bulk = useBulkAction<ShareGroup, "delete">({
    noun: { one: "share group", many: "share groups" },
    name: getName,
    getId,
    invalidates: shareWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (group) => deleteShareGroup(group.id),
        body: <p>The group must be empty. Its shares are not deleted.</p>,
        eligible: (group) =>
          allows(availableShareGroupActions(group), "delete"),
        skippedWhy: "they are busy",
        onSucceeded: onDeleted,
      },
    },
  });

  const run = (action: ShareGroupActionId, groups: ShareGroup[]) => {
    const [first] = groups;
    if (!first) return;
    if (action === "delete") bulk.run("delete", groups);
    else setDialog({ kind: action, group: first });
  };

  const close = () => setDialog(null);
  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditShareGroupDialog group={dialog.group} onClose={close} />;
  } else if (dialog?.kind === "snapshot") {
    formDialog = (
      <CreateShareGroupSnapshotDialog group={dialog.group} onClose={close} />
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
