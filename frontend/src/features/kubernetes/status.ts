// Cluster and node group status wording (Heat-style states as magnum-ui
// shows them), the cluster and node group action rules, and the node label
// and taint text formats.
import {
  offerActions,
  type ActionCheck,
  type ActionTable,
} from "../../lib/actions";
import type {
  Cluster,
  ClusterTemplate,
  NodeGroup,
  NodeTaint,
} from "../../lib/api/types/kubernetes";
import { defineStatus, heatStatus } from "../../lib/status";

type Status = string | null | undefined;

export const isTransitional = (status: Status) =>
  heatStatus(status).isTransitional;
export const statusTone = (status: Status) => heatStatus(status).tone;
export const statusLabel = (status: Status) => heatStatus(status).label;

const health = defineStatus({ success: ["HEALTHY"], danger: ["UNHEALTHY"] });

export const healthTone = health.tone;
export const healthLabel = health.label;

export function healthReason(
  cluster: Pick<Cluster, "health_status_reason">,
): string {
  const reason = cluster.health_status_reason;
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  return Object.entries(reason)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

export type ClusterActionId =
  "config" | "nodegroups" | "upgrade" | "certificate" | "sign" | "delete";

/** The kubeconfig and certificates need the cluster's API to answer. */
const needsApi = (c: Cluster) =>
  !c.api_address && "The cluster has no API address yet";

/**
 * The cluster menu, from magnum-ui's clusters.utils.js. The backend reads
 * the cluster's status and lists the actions Magnum allows now in
 * `actions` (delete included while the cluster is being created); the
 * kubeconfig, the CA certificate and signing wait for the cluster's API
 * address.
 */
const CLUSTER_ACTIONS: ActionTable<ClusterActionId, Cluster> = {
  rules: [
    { id: "config", label: "Download kubeconfig", checks: [needsApi] },
    { id: "nodegroups", label: "Manage node groups" },
    {
      id: "upgrade",
      label: "Upgrade cluster",
      checks: [
        (c) =>
          !c.actions.includes("upgrade") &&
          "The cluster must be in a completed state",
      ],
    },
    { id: "certificate", label: "Download CA certificate", checks: [needsApi] },
    { id: "sign", label: "Sign a certificate", checks: [needsApi] },
    {
      id: "delete",
      label: "Delete cluster",
      tone: "danger",
      checks: [
        (c) =>
          !c.actions.includes("delete") &&
          "Wait for the current operation to finish",
      ],
    },
  ],
};

export function availableClusterActions(cluster: Cluster) {
  return offerActions(CLUSTER_ACTIONS, cluster);
}

export type NodeGroupActionId = "resize" | "autoscaling" | "labels" | "delete";

/**
 * Whether the cluster lets its node groups change now (the node groups
 * response's `can_change`); every node group action waits otherwise.
 */
const waitForCluster: ActionCheck<NodeGroup, boolean> = (_, canChange) =>
  !canChange && "Wait for the cluster to finish its current operation";

/**
 * The node group menu with the Nectar node group actions. A rule about the
 * group itself is checked before the cluster's state, so its reason wins.
 */
const NODE_GROUP_ACTIONS: ActionTable<NodeGroupActionId, NodeGroup, boolean> = {
  rules: [
    { id: "resize", label: "Resize", checks: [waitForCluster] },
    {
      id: "autoscaling",
      label: "Edit autoscaling",
      checks: [
        (g) =>
          !g.auto_scaling && "Autoscaling is not enabled on this node group",
        waitForCluster,
      ],
    },
    {
      id: "labels",
      label: "Edit labels and taints",
      checks: [
        (g) =>
          g.role === "master" &&
          "Control plane node groups cannot carry labels or taints",
        waitForCluster,
      ],
    },
    {
      id: "delete",
      label: "Delete node group",
      tone: "danger",
      checks: [
        (g) => g.is_default && "The default node group cannot be deleted",
        waitForCluster,
      ],
    },
  ],
};

/** The node group menu; `canChange` is the cluster's `can_change`. */
export function availableNodeGroupActions(
  group: NodeGroup,
  canChange: boolean,
) {
  return offerActions(NODE_GROUP_ACTIONS, group, canChange);
}

export type TemplateActionId = "create";

/** The template menu (magnum-ui's template row action "Create Cluster"). */
const TEMPLATE_ACTIONS: ActionTable<TemplateActionId, ClusterTemplate> = {
  rules: [{ id: "create", label: "Create cluster" }],
};

export function availableTemplateActions(template: ClusterTemplate) {
  return offerActions(TEMPLATE_ACTIONS, template);
}

/**
 * The create cluster page's search for a template: its version, zone and
 * driver, which pick the newest template of that kind (the form picks by
 * those, not by template id). A field the template lacks is left out.
 */
export function createFromTemplateSearch(template: ClusterTemplate) {
  return {
    ...(template.kubernetes_version
      ? { version: template.kubernetes_version }
      : {}),
    ...(template.availability_zone ? { zone: template.availability_zone } : {}),
    ...(template.network_driver ? { driver: template.network_driver } : {}),
  };
}

export function formatTaints(taints: NodeTaint[]): string {
  return taints
    .map((t) =>
      t.value ? `${t.key}=${t.value}:${t.effect}` : `${t.key}:${t.effect}`,
    )
    .join(",");
}

export function formatLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

export const LABELS_PATTERN =
  /^([^,=:\s]+=[^,=:\s]*)(\s*,\s*[^,=:\s]+=[^,=:\s]*)*$/;
export const TAINTS_PATTERN =
  /^([^,=:\s]+(=[^,=:\s]*)?:(NoSchedule|PreferNoSchedule|NoExecute))(\s*,\s*[^,=:\s]+(=[^,=:\s]*)?:(NoSchedule|PreferNoSchedule|NoExecute))*$/;
