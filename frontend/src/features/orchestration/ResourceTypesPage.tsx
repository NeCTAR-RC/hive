// Resource types (heat-dashboard resource_types panel): every type the
// Heat engine offers, with a detail page showing its schema.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import type { ResourceTypeSummary } from "../../lib/api/types";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { resourceTypesQuery } from "./api";
import styles from "./Orchestration.module.scss";

export function ResourceTypesPage() {
  const projectId = useProjectId();
  const types = useQuery(resourceTypesQuery(projectId));
  const [query, setQuery] = useState("");
  const columns = useMemo<ColumnDef<ResourceTypeSummary>[]>(
    () => [
      {
        id: "name",
        label: "Type",
        isRowHeader: true,
        cell: (row) => (
          <RouterLink
            to="/orchestration/resource-types/$name"
            params={{ name: row.name ?? "" }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
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
  const rows = useMemo(
    () => filterRows(types.data?.items ?? [], query, columns),
    [types.data, query, columns],
  );
  return (
    <>
      <PageHeader
        title="Resource Types"
        crumbs={[{ label: "Project" }, { label: "Orchestration" }]}
      />
      <DataTable
        id="resource-types"
        label="Resource types"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.name ?? ""}
        isLoading={types.isPending}
        isFetching={types.isFetching}
        error={types.error}
        onRetry={() => void types.refetch()}
        onRefresh={() => void types.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search resource types",
        }}
        resetKey={query}
        emptyTitle="No resource types match"
        defaultSort={{ column: "name", direction: "ascending" }}
      />
    </>
  );
}
