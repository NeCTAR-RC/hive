// Clusters (magnum-ui clusters panel with the Nectar changes): the
// project's Kubernetes clusters, quota, security risks and actions.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { Link } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { filterRows } from "../../components/DataTable/filter";
import { Panel } from "../../components/Panel/Panel";
import { QuotaMeter } from "../../components/QuotaMeter/QuotaMeter";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Cluster } from "../../lib/api/types";
import { notify } from "../../lib/notify";
import { risksQuery } from "../../lib/queries";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { clustersQuery, useDeleteCluster } from "./api";
import { useClusterActions } from "./ClusterActions";
import { healthLabel, healthTone, statusLabel, statusTone } from "./status";
import styles from "./Kubernetes.module.scss";

export function ClustersPage() {
  const projectId = useProjectId();
  const clusters = useQuery(clustersQuery(projectId));
  const risks = useQuery(risksQuery(projectId));
  const remove = useDeleteCluster(projectId);
  const { run, dialogs } = useClusterActions(projectId);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Cluster[]>([]);

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
          <RouterLink
            to="/kubernetes/clusters/$clusterId"
            params={{ clusterId: row.id }}
            className={styles.nameLink}
          >
            {row.name}
          </RouterLink>
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
            <RouterLink
              to="/security/risks"
              hash={row.id}
              className={styles.riskLink}
              aria-label={`${count} security ${count === 1 ? "risk" : "risks"}`}
            >
              <StatusPill tone="danger">{`${count} ${count === 1 ? "risk" : "risks"}`}</StatusPill>
            </RouterLink>
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
  const rows = useMemo(
    () => filterRows(clusters.data?.items ?? [], query, columns),
    [clusters.data, query, columns],
  );

  const confirmDelete = async () => {
    const results = await Promise.allSettled(
      deleting.map((c) => remove.mutateAsync(c.id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed === 0) {
      notify.success(
        deleting.length === 1
          ? `Deleting cluster ${deleting[0]?.name}.`
          : `Deleting ${deleting.length} clusters.`,
      );
    } else {
      notify.danger(
        `Could not delete ${failed} of ${deleting.length} clusters.`,
      );
    }
    setDeleting([]);
  };

  const quota = clusters.data?.quota;
  return (
    <>
      <PageHeader
        title="Clusters"
        crumbs={[{ label: "Project" }, { label: "Container Infra" }]}
        actions={
          <Link variant="primary" size="sm" href="/kubernetes/clusters/new">
            Create cluster
          </Link>
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
                valueText={`${quota.clusters ?? 0} of ${quota.hard_limit} clusters`}
              />
              {quota.nodes !== null && (
                <p className={styles.muted}>
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
          rows={rows}
          getRowId={(row) => row.id}
          isLoading={clusters.isPending}
          isFetching={clusters.isFetching}
          error={clusters.error}
          onRetry={() => void clusters.refetch()}
          onRefresh={() => void clusters.refetch()}
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Search clusters",
          }}
          resetKey={query}
          emptyTitle={
            clusters.data?.items.length
              ? "No clusters match"
              : "No clusters yet"
          }
          emptyBody={
            clusters.data?.items.length === 0 ? (
              <p>Create a cluster to run Kubernetes workloads on Nectar.</p>
            ) : null
          }
          defaultSort={{ column: "name", direction: "ascending" }}
          rowActions={(row) => [
            {
              id: "config",
              label: "Download kubeconfig",
              isDisabled: !row.api_address,
              disabledReason: "The cluster has no API address yet.",
              onAction: () => run("config", row),
            },
            {
              id: "nodegroups",
              label: "Manage node groups",
              onAction: () => run("nodegroups", row),
            },
            {
              id: "upgrade",
              label: "Upgrade cluster",
              isDisabled: !row.actions.includes("upgrade"),
              disabledReason: "The cluster must be in a completed state.",
              onAction: () => run("upgrade", row),
            },
            {
              id: "certificate",
              label: "Download CA certificate",
              onAction: () => run("certificate", row),
            },
            {
              id: "sign",
              label: "Sign a certificate",
              onAction: () => run("sign", row),
            },
            {
              id: "delete",
              label: "Delete cluster",
              tone: "danger",
              isDisabled: !row.actions.includes("delete"),
              disabledReason: "Wait for the current operation to finish.",
              onAction: () => setDeleting([row]),
            },
          ]}
          batchActions={[
            {
              id: "delete",
              label: "Delete",
              tone: "danger",
              isDisabled: (selected) =>
                selected.every((c) => !c.actions.includes("delete")),
              onAction: (selected) =>
                setDeleting(
                  selected.filter((c) => c.actions.includes("delete")),
                ),
            },
          ]}
        />
      </div>
      {dialogs}
      <ConfirmDialog
        isOpen={deleting.length > 0}
        onOpenChange={(open) => !open && setDeleting([])}
        title={
          deleting.length === 1
            ? `Delete cluster ${deleting[0]?.name}?`
            : `Delete ${deleting.length} clusters?`
        }
        confirmLabel="Delete"
        confirmText={deleting.length === 1 ? (deleting[0]?.name ?? "") : ""}
        isPending={remove.isPending}
        onConfirm={() => void confirmDelete()}
      >
        <p>
          Every node, volume and load balancer the cluster created is removed.
          This cannot be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
