// The application credential actions behind one hook, shared by the list
// and the credential's page: `run("delete", credentials)` deletes the batch
// after asking. The hook returns the dialogs to render.
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import type { RowAction } from "../../../components/DataTable/RowActionsMenu";
import type { ApplicationCredential } from "../../../lib/api/types/identity";
import { appCredentialWriteKeys, deleteAppCredential } from "../api";

/**
 * The application credential actions. `onDeleted` runs once a delete has
 * removed at least one credential, so the credential's page can go back to
 * the list.
 */
export function useApplicationCredentialActions(onDeleted?: () => void) {
  const bulk = useBulkAction<ApplicationCredential, "delete">({
    noun: { one: "application credential", many: "application credentials" },
    name: (credential) => credential.name,
    getId: (credential) => credential.id,
    invalidates: appCredentialWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (credential) => deleteAppCredential(credential.id),
        body: (
          <p>Anything still using the credential loses access immediately.</p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  /** One credential's menu: the list row's, and the page header's. */
  const rowActions = (credential: ApplicationCredential): RowAction[] => [
    {
      id: "delete",
      label: "Delete",
      tone: "danger",
      onAction: () => bulk.run("delete", [credential]),
    },
  ];

  return {
    run: bulk.run,
    rowActions,
    dialogs: bulk.dialog,
    tableProps: bulk.tableProps,
  };
}
