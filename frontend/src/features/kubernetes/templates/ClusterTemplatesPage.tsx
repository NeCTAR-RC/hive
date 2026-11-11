// Cluster templates (magnum-ui cluster-templates panel), read-only on
// Nectar: the templates are managed by the cloud operators. A template's
// one action creates a cluster from it.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { AppLink } from "../../../components/AppLink/AppLink";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { toRowActions } from "../../../lib/actions";
import type { ClusterTemplate } from "../../../lib/api/types/kubernetes";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { templatesQuery } from "../api";
import { availableTemplateActions, createFromTemplateSearch } from "../status";

const templatesRoute = getRouteApi("/app/kubernetes/cluster-templates");

export function ClusterTemplatesPage() {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const templates = useQuery(templatesQuery(projectId));
  const search = useListSearch(templatesRoute);
  const table = useQueryTable(templates, {
    noun: "cluster templates",
    emptyTitle: "No cluster templates",
    search,
    placeholder: "Search templates",
  });
  const columns = useMemo<ColumnDef<ClusterTemplate>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/kubernetes/cluster-templates/$templateId"
            params={{ templateId: row.id }}
          >
            {row.name}
          </AppLink>
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
  return (
    <>
      <PageHeader
        title="Cluster templates"
        crumbs={[{ label: "Project" }, { label: "Container infra" }]}
        actions={
          <AppLink variant="primary" size="sm" to="/kubernetes/clusters/new">
            Create cluster
          </AppLink>
        }
      >
        <p>
          Templates are maintained by the Nectar team. Create a cluster by
          Kubernetes version, zone and network driver; the newest matching
          template is used.
        </p>
      </PageHeader>
      <DataTable
        id="cluster-templates"
        label="Cluster templates"
        columns={columns}
        getRowId={(row) => row.id}
        {...table}
        defaultSort={{ column: "name", direction: "ascending" }}
        rowActions={(row) =>
          toRowActions(
            availableTemplateActions(row),
            () =>
              void navigate({
                to: "/kubernetes/clusters/new",
                search: createFromTemplateSearch(row),
              }),
          )
        }
      />
    </>
  );
}
