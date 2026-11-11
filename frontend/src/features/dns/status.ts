// Designate status wording and the zone and record set action rules.
import type { RecordSet, Zone } from "../../lib/api/types/dns";
import { offerActions, type ActionTable } from "../../lib/actions";
import { defineStatus } from "../../lib/status";

const readers = defineStatus({
  transitional: ["PENDING"],
  success: ["ACTIVE"],
  danger: ["ERROR"],
});

export const statusTone = readers.tone;

/** The status, with the pending action named: "Pending (create)". */
export function statusLabel(
  status: string | null | undefined,
  action?: string | null,
): string {
  const word = readers.label(status);
  if (status === "PENDING" && action && action !== "NONE") {
    return `${word} (${action.toLowerCase()})`;
  }
  return word;
}

/** Why a zone or record set with a change in flight cannot be changed. */
const PENDING_REASON = "Wait for the pending change to finish";

export type ZoneActionId = "edit" | "delete";

/**
 * The zone menu, as designate-dashboard offers it: nothing changes a zone
 * while Designate is still applying its last change.
 */
const ZONE_ACTIONS: ActionTable<ZoneActionId, Zone> = {
  guard: (zone) => zone.is_transitional && PENDING_REASON,
  rules: [
    { id: "edit", label: "Edit zone" },
    { id: "delete", label: "Delete zone", tone: "danger" },
  ],
};

export function availableZoneActions(zone: Zone) {
  return offerActions(ZONE_ACTIONS, zone);
}

export type RecordSetActionId = "edit" | "delete";

/**
 * The record set menu. The SOA and apex NS record sets belong to Designate
 * (`can_edit` is false), and a record set with a change in flight waits.
 */
const RECORD_SET_ACTIONS: ActionTable<RecordSetActionId, RecordSet> = {
  guard: (recordSet) =>
    (!recordSet.can_edit && "This record set is managed by the DNS service") ||
    (recordSet.is_transitional && PENDING_REASON),
  rules: [
    { id: "edit", label: "Edit record set" },
    { id: "delete", label: "Delete record set", tone: "danger" },
  ],
};

export function availableRecordSetActions(recordSet: RecordSet) {
  return offerActions(RECORD_SET_ACTIONS, recordSet);
}

export const ZONE_TYPES = [
  { id: "PRIMARY", label: "Primary" },
  { id: "SECONDARY", label: "Secondary" },
];
