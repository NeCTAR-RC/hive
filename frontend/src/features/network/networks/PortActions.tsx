// Port actions behind one hook: `run(action, items)` deletes the batch
// after asking, or opens the edit dialog. The hook returns the dialogs to
// render and the props for the table that lists the ports.
import { useState } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Network, Port } from "../../../lib/api/types/network";
import { deletePort, portWriteKeys } from "../api";
import { availablePortActions, type PortActionId } from "../status";
import { PortDialog } from "./dialogs/PortDialog";

const getId = (port: Port) => port.id;

/** A port as titles and toasts name it. */
const portName = (port: Port) => port.name || port.id;

/**
 * Every port action on `network`'s ports: delete runs on a batch, edit
 * opens the form for the first port once the network is known.
 * `onDeleted` runs after a delete that removed at least one port.
 */
export function usePortActions(
  network: Pick<Network, "id" | "name" | "subnets"> | undefined,
  onDeleted?: () => void,
) {
  const [editing, setEditing] = useState<Port | null>(null);
  const bulk = useBulkAction<Port, "delete">({
    noun: { one: "port", many: "ports" },
    name: portName,
    getId,
    invalidates: portWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (port) => deletePort(port.id),
        eligible: (port) => allows(availablePortActions(port), "delete"),
        skippedWhy: "attached or network service ports cannot be deleted",
        body: <p>Any floating IP on the port is disassociated.</p>,
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: PortActionId, ports: Port[]) => {
    const [first] = ports;
    if (action === "delete") bulk.run("delete", ports);
    else if (first) setEditing(first);
  };

  return {
    run,
    dialogs: (
      <>
        {editing && network && (
          <PortDialog
            network={network}
            port={editing}
            onClose={() => setEditing(null)}
          />
        )}
        {bulk.dialog}
      </>
    ),
    tableProps: bulk.tableProps,
  };
}
