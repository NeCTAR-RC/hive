// The Databases tab of a database instance (trove-dashboard instance detail
// tabs): its databases, created and deleted here.
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
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { databaseWrites, dbDatabasesQuery, deleteDatabase } from "../../api";
import { CreateDatabaseDialog } from "../dialogs/CreateDatabaseDialog";

/** A database of the instance, as the Databases tab lists it. */
interface NamedDatabase {
  name: string | null;
}

const databaseName = (database: NamedDatabase) => database.name ?? "";

/** The instance's databases by name. */
export function DatabasesTab({
  instanceId,
  datastore,
}: {
  instanceId: string;
  datastore: string | null;
}) {
  const projectId = useProjectId();
  const databases = useQuery(dbDatabasesQuery(projectId, instanceId));
  const databasesTable = useQueryTable(databases, {
    noun: "databases",
    emptyTitle: "No databases",
  });
  const remove = useBulkAction<NamedDatabase, "delete">({
    noun: { one: "database", many: "databases" },
    name: databaseName,
    getId: databaseName,
    invalidates: databaseWrites.databases(instanceId),
    actions: {
      delete: {
        verb: DELETE,
        body: <p>All data in the database is lost. This cannot be undone.</p>,
        request: (database) =>
          deleteDatabase(instanceId, databaseName(database)),
      },
    },
  });
  const [creating, setCreating] = useState(false);
  const columns = useMemo<ColumnDef<NamedDatabase>[]>(
    () => [
      {
        id: "name",
        label: "Database name",
        isRowHeader: true,
        cell: (row) => row.name ?? "",
        sortValue: (row) => row.name ?? "",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="db-databases"
        label="Databases"
        columns={columns}
        getRowId={databaseName}
        {...databasesTable}
        {...remove.tableProps}
        toolbarActions={
          <Button size="xs" onPress={() => setCreating(true)}>
            Create database
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete database",
            tone: "danger",
            onAction: () => remove.run("delete", [row]),
          },
        ]}
      />
      {creating && (
        <CreateDatabaseDialog
          instanceId={instanceId}
          datastore={datastore}
          onClose={() => setCreating(false)}
        />
      )}
      {remove.dialog}
    </>
  );
}
