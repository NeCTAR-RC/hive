// Network actions behind one hook: `run(action, items)` deletes the batch
// after asking, or opens the form dialog the action needs. The hook
// returns the dialogs to render and the props for the table that lists
// the networks.
import { useState, type ReactNode } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Network } from "../../../lib/api/types/network";
import { deleteNetwork, networkWriteKeys } from "../api";
import { availableNetworkActions, type NetworkActionId } from "../status";
import { EditNetworkDialog } from "./dialogs/EditNetworkDialog";
import { SubnetDialog } from "./dialogs/SubnetDialog";

const getId = (network: Network) => network.id;

/**
 * Every network action: delete runs on a batch, edit and create subnet
 * open their form for the first network. `onDeleted` runs after a delete
 * that removed at least one network (a detail page leaves for the list).
 */
export function useNetworkActions(onDeleted?: () => void) {
  const [dialog, setDialog] = useState<{
    kind: Exclude<NetworkActionId, "delete">;
    network: Network;
  } | null>(null);
  const bulk = useBulkAction<Network, "delete">({
    noun: { one: "network", many: "networks" },
    name: (network) => network.name,
    getId,
    invalidates: networkWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (network) => deleteNetwork(network.id),
        eligible: (network) =>
          allows(availableNetworkActions(network), "delete"),
        skippedWhy:
          "only your project's own networks without ports in use can be deleted",
        body: (networks) => (
          <p>
            The{" "}
            {networks.length === 1
              ? "network and its subnets are"
              : "networks and their subnets are"}{" "}
            removed.
          </p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: NetworkActionId, networks: Network[]) => {
    const [first] = networks;
    if (action === "delete") bulk.run("delete", networks);
    else if (first) setDialog({ kind: action, network: first });
  };

  const close = () => setDialog(null);
  let formDialog: ReactNode = null;
  if (dialog?.kind === "edit") {
    formDialog = <EditNetworkDialog network={dialog.network} onClose={close} />;
  } else if (dialog?.kind === "create-subnet") {
    formDialog = <SubnetDialog network={dialog.network} onClose={close} />;
  }

  return {
    run,
    dialogs: (
      <>
        {formDialog}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
