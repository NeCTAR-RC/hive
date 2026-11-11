// The quota figures of the overview's limit summary, from each service's
// limits, as Horizon's usage/views.py groups its charts: compute, volume
// and network.
import type { ComputeLimits } from "../../../lib/api/types/compute";
import type { NetworkQuota } from "../../../lib/api/types/network";
import type { VolumeLimits } from "../../../lib/api/types/volumes";
import { formatGb, formatMb } from "../../../lib/format";
import { quotaPair, type QuotaPair } from "../../../lib/quota";

/** One meter of the summary: a quota's use, and how to write its figures. */
export interface QuotaFigure extends QuotaPair {
  label: string;
  format?: (value: number) => string;
}

/** Instances, vCPUs, RAM and server groups, from Nova's limits. */
export function computeQuotas(
  limits: ComputeLimits | undefined,
): QuotaFigure[] {
  return [
    {
      label: "Instances",
      ...quotaPair(limits, "maxTotalInstances", "totalInstancesUsed"),
    },
    { label: "vCPUs", ...quotaPair(limits, "maxTotalCores", "totalCoresUsed") },
    {
      label: "RAM",
      ...quotaPair(limits, "maxTotalRAMSize", "totalRAMUsed"),
      format: formatMb,
    },
    {
      label: "Server groups",
      ...quotaPair(limits, "maxServerGroups", "totalServerGroupsUsed"),
    },
  ];
}

/** Volumes, volume snapshots and volume storage, from Cinder's limits. */
export function volumeQuotas(limits: VolumeLimits | undefined): QuotaFigure[] {
  return [
    {
      label: "Volumes",
      ...quotaPair(limits, "maxTotalVolumes", "totalVolumesUsed"),
    },
    {
      label: "Volume snapshots",
      ...quotaPair(limits, "maxTotalSnapshots", "totalSnapshotsUsed"),
    },
    {
      label: "Volume storage",
      ...quotaPair(limits, "maxTotalVolumeGigabytes", "totalGigabytesUsed"),
      format: formatGb,
    },
  ];
}

/** The Neutron resources Horizon's summary charts, in its order. */
const NETWORK_RESOURCES: [label: string, resource: string][] = [
  ["Floating IPs", "floatingip"],
  ["Security groups", "security_group"],
  ["Security group rules", "security_group_rule"],
  ["Networks", "network"],
  ["Ports", "port"],
  ["Routers", "router"],
];

/**
 * Floating IPs, security groups and rules, networks, ports and routers,
 * from Neutron's quota details; a negative limit is unlimited.
 */
export function networkQuotas(quota: NetworkQuota | undefined): QuotaFigure[] {
  return NETWORK_RESOURCES.map(([label, resource]) => {
    const entry = quota?.[resource];
    return {
      label,
      used: entry?.used ?? 0,
      max: entry === undefined || entry.limit < 0 ? null : entry.limit,
    };
  });
}
