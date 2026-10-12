// Launch wizard defaults, as Horizon's launch dialog applies them
// (launch-instance-model.service.js onGetNetworks, Gerrit change 71399):
// the classic network is preselected when it is offered, otherwise a
// network is preselected only when it is the sole choice.
import type { Network } from "../../../lib/api/types";

export function defaultNetworkIds(
  networks: Pick<Network, "id" | "is_classic">[] | null | undefined,
): string[] {
  const offered = networks ?? [];
  const classic = offered.find((network) => network.is_classic);
  if (classic) return [classic.id];
  const only = offered.length === 1 ? offered[0] : undefined;
  return only ? [only.id] : [];
}
