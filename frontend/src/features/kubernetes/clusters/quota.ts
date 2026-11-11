// The compute quota a new cluster needs: every control plane and worker
// node is a Nova instance of its flavour, so the cluster takes instances,
// vCPUs and RAM from the project's compute quota. magnum-ui does not check
// (believed); Magnum would fail the build after a long wait.
import type { ClusterFlavor } from "../../../lib/api/types/kubernetes";
import { formatMb } from "../../../lib/format";
import { quotaPair, type Limits, type QuotaPair } from "../../../lib/quota";

/** The sizes of a cluster as the create form holds them. */
export interface ClusterSize {
  master_count: string;
  master_flavor_id: string;
  node_count: number;
  flavor_id: string;
}

/** What a cluster takes from the compute quota. */
export interface ClusterNeeds {
  instances: number;
  vcpus: number;
  ramMb: number;
}

/**
 * What the cluster takes: control plane plus worker nodes as instances,
 * and each group's count times its flavour's vCPUs and RAM. Null while a
 * flavour is not chosen or not among `flavors`.
 */
export function clusterNeeds(
  size: ClusterSize,
  flavors: readonly ClusterFlavor[],
): ClusterNeeds | null {
  const master = flavors.find((f) => f.name === size.master_flavor_id);
  const worker = flavors.find((f) => f.name === size.flavor_id);
  if (!master || !worker) return null;
  const masters = Number(size.master_count) || 0;
  const workers = size.node_count;
  return {
    instances: masters + workers,
    vcpus: masters * (master.vcpus ?? 0) + workers * (worker.vcpus ?? 0),
    ramMb: masters * (master.ram_mb ?? 0) + workers * (worker.ram_mb ?? 0),
  };
}

/** How much of a quota is left, or null when it is unlimited. */
function left({ used, max }: QuotaPair): number | null {
  return max === null ? null : Math.max(max - used, 0);
}

/**
 * Why the project's compute quota cannot hold the cluster, naming the
 * first resource that runs out and how much is left, or null when it can
 * (or the limits are not known yet).
 */
export function clusterQuotaProblem(
  needs: ClusterNeeds | null,
  limits: Limits | undefined,
): string | null {
  if (!needs || !limits) return null;
  const instances = left(
    quotaPair(limits, "maxTotalInstances", "totalInstancesUsed"),
  );
  if (instances !== null && needs.instances > instances) {
    return `The cluster needs ${needs.instances} instances; the project has ${instances} left`;
  }
  const vcpus = left(quotaPair(limits, "maxTotalCores", "totalCoresUsed"));
  if (vcpus !== null && needs.vcpus > vcpus) {
    return `The cluster needs ${needs.vcpus} vCPUs; the project has ${vcpus} left`;
  }
  const ram = left(quotaPair(limits, "maxTotalRAMSize", "totalRAMUsed"));
  if (ram !== null && needs.ramMb > ram) {
    return `The cluster needs ${formatMb(needs.ramMb)} of RAM; the project has ${formatMb(ram)} left`;
  }
  return null;
}

/**
 * What the compute quota has left for nodes, as the worker count's help
 * text: "The project has 7 instances, 24 vCPUs and 48 GB of RAM left."
 * Unlimited resources are left out; undefined when nothing is limited or
 * the limits are not known yet.
 */
export function quotaLeftText(limits: Limits | undefined): string | undefined {
  if (!limits) return undefined;
  const instances = left(
    quotaPair(limits, "maxTotalInstances", "totalInstancesUsed"),
  );
  const vcpus = left(quotaPair(limits, "maxTotalCores", "totalCoresUsed"));
  const ram = left(quotaPair(limits, "maxTotalRAMSize", "totalRAMUsed"));
  const parts = [
    instances !== null ? `${instances} instances` : null,
    vcpus !== null ? `${vcpus} vCPUs` : null,
    ram !== null ? `${formatMb(ram)} of RAM` : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return undefined;
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `The project has ${list} left.`;
}
