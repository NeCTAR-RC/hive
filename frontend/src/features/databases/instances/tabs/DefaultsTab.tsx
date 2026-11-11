// The Defaults tab of a database instance (trove-dashboard
// ConfigDefaultsTab): the datastore's default configuration values.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import type { DbConfigDefault } from "../../../../lib/api/types/databases";
import { useListSearch } from "../../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { dbConfigDefaultsQuery } from "../../api";

const dbInstanceRoute = getRouteApi("/app/databases/instances/$instanceId");

/**
 * The default value of every configuration parameter of the instance's
 * datastore, searched through the URL's `q`.
 */
export function DefaultsTab({ instanceId }: { instanceId: string }) {
  const projectId = useProjectId();
  const defaults = useQuery(dbConfigDefaultsQuery(projectId, instanceId));
  const search = useListSearch(dbInstanceRoute);
  const table = useQueryTable(defaults, {
    noun: "configuration values",
    emptyTitle: "No configuration values",
    search,
    placeholder: "Search parameters",
  });
  const columns = useMemo<ColumnDef<DbConfigDefault>[]>(
    () => [
      {
        id: "name",
        label: "Parameter",
        isRowHeader: true,
        cell: (row) => row.name,
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${String(row.value ?? "")}`,
      },
      {
        id: "value",
        label: "Value",
        cell: (row) => <code>{String(row.value ?? "")}</code>,
      },
    ],
    [],
  );
  return (
    <DataTable
      id="db-config-defaults"
      label="Configuration defaults"
      columns={columns}
      getRowId={(row) => row.name}
      {...table}
      defaultSort={{ column: "name", direction: "ascending" }}
    />
  );
}
