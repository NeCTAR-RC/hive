// The request bodies the Routers panel's dialogs send: a new router, a
// router's changes and a new interface. A create sends what the user
// filled in; an edit sends only what changed, and nothing when nothing did.
import type {
  Router,
  RouterCreateRequest,
} from "../../../../lib/api/types/network";
import type { useAddInterface, useUpdateRouter } from "../../api";
import type {
  CreateRouterValues,
  EditRouterValues,
  InterfaceValues,
} from "./schema";

/** What the update router mutation takes: the id and the changes. */
export type RouterUpdate = Parameters<
  ReturnType<typeof useUpdateRouter>["mutate"]
>[0];

/** What the add interface mutation takes: the router and the interface. */
export type InterfaceAdd = Parameters<
  ReturnType<typeof useAddInterface>["mutate"]
>[0];

/** The create router body; the gateway and zones go only when chosen. */
export function createRouterRequest(
  values: CreateRouterValues,
): RouterCreateRequest {
  const body: RouterCreateRequest = {
    admin_state_up: values.admin_state_up,
  };
  if (values.name) body.name = values.name;
  if (values.external_network_id) {
    body.external_network_id = values.external_network_id;
  }
  if (values.availability_zone_hints.length > 0) {
    body.availability_zone_hints = values.availability_zone_hints;
  }
  return body;
}

/** The changes to `router`, or null when there are none. */
export function updateRouterRequest(
  router: Pick<Router, "id" | "name" | "admin_state_up">,
  values: EditRouterValues,
): RouterUpdate | null {
  const body: RouterUpdate = { routerId: router.id };
  if (values.name !== router.name) body.name = values.name;
  if (values.admin_state_up !== router.admin_state_up) {
    body.admin_state_up = values.admin_state_up;
  }
  return Object.keys(body).length === 1 ? null : body;
}

/**
 * A new interface on `routerId`; without an address neutron gives it the
 * subnet's gateway address.
 */
export function addInterfaceRequest(
  routerId: string,
  values: InterfaceValues,
): InterfaceAdd {
  return {
    routerId,
    subnet_id: values.subnet_id,
    ...(values.ip_address ? { ip_address: values.ip_address } : {}),
  };
}
