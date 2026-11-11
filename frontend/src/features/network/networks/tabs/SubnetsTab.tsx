// The Subnets tab of a network's detail page.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { AppLink } from "../../../../components/AppLink/AppLink";
import {
  DataTable,
  type ColumnDef,
} from "../../../../components/DataTable/DataTable";
import { allows, toRowActions } from "../../../../lib/actions";
import type {
  NetworkDetail,
  SubnetDetail,
} from "../../../../lib/api/types/network";
import { availableSubnetActions } from "../../status";
import { SubnetDialog } from "../dialogs/SubnetDialog";
import { useSubnetActions } from "../SubnetActions";

/**
 * The network's subnets with their actions. Only the project's own
 * network offers Create subnet, disabled while `canCreate` is false (the
 * subnet quota is full).
 */
export function SubnetsTab({
  network,
  canCreate,
  refetch,
}: {
  network: NetworkDetail;
  canCreate: boolean;
  refetch: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const actions = useSubnetActions(network);
  const columns = useMemo<ColumnDef<SubnetDetail>[]>(
    () => [
      {
        id: "name",
        label: "Name",
        isRowHeader: true,
        cell: (row) => (
          <AppLink
            size="sm"
            to="/network/subnets/$subnetId"
            params={{ subnetId: row.id }}
          >
            {row.name || row.id}
          </AppLink>
        ),
        sortValue: (row) => row.name || row.id,
      },
      {
        id: "cidr",
        label: "Network address",
        cell: (row) => <code>{row.cidr}</code>,
        sortValue: (row) => row.cidr ?? "",
      },
      {
        id: "version",
        label: "IP version",
        cell: (row) => (row.ip_version ? `IPv${row.ip_version}` : ""),
        hideBelow: "md",
      },
      {
        id: "gateway",
        label: "Gateway IP",
        cell: (row) => <code>{row.gateway_ip ?? ""}</code>,
        hideBelow: "md",
      },
      {
        id: "dhcp",
        label: "DHCP",
        cell: (row) =>
          row.enable_dhcp === null
            ? ""
            : row.enable_dhcp
              ? "Enabled"
              : "Disabled",
        hideBelow: "lg",
      },
    ],
    [],
  );
  return (
    <>
      <DataTable
        id="network-subnets"
        label="Subnets"
        columns={columns}
        rows={network.subnets}
        getRowId={(row) => row.id}
        {...actions.tableProps}
        onRefresh={refetch}
        emptyTitle="No subnets"
        emptyBody={
          <p>Instances need a subnet on the network to get an address.</p>
        }
        toolbarActions={
          network.is_project && (
            <Button
              variant="primary"
              size="xs"
              onPress={() => setCreating(true)}
              isDisabled={!canCreate}
            >
              {canCreate ? "Create subnet" : "Create subnet (quota exceeded)"}
            </Button>
          )
        }
        rowActions={(row) =>
          toRowActions(availableSubnetActions(row, network), (id) =>
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
                allows(availableSubnetActions(row, network), "delete"),
              ),
          },
        ]}
      />
      {actions.dialogs}
      {creating && (
        <SubnetDialog network={network} onClose={() => setCreating(false)} />
      )}
    </>
  );
}
