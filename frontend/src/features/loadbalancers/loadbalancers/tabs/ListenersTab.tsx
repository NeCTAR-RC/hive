// The load balancer detail page's listeners tab.
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
  Listener,
  LoadBalancerTree,
} from "../../../../lib/api/types/loadbalancers";
import { deleteListener, loadBalancerWriteKeys } from "../../api";
import {
  availableListenerActions,
  octaviaLock,
  provisioningLabel,
  provisioningTone,
} from "../../status";

/** A listener's name, or its id while it has none. */
const nameOf = (item: { name: string | null; id: string }) =>
  item.name || item.id;
const idOf = (item: { id: string }) => item.id;

/**
 * The load balancer's listeners, each linked to its page with its default
 * pool, and deleted here with their L7 policies; `onCreate` and `onEdit`
 * open the create and edit listener dialogs. Every change waits while the
 * load balancer is PENDING_*.
 */
export function ListenersTab({
  tree,
  onCreate,
  onEdit,
}: {
  tree: LoadBalancerTree;
  onCreate: () => void;
  onEdit: (listener: Listener) => void;
}) {
  const remove = useBulkAction<Listener, "delete">({
    noun: { one: "listener", many: "listeners" },
    name: nameOf,
    getId: idOf,
    invalidates: loadBalancerWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (listener) => deleteListener(listener.id),
        body: (
          <p>
            Its L7 policies are deleted with it. Pools stay on the load
            balancer.
          </p>
        ),
      },
    },
  });
  const lbId = tree.load_balancer.id;
  const lbStatus = tree.load_balancer.provisioning_status;
  const columns = useMemo<ColumnDef<Listener>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/load-balancers/$lbId/listeners/$listenerId"
            params={{ lbId, listenerId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name ?? row.id,
      },
      {
        id: "protocol",
        label: "Protocol",
        cell: (row) => row.protocol,
        sortValue: (row) => row.protocol,
      },
      {
        id: "port",
        label: "Port",
        cell: (row) => row.protocol_port,
        sortValue: (row) => row.protocol_port,
      },
      {
        id: "pool",
        label: "Default pool",
        cell: (row) =>
          tree.pools.find((p) => p.id === row.default_pool_id)?.name ||
          (row.default_pool_id ?? ""),
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
    [lbId, tree.pools],
  );
  return (
    <>
      <DataTable
        id="lb-listeners"
        label="Listeners"
        columns={columns}
        rows={tree.listeners}
        getRowId={idOf}
        {...remove.tableProps}
        emptyTitle="No listeners"
        emptyBody={
          <p>A listener accepts traffic on a port and sends it to a pool.</p>
        }
        toolbarActions={
          <Button
            size="xs"
            onPress={onCreate}
            isDisabled={octaviaLock(lbStatus) !== null}
          >
            Create listener
          </Button>
        }
        rowActions={(row) =>
          toRowActions(availableListenerActions(row, lbStatus), (id) =>
            id === "edit" ? onEdit(row) : remove.run("delete", [row]),
          )
        }
      />
      {remove.dialog}
    </>
  );
}
