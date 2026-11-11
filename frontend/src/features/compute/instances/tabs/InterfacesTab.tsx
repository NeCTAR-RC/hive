// The instance detail page's interfaces tab.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@ardc-ui/react";
import { DETACH } from "../../../../components/BulkAction/messages";
import { useBulkAction } from "../../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { useQueryTable } from "../../../../components/DataTable/useQueryTable";
import type {
  InstanceDetail,
  InstancePort,
} from "../../../../lib/api/types/compute";
import type { Network, Port } from "../../../../lib/api/types/network";
import { useProjectId } from "../../../../lib/hooks/useProjectId";
import { notify } from "../../../../lib/notify";
import { networkQuery, networksQuery, portQuery } from "../../../network/api";
import { PortDialog } from "../../../network/networks/dialogs/PortDialog";
import {
  instancePortsQuery,
  instanceWriteKeys,
  requestInstanceAction,
} from "../../api";
import { portAddresses } from "../ports";

/**
 * The instance's ports, each named by its network, with its fixed and
 * floating addresses. Attaching opens the instance's attach interface
 * dialog (`onAttach`); detaching asks first, since a floating IP on the
 * port goes with it. "Edit port" opens the Networks panel's port form
 * (Horizon's EditPortSecurityGroups), where one port's security groups
 * can differ from the instance's.
 */
export function InterfacesTab({
  instance,
  onAttach,
}: {
  instance: InstanceDetail;
  onAttach: () => void;
}) {
  const projectId = useProjectId();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{
    port: Port;
    network: Network;
  } | null>(null);
  const ports = useQuery(instancePortsQuery(projectId, instance.id));
  const portsTable = useQueryTable(ports, {
    noun: "interfaces",
    emptyTitle: "No interfaces",
  });
  const networks = useQuery(networksQuery(projectId, "any"));
  const detach = useBulkAction<InstancePort, "detach">({
    noun: { one: "interface", many: "interfaces" },
    name: portAddresses,
    getId: (port) => port.id,
    invalidates: instanceWriteKeys,
    actions: {
      detach: {
        verb: DETACH,
        request: (port) =>
          requestInstanceAction({
            instanceId: instance.id,
            body: { action: "detach-interface", port_id: port.id },
          }),
        body: (ports) => (
          <p>
            The port {ports.map(portAddresses).join(", ")} is removed from the
            instance. Any floating IP on it is disassociated.
          </p>
        ),
      },
    },
  });
  // The form needs the full port and its network, which this tab does not
  // list; it opens once both have loaded.
  const editPort = async (row: InstancePort) => {
    try {
      const [port, network] = await Promise.all([
        queryClient.fetchQuery(portQuery(projectId, row.id)),
        queryClient.fetchQuery(networkQuery(projectId, row.network_id)),
      ]);
      setEditing({ port, network });
    } catch (error) {
      notify.danger(
        `Could not open the port: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  const names = useMemo(
    () => new Map((networks.data?.items ?? []).map((n) => [n.id, n.name])),
    [networks.data],
  );
  const columns = useMemo<ColumnDef<InstancePort>[]>(
    () => [
      {
        id: "network",
        label: "Network",
        isRowHeader: true,
        cell: (row) => names.get(row.network_id) ?? row.network_id,
      },
      {
        id: "fixed",
        label: "Fixed IPs",
        cell: (row) => <code>{portAddresses(row)}</code>,
      },
      {
        id: "floating",
        label: "Floating IPs",
        cell: (row) => (
          <code>{row.floating_ips.map((f) => f.address).join(", ")}</code>
        ),
        hideBelow: "md",
      },
      {
        id: "mac",
        label: "MAC address",
        cell: (row) => <code>{row.mac_address ?? ""}</code>,
        hideBelow: "lg",
      },
      {
        id: "status",
        label: "Status",
        cell: (row) => row.status ?? "",
        hideBelow: "md",
      },
      {
        id: "port_security",
        label: "Port security",
        cell: (row) =>
          row.port_security_enabled === null
            ? ""
            : row.port_security_enabled
              ? "On"
              : "Off",
        hideBelow: "lg",
      },
    ],
    [names],
  );
  return (
    <>
      <DataTable
        id="instance-interfaces"
        label="Interfaces"
        columns={columns}
        getRowId={(row) => row.id}
        {...portsTable}
        {...detach.tableProps}
        toolbarActions={
          <Button variant="primary" size="xs" onPress={onAttach}>
            Attach interface
          </Button>
        }
        rowActions={(row) => [
          {
            id: "edit",
            label: "Edit port",
            onAction: () => void editPort(row),
          },
          {
            id: "detach",
            label: "Detach interface",
            tone: "danger",
            onAction: () => detach.run("detach", [row]),
          },
        ]}
      />
      {detach.dialog}
      {editing && (
        <PortDialog
          network={editing.network}
          port={editing.port}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
