/**
 * The query keys of every cached resource, and the one way to invalidate
 * them.
 *
 * A project resource's keys start with `["project", projectId, service,
 * resource]`: a project switch drops them all at once (see switchProject),
 * and invalidating a resource's `all` key refreshes its lists, its records
 * and anything keyed under a record. Keys that need more than a list or a
 * record extend `all` or `detail` with a named segment, so they stay under
 * the resource. User resources (the user's own credentials, choices that
 * are the same in every project) live under `["user", service, resource]`
 * and survive a project switch.
 *
 * `service` is the API path segment after `/api/` and `resource` the one
 * after it, so a key reads like the request that fills it. Writes mark
 * keys stale through `useInvalidate` (lib/hooks/useInvalidate.ts).
 */
import type { QueryKey } from "@tanstack/react-query";

/** List parameters (any plain object); one cache entry per distinct value. */
export type ListParams = object;

/** Builds a key for the current project: what `useInvalidate` accepts. */
export type ProjectKeyOf = (projectId: string) => QueryKey;

/** The keys of every resource of one service in a project. */
export interface ServiceKeys {
  all: ProjectKeyOf;
}

/** The keys of one resource in a project. */
export interface ResourceKeys {
  /** The prefix of every key below: invalidate it to refresh them all. */
  all: ProjectKeyOf;
  /** The resource's list, one cache entry per distinct `params`. */
  list: (projectId: string, params?: ListParams) => QueryKey;
  /** One record; keys of its sub-resources extend this one. */
  detail: (projectId: string, id: string) => QueryKey;
}

/** The keys of one resource that belongs to the user, not to a project. */
export interface UserResourceKeys {
  all: () => QueryKey;
  list: (params?: ListParams) => QueryKey;
  detail: (id: string) => QueryKey;
}

/** The keys of one service: invalidate `all` when a write can touch any of its resources. */
export function serviceKeys(service: string): ServiceKeys {
  return { all: (projectId) => ["project", projectId, service] };
}

/** The keys of `/api/<service>/<resource>` in a project. */
export function resourceKeys(service: string, resource: string): ResourceKeys {
  const all = (projectId: string) =>
    ["project", projectId, service, resource] as const;
  return {
    all,
    list: (projectId, params) =>
      params === undefined
        ? [...all(projectId), "list"]
        : [...all(projectId), "list", params],
    detail: (projectId, id) => [...all(projectId), "detail", id],
  };
}

/** The keys of `/api/<service>/<resource>` when the data is the user's. */
export function userResourceKeys(
  service: string,
  resource: string,
): UserResourceKeys {
  const all = () => ["user", service, resource] as const;
  return {
    all,
    list: (params) =>
      params === undefined ? [...all(), "list"] : [...all(), "list", params],
    detail: (id) => [...all(), "detail", id],
  };
}

/**
 * Every cached resource, by service. A feature reads its keys here, and so
 * does a feature whose write changes what another one shows (attaching a
 * volume changes the instance's volumes).
 */
export const queryKeys = {
  allocation: {
    service: serviceKeys("allocation"),
    summary: resourceKeys("allocation", "summary"),
  },
  apiAccess: {
    service: serviceKeys("api-access"),
    credentials: resourceKeys("api-access", "credentials"),
    endpoints: resourceKeys("api-access", "endpoints"),
  },
  compute: {
    service: serviceKeys("compute"),
    availabilityZones: resourceKeys("compute", "availability-zones"),
    flavors: resourceKeys("compute", "flavors"),
    images: resourceKeys("compute", "images"),
    instances: resourceKeys("compute", "instances"),
    keyPairs: resourceKeys("compute", "keypairs"),
    launchOptions: resourceKeys("compute", "launch-options"),
    limits: resourceKeys("compute", "limits"),
    serverGroups: resourceKeys("compute", "server-groups"),
  },
  databases: {
    service: serviceKeys("databases"),
    backups: resourceKeys("databases", "backups"),
    configurations: resourceKeys("databases", "configurations"),
    instances: resourceKeys("databases", "instances"),
    options: resourceKeys("databases", "options"),
  },
  dns: {
    service: serviceKeys("dns"),
    zones: resourceKeys("dns", "zones"),
  },
  identity: {
    service: serviceKeys("identity"),
    applicationCredentialOptions: resourceKeys(
      "identity",
      "application-credential-options",
    ),
    ec2Credentials: resourceKeys("identity", "ec2-credentials"),
    members: resourceKeys("identity", "members"),
  },
  kubernetes: {
    service: serviceKeys("kubernetes"),
    clusters: resourceKeys("kubernetes", "clusters"),
    clusterTemplates: resourceKeys("kubernetes", "cluster-templates"),
    options: resourceKeys("kubernetes", "options"),
  },
  loadBalancers: {
    service: serviceKeys("load-balancers"),
    l7Policies: resourceKeys("load-balancers", "l7policies"),
    loadBalancers: resourceKeys("load-balancers", "load-balancers"),
    options: resourceKeys("load-balancers", "options"),
  },
  network: {
    service: serviceKeys("network"),
    extensions: resourceKeys("network", "extensions"),
    floatingIps: resourceKeys("network", "floating-ips"),
    networks: resourceKeys("network", "networks"),
    options: resourceKeys("network", "options"),
    portForwardings: resourceKeys("network", "port-forwardings"),
    ports: resourceKeys("network", "ports"),
    quota: resourceKeys("network", "quota"),
    routers: resourceKeys("network", "routers"),
    securityGroups: resourceKeys("network", "security-groups"),
    subnets: resourceKeys("network", "subnets"),
    topology: resourceKeys("network", "topology"),
    trunks: resourceKeys("network", "trunks"),
  },
  objectStore: {
    service: serviceKeys("object-store"),
    containers: resourceKeys("object-store", "containers"),
    info: resourceKeys("object-store", "info"),
  },
  orchestration: {
    service: serviceKeys("orchestration"),
    resourceTypes: resourceKeys("orchestration", "resource-types"),
    stacks: resourceKeys("orchestration", "stacks"),
    templateVersions: resourceKeys("orchestration", "template-versions"),
  },
  reservations: {
    service: serviceKeys("reservations"),
    options: resourceKeys("reservations", "options"),
    reservations: resourceKeys("reservations", "reservations"),
    slots: resourceKeys("reservations", "slots"),
  },
  security: {
    service: serviceKeys("security"),
    risks: resourceKeys("security", "risks"),
  },
  shares: {
    service: serviceKeys("shares"),
    groupSnapshots: resourceKeys("shares", "group-snapshots"),
    groups: resourceKeys("shares", "groups"),
    options: resourceKeys("shares", "options"),
    securityServices: resourceKeys("shares", "security-services"),
    shares: resourceKeys("shares", "shares"),
    snapshots: resourceKeys("shares", "snapshots"),
  },
  usage: {
    service: serviceKeys("usage"),
    allocation: resourceKeys("usage", "allocation"),
    instances: resourceKeys("usage", "instances"),
    summary: resourceKeys("usage", "summary"),
  },
  volumes: {
    service: serviceKeys("volumes"),
    backups: resourceKeys("volumes", "backups"),
    limits: resourceKeys("volumes", "limits"),
    options: resourceKeys("volumes", "options"),
    snapshots: resourceKeys("volumes", "snapshots"),
    volumes: resourceKeys("volumes", "volumes"),
  },
} as const;

/** Resources that belong to the user and are the same in every project. */
export const userKeys = {
  applicationCredentials: userResourceKeys(
    "identity",
    "application-credentials",
  ),
  credentials: userResourceKeys("identity", "credentials"),
  myAddress: userResourceKeys("network", "my-address"),
  securityGroupPresets: userResourceKeys("network", "security-group-presets"),
  usageOptions: userResourceKeys("usage", "options"),
  users: userResourceKeys("identity", "users"),
} as const;
