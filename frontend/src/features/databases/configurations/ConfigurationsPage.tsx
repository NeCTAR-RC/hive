// Configuration groups (trove-dashboard database_configurations panel):
// the list and the create dialog.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { DbConfiguration } from "../../../lib/api/types/databases";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { dbConfigurationsQuery } from "../api";
import { CreateConfigurationDialog } from "./dialogs/CreateConfigurationDialog";
import { useDeleteConfigurations } from "./useDeleteConfigurations";

const configurationsRoute = getRouteApi("/app/databases/configuration-groups");

/** The project's configuration groups, deleted from the list in batches. */
export function ConfigurationsPage() {
  const projectId = useProjectId();
  const configurations = useQuery(dbConfigurationsQuery(projectId));
  const search = useListSearch(configurationsRoute);
  const table = useQueryTable(configurations, {
    noun: "configuration groups",
    search,
    placeholder: "Search configuration groups",
  });
  const remove = useDeleteConfigurations();
  const [creating, setCreating] = useState(false);

  const columns = useMemo<ColumnDef<DbConfiguration>[]>(
    () => [
      {
        id: "name",
        label: "Configuration group name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/databases/configuration-groups/$configurationId"
            params={{ configurationId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
        textValue: (row) =>
          `${row.name ?? ""} ${row.id} ${row.description ?? ""} ${row.datastore ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => row.description ?? "",
        hideBelow: "lg",
      },
      {
        id: "datastore",
        label: "Datastore",
        cell: (row) => row.datastore ?? "",
        sortValue: (row) => row.datastore ?? "",
      },
      {
        id: "version",
        label: "Datastore version",
        cell: (row) => row.datastore_version ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Configuration groups"
        crumbs={[{ label: "Project" }, { label: "Database" }]}
        actions={
          <Button size="sm" onPress={() => setCreating(true)}>
            Create configuration group
          </Button>
        }
      />
      <DataTable
        id="db-configurations"
        label="Configuration groups"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        {...remove.tableProps}
        emptyBody={
          <p>
            A configuration group holds datastore settings you can attach to
            instances.
          </p>
        }
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete configuration group",
            tone: "danger",
            onAction: () => remove.run("delete", [row]),
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => remove.run("delete", selected),
          },
        ]}
      />
      {creating && (
        <CreateConfigurationDialog onClose={() => setCreating(false)} />
      )}
      {remove.dialog}
    </>
  );
}
