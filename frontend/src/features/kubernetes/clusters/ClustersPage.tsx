// Clusters (magnum-ui clusters panel with the Nectar changes): the
// project's Kubernetes clusters, quota, security risks and actions.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { AppLink } from "../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../components/DataTable/useQueryTable";
import { Panel } from "../../../components/Panel/Panel";
import { QuotaMeter } from "../../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../../components/Skeleton/Skeleton";
import { StatusPill } from "../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../lib/actions";
import type { Cluster } from "../../../lib/api/types/kubernetes";
import { risksQuery } from "../../../lib/queries";
import { useListSearch } from "../../../lib/hooks/useListSearch";
import { useProjectId } from "../../../lib/hooks/useProjectId";
import { PageHeader } from "../../../shell/PageHeader/PageHeader";
import { clustersQuery } from "../api";
import { useClusterActions } from "./ClusterActions";
import {
  availableClusterActions,
  healthLabel,
  healthTone,
  statusLabel,
  statusTone,
} from "../status";
import styles from "../Kubernetes.module.scss";

const clustersRoute = getRouteApi("/app/kubernetes/clusters");

export function ClustersPage() {
  const projectId = useProjectId();
  const clusters = useQuery(clustersQuery(projectId));
  const search = useListSearch(clustersRoute);
  const table = useQueryTable(clusters, {
    noun: "clusters",
    search,
    placeholder: "Search clusters",
  });
  const risks = useQuery(risksQuery(projectId));
  const { run, dialogs, tableProps } = useClusterActions();

  const riskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const risk of risks.data?.items ?? []) {
      if (risk.resource_type === "cluster") {
        counts.set(risk.resource_id, (counts.get(risk.resource_id) ?? 0) + 1);
      }
    }
    return counts;
  }, [risks.data]);

  const columns = useMemo<ColumnDef<Cluster>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/kubernetes/clusters/$clusterId"
            params={{ clusterId: row.id }}
          >
            {row.name}
          </AppLink>
        ),
        sortValue: (row) => row.name,
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        sortValue: (row) => row.status ?? "",
      },
      {
        id: "health",
        label: "Health",
        cell: (row) => (
          <StatusPill tone={healthTone(row.health_status)}>
            {healthLabel(row.health_status)}
          </StatusPill>
        ),
        sortValue: (row) => row.health_status ?? "",
        hideBelow: "md",
      },
      {
        id: "risks",
        label: "Security risks",
        cell: (row) => {
          const count = riskCounts.get(row.id) ?? 0;
          return count > 0 ? (
            <AppLink
              size="sm"
              to="/security/risks"
              hash={row.id}
              aria-label={`${count} security ${count === 1 ? "risk" : "risks"}`}
            >
              <StatusPill tone="danger">{`${count} ${count === 1 ? "risk" : "risks"}`}</StatusPill>
            </AppLink>
          ) : (
            ""
          );
        },
        sortValue: (row) => riskCounts.get(row.id) ?? 0,
        hideBelow: "lg",
        defaultHidden: riskCounts.size === 0,
      },
      {
        id: "masters",
        label: "Control plane",
        cell: (row) => row.master_count ?? "",
        sortValue: (row) => row.master_count ?? 0,
        hideBelow: "md",
      },
      {
        id: "nodes",
        label: "Nodes",
        cell: (row) => row.node_count ?? "",
        sortValue: (row) => row.node_count ?? 0,
      },
      {
        id: "version",
        label: "Kubernetes",
        cell: (row) => row.kubernetes_version ?? "",
        sortValue: (row) => row.kubernetes_version ?? "",
        hideBelow: "md",
      },
      {
        id: "zone",
        label: "Availability zone",
        cell: (row) => row.availability_zone ?? "",
        sortValue: (row) => row.availability_zone ?? "",
        hideBelow: "lg",
      },
    ],
    [riskCounts],
  );

  const quota = clusters.data?.quota;
  return (
    <>
      <PageHeader
        title="Clusters"
        crumbs={[{ label: "Project" }, { label: "Container infra" }]}
        actions={
          <AppLink variant="primary" size="sm" to="/kubernetes/clusters/new">
            Create cluster
          </AppLink>
        }
      />
      <div className={styles.stack}>
        <Panel title="Quota">
          {clusters.isPending ? (
            <SkeletonLines lines={2} />
          ) : quota ? (
            <div className={styles.meters}>
              <QuotaMeter
                label="Clusters"
                value={quota.clusters ?? 0}
                max={quota.hard_limit}
              />
              {quota.nodes !== null && (
                <p className={styles.note}>
                  {quota.nodes} {quota.nodes === 1 ? "node" : "nodes"} in use.
                </p>
              )}
            </div>
          ) : null}
        </Panel>
        <DataTable
          id="clusters"
          label="Clusters"
          columns={columns}
          getRowId={(row) => row.id}
          {...table}
          {...tableProps}
          emptyBody={
            <p>Create a cluster to run Kubernetes workloads on Nectar.</p>
          }
          defaultSort={{ column: "name", direction: "ascending" }}
          rowActions={(row) =>
            toRowActions(availableClusterActions(row), (id) => run(id, [row]))
          }
          batchActions={[
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              isDisabled: (selected) =>
                !selected.some((c) =>
                  allows(availableClusterActions(c), "delete"),
                ),
              onAction: (selected) => run("delete", selected),
            },
          ]}
        />
      </div>
      {dialogs}
    </>
  );
}
