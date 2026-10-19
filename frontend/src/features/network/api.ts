// Queries and mutations for the Network dashboard, keyed under
// `['project', pid, 'network', ...]`: networks, subnets and ports, routers,
// floating IPs and their port forwardings, trunks, the topology payload,
// and the security groups compute shares.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  AddInterfaceRequest,
  AddInterfaceResult,
  AttachablePort,
  FloatingIp,
  FloatingIpAllocateRequest,
  FloatingIpTarget,
  HostRoute,
  InterfaceCandidate,
  Items,
  Network,
  NetworkCreateRequest,
  NetworkDetail,
  NetworkExtensions,
  NetworkOptions,
  NetworkQuota,
  Port,
  PortCreateRequest,
  PortForwarding,
  PortForwardingRequest,
  PortUpdateRequest,
  Router,
  RouterCreateRequest,
  RouterDetail,
  RuleCreate,
  RulePresets,
  SecurityGroup,
  SecurityGroupRule,
  SubnetCreateRequest,
  SubnetDetail,
  SubnetUpdateRequest,
  Topology,
  Trunk,
  TrunkCreateRequest,
  TrunkOptions,
  TrunkSubportRequest,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";
import { isTransitional } from "./status";

export function networkKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "network", ...rest] as const;
}

export type NetworkPurpose = "boot" | "router" | "any";

const POLL_MS = 5000;

function pollWhileBusy<T extends { status: string | null }>(query: {
  state: { data?: Items<T> | undefined };
}) {
  return query.state.data?.items.some(isTransitional) ? POLL_MS : false;
}

export function networksQuery(projectId: string, purpose: NetworkPurpose) {
  return queryOptions({
    queryKey: networkKey(projectId, "networks", purpose),
    queryFn: ({ signal }) =>
      apiFetch<Items<Network>>("/api/network/networks", {
        signal,
        query: { purpose },
      }),
    staleTime: staleTimes.list,
  });
}

/** The Networks panel listing: every network the user may use, plus the
 * floating networks, classic first (Horizon's project networks table). */
export function panelNetworksQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "networks", "panel"),
    queryFn: ({ signal }) =>
      apiFetch<Items<Network>>("/api/network/networks", {
        signal,
        query: { purpose: "any", external: "true" },
      }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: pollWhileBusy,
  });
}

export function networkQuery(projectId: string, networkId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "networks", "detail", networkId),
    queryFn: ({ signal }) =>
      apiFetch<NetworkDetail>(`/api/network/networks/${networkId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function subnetQuery(projectId: string, subnetId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "subnets", subnetId),
    queryFn: ({ signal }) =>
      apiFetch<SubnetDetail>(`/api/network/subnets/${subnetId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function portQuery(projectId: string, portId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "ports", "detail", portId),
    queryFn: ({ signal }) =>
      apiFetch<Port>(`/api/network/ports/${portId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function attachablePortsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "ports", "boot"),
    queryFn: ({ signal }) =>
      apiFetch<Items<AttachablePort>>("/api/network/ports", {
        signal,
        query: { purpose: "boot" },
      }),
    staleTime: staleTimes.list,
  });
}

export function networkOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "options"),
    queryFn: ({ signal }) =>
      apiFetch<NetworkOptions>("/api/network/options", { signal }),
    staleTime: staleTimes.list,
  });
}

export function networkExtensionsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "extensions"),
    queryFn: ({ signal }) =>
      apiFetch<NetworkExtensions>("/api/network/extensions", { signal }),
    staleTime: staleTimes.static,
  });
}

export function networkQuotaQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "quota"),
    queryFn: ({ signal }) =>
      apiFetch<NetworkQuota>("/api/network/quota", { signal }),
    staleTime: staleTimes.list,
  });
}

export function topologyQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "topology"),
    queryFn: ({ signal }) =>
      apiFetch<Topology>("/api/network/topology", { signal }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
  });
}

export function routersQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "routers"),
    queryFn: ({ signal }) =>
      apiFetch<Items<Router>>("/api/network/routers", { signal }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: pollWhileBusy,
  });
}

export function routerQuery(projectId: string, routerId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "routers", routerId),
    queryFn: ({ signal }) =>
      apiFetch<RouterDetail>(`/api/network/routers/${routerId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function interfaceCandidatesQuery(projectId: string, routerId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "routers", routerId, "candidates"),
    queryFn: ({ signal }) =>
      apiFetch<Items<InterfaceCandidate>>(
        `/api/network/routers/${routerId}/interface-candidates`,
        { signal },
      ),
    staleTime: 0,
  });
}

export function floatingIpsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "floating-ips"),
    queryFn: ({ signal }) =>
      apiFetch<Items<FloatingIp>>("/api/network/floating-ips", { signal }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
  });
}

export function floatingIpTargetsQuery(projectId: string, instanceId?: string) {
  return queryOptions({
    queryKey: networkKey(
      projectId,
      "floating-ips",
      "targets",
      instanceId ?? "",
    ),
    queryFn: ({ signal }) =>
      apiFetch<Items<FloatingIpTarget>>("/api/network/floating-ips/targets", {
        signal,
        query: instanceId ? { instance_id: instanceId } : {},
      }),
    staleTime: 0,
  });
}

export function portForwardingsQuery(projectId: string, floatingIpId?: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "port-forwardings", floatingIpId ?? ""),
    queryFn: ({ signal }) =>
      apiFetch<Items<PortForwarding>>("/api/network/port-forwardings", {
        signal,
        query: floatingIpId ? { floating_ip_id: floatingIpId } : {},
      }),
    staleTime: staleTimes.list,
  });
}

export function trunksQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "trunks"),
    queryFn: ({ signal }) =>
      apiFetch<Items<Trunk>>("/api/network/trunks", { signal }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
  });
}

export function trunkQuery(projectId: string, trunkId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "trunks", trunkId),
    queryFn: ({ signal }) =>
      apiFetch<Trunk>(`/api/network/trunks/${trunkId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function trunkOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "trunks", "options"),
    queryFn: ({ signal }) =>
      apiFetch<TrunkOptions>("/api/network/trunks/options", { signal }),
    staleTime: 0,
  });
}

export function securityGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "security-groups"),
    queryFn: ({ signal }) =>
      apiFetch<Items<SecurityGroup>>("/api/network/security-groups", {
        signal,
      }),
    staleTime: staleTimes.list,
  });
}

export function securityGroupQuery(projectId: string, groupId: string) {
  return queryOptions({
    queryKey: networkKey(projectId, "security-groups", groupId),
    queryFn: ({ signal }) =>
      apiFetch<Required<SecurityGroup>>(
        `/api/network/security-groups/${groupId}`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export const rulePresetsQuery = queryOptions({
  queryKey: ["security-group-presets"],
  queryFn: ({ signal }) =>
    apiFetch<RulePresets>("/api/network/security-group-presets", { signal }),
  staleTime: Infinity,
});

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return (...rest: unknown[]) =>
    queryClient.invalidateQueries({ queryKey: networkKey(projectId, ...rest) });
}

// Floating IP changes show on the instance pages too.
function useInvalidateCompute(projectId: string) {
  const queryClient = useQueryClient();
  return (resource: string) =>
    queryClient.invalidateQueries({
      queryKey: ["project", projectId, "compute", resource],
    });
}

async function deleteAll(paths: string[]) {
  const results = await Promise.allSettled(
    paths.map((path) => apiFetch<void>(path, { method: "DELETE" })),
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}

// --- networks, subnets and ports ---------------------------------------------

export function useCreateNetwork(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: NetworkCreateRequest) =>
      apiFetch<Network>("/api/network/networks", {
        method: "POST",
        json: body,
      }),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("quota");
      await invalidate("topology");
    },
  });
}

export function useUpdateNetwork(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      networkId,
      ...body
    }: {
      networkId: string;
      name?: string;
      admin_state_up?: boolean;
    }) =>
      apiFetch<Network>(`/api/network/networks/${networkId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("networks"),
  });
}

export function useDeleteNetworks(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/networks/${id}`)),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("quota");
      await invalidate("topology");
    },
  });
}

export function useCreateSubnet(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: SubnetCreateRequest) =>
      apiFetch<SubnetDetail>("/api/network/subnets", {
        method: "POST",
        json: body,
      }),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("quota");
    },
  });
}

export function useUpdateSubnet(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      subnetId,
      ...body
    }: SubnetUpdateRequest & { subnetId: string }) =>
      apiFetch<SubnetDetail>(`/api/network/subnets/${subnetId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("subnets");
    },
  });
}

export function useDeleteSubnets(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/subnets/${id}`)),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("quota");
    },
  });
}

export function useCreatePort(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: PortCreateRequest) =>
      apiFetch<Port>("/api/network/ports", { method: "POST", json: body }),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("ports");
      await invalidate("quota");
    },
  });
}

export function useUpdatePort(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ portId, ...body }: PortUpdateRequest & { portId: string }) =>
      apiFetch<Port>(`/api/network/ports/${portId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("ports");
    },
  });
}

export function useDeletePorts(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/ports/${id}`)),
    onSettled: async () => {
      await invalidate("networks");
      await invalidate("ports");
      await invalidate("quota");
    },
  });
}

// --- routers -----------------------------------------------------------------

export function useCreateRouter(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: RouterCreateRequest) =>
      apiFetch<Router>("/api/network/routers", { method: "POST", json: body }),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("quota");
      await invalidate("topology");
    },
  });
}

export function useUpdateRouter(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      routerId,
      ...body
    }: {
      routerId: string;
      name?: string;
      admin_state_up?: boolean;
    }) =>
      apiFetch<Router>(`/api/network/routers/${routerId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("routers"),
  });
}

export function useDeleteRouters(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/routers/${id}`)),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("quota");
      await invalidate("topology");
    },
  });
}

export function useSetGateway(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      routerId,
      networkId,
    }: {
      routerId: string;
      networkId: string;
    }) =>
      apiFetch<Router>(`/api/network/routers/${routerId}/gateway`, {
        method: "PUT",
        json: { network_id: networkId },
      }),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("topology");
    },
  });
}

export function useClearGateway(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (routerId: string) =>
      apiFetch<Router>(`/api/network/routers/${routerId}/gateway`, {
        method: "DELETE",
      }),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("topology");
    },
  });
}

export function useAddInterface(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      routerId,
      ...body
    }: AddInterfaceRequest & { routerId: string }) =>
      apiFetch<AddInterfaceResult>(
        `/api/network/routers/${routerId}/interfaces`,
        { method: "POST", json: body },
      ),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("networks");
      await invalidate("topology");
    },
  });
}

export function useRemoveInterface(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ routerId, portId }: { routerId: string; portId: string }) =>
      apiFetch<void>(`/api/network/routers/${routerId}/interfaces/${portId}`, {
        method: "DELETE",
      }),
    onSettled: async () => {
      await invalidate("routers");
      await invalidate("networks");
      await invalidate("topology");
    },
  });
}

export function useSetRoutes(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      routerId,
      routes,
    }: {
      routerId: string;
      routes: HostRoute[];
    }) =>
      apiFetch<Router>(`/api/network/routers/${routerId}/routes`, {
        method: "PUT",
        json: { routes },
      }),
    onSettled: () => invalidate("routers"),
  });
}

// --- floating IPs ------------------------------------------------------------

export function useAllocateFloatingIp(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: FloatingIpAllocateRequest) =>
      apiFetch<FloatingIp>("/api/network/floating-ips", {
        method: "POST",
        json: body,
      }),
    onSettled: async () => {
      await invalidate("floating-ips");
      await invalidate("quota");
    },
  });
}

export function useAssociateFloatingIp(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: ({
      floatingIpId,
      portId,
      fixedIp,
    }: {
      floatingIpId: string;
      portId: string;
      fixedIp?: string;
    }) =>
      apiFetch<FloatingIp>(
        `/api/network/floating-ips/${floatingIpId}/associate`,
        {
          method: "POST",
          json: {
            port_id: portId,
            ...(fixedIp ? { fixed_ip_address: fixedIp } : {}),
          },
        },
      ),
    onSettled: async () => {
      await invalidate("floating-ips");
      await invalidateCompute("instances");
    },
  });
}

export function useDisassociateFloatingIp(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: (floatingIpId: string) =>
      apiFetch<FloatingIp>(
        `/api/network/floating-ips/${floatingIpId}/disassociate`,
        { method: "POST", json: {} },
      ),
    onSettled: async () => {
      await invalidate("floating-ips");
      await invalidateCompute("instances");
    },
  });
}

export function useReleaseFloatingIps(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const invalidateCompute = useInvalidateCompute(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/floating-ips/${id}`)),
    onSettled: async () => {
      await invalidate("floating-ips");
      await invalidate("quota");
      await invalidateCompute("instances");
    },
  });
}

export function useCreatePortForwarding(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      floatingIpId,
      ...body
    }: PortForwardingRequest & { floatingIpId: string }) =>
      apiFetch<PortForwarding>(
        `/api/network/floating-ips/${floatingIpId}/port-forwardings`,
        { method: "POST", json: body },
      ),
    onSettled: async () => {
      await invalidate("port-forwardings");
      await invalidate("floating-ips");
    },
  });
}

export function useUpdatePortForwarding(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      floatingIpId,
      ruleId,
      ...body
    }: Partial<PortForwardingRequest> & {
      floatingIpId: string;
      ruleId: string;
    }) =>
      apiFetch<PortForwarding>(
        `/api/network/floating-ips/${floatingIpId}/port-forwardings/${ruleId}`,
        { method: "PATCH", json: body },
      ),
    onSettled: () => invalidate("port-forwardings"),
  });
}

export function useDeletePortForwardings(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (rules: { floatingIpId: string; ruleId: string }[]) =>
      deleteAll(
        rules.map(
          (r) =>
            `/api/network/floating-ips/${r.floatingIpId}/port-forwardings/${r.ruleId}`,
        ),
      ),
    onSettled: async () => {
      await invalidate("port-forwardings");
      await invalidate("floating-ips");
    },
  });
}

// --- trunks ------------------------------------------------------------------

export function useCreateTrunk(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: TrunkCreateRequest) =>
      apiFetch<Trunk>("/api/network/trunks", { method: "POST", json: body }),
    onSettled: async () => {
      await invalidate("trunks");
      await invalidate("ports");
    },
  });
}

export function useUpdateTrunk(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      trunkId,
      ...body
    }: {
      trunkId: string;
      name?: string;
      description?: string;
      admin_state_up?: boolean;
    }) =>
      apiFetch<Trunk>(`/api/network/trunks/${trunkId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("trunks"),
  });
}

export function useDeleteTrunks(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (ids: string[]) =>
      deleteAll(ids.map((id) => `/api/network/trunks/${id}`)),
    onSettled: async () => {
      await invalidate("trunks");
      await invalidate("ports");
    },
  });
}

export function useAddSubports(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      trunkId,
      subports,
    }: {
      trunkId: string;
      subports: TrunkSubportRequest[];
    }) =>
      apiFetch<Trunk>(`/api/network/trunks/${trunkId}/subports`, {
        method: "POST",
        json: { sub_ports: subports },
      }),
    onSettled: () => invalidate("trunks"),
  });
}

export function useRemoveSubports(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      trunkId,
      portIds,
    }: {
      trunkId: string;
      portIds: string[];
    }) =>
      apiFetch<Trunk>(`/api/network/trunks/${trunkId}/subports/remove`, {
        method: "POST",
        json: { port_ids: portIds },
      }),
    onSettled: () => invalidate("trunks"),
  });
}

// --- security groups ---------------------------------------------------------

export function useCreateSecurityGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      apiFetch<SecurityGroup>("/api/network/security-groups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate("security-groups"),
  });
}

export function useUpdateSecurityGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      groupId,
      ...body
    }: {
      groupId: string;
      name?: string;
      description?: string;
    }) =>
      apiFetch<SecurityGroup>(`/api/network/security-groups/${groupId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("security-groups"),
  });
}

export function useDeleteSecurityGroups(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (groupIds: string[]) =>
      deleteAll(groupIds.map((id) => `/api/network/security-groups/${id}`)),
    onSettled: () => invalidate("security-groups"),
  });
}

export function useCreateRule(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ groupId, ...body }: RuleCreate & { groupId: string }) =>
      apiFetch<SecurityGroupRule>(
        `/api/network/security-groups/${groupId}/rules`,
        { method: "POST", json: body },
      ),
    onSettled: () => invalidate("security-groups"),
  });
}

export function useDeleteRule(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ groupId, ruleId }: { groupId: string; ruleId: string }) =>
      apiFetch<void>(
        `/api/network/security-groups/${groupId}/rules/${ruleId}`,
        { method: "DELETE" },
      ),
    onSettled: () => invalidate("security-groups"),
  });
}
