// The configuration group delete, shared by the groups list and a group's
// page.
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import type { DbConfiguration } from "../../../lib/api/types/databases";
import { databaseWrites, deleteConfiguration } from "../api";

/**
 * Deletes configuration groups after asking: the list's batch and row
 * menu and the group's page share it. `onDeleted` runs once a delete has
 * removed at least one group, so the group's page can go back to the list.
 */
export function useDeleteConfigurations(onDeleted?: () => void) {
  return useBulkAction<DbConfiguration, "delete">({
    noun: { one: "configuration group", many: "configuration groups" },
    name: (configuration) => configuration.name || configuration.id,
    getId: (configuration) => configuration.id,
    invalidates: databaseWrites.configurations,
    actions: {
      delete: {
        verb: DELETE,
        body: <p>Detach the group from its instances first.</p>,
        request: (configuration) => deleteConfiguration(configuration.id),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });
}
