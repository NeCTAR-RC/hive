// The instance action bodies the instance dialogs build from their forms.
import type { InstanceActionBody } from "../../../../lib/api/types/compute";

/** The rebuild form's values. */
export interface RebuildValues {
  image_id: string;
  name: string;
  password: string;
}

/**
 * The rebuild body: the image, plus a new name and an admin password only
 * when the user gave them, so Nova keeps the current name otherwise.
 */
export function rebuildBody(
  values: RebuildValues,
): InstanceActionBody<"rebuild"> {
  return {
    action: "rebuild",
    image_id: values.image_id,
    ...(values.name ? { name: values.name } : {}),
    ...(values.password ? { password: values.password } : {}),
  };
}

/** Security group names to add to and remove from an instance. */
export interface GroupChanges {
  added: string[];
  removed: string[];
}

/**
 * The security groups to add and remove to go from the instance's groups
 * to the chosen ones, or null when nothing changed (no request is sent).
 */
export function securityGroupChanges(
  current: string[],
  chosen: string[],
): GroupChanges | null {
  const before = new Set(current);
  const after = new Set(chosen);
  const changes = {
    added: chosen.filter((name) => !before.has(name)),
    removed: current.filter((name) => !after.has(name)),
  };
  return changes.added.length || changes.removed.length ? changes : null;
}

/** The attach interface form's values. */
export interface AttachInterfaceValues {
  mode: "network" | "port";
  network_id: string;
  port_id: string;
}

/**
 * The attach interface body: the network (Nova creates a port on it) or
 * the existing port, as the user chose to attach by. It names exactly one
 * of the two, as the backend requires.
 */
export function attachInterfaceBody(
  values: AttachInterfaceValues,
):
  | { action: "attach-interface"; network_id: string }
  | { action: "attach-interface"; port_id: string } {
  return values.mode === "network"
    ? { action: "attach-interface", network_id: values.network_id }
    : { action: "attach-interface", port_id: values.port_id };
}
