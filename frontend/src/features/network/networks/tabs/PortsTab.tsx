// The Ports tab of a network's detail page.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { StatusPill } from "../../../../components/StatusPill/StatusPill";
import { allows, toRowActions } from "../../../../lib/actions";
import type { NetworkDetail, Port } from "../../../../lib/api/types/network";
import {
  adminStateLabel,
  availablePortActions,
  portDeviceText,
  statusLabel,
  statusTone,
} from "../../status";
import { AttachedDevice } from "../AttachedDevice";
import { PortDialog } from "../dialogs/PortDialog";
import { usePortActions } from "../PortActions";

/**
 * The network's ports with their actions, and Create port, disabled while
 * `canCreate` is false (the port quota is full).
 */
export function PortsTab({
  network,
  canCreate,
  refetch,
}: {
  network: NetworkDetail;
  canCreate: boolean;
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const actions = usePortActions(network);
  const columns = useMemo<ColumnDef<Port>[]>(
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
        textValue: (row) => `${row.name} ${row.id}`,
      },
      {
        id: "ips",
        label: "Fixed IPs",
        cell: (row) => (
          <code>{row.fixed_ips.map((ip) => ip.ip_address).join(", ")}</code>
        ),
        textValue: (row) => row.fixed_ips.map((ip) => ip.ip_address).join(" "),
      },
      {
        id: "mac",
        label: "MAC address",
        cell: (row) => <code>{row.mac_address ?? ""}</code>,
        hideBelow: "lg",
      },
      {
        id: "attached",
        label: "Attached device",
        cell: (row) => <AttachedDevice port={row} size="sm" />,
        sortValue: portDeviceText,
        textValue: portDeviceText,
        hideBelow: "md",
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
        id="network-ports"
        label="Ports"
        columns={columns}
        rows={network.ports}
        getRowId={(row) => row.id}
        {...actions.tableProps}
        onRefresh={refetch}
        emptyTitle="No ports"
        emptyBody={
          <p>
            Ports appear when instances or routers attach to the network, or
            when you create one to attach later.
          </p>
        }
        toolbarActions={
          <Button
            variant="primary"
            size="xs"
            onPress={() => setCreating(true)}
            isDisabled={!canCreate}
          >
            {canCreate ? "Create port" : "Create port (quota exceeded)"}
          </Button>
        }
        rowActions={(row) =>
          toRowActions(availablePortActions(row), (id) =>
            actions.run(id, [row]),
          )
        }
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => actions.run("delete", selected),
            isDisabled: (selected) =>
              !selected.some((row) =>
                allows(availablePortActions(row), "delete"),
              ),
          },
        ]}
      />
      {actions.dialogs}
      {creating && (
        <PortDialog network={network} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
