// The server group action rules, on the shared action engine.
import type { ServerGroup } from "../../../lib/api/types/compute";
import {
  offerActions,
  type ActionOffer,
  type ActionTable,
} from "../../../lib/actions";

export type ServerGroupActionId = "delete";

/**
 * Horizon lists server groups with a delete action only; deleting a group
 * leaves its instances running, so nothing rules it out.
 */
const SERVER_GROUP_ACTIONS: ActionTable<ServerGroupActionId, ServerGroup> = {
  rules: [{ id: "delete", label: "Delete server group", tone: "danger" }],
};

/** The server group's menu, as the list row and the detail page offer it. */
export function availableServerGroupActions(
  group: ServerGroup,
): ActionOffer<ServerGroupActionId>[] {
  return offerActions(SERVER_GROUP_ACTIONS, group);
}
