// A port's allowed address pairs on its page (Horizon's Allowed Address
// Pairs tab): the list, Add pair, and delete for one or many.
import { useMemo, useState } from "react";
import { Button } from "@ardc-ui/react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import {
  DataTable,
  type ColumnDef,
} from "../../../components/DataTable/DataTable";
import { Panel } from "../../../components/Panel/Panel";
import type { Port, PortAddressPair } from "../../../lib/api/types/network";
import { queryKeys } from "../../../lib/queryKeys";
import { setAllowedAddressPairs } from "../api";
import { allows } from "../../../lib/actions";
import { availablePortActions } from "../status";
import { pairId, withoutPairs } from "./addressPairs";
import { AddAddressPairDialog } from "./dialogs/AddAddressPairDialog";

/**
 * The pairs table. Deleting any number of pairs is one request that sends
 * the pairs that remain. Ports the network service owns cannot change,
 * so Add pair is disabled on them with the reason.
 */
export function AddressPairsPanel({
  port,
  onRefresh,
}: {
  port: Port;
  onRefresh: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const bulk = useBulkAction<PortAddressPair, "delete">({
    noun: { one: "address pair", many: "address pairs" },
    name: (pair) => pair.ip_address,
    getId: pairId,
    invalidates: [queryKeys.network.ports.all],
    actions: {
      delete: {
        verb: DELETE,
        // Neutron keeps the pairs as one list: one request sends the rest.
        batch: async (pairs) => {
          await setAllowedAddressPairs(
            port.id,
            withoutPairs(port.allowed_address_pairs, pairs),
          );
          return { succeeded: pairs, failed: [] };
        },
        body: (
          <p>
            The port stops accepting traffic for these addresses, so a shared
            virtual IP on them moves away from this port.
          </p>
        ),
      },
    },
  });
  const columns = useMemo<ColumnDef<PortAddressPair>[]>(
    () => [
      {
        id: "ip_address",
        label: "IP address or range",
        isRowHeader: true,
        cell: (row) => <code>{row.ip_address}</code>,
        sortValue: (row) => row.ip_address,
      },
      {
        id: "mac_address",
        label: "MAC address",
        cell: (row) => <code>{row.mac_address ?? ""}</code>,
        sortValue: (row) => row.mac_address ?? "",
      },
    ],
    [],
  );
  const editable = allows(availablePortActions(port), "edit");
  return (
    <Panel title="Allowed address pairs">
      <DataTable
        id="port-address-pairs"
        label="Allowed address pairs"
        columns={columns}
        rows={port.allowed_address_pairs}
        getRowId={pairId}
        {...bulk.tableProps}
        onRefresh={onRefresh}
        emptyTitle="No allowed address pairs"
        emptyBody={
          <p>
            A pair lets the port send and receive traffic for another address,
            such as a virtual IP that keepalived moves between instances.
          </p>
        }
        toolbarActions={
          <Button
            variant="primary"
            size="xs"
            onPress={() => setAdding(true)}
            isDisabled={!editable}
          >
            {editable ? "Add pair" : "Add pair (owned by the network service)"}
          </Button>
        }
        rowActions={(row) => [
          {
            id: "delete",
            label: "Delete address pair",
            tone: "danger",
            onAction: () => bulk.run("delete", [row]),
            isDisabled: !editable,
          },
        ]}
        batchActions={[
          {
            id: "delete",
            label: "Delete",
            tone: "danger",
            onAction: (selected) => bulk.run("delete", selected),
            isDisabled: () => !editable,
          },
        ]}
      />
      {adding && (
        <AddAddressPairDialog port={port} onClose={() => setAdding(false)} />
      )}
      {bulk.dialog}
    </Panel>
  );
}
