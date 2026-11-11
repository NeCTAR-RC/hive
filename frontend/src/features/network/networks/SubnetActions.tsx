// Subnet actions behind one hook: `run(action, items)` deletes the batch
// after asking, or opens the edit dialog. The hook returns the dialogs to
// render and the props for the table that lists the subnets.
import { useState } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Network, SubnetDetail } from "../../../lib/api/types/network";
import { deleteSubnet, subnetWriteKeys } from "../api";
import { availableSubnetActions, type SubnetActionId } from "../status";
import { SubnetDialog } from "./dialogs/SubnetDialog";

const getId = (subnet: SubnetDetail) => subnet.id;

/** A subnet as titles and toasts name it. */
const subnetName = (subnet: SubnetDetail) =>
  subnet.name || subnet.cidr || subnet.id;

/**
 * Every subnet action on `network`'s subnets: delete runs on a batch, edit
 * opens the form for the first subnet once the network is known.
 * `onDeleted` runs after a delete that removed at least one subnet.
 */
export function useSubnetActions(
  network: Network | undefined,
  onDeleted?: () => void,
) {
  const [editing, setEditing] = useState<SubnetDetail | null>(null);
  const bulk = useBulkAction<SubnetDetail, "delete">({
    noun: { one: "subnet", many: "subnets" },
    name: subnetName,
    getId,
    invalidates: subnetWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (subnet) => deleteSubnet(subnet.id),
        eligible: (subnet) =>
          allows(availableSubnetActions(subnet, network), "delete"),
        skippedWhy: "only your project's own networks can be changed",
        body: (
          <p>
            A subnet with addresses still allocated to ports cannot be deleted.
          </p>
        ),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: SubnetActionId, subnets: SubnetDetail[]) => {
    const [first] = subnets;
    if (action === "delete") bulk.run("delete", subnets);
    else if (first) setEditing(first);
  };

  return {
    run,
    dialogs: (
      <>
        {editing && network && (
          <SubnetDialog
            network={network}
            subnet={editing}
            onClose={() => setEditing(null)}
          />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
