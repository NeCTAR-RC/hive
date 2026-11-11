// The request bodies the Trunks panel's dialogs send: the subports, a new
// trunk and a trunk's changes. An edit sends only what changed, and
// nothing when nothing did.
import type {
  Trunk,
  TrunkCreateRequest,
  TrunkSubportRequest,
} from "../../../../lib/api/types/network";
import type { useUpdateTrunk } from "../../api";
import type {
  CreateTrunkValues,
  EditTrunkValues,
  SubportValues,
} from "./schema";

/** What the update trunk mutation takes: the id and the changes. */
export type TrunkUpdate = Parameters<
  ReturnType<typeof useUpdateTrunk>["mutate"]
>[0];

/** The subport rows as the API takes them; only a VLAN carries an id. */
export function subportsBody(values: SubportValues[]): TrunkSubportRequest[] {
  return values.map((s) => ({
    port_id: s.port_id,
    segmentation_type: s.segmentation_type,
    ...(s.segmentation_type === "vlan" && typeof s.segmentation_id === "number"
      ? { segmentation_id: s.segmentation_id }
      : {}),
  }));
}

/** The create trunk body; the name and description go only when given. */
export function createTrunkRequest(
  values: CreateTrunkValues,
): TrunkCreateRequest {
  const body: TrunkCreateRequest = {
    admin_state_up: values.admin_state_up,
    port_id: values.port_id,
    sub_ports: subportsBody(values.sub_ports),
  };
  if (values.name) body.name = values.name;
  if (values.description) body.description = values.description;
  return body;
}

/** The changes to `trunk`, or null when there are none. */
export function updateTrunkRequest(
  trunk: Pick<Trunk, "id" | "name" | "description" | "admin_state_up">,
  values: EditTrunkValues,
): TrunkUpdate | null {
  const body: TrunkUpdate = { trunkId: trunk.id };
  if (values.name !== trunk.name) body.name = values.name;
  if (values.description !== trunk.description) {
    body.description = values.description;
  }
  if (values.admin_state_up !== trunk.admin_state_up) {
    body.admin_state_up = values.admin_state_up;
  }
  return Object.keys(body).length === 1 ? null : body;
}
