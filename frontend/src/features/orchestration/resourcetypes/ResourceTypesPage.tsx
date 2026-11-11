// Resource types (heat-dashboard resource_types panel): every type the
// Heat engine offers, with a detail page showing its schema.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import type { ResourceTypeSummary } from "../../../lib/api/types/orchestration";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { resourceTypesQuery } from "../api";

const resourceTypesRoute = getRouteApi("/app/orchestration/resource-types");

export function ResourceTypesPage() {
  const projectId = useProjectId();
  const types = useQuery(resourceTypesQuery(projectId));
  const search = useListSearch(resourceTypesRoute);
  const table = useQueryTable(types, {
    noun: "resource types",
    emptyTitle: "No resource types",
    search,
    placeholder: "Search resource types",
  });
  const columns = useMemo<ColumnDef<ResourceTypeSummary>[]>(
    () => [
      {
        id: "name",
        label: "Type",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/orchestration/resource-types/$name"
            params={{ name: row.name ?? "" }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? "",
        textValue: (row) => `${row.name ?? ""} ${row.description ?? ""}`,
      },
      {
        id: "description",
        label: "Description",
        cell: (row) => (row.description ?? "").split("\n")[0] ?? "",
        hideBelow: "md",
      },
    ],
    [],
  );
  return (
    <>
      <PageHeader
        title="Resource types"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
      />
      <DataTable
        id="resource-types"
        label="Resource types"
        columns={columns}
        getRowId={(row) => row.name ?? ""}
        {...table}
        defaultSort={{ column: "name", direction: "ascending" }}
      />
    </>
  );
}
