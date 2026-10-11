// One cluster: overview, node groups and labels (magnum-ui cluster
// details with the Nectar node group actions).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Alert, Button, TabItem, Tabs } from "@ardc-ui/react";
import { ConfirmDialog } from "../../components/ConfirmDialog/ConfirmDialog";
import {
  DataTable,
  type ColumnDef,
} from "../../components/DataTable/DataTable";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { KeyValueList } from "../../components/KeyValueList/KeyValueList";
import { Panel } from "../../components/Panel/Panel";
import { SkeletonLines } from "../../components/Skeleton/Skeleton";
import { StatusPill } from "../../components/StatusPill/StatusPill";
import type { Cluster, NodeGroup } from "../../lib/api/types";
import { formatDateTime } from "../../lib/format";
import { notify } from "../../lib/notify";
import { useProjectId } from "../../lib/useProject";
import { PageHeader } from "../../shell/PageHeader/PageHeader";
import { clusterRoute } from "../../app/router";
import {
  clusterQuery,
  nodeGroupsQuery,
  useDeleteCluster,
  useDeleteNodeGroup,
} from "./api";
import { useClusterActions } from "./ClusterActions";
import {
  AutoscalingDialog,
  CreateNodeGroupDialog,
  LabelsDialog,
  ResizeNodeGroupDialog,
} from "./NodeGroupDialogs";
import {
  formatLabels,
  formatTaints,
  healthLabel,
  healthReason,
  healthTone,
  statusLabel,
  statusTone,
} from "./status";
import styles from "./Kubernetes.module.scss";

type NodeGroupDialog =
  | { kind: "create" }
  | { kind: "resize" | "autoscaling" | "labels"; group: NodeGroup }
  | null;

export function ClusterDetailPage() {
  const projectId = useProjectId();
  const { clusterId } = clusterRoute.useParams();
  const search = clusterRoute.useSearch();
  const navigate = useNavigate({ from: clusterRoute.fullPath });
  const cluster = useQuery(clusterQuery(projectId, clusterId));
  const remove = useDeleteCluster(projectId);
  const { run, dialogs } = useClusterActions(projectId);
  const [deleting, setDeleting] = useState(false);
  const tab = search.tab ?? "overview";
  const selectTab = (key: React.Key) =>
    void navigate({
      search: key === "overview" ? {} : { tab: String(key) },
      replace: true,
    });

  const data = cluster.data;
  return (
    <>
      <PageHeader
        title={data?.name ?? "Cluster"}
        crumbs={[
          { label: "Project" },
          { label: "Container Infra" },
          { label: "Clusters", href: "/kubernetes/clusters" },
        ]}
        actions={
          data ? (
            <div className={styles.actions}>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("config", data)}
                isDisabled={!data.api_address}
              >
                Download kubeconfig
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onPress={() => run("upgrade", data)}
                isDisabled={!data.actions.includes("upgrade")}
              >
                Upgrade
              </Button>
              <Button
                variant="secondary"
                tone="danger"
                size="sm"
                onPress={() => setDeleting(true)}
                isDisabled={!data.actions.includes("delete")}
              >
                Delete
              </Button>
            </div>
          ) : null
        }
      />
      {cluster.isError ? (
        <ErrorState error={cluster.error} onRetry={() => cluster.refetch()} />
      ) : (
        <Tabs
          selectedKey={tab}
          onSelectionChange={selectTab}
          aria-label="Cluster details"
        >
          <TabItem id="overview" title="Overview">
            {data ? <Overview cluster={data} /> : <SkeletonLines lines={10} />}
          </TabItem>
          <TabItem id="nodegroups" title="Node groups">
            {data ? (
              <NodeGroups projectId={projectId} cluster={data} />
            ) : (
              <SkeletonLines lines={6} />
            )}
          </TabItem>
          <TabItem id="labels" title="Labels">
            {data ? (
              Object.keys(data.labels).length === 0 ? (
                <p>None</p>
              ) : (
                <KeyValueList
                  items={Object.entries(data.labels).map(([key, value]) => ({
                    label: key,
                    value: <code>{value}</code>,
                  }))}
                />
              )
            ) : (
              <SkeletonLines lines={6} />
            )}
          </TabItem>
        </Tabs>
      )}
      {dialogs}
      <ConfirmDialog
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={`Delete cluster ${data?.name}?`}
        confirmLabel="Delete"
        confirmText={data?.name ?? ""}
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() =>
          remove.mutate(clusterId, {
            onSuccess: () => {
              notify.success(`Deleting cluster ${data?.name}.`);
              void navigate({ to: "/kubernetes/clusters" });
            },
          })
        }
      >
        <p>
          Every node, volume and load balancer the cluster created is removed.
        </p>
      </ConfirmDialog>
    </>
  );
}

function Overview({ cluster }: { cluster: Cluster }) {
  const reason = healthReason(cluster);
  return (
    <div className={styles.grid}>
      {cluster.status_reason && cluster.status?.endsWith("_FAILED") && (
        <Alert tone="danger" role="status">
          {cluster.status_reason}
        </Alert>
      )}
      <Panel title="Status" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Status",
              value: (
                <StatusPill tone={statusTone(cluster.status)}>
                  {statusLabel(cluster.status)}
                </StatusPill>
              ),
            },
            {
              label: "Health",
              value: (
                <StatusPill tone={healthTone(cluster.health_status)}>
                  {healthLabel(cluster.health_status)}
                </StatusPill>
              ),
            },
            ...(reason ? [{ label: "Health detail", value: reason }] : []),
            {
              label: "Created",
              value: formatDateTime(cluster.created_at) || "-",
            },
            {
              label: "Updated",
              value: formatDateTime(cluster.updated_at) || "-",
            },
            { label: "ID", value: <code>{cluster.id}</code> },
          ]}
        />
      </Panel>
      <Panel title="Nodes" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Control plane nodes",
              value: cluster.master_count ?? "-",
            },
            { label: "Worker nodes", value: cluster.node_count ?? "-" },
            {
              label: "Kubernetes API",
              value: cluster.api_address ? (
                <code>{cluster.api_address}</code>
              ) : (
                "Not ready"
              ),
            },
            {
              label: "Control plane addresses",
              value: cluster.master_addresses.length
                ? cluster.master_addresses.join(", ")
                : "-",
            },
            {
              label: "Node addresses",
              value: cluster.node_addresses.length
                ? cluster.node_addresses.join(", ")
                : "-",
            },
          ]}
        />
      </Panel>
      <Panel title="Configuration" headingLevel={3}>
        <KeyValueList
          items={[
            {
              label: "Kubernetes version",
              value: cluster.kubernetes_version ?? "-",
            },
            {
              label: "Template",
              value:
                cluster.template_name ?? cluster.cluster_template_id ?? "-",
            },
            {
              label: "Availability zone",
              value: cluster.availability_zone ?? "-",
            },
            { label: "Network driver", value: cluster.network_driver ?? "-" },
            {
              label: "Control plane flavour",
              value: cluster.master_flavor_id ?? "-",
            },
            { label: "Worker flavour", value: cluster.flavor_id ?? "-" },
            { label: "Key pair", value: cluster.keypair ?? "-" },
            {
              label: "Create timeout",
              value: cluster.create_timeout
                ? `${cluster.create_timeout} minutes`
                : "Infinite",
            },
          ]}
        />
      </Panel>
    </div>
  );
}

function NodeGroups({
  projectId,
  cluster,
}: {
  projectId: string;
  cluster: Cluster;
}) {
  const groups = useQuery(nodeGroupsQuery(projectId, cluster.id));
  const remove = useDeleteNodeGroup(projectId);
  const [dialog, setDialog] = useState<NodeGroupDialog>(null);
  const [deleting, setDeleting] = useState<NodeGroup | null>(null);
  const canChange = groups.data?.can_change ?? false;

  const columns = useMemo<ColumnDef<NodeGroup>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <span>
            {row.name}
            {row.is_default && <span className={styles.muted}> (default)</span>}
          </span>
        ),
        sortValue: (row) => row.name,
      },
      {
        id: "role",
        label: "Role",
        cell: (row) => row.role ?? "",
        sortValue: (row) => row.role ?? "",
      },
      {
        id: "flavor",
        label: "Flavour",
        cell: (row) => row.flavor_id ?? "",
        sortValue: (row) => row.flavor_id ?? "",
        hideBelow: "md",
      },
      {
        id: "nodes",
        label: "Nodes",
        cell: (row) =>
          row.auto_scaling
            ? `${row.node_count ?? 0} (${row.min_node_count ?? 0} to ${row.max_node_count ?? "?"})`
            : (row.node_count ?? ""),
        sortValue: (row) => row.node_count ?? 0,
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
        id: "labels",
        label: "Node labels and taints",
        cell: (row) => {
          const labels = formatLabels(row.node_labels);
          const taints = formatTaints(row.node_taints);
          return labels || taints ? (
            <span className={styles.mono}>
              {labels}
              {labels && taints ? " | " : ""}
              {taints}
            </span>
          ) : (
            ""
          );
        },
        hideBelow: "lg",
      },
    ],
    [],
  );

  return (
    <div className={styles.stack}>
      {!canChange && groups.data && (
        <Alert tone="info" role="status">
          Node groups can be changed once the cluster is in a completed state
          (it is {statusLabel(groups.data.cluster_status).toLowerCase()}).
        </Alert>
      )}
      <DataTable
        id="nodegroups"
        label="Node groups"
        columns={columns}
        rows={groups.data?.items}
        getRowId={(row) => row.id}
        isLoading={groups.isPending}
        isFetching={groups.isFetching}
        error={groups.error}
        onRetry={() => void groups.refetch()}
        onRefresh={() => void groups.refetch()}
        emptyTitle="No node groups"
        toolbarActions={
          <Button
            size="xs"
            onPress={() => setDialog({ kind: "create" })}
            isDisabled={!canChange}
          >
            Create node group
          </Button>
        }
        rowActions={(row) => [
          {
            id: "resize",
            label: "Resize",
            isDisabled: !canChange,
            disabledReason:
              "Wait for the cluster to finish its current operation.",
            onAction: () => setDialog({ kind: "resize", group: row }),
          },
          {
            id: "autoscaling",
            label: "Edit autoscaling",
            isDisabled: !canChange || !row.auto_scaling,
            disabledReason: row.auto_scaling
              ? "Wait for the cluster to finish its current operation."
              : "Autoscaling is not enabled on this node group.",
            onAction: () => setDialog({ kind: "autoscaling", group: row }),
          },
          {
            id: "labels",
            label: "Edit labels and taints",
            isDisabled: !canChange || row.role === "master",
            disabledReason:
              row.role === "master"
                ? "Control plane node groups cannot carry labels or taints."
                : "Wait for the cluster to finish its current operation.",
            onAction: () => setDialog({ kind: "labels", group: row }),
          },
          {
            id: "delete",
            label: "Delete node group",
            tone: "danger",
            isDisabled: !canChange || row.is_default,
            disabledReason: row.is_default
              ? "The default node group cannot be deleted."
              : "Wait for the cluster to finish its current operation.",
            onAction: () => setDeleting(row),
          },
        ]}
      />
      {dialog?.kind === "create" && (
        <CreateNodeGroupDialog
          projectId={projectId}
          clusterId={cluster.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resize" && (
        <ResizeNodeGroupDialog
          projectId={projectId}
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "autoscaling" && (
        <AutoscalingDialog
          projectId={projectId}
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "labels" && (
        <LabelsDialog
          projectId={projectId}
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete node group ${deleting?.name}?`}
        confirmLabel="Delete"
        isPending={remove.isPending}
        error={remove.error}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(
            { clusterId: cluster.id, nodeGroupId: deleting.id },
            {
              onSuccess: () => {
                notify.success(`Node group ${deleting.name} is being deleted.`);
                setDeleting(null);
              },
            },
          );
        }}
      >
        <p>
          Its nodes are removed from the cluster. Workloads on them are
          rescheduled.
        </p>
      </ConfirmDialog>
    </div>
  );
}
