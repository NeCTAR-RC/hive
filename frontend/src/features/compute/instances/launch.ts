// Launch wizard defaults, as Horizon's launch dialog applies them
// (launch-instance-model.service.js onGetNetworks, Gerrit change 71399):
// the classic network is preselected when it is offered, otherwise a
// network is preselected only when it is the sole choice.
import type { ComputeLimits, Network } from "../../../lib/api/types";

export function defaultNetworkIds(
  networks: Pick<Network, "id" | "is_classic">[] | null | undefined,
): string[] {
  const offered = networks ?? [];
  const classic = offered.find((network) => network.is_classic);
  if (classic) return [classic.id];
  const only = offered.length === 1 ? offered[0] : undefined;
  return only ? [only.id] : [];
}

/**
 * Why a flavour cannot be launched within the project's compute quota, or
 * null when it fits. Horizon's flavour step greys out a flavour whose cores
 * or RAM times the instance count exceed what is left
 * (launch-instance/flavor/flavor.controller.js getErrorMessages). An
 * unlimited (negative) or unreported limit never blocks.
 */
export function flavorQuotaProblem(
  flavor: { vcpus: number | null; ram_mb: number | null },
  limits: ComputeLimits | null | undefined,
  count: number,
): string | null {
  const instances = Number.isFinite(count) && count > 0 ? count : 1;
  const left = (max: number | undefined, used: number | undefined) =>
    max === undefined || max < 0 ? Infinity : max - (used ?? 0);
  const cores = left(limits?.maxTotalCores, limits?.totalCoresUsed);
  if ((flavor.vcpus ?? 0) * instances > cores) {
    return "Needs more vCPUs than your quota has left";
  }
  const ram = left(limits?.maxTotalRAMSize, limits?.totalRAMUsed);
  if ((flavor.ram_mb ?? 0) * instances > ram) {
    return "Needs more RAM than your quota has left";
  }
  return null;
}
