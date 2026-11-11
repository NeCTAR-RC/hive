// Every zone action behind one hook, shared by the zones list and the zone
// page: `run(action, zones)` deletes the batch after asking, or opens the
// edit dialog for the first zone. The hook returns the dialogs to render.
import { useState, type ReactNode } from "react";
import { DELETE } from "../../../components/BulkAction/messages";
import { useBulkAction } from "../../../components/BulkAction/useBulkAction";
import { allows } from "../../../lib/actions";
import type { Zone } from "../../../lib/api/types/dns";
import { deleteZone, dnsWriteKeys } from "../api";
import { availableZoneActions, type ZoneActionId } from "../status";
import { EditZoneDialog } from "./dialogs/EditZoneDialog";

const getId = (zone: Zone) => zone.id;
const getName = (zone: Zone) => zone.name;

/**
 * The zone actions. `onDeleted` runs once a delete has removed at least
 * one zone, so the zone page can go back to the list.
 */
export function useZoneActions(onDeleted?: () => void) {
  const [editing, setEditing] = useState<Zone | null>(null);
  const bulk = useBulkAction<Zone, "delete">({
    noun: { one: "zone", many: "zones" },
    name: getName,
    getId,
    invalidates: dnsWriteKeys,
    actions: {
      delete: {
        verb: DELETE,
        request: (zone) => deleteZone(zone.id),
        body: <p>All record sets in the zone are deleted with it.</p>,
        eligible: (zone) => allows(availableZoneActions(zone), "delete"),
        onSucceeded: () => onDeleted?.(),
      },
    },
  });

  const run = (action: ZoneActionId, zones: Zone[]) => {
    const [first] = zones;
    if (action === "edit") {
      if (first) setEditing(first);
    } else {
      bulk.run(action, zones);
    }
  };

  const dialogs: ReactNode = (
    <>
      {editing && (
        <EditZoneDialog zone={editing} onClose={() => setEditing(null)} />
      )}
      {bulk.dialog}
    </>
  );

  return { run, dialogs, tableProps: bulk.tableProps };
}
