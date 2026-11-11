// Manage a user's database access (trove-dashboard databases/forms.py).
import { useQuery } from "@tanstack/react-query";
import { Switch } from "@ardc-ui/react";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import { ConfirmDialog } from "../../../../components/ConfirmDialog/ConfirmDialog";
import { ErrorState } from "../../../../components/ErrorState/ErrorState";
import { SkeletonLines } from "../../../../components/Skeleton/Skeleton";
import type { DbUser } from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  databaseWrites,
  dbUserAccessQuery,
  grantDbAccess,
  revokeDbAccess,
} from "../../api";

/** A database as the access dialog lists it: whether the user may use it. */
interface DatabaseAccess {
  name: string | null;
  granted: boolean;
}

/**
 * A user's access to each database of the instance: one switch per
 * database, granting or revoking that one database as it is flipped, as
 * trove-dashboard's access table does with its row buttons. Each change
 * goes through the bulk engine, which reports it in one toast. The dialog
 * itself sends nothing; Done closes it.
 */
export function UserAccessDialog({
  instanceId,
  user,
  onClose,
}: {
  instanceId: string;
  user: DbUser;
  onClose: () => void;
}) {
  const projectId = useProjectId();
  const name = user.name ?? "";
  const access = useQuery(
    dbUserAccessQuery(projectId, instanceId, name, user.host),
  );
  const change = useBulkAction<DatabaseAccess, "grant" | "revoke">({
    noun: { one: "access to database", many: "access to databases" },
    name: (db) => db.name ?? "",
    getId: (db) => db.name ?? "",
    invalidates: databaseWrites.users(instanceId),
    actions: {
      grant: {
        verb: { label: "Grant", done: "Granted", failed: "grant" },
        tone: "primary",
        immediate: true,
        request: (db) => grantDbAccess(instanceId, user, db.name ?? ""),
      },
      revoke: {
        verb: { label: "Revoke", done: "Revoked", failed: "revoke" },
        tone: "primary",
        immediate: true,
        request: (db) => revokeDbAccess(instanceId, user, db.name ?? ""),
      },
    },
  });
  const items = access.data?.items ?? [];
  return (
    <ConfirmDialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={`Access for ${name}`}
      confirmLabel="Done"
      tone="primary"
      onConfirm={onClose}
    >
      {access.isPending ? (
        <SkeletonLines lines={3} />
      ) : access.isError ? (
        <ErrorState
          error={access.error}
          title="Could not load access"
          onRetry={() => void access.refetch()}
        />
      ) : items.length === 0 ? (
        <p>The instance has no databases yet.</p>
      ) : (
        items.map((db) => (
          <Switch
            key={db.name ?? ""}
            isSelected={db.granted}
            isDisabled={change.isPending}
            onChange={(granted) =>
              change.run(granted ? "grant" : "revoke", [db])
            }
          >
            {db.name ?? ""}
          </Switch>
        ))
      )}
    </ConfirmDialog>
  );
}
