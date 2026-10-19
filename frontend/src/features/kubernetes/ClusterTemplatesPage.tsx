// Cluster templates (magnum-ui cluster-templates panel), read-only on
// Nectar: the templates are managed by the cloud operators.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { RouteLink } from "../../components/RouteLink/RouteLink";
import type { ClusterTemplate } from "../../lib/api/types";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { templatesQuery } from "./api";
import styles from "./Kubernetes.module.scss";

export function ClusterTemplatesPage() {
  const projectId = useProjectId();
  const templates = useQuery(templatesQuery(projectId));
  const [query, setQuery] = useState("");
  const columns = useMemo<ColumnDef<ClusterTemplate>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <RouteLink
            to="/kubernetes/cluster-templates/$templateId"
            params={{ templateId: row.id }}
          >
            {row.name}
          </RouteLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "version",
        label: "Kubernetes",
        cell: (row) => row.kubernetes_version ?? "",
        sortValue: (row) => row.kubernetes_version ?? "",
      },
      {
        id: "zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "md",
      },
      {
        id: "driver",
        label: "Network driver",
        cell: (row) => row.network_driver ?? "",
        sortValue: (row) => row.network_driver ?? "",
        hideBelow: "md",
      },
      {
        id: "coe",
        label: "COE",
        cell: (row) => row.coe ?? "",
        hideBelow: "lg",
      },
      {
        id: "public",
        label: "Public",
        cell: (row) => (row.public ? "Yes" : "No"),
        hideBelow: "lg",
      },
    ],
    [],
  );
  const rows = useMemo(
    () => filterRows(templates.data?.items ?? [], query, columns),
    [templates.data, query, columns],
  );
  return (
    <>
      <PageHeader
        title="Cluster Templates"
        crumbs={[{ label: "Project" }, { label: "Container Infra" }]}
        actions={
          <RouteLink variant="primary" size="sm" to="/kubernetes/clusters/new">
            Create cluster
          </RouteLink>
        }
      >
        <p className={styles.muted}>
          Templates are maintained by the Nectar team. Create a cluster by
          Kubernetes version, zone and network driver; the newest matching
          template is used.
        </p>
      </PageHeader>
      <DataTable
        id="cluster-templates"
        label="Cluster templates"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        isLoading={templates.isPending}
        isFetching={templates.isFetching}
        error={templates.error}
        onRetry={() => void templates.refetch()}
        onRefresh={() => void templates.refetch()}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search templates",
        }}
        resetKey={query}
        emptyTitle="No cluster templates"
        defaultSort={{ column: "name", direction: "ascending" }}
        pageSizes={[20, 50, 100]}
      />
    </>
  );
}
