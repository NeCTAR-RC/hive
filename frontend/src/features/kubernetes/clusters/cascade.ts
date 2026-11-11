// The create cluster cascade (magnum-ui workflow.service.js): the version,
// zone and network driver pickers each narrow the next, the three together
// pick the template, and the template fills the size fields it has
// defaults for.
import type {
  ClusterFlavor,
  ClusterOptions,
  ClusterTemplate,
  TemplateCombination,
} from "../../../lib/api/types/kubernetes";
import type { ClusterFormValues } from "./request";

/**
 * The template behind a version, zone and driver combination, or undefined
 * when the combination is incomplete, not offered, or names a template the
 * options do not list.
 */
export function templateFor(
  options: ClusterOptions | undefined,
  version: string,
  zone: string,
  driver: string,
): ClusterTemplate | undefined {
  const combination = options?.combinations.find(
    (c) =>
      c.kubernetes_version === version &&
      c.availability_zone === zone &&
      c.network_driver === driver,
  );
  return combination
    ? options?.templates.find((t) => t.id === combination.template_id)
    : undefined;
}

/** The zones offered for a Kubernetes version, sorted and without repeats. */
export function zonesFor(
  combinations: readonly TemplateCombination[],
  version: string,
): string[] {
  return [
    ...new Set(
      combinations
        .filter((c) => c.kubernetes_version === version)
        .map((c) => c.availability_zone),
    ),
  ].sort();
}

/** The network drivers offered for a version and zone, sorted and unique. */
export function driversFor(
  combinations: readonly TemplateCombination[],
  version: string,
  zone: string,
): string[] {
  return [
    ...new Set(
      combinations
        .filter(
          (c) =>
            c.kubernetes_version === version && c.availability_zone === zone,
        )
        .map((c) => c.network_driver),
    ),
  ].sort();
}

/** The only choice a picker offers, which it selects by itself. */
export function soleChoice(offered: readonly string[]): string | undefined {
  return offered.length === 1 ? offered[0] : undefined;
}

/**
 * What a picker's value becomes after the pickers above it change: cleared
 * when its choice is no longer offered, the sole choice when it is empty,
 * and undefined when it stays as it is.
 */
export function nextPick(
  current: string,
  offered: readonly string[],
): string | undefined {
  if (current && !offered.includes(current)) return "";
  if (!current) return soleChoice(offered);
  return undefined;
}

/**
 * Whether a template allows only one control plane node: one without a
 * control plane load balancer. No template allows any size.
 */
export function isSingleMaster(template: ClusterTemplate | undefined): boolean {
  return template ? template.master_lb_enabled === false : false;
}

/** The size fields a template sets; a field it leaves alone is absent. */
export interface TemplateDefaults {
  master_flavor_id?: string;
  flavor_id?: string;
  master_count?: string;
}

/**
 * The size fields a newly picked template fills in
 * (cluster-template.controller.js:72-110): its control plane and worker
 * flavours, only into empty fields and only when the flavour is offered,
 * and one control plane node for a single master template.
 */
export function templateDefaults(
  template: ClusterTemplate,
  flavors: readonly ClusterFlavor[],
  current: Pick<ClusterFormValues, "master_flavor_id" | "flavor_id">,
): TemplateDefaults {
  const offered = flavors.map((f) => f.name);
  const defaults: TemplateDefaults = {};
  if (
    !current.master_flavor_id &&
    template.master_flavor_id &&
    offered.includes(template.master_flavor_id)
  ) {
    defaults.master_flavor_id = template.master_flavor_id;
  }
  if (
    !current.flavor_id &&
    template.flavor_id &&
    offered.includes(template.flavor_id)
  ) {
    defaults.flavor_id = template.flavor_id;
  }
  if (isSingleMaster(template)) defaults.master_count = "1";
  return defaults;
}
