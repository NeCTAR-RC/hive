// Which instance actions open a dialog and which run on a batch, and the
// backend request behind each batch action but delete.
import type { InstanceActionRequest } from "../../../lib/api/types/compute";
import type { InstanceActionVariables } from "../api";
import type { InstanceActionId } from "./status";

/** The actions that open a dialog collecting what they need. */
export type DialogActionId =
  | "edit"
  | "resize"
  | "rebuild"
  | "snapshot"
  | "metadata"
  | "security-groups"
  | "attach-interface"
  | "detach-interface"
  | "associate-fip"
  | "disassociate-fip"
  | "attach-volume"
  | "detach-volume"
  | "rescue";

/** The actions that run on a batch of instances. */
export type BatchActionId = Exclude<
  InstanceActionId,
  DialogActionId | "console" | "log"
>;

/** The batch actions sent as a backend instance action (all but delete). */
export type RequestActionId = Exclude<BatchActionId, "delete">;

/**
 * The backend body of each batch action but delete: the plain state
 * changes carry their name alone, and both reboots are `reboot`, told
 * apart by their type.
 */
const BODIES: Record<RequestActionId, InstanceActionRequest> = {
  start: { action: "start" },
  stop: { action: "stop" },
  "soft-reboot": { action: "reboot", type: "SOFT" },
  "hard-reboot": { action: "reboot", type: "HARD" },
  pause: { action: "pause" },
  unpause: { action: "unpause" },
  suspend: { action: "suspend" },
  resume: { action: "resume" },
  shelve: { action: "shelve" },
  unshelve: { action: "unshelve" },
  lock: { action: "lock" },
  unlock: { action: "unlock" },
  unrescue: { action: "unrescue" },
  "confirm-resize": { action: "confirm-resize" },
  "revert-resize": { action: "revert-resize" },
};

/** The instance action request for a batch action on one instance. */
export function actionRequest(
  id: RequestActionId,
  instanceId: string,
): InstanceActionVariables {
  return { instanceId, body: BODIES[id] };
}
