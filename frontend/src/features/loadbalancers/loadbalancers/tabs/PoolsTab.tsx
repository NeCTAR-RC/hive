// The load balancer detail page's pools tab.
import { useMemo } from "react";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { DELETE } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type {
  LoadBalancerTree,
  Pool,
} from "../../../../lib/api/types/loadbalancers";
import { humanise } from "../../../../lib/status";
import { deletePool, loadBalancerWriteKeys } from "../../api";
import {
  availablePoolActions,
  octaviaLock,
  provisioningLabel,
  provisioningTone,
} from "../../status";

/** A pool's name, or its id while it has none. */
const nameOf = (item: { name: string | null; id: string }) =>
  item.name || item.id;
const idOf = (item: { id: string }) => item.id;

/**
 * The load balancer's pools, each linked to its page with its member count
 * and health monitor type, and deleted here with their members and monitor;
 * `onCreate` and `onEdit` open the create and edit pool dialogs. Every
 * change waits while the load balancer is PENDING_*.
 */
export function PoolsTab({
  tree,
  onCreate,
  onEdit,
}: {
  tree: LoadBalancerTree;
  onCreate: () => void;
  onEdit: (pool: Pool) => void;
}) {
  const remove = useBulkAction<Pool, "delete">({
    noun: { one: "pool", many: "pools" },
    name: nameOf,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (pool) => deletePool(pool.id),
        body: <p>Its members and health monitor are deleted with it.</p>,
      },
    },
  });
  const lbId = tree.load_balancer.id;
  const lbStatus = tree.load_balancer.provisioning_status;
  const columns = useMemo<ColumnDef<Pool>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/load-balancers/$lbId/pools/$poolId"
            params={{ lbId, poolId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol ?? "",
        sortValue: (row) => row.protocol ?? "",
      },
      {
        id: "algorithm",
        label: "Algorithm",
        cell: (row) => humanise(row.lb_algorithm ?? ""),
        hideBelow: "md",
      },
      {
        id: "members",
        label: "Members",
        cell: (row) => row.members.length,
        sortValue: (row) => row.members.length,
      },
      {
        id: "monitor",
        label: "Health monitor",
        cell: (row) =>
          row.healthmonitor_id
            ? (tree.monitors.find((m) => m.id === row.healthmonitor_id)?.type ??
              "Yes")
            : "None",
        hideBelow: "md",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={provisioningTone(row.provisioning_status)}>
            {provisioningLabel(row.provisioning_status)}
          </StatusPill>
        ),
      },
    ],
    [lbId, tree.monitors],
  );
  return (
    <>
      <DataTable
        id="lb-pools"
        label="Pools"
        columns={columns}
        rows={tree.pools}
        getRowId={idOf}
        {...remove.tableProps}
        emptyTitle="No pools"
        emptyBody={
          <p>A pool groups the members that answer a listener's traffic.</p>
        }
        toolbarActions={
          <Button
            size="xs"
            onPress={onCreate}
            isDisabled={octaviaLock(lbStatus) !== null}
          >
            Create pool
          </Button>
        }
        rowActions={(row) =>
          toRowActions(availablePoolActions(row, lbStatus), (id) =>
            id === "edit" ? onEdit(row) : remove.run("delete", [row]),
          )
        }
      />
      {remove.dialog}
    </>
  );
}
