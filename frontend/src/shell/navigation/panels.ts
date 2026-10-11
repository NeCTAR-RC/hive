// The sidebar is rendered from this registry. A panel is `built` once it has
// a Hive route, `linkout` while users still go to Horizon for it, and
// `hidden` when it should not appear at all. `requires` names the service
// capability (from /api/me) that must be present; `roles` the capability
// flags; `hideForTrial` hides it for `pt-` projects; `requiresExtension`
// names a neutron extension (from /api/network/extensions) the cloud must
// offer, as Horizon shows Trunks and Port Forwardings only when it does.
import type {
  AllocationSummary,
  Me,
  NetworkExtensions,
  ServiceKey,
} from "../../lib/api/types";

export type PanelStatus = "built" | "linkout" | "hidden";

export interface Panel {
  id: string;
  label: string;
  status: PanelStatus;
  /** Hive route when built. */
  to?: string;
  /** Horizon path, used for link-outs and the redirect map test. */
  horizonPath: string;
  requires?: ServiceKey[];
  requiresExtension?: keyof NetworkExtensions;
  roles?: ("tenantmanager" | "user_lookup")[];
  hideForTrial?: boolean;
  /** Shown only once the allocation summary reports an SU budget above
   * zero (nectar_dashboard allocation_usage/panel.py:13-26). */
  requiresBudget?: boolean;
}

export interface PanelGroup {
  id: string;
  label: string;
  panels: Panel[];
}

export interface Dashboard {
  id: string;
  label: string;
  groups: PanelGroup[];
}

export const HOME: Panel = {
  id: "home",
  label: "Home",
  status: "built",
  to: "/",
  horizonPath: "/dashboard_home/",
};

export const DASHBOARDS: Dashboard[] = [
  {
    id: "project",
    label: "Project",
    groups: [
      {
        id: "compute",
        label: "Compute",
        panels: [
          {
            id: "overview",
            label: "Overview",
            status: "built",
            to: "/compute/overview",
            horizonPath: "/project/",
            requires: ["compute"],
          },
          {
            id: "instances",
            label: "Instances",
            status: "built",
            to: "/compute/instances",
            horizonPath: "/project/instances/",
            requires: ["compute"],
          },
          {
            id: "images",
            label: "Images",
            status: "built",
            to: "/compute/images",
            horizonPath: "/project/images/",
            requires: ["image"],
          },
          {
            id: "key-pairs",
            label: "Key Pairs",
            status: "built",
            to: "/compute/key-pairs",
            horizonPath: "/project/key_pairs/",
            requires: ["compute"],
          },
          {
            id: "server-groups",
            label: "Server Groups",
            status: "built",
            to: "/compute/server-groups",
            horizonPath: "/project/server_groups/",
            requires: ["compute"],
          },
          {
            id: "reservations",
            label: "Reservations",
            status: "built",
            to: "/reservations",
            horizonPath: "/project/reservations/",
            requires: ["reservation"],
          },
        ],
      },
      {
        id: "volumes",
        label: "Volumes",
        panels: [
          {
            id: "volumes",
            label: "Volumes",
            status: "built",
            to: "/storage/volumes",
            horizonPath: "/project/volumes/",
            requires: ["volume"],
          },
          {
            id: "snapshots",
            label: "Snapshots",
            status: "built",
            to: "/storage/snapshots",
            horizonPath: "/project/snapshots/",
            requires: ["volume"],
          },
          {
            id: "backups",
            label: "Backups",
            status: "built",
            to: "/storage/backups",
            horizonPath: "/project/backups/",
            requires: ["volume"],
          },
        ],
      },
      {
        id: "container-infra",
        label: "Container Infra",
        panels: [
          {
            id: "clusters",
            label: "Clusters",
            status: "built",
            to: "/kubernetes/clusters",
            horizonPath: "/project/clusters/",
            requires: ["container-infra"],
          },
          {
            id: "cluster-templates",
            label: "Cluster Templates",
            status: "built",
            to: "/kubernetes/cluster-templates",
            horizonPath: "/project/cluster_templates/",
            requires: ["container-infra"],
          },
        ],
      },
      {
        id: "network",
        label: "Network",
        panels: [
          {
            id: "topology",
            label: "Network Topology",
            status: "built",
            to: "/network/topology",
            horizonPath: "/project/network_topology/",
            requires: ["network"],
          },
          {
            id: "networks",
            label: "Networks",
            status: "built",
            to: "/network/networks",
            horizonPath: "/project/networks/",
            requires: ["network"],
          },
          {
            id: "routers",
            label: "Routers",
            status: "built",
            to: "/network/routers",
            horizonPath: "/project/routers/",
            requires: ["network"],
          },
          {
            id: "security-groups",
            label: "Security Groups",
            status: "built",
            to: "/network/security-groups",
            horizonPath: "/project/security_groups/",
            requires: ["network"],
          },
          {
            id: "floating-ips",
            label: "Floating IPs",
            status: "built",
            to: "/network/floating-ips",
            horizonPath: "/project/floating_ips/",
            requires: ["network"],
          },
          {
            id: "port-forwardings",
            label: "Port Forwardings",
            status: "built",
            to: "/network/port-forwardings",
            horizonPath: "/project/floating_ip_portforwardings/",
            requires: ["network"],
            requiresExtension: "port_forwarding",
          },
          {
            id: "trunks",
            label: "Trunks",
            status: "built",
            to: "/network/trunks",
            horizonPath: "/project/trunks/",
            requires: ["network"],
            requiresExtension: "trunk",
          },
          {
            id: "load-balancers",
            label: "Load Balancers",
            status: "built",
            to: "/load-balancers",
            horizonPath: "/project/load_balancer/",
            requires: ["load-balancer"],
          },
        ],
      },
      {
        id: "object-store",
        label: "Object Store",
        panels: [
          {
            id: "containers",
            label: "Containers",
            status: "built",
            to: "/object-store/containers",
            horizonPath: "/project/containers/",
            requires: ["object-store"],
          },
        ],
      },
      {
        id: "database",
        label: "Database",
        panels: [
          {
            id: "database-instances",
            label: "Instances",
            status: "built",
            to: "/databases/instances",
            horizonPath: "/project/databases/",
            requires: ["database"],
          },
          {
            id: "database-backups",
            label: "Backups",
            status: "built",
            to: "/databases/backups",
            horizonPath: "/project/database_backups/",
            requires: ["database"],
          },
          {
            id: "database-configurations",
            label: "Configuration Groups",
            status: "built",
            to: "/databases/configuration-groups",
            horizonPath: "/project/database_configurations/",
            requires: ["database"],
          },
        ],
      },
      {
        id: "usage",
        label: "Usage",
        panels: [
          {
            id: "usage-trend",
            label: "Usage Trend",
            status: "built",
            to: "/usage/trend",
            horizonPath: "/project/usage-trend/",
            requires: ["rating"],
          },
          {
            id: "allocation-usage",
            label: "Allocation Usage",
            status: "built",
            to: "/usage/allocation",
            horizonPath: "/project/allocation-usage/",
            requires: ["rating"],
            hideForTrial: true,
            requiresBudget: true,
          },
        ],
      },
      {
        id: "orchestration",
        label: "Orchestration",
        panels: [
          {
            id: "stacks",
            label: "Stacks",
            status: "built",
            to: "/orchestration/stacks",
            horizonPath: "/project/stacks/",
            requires: ["orchestration"],
          },
          {
            id: "resource-types",
            label: "Resource Types",
            status: "built",
            to: "/orchestration/resource-types",
            horizonPath: "/project/stacks/resource_types/",
            requires: ["orchestration"],
          },
          {
            id: "template-versions",
            label: "Template Versions",
            status: "built",
            to: "/orchestration/template-versions",
            horizonPath: "/project/stacks/template_versions/",
            requires: ["orchestration"],
          },
        ],
      },
      {
        id: "dns",
        label: "DNS",
        panels: [
          {
            id: "zones",
            label: "Zones",
            status: "built",
            to: "/dns/zones",
            horizonPath: "/project/dnszones/",
            requires: ["dns"],
          },
        ],
      },
      {
        id: "share",
        label: "Share",
        panels: [
          {
            id: "shares",
            label: "Shares",
            status: "built",
            to: "/shares/shares",
            horizonPath: "/project/shares/",
            requires: ["share"],
          },
          {
            id: "share-snapshots",
            label: "Snapshots",
            status: "built",
            to: "/shares/snapshots",
            horizonPath: "/project/share_snapshots/",
            requires: ["share"],
          },
          {
            id: "security-services",
            label: "Security Services",
            status: "built",
            to: "/shares/security-services",
            horizonPath: "/project/security_services/",
            requires: ["share"],
          },
          {
            id: "share-groups",
            label: "Share Groups",
            status: "built",
            to: "/shares/share-groups",
            horizonPath: "/project/share_groups/",
            requires: ["share"],
          },
          {
            id: "share-group-snapshots",
            label: "Share Group Snapshots",
            status: "built",
            to: "/shares/share-group-snapshots",
            horizonPath: "/project/share_group_snapshots/",
            requires: ["share"],
          },
        ],
      },
      {
        id: "project-other",
        label: "",
        panels: [
          {
            id: "api-access",
            label: "API Access",
            status: "built",
            to: "/api-access",
            horizonPath: "/project/api_access/",
          },
          {
            id: "security-risks",
            label: "Security Risks",
            status: "built",
            to: "/security/risks",
            horizonPath: "/project/security/",
            requires: ["security"],
          },
        ],
      },
    ],
  },
  {
    id: "identity",
    label: "Identity",
    groups: [
      {
        id: "identity-default",
        label: "",
        panels: [
          {
            id: "application-credentials",
            label: "Application Credentials",
            status: "built",
            to: "/identity/application-credentials",
            horizonPath: "/identity/application_credentials/",
          },
          {
            id: "credentials",
            label: "Credentials",
            status: "built",
            to: "/identity/credentials",
            horizonPath: "/identity/credentials/",
          },
          {
            id: "members",
            label: "Project Members",
            status: "built",
            to: "/members",
            horizonPath: "/identity/members/",
            roles: ["tenantmanager"],
          },
          {
            id: "user-lookup",
            label: "User Details",
            status: "built",
            to: "/identity/user-lookup",
            horizonPath: "/identity/lookup/",
            roles: ["user_lookup"],
          },
        ],
      },
    ],
  },
  {
    id: "allocations",
    label: "Allocations",
    groups: [
      {
        id: "allocations-default",
        label: "",
        panels: [
          {
            id: "allocation-request",
            label: "New Request",
            status: "linkout",
            horizonPath: "/allocation/request/",
          },
          {
            id: "allocation-user-requests",
            label: "My Requests",
            status: "linkout",
            horizonPath: "/allocation/user_requests/",
          },
        ],
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    groups: [
      {
        id: "account-default",
        label: "",
        panels: [
          {
            id: "my-details",
            label: "My Details",
            status: "built",
            to: "/account/my-details",
            horizonPath: "/settings/my-details/",
          },
          {
            id: "reset-password",
            label: "Reset Password",
            status: "built",
            to: "/account/reset-password",
            horizonPath: "/settings/reset-password/",
          },
        ],
      },
    ],
  },
];

export function panelVisible(
  panel: Panel,
  me: Me | undefined,
  extensions?: NetworkExtensions | undefined,
  allocation?: AllocationSummary | undefined,
): boolean {
  if (panel.status === "hidden") return false;
  if (!me) return !panel.requires && !panel.roles;
  if (panel.requires?.some((key) => !me.capabilities.services[key])) {
    return false;
  }
  if (panel.requiresExtension && !extensions?.[panel.requiresExtension]) {
    return false;
  }
  if (panel.roles?.some((role) => !me.capabilities[role])) return false;
  if (panel.hideForTrial && me.project.is_trial) return false;
  if (panel.requiresBudget) {
    const budget = allocation?.su_budget ?? null;
    if (budget === null || budget <= 0) return false;
  }
  return true;
}

export function linkoutHref(horizonUrl: string, panel: Panel): string {
  return horizonUrl.replace(/\/$/, "") + panel.horizonPath;
}

export function allPanels(): Panel[] {
  return [
    HOME,
    ...DASHBOARDS.flatMap((d) => d.groups.flatMap((g) => g.panels)),
  ];
}
