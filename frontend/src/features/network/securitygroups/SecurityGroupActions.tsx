// Every security group action behind one hook, shared by the list and the
// detail page: `run(action, groups)` deletes the batch after asking, or
// opens the edit form. The hook returns the dialogs to render and the
// props for the table that lists the groups.
import { useState } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { SecurityGroup } from "../../../lib/api/types/network";
import { deleteSecurityGroup, securityGroupWriteKeys } from "../api";
import {
  availableSecurityGroupActions,
  type SecurityGroupActionId,
} from "../status";
import { EditSecurityGroupDialog } from "./dialogs/EditSecurityGroupDialog";

/**
 * Every security group action. `onDeleted` runs after a delete that
 * removed at least one group (the detail page leaves for the list).
 */
export function useSecurityGroupActions(onDeleted?: () => void) {
  const [editing, setEditing] = useState<SecurityGroup | null>(null);
  const bulk = useBulkAction<SecurityGroup, "delete">({
    noun: { one: "security group", many: "security groups" },
    name: (group) => group.name,
    getId: (group) => group.id,
    invalidates: securityGroupWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (group) => deleteSecurityGroup(group.id),
        eligible: (group) =>
          allows(availableSecurityGroupActions(group), "delete"),
        skippedWhy: "the default group cannot be deleted",
        body: <p>A group still applied to an instance cannot be deleted.</p>,
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: SecurityGroupActionId, groups: SecurityGroup[]) => {
    const [first] = groups;
    if (action === "delete") bulk.run("delete", groups);
    else if (first) setEditing(first);
  };

  return {
    run,
    dialogs: (
      <>
        {editing && (
          <EditSecurityGroupDialog
            group={editing}
            onClose={() => setEditing(null)}
          />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
