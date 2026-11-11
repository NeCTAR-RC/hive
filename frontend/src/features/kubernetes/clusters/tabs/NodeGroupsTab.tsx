// The node groups tab of a cluster: the groups with their sizes, labels and
// taints, and the Nectar node group actions.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@ardc-ui/react";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type { Cluster, NodeGroup } from "../../../../lib/api/types/kubernetes";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import {
  deleteNodeGroup,
  kubernetesWriteKeys,
  nodeGroupsQuery,
} from "../../api";
import {
  availableNodeGroupActions,
  formatLabels,
  formatTaints,
  statusLabel,
  statusTone,
} from "../../status";
import { AutoscalingDialog } from "../dialogs/AutoscalingDialog";
import { CreateNodeGroupDialog } from "../dialogs/CreateNodeGroupDialog";
import { LabelsDialog } from "../dialogs/LabelsDialog";
import { ResizeNodeGroupDialog } from "../dialogs/ResizeNodeGroupDialog";
import styles from "../../Kubernetes.module.scss";

type NodeGroupDialog =
  | { kind: "create" }
  | { kind: "resize" | "autoscaling" | "labels"; group: NodeGroup }
  | null;

/**
 * A cluster's node groups with create, resize, autoscaling, labels and
 * delete. Changes are offered only while the cluster is in a completed
 * state, and the tab says why when they are not.
 */
export function NodeGroupsTab({ cluster }: { cluster: Cluster }) {
  const projectId = useProjectId();
  const groups = useQuery(nodeGroupsQuery(projectId, cluster.id));
  const groupsTable = useQueryTable(groups, {
    noun: "node groups",
    emptyTitle: "No node groups",
  });
  const remove = useBulkAction<NodeGroup, "delete">({
    noun: { one: "node group", many: "node groups" },
    name: (group) => group.name,
    getId: (group) => group.id,
    invalidates: kubernetesWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (group) => deleteNodeGroup(cluster.id, group.id),
        body: (
          <p>
            Its nodes are removed from the cluster. Workloads on them are
            rescheduled.
          </p>
        ),
      },
    },
  });
  const [dialog, setDialog] = useState<NodeGroupDialog>(null);
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
            {row.is_default && <span className={styles.note}> (default)</span>}
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
            <span className={styles.labels}>
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
        getRowId={(row) => row.id}
        {...groupsTable}
        {...remove.tableProps}
        toolbarActions={
          <Button
            size="xs"
            onPress={() => setDialog({ kind: "create" })}
            isDisabled={!canChange}
          >
            Create node group
          </Button>
        }
        rowActions={(row) =>
          toRowActions(availableNodeGroupActions(row, canChange), (id) =>
            id === "delete"
              ? remove.run(id, [row])
              : setDialog({ kind: id, group: row }),
          )
        }
      />
      {dialog?.kind === "create" && (
        <CreateNodeGroupDialog
          clusterId={cluster.id}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "resize" && (
        <ResizeNodeGroupDialog
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "autoscaling" && (
        <AutoscalingDialog
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "labels" && (
        <LabelsDialog
          clusterId={cluster.id}
          group={dialog.group}
          onClose={() => setDialog(null)}
        />
      )}
      {remove.dialog}
    </div>
  );
}
