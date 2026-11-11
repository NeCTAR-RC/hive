// Every server group action behind one hook, shared by the list and the
// detail page: `run(action, groups)` asks before deleting the batch.
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import type { ServerGroup } from "../../../lib/api/types/compute";
import { deleteServerGroup, serverGroupWriteKeys } from "../api";
import type { ServerGroupActionId } from "./status";

/**
 * The server group actions. `onDeleted` runs after a delete that
 * succeeded, so the detail page can return to the list.
 */
export function useServerGroupActions(onDeleted?: () => void) {
  const bulk = useBulkAction<ServerGroup, ServerGroupActionId>({
    noun: { one: "server group", many: "server groups" },
    name: (group) => group.name,
    getId: (group) => group.id,
    invalidates: serverGroupWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (group) => deleteServerGroup(group.id),
        body: (
          <p>
            Instances in the group are not affected; only the grouping is
            removed.
          </p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: ServerGroupActionId, groups: ServerGroup[]) =>
    bulk.run(action, groups);

  return { run, dialogs: bulk.dialog, tableProps: bulk.tableProps };
}
