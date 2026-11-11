// The Users tab of a database instance (trove-dashboard instance detail
// tabs): its users, created, edited, given access to databases and
// deleted here.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import type { DbUser } from "../../../../lib/api/types/databases";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { databaseWrites, dbUsersQuery, deleteDbUser } from "../../api";
import { CreateUserDialog } from "../dialogs/CreateUserDialog";
import { EditUserDialog } from "../dialogs/EditUserDialog";
import { UserAccessDialog } from "../dialogs/UserAccessDialog";

/** A user's row id: a Trove user is its name at a host. */
const userId = (user: DbUser) => `${user.name}@${user.host}`;

/**
 * The instance's users, each with its allowed host and databases; names
 * and passwords are checked against the instance's datastore.
 */
export function UsersTab({
  instanceId,
  datastore,
}: {
  instanceId: string;
  datastore: string | null;
}) {
  const projectId = useProjectId();
  const users = useQuery(dbUsersQuery(projectId, instanceId));
  const usersTable = useQueryTable(users, {
    noun: "users",
    emptyTitle: "No users",
  });
  const remove = useBulkAction<DbUser, "delete">({
    noun: { one: "user", many: "users" },
    name: (user) => user.name ?? "",
    getId: userId,
    invalidates: databaseWrites.users(instanceId),
    actions: {
      delete: {
        verb: DELETE,
        body: <p>Applications using this user lose access.</p>,
        request: (user) => deleteDbUser(instanceId, user),
      },
    },
  });
  const [creating, setCreating] = useState(false);
  const [access, setAccess] = useState<DbUser | null>(null);
  const [editing, setEditing] = useState<DbUser | null>(null);
  const columns = useMemo<ColumnDef<DbUser>[]>(
    () => [
      {
        id: "name",
        label: "User name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
      { id: "host", label: "Allowed host", cell: (row) => row.host },
      {
        id: "databases",
        label: "Databases",
        cell: (row) => row.databases.join(", "),
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="db-users"
        label="Users"
        columns={columns}
        getRowId={userId}
        {...usersTable}
        {...remove.tableProps}
        toolbarActions={
          <Button size="xs" onPress={() => setCreating(true)}>
            Create user
          </Button>
        }
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit user",
            onAction: () => setEditing(row),
          },
          {
            id: "access",
            label: "Manage access",
            onAction: () => setAccess(row),
          },
          {
            id: "delete",
            label: "Delete user",
            tone: "danger",
            onAction: () => remove.run("delete", [row]),
          },
        ]}
      />
      {creating && (
        <CreateUserDialog
          instanceId={instanceId}
          datastore={datastore}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <EditUserDialog
          instanceId={instanceId}
          datastore={datastore}
          user={editing}
          onClose={() => setEditing(null)}
        />
      )}
      {access && (
        <UserAccessDialog
          instanceId={instanceId}
          user={access}
          onClose={() => setAccess(null)}
        />
      )}
      {remove.dialog}
    </>
  );
}
