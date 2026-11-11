// The Interfaces tab of a router's detail page.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import { DELETE, type Verb } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { toRowActions } from "../../../../lib/actions";
import type {
  RouterDetail,
  RouterInterface,
} from "../../../../lib/api/types/network";
import { removeInterface, routerInterfaceWriteKeys } from "../../api";
import {
  adminStateLabel,
  availableRouterInterfaceActions,
  interfaceKindLabel,
  statusLabel,
  statusTone,
} from "../../status";
import { AddInterfaceDialog } from "../dialogs/AddInterfaceDialog";

/**
 * Removing the gateway port, labelled as the router menu's clear gateway
 * and worded for a port: "Cleared the gateway interface 203.0.113.5."
 */
const CLEAR_GATEWAY_PORT: Verb = {
  label: "Clear gateway",
  done: "Cleared the gateway",
  failed: "clear the gateway",
};

/** An interface as titles and toasts name it: its addresses. */
function interfaceName(port: RouterInterface): string {
  return port.fixed_ips.map((ip) => ip.ip_address).join(", ") || port.id;
}

/**
 * The router's ports with Add interface. Each row has one remove action,
 * which clears the gateway on the gateway port and deletes any other.
 */
export function InterfacesTab({
  router,
  refetch,
}: {
  router: RouterDetail;
  refetch: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const bulk = useBulkAction<RouterInterface, "delete" | "clear-gateway">({
    noun: { one: "interface", many: "interfaces" },
    name: interfaceName,
    getId: (port) => port.id,
    invalidates: routerInterfaceWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (port) => removeInterface(router.id, port.id),
        body: <p>The subnet loses its route through this router.</p>,
      },
      "clear-gateway": {
        verb: CLEAR_GATEWAY_PORT,
        request: (port) => removeInterface(router.id, port.id),
        title: () => `Clear the gateway of ${router.name}?`,
        body: (
          <p>
            The router loses its route out and floating IPs behind it stop
            working.
          </p>
        ),
      },
    },
  });
  const columns = useMemo<ColumnDef<RouterInterface>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/network/ports/$portId"
            params={{ portId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name || row.id,
      },
      {
        id: "network",
        label: "Network",
        cell: (row) =>
          row.network_id ? (
            <AppLink
              size="sm"
              to="/network/networks/$networkId"
              params={{ networkId: row.network_id }}
              search={{}}
            >
              {row.network_name ?? row.network_id}
            </AppLink>
          ) : (
            ""
          ),
        sortValue: (row) => row.network_name ?? "",
      },
      {
        id: "ips",
        label: "Fixed IPs",
        cell: (row) => (
          <code>{row.fixed_ips.map((ip) => ip.ip_address).join(", ")}</code>
        ),
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => (
          <StatusPill tone={statusTone(row.status)}>
            {statusLabel(row.status)}
          </StatusPill>
        ),
        hideBelow: "md",
      },
      {
        id: "kind",
        label: "Type",
        cell: (row) => interfaceKindLabel(row.kind),
        sortValue: (row) => row.kind,
        hideBelow: "md",
      },
      {
        id: "admin_state",
        label: "Admin state",
        cell: (row) => adminStateLabel(row.admin_state_up),
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="router-interfaces"
        label="Interfaces"
        columns={columns}
        rows={router.interfaces}
        getRowId={(row) => row.id}
        {...bulk.tableProps}
        onRefresh={refetch}
        emptyTitle="No interfaces"
        emptyBody={
          <p>
            Add an interface on one of your subnets to route it through this
            router.
          </p>
        }
        toolbarActions={
          <Button variant="primary" size="xs" onPress={() => setAdding(true)}>
            Add interface
          </Button>
        }
        rowActions={(row) =>
          // One remove action, which clears the gateway on the gateway port.
          toRowActions(availableRouterInterfaceActions(row), () =>
            bulk.run(row.kind === "gateway" ? "clear-gateway" : "delete", [
              row,
            ]),
          )
        }
      />
      {adding && (
        <AddInterfaceDialog router={router} onClose={() => setAdding(false)} />
      )}
      {bulk.dialog}
    </>
  );
}
