// Every trunk action behind one hook: `run(action, trunks)` deletes the
// batch after asking, or opens the edit form. The hook returns the dialogs
// to render and the props for the table that lists the trunks.
import { useState } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import type { Trunk } from "../../../lib/api/types/network";
import { deleteTrunk, trunkWriteKeys } from "../api";
import type { TrunkActionId } from "../status";
import { EditTrunkDialog } from "./dialogs/EditTrunkDialog";

/**
 * Every trunk action. `onDeleted` runs after a delete that removed at
 * least one trunk (a detail page leaves for the list).
 */
export function useTrunkActions(onDeleted?: () => void) {
  const [editing, setEditing] = useState<Trunk | null>(null);
  const bulk = useBulkAction<Trunk, "delete">({
    noun: { one: "trunk", many: "trunks" },
    name: (trunk) => trunk.name || trunk.id,
    getId: (trunk) => trunk.id,
    invalidates: trunkWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (trunk) => deleteTrunk(trunk.id),
        body: (
          <p>The parent and subports stay; only the trunk between them goes.</p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: TrunkActionId, trunks: Trunk[]) => {
    const [first] = trunks;
    if (action === "delete") bulk.run("delete", trunks);
    else if (first) setEditing(first);
  };

  return {
    run,
    dialogs: (
      <>
        {editing && (
          <EditTrunkDialog trunk={editing} onClose={() => setEditing(null)} />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
