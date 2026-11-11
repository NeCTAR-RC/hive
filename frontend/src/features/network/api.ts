// Queries and mutations for the Network dashboard, keyed by
// `queryKeys.network`: networks, subnets and ports, routers, floating IPs
// and their port forwardings, trunks, the topology payload, and the
// security groups compute shares.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  AddInterfaceRequest,
  AddInterfaceResult,
  AttachablePort,
  FloatingIp,
  FloatingIpAllocateRequest,
  FloatingIpTarget,
  HostRoute,
  InterfaceCandidate,
  MyAddress,
  Network,
  NetworkCreateRequest,
  NetworkDetail,
  NetworkExtensions,
  NetworkOptions,
  NetworkQuota,
  Port,
  PortAddressPair,
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
  SecurityGroupDetail,
  SecurityGroupRule,
  SubnetCreateRequest,
  SubnetDetail,
  SubnetUpdateRequest,
  Topology,
  Trunk,
  TrunkCreateRequest,
  TrunkOptions,
  TrunkSubportRequest,
} from "../../lib/api/types/network";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys, userKeys } from "../../lib/queryKeys";
import { isTransitional } from "./status";

const keys = queryKeys.network;

export type NetworkPurpose = "boot" | "router" | "any";

function pollWhileBusy<T extends { status: string | null }>(query: {
  state: { data?: Items<T> | undefined };
}) {
  return pollWhile(query, query.state.data?.items.some(isTransitional));
}

export function networksQuery(projectId: string, purpose: NetworkPurpose) {
  return queryOptions({
    queryKey: keys.networks.list(projectId, { purpose }),
    queryFn: getJson<Items<Network>>("/api/network/networks", { purpose }),
    staleTime: staleTimes.list,
  });
}

/** The Networks panel listing: every network the user may use, plus the
 * floating networks, classic first (Horizon's project networks table). */
export function panelNetworksQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.networks.list(projectId, { purpose: "any", external: true }),
    queryFn: getJson<Items<Network>>("/api/network/networks", {
      purpose: "any",
      external: "true",
    }),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileBusy,
  });
}

export function networkQuery(projectId: string, networkId: string) {
  return queryOptions({
    queryKey: keys.networks.detail(projectId, networkId),
    queryFn: getJson<NetworkDetail>(`/api/network/networks/${networkId}`),
    staleTime: staleTimes.detail,
  });
}

export function subnetQuery(projectId: string, subnetId: string) {
  return queryOptions({
    queryKey: keys.subnets.detail(projectId, subnetId),
    queryFn: getJson<SubnetDetail>(`/api/network/subnets/${subnetId}`),
    staleTime: staleTimes.detail,
  });
}

export function portQuery(projectId: string, portId: string) {
  return queryOptions({
    queryKey: keys.ports.detail(projectId, portId),
    queryFn: getJson<Port>(`/api/network/ports/${portId}`),
    staleTime: staleTimes.detail,
  });
}

export function attachablePortsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.ports.list(projectId, { purpose: "boot" }),
    queryFn: getJson<Items<AttachablePort>>("/api/network/ports", {
      purpose: "boot",
    }),
    staleTime: staleTimes.list,
  });
}

export function networkOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<NetworkOptions>("/api/network/options"),
    staleTime: staleTimes.list,
  });
}

export function networkExtensionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.extensions.all(projectId),
    queryFn: getJson<NetworkExtensions>("/api/network/extensions"),
    staleTime: staleTimes.static,
  });
}

export function networkQuotaQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.quota.all(projectId),
    queryFn: getJson<NetworkQuota>("/api/network/quota"),
    staleTime: staleTimes.list,
  });
}

export function topologyQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.topology.all(projectId),
    queryFn: getJson<Topology>("/api/network/topology"),
    staleTime: staleTimes.list,
  });
}

export function routersQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.routers.list(projectId),
    queryFn: getJson<Items<Router>>("/api/network/routers"),
    staleTime: staleTimes.list,
    refetchInterval: pollWhileBusy,
  });
}

export function routerQuery(projectId: string, routerId: string) {
  return queryOptions({
    queryKey: keys.routers.detail(projectId, routerId),
    queryFn: getJson<RouterDetail>(`/api/network/routers/${routerId}`),
    staleTime: staleTimes.detail,
  });
}

export function interfaceCandidatesQuery(projectId: string, routerId: string) {
  return queryOptions({
    queryKey: [
      ...keys.routers.detail(projectId, routerId),
      "interface-candidates",
    ],
    queryFn: getJson<Items<InterfaceCandidate>>(
      `/api/network/routers/${routerId}/interface-candidates`,
    ),
    staleTime: staleTimes.none,
  });
}

export function floatingIpsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.floatingIps.list(projectId),
    queryFn: getJson<Items<FloatingIp>>("/api/network/floating-ips"),
    staleTime: staleTimes.list,
  });
}

export function floatingIpTargetsQuery(projectId: string, instanceId?: string) {
  return queryOptions({
    queryKey: [...keys.floatingIps.all(projectId), "targets", instanceId ?? ""],
    queryFn: getJson<Items<FloatingIpTarget>>(
      "/api/network/floating-ips/targets",
      instanceId ? { instance_id: instanceId } : {},
    ),
    staleTime: staleTimes.none,
  });
}

export function portForwardingsQuery(projectId: string, floatingIpId?: string) {
  return queryOptions({
    queryKey: keys.portForwardings.list(projectId, {
      floatingIpId: floatingIpId ?? "",
    }),
    queryFn: getJson<Items<PortForwarding>>(
      "/api/network/port-forwardings",
      floatingIpId ? { floating_ip_id: floatingIpId } : {},
    ),
    staleTime: staleTimes.list,
  });
}

export function trunksQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.trunks.list(projectId),
    queryFn: getJson<Items<Trunk>>("/api/network/trunks"),
    staleTime: staleTimes.list,
  });
}

export function trunkQuery(projectId: string, trunkId: string) {
  return queryOptions({
    queryKey: keys.trunks.detail(projectId, trunkId),
    queryFn: getJson<Trunk>(`/api/network/trunks/${trunkId}`),
    staleTime: staleTimes.detail,
  });
}

export function trunkOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...keys.trunks.all(projectId), "options"],
    queryFn: getJson<TrunkOptions>("/api/network/trunks/options"),
    staleTime: staleTimes.none,
  });
}

export function securityGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.securityGroups.list(projectId),
    queryFn: getJson<Items<SecurityGroup>>("/api/network/security-groups"),
    staleTime: staleTimes.list,
  });
}

export function securityGroupQuery(projectId: string, groupId: string) {
  return queryOptions({
    queryKey: keys.securityGroups.detail(projectId, groupId),
    queryFn: getJson<SecurityGroupDetail>(
      `/api/network/security-groups/${groupId}`,
    ),
    staleTime: staleTimes.detail,
  });
}

export const rulePresetsQuery = queryOptions({
  queryKey: userKeys.securityGroupPresets.all(),
  queryFn: getJson<RulePresets>("/api/network/security-group-presets"),
  staleTime: Infinity,
});

/**
 * The browser's own address as the backend sees it, for a security group
 * rule open to the user alone. It is the user's, not the project's, and
 * changes only when the user moves network, so it is read once a session.
 */
export const myAddressQuery = queryOptions({
  queryKey: userKeys.myAddress.all(),
  queryFn: getJson<MyAddress>("/api/network/my-address"),
  staleTime: Infinity,
});

/** What a network write marks stale: the networks, quota and topology. */
export const networkWriteKeys = [
  keys.networks.all,
  keys.quota.all,
  keys.topology.all,
];
/** What a subnet create or delete marks stale: its network and the quota. */
export const subnetWriteKeys = [keys.networks.all, keys.quota.all];
/** What a port create or delete marks stale: its network and the quota. */
export const portWriteKeys = [
  keys.networks.all,
  keys.ports.all,
  keys.quota.all,
];
/** What a router write marks stale: the routers, quota and topology. */
export const routerWriteKeys = [
  keys.routers.all,
  keys.quota.all,
  keys.topology.all,
];
/** What a router interface write marks stale: both ends and the topology. */
export const routerInterfaceWriteKeys = [
  keys.routers.all,
  keys.networks.all,
  keys.topology.all,
];
/** What a change to a router's static routes marks stale. */
export const routerRouteWriteKeys = [keys.routers.all];
/** What a floating IP write marks stale, the instances it reaches too. */
export const floatingIpWriteKeys = [
  keys.floatingIps.all,
  keys.quota.all,
  queryKeys.compute.instances.all,
];
/** What a port forwarding write marks stale, its IP's rule count too. */
export const portForwardingWriteKeys = [
  keys.portForwardings.all,
  keys.floatingIps.all,
];
/** What a trunk or subport write marks stale, the ports it binds too. */
export const trunkWriteKeys = [keys.trunks.all, keys.ports.all];
/** What a security group or rule write marks stale. */
export const securityGroupWriteKeys = [keys.securityGroups.all];

export function useCreateNetwork() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: NetworkCreateRequest) =>
      apiFetch<Network>("/api/network/networks", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...networkWriteKeys),
  });
}

export function useUpdateNetwork() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.networks.all),
  });
}

/** Deletes one network; a batch sends it per network. */
export function deleteNetwork(networkId: string) {
  return apiFetch<void>(`/api/network/networks/${networkId}`, {
    method: "DELETE",
  });
}

export function useCreateSubnet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: SubnetCreateRequest) =>
      apiFetch<SubnetDetail>("/api/network/subnets", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...subnetWriteKeys),
  });
}

export function useUpdateSubnet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      subnetId,
      ...body
    }: SubnetUpdateRequest & { subnetId: string }) =>
      apiFetch<SubnetDetail>(`/api/network/subnets/${subnetId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate(keys.networks.all, keys.subnets.all),
  });
}

/** Deletes one subnet; a batch sends it per subnet. */
export function deleteSubnet(subnetId: string) {
  return apiFetch<void>(`/api/network/subnets/${subnetId}`, {
    method: "DELETE",
  });
}

export function useCreatePort() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: PortCreateRequest) =>
      apiFetch<Port>("/api/network/ports", { method: "POST", json: body }),
    onSettled: () => invalidate(...portWriteKeys),
  });
}

export function useUpdatePort() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ portId, ...body }: PortUpdateRequest & { portId: string }) =>
      apiFetch<Port>(`/api/network/ports/${portId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate(keys.networks.all, keys.ports.all),
  });
}

/**
 * Replaces a port's allowed address pairs with `pairs`. Neutron keeps the
 * list whole, so adding or deleting pairs sends the list that should
 * remain.
 */
export function setAllowedAddressPairs(
  portId: string,
  pairs: PortAddressPair[],
) {
  return apiFetch<Port>(`/api/network/ports/${portId}/allowed-address-pairs`, {
    method: "PUT",
    json: {
      pairs: pairs.map((pair) =>
        pair.mac_address
          ? { ip_address: pair.ip_address, mac_address: pair.mac_address }
          : { ip_address: pair.ip_address },
      ),
    },
  });
}

export function useSetAllowedAddressPairs() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      portId,
      pairs,
    }: {
      portId: string;
      pairs: PortAddressPair[];
    }) => setAllowedAddressPairs(portId, pairs),
    onSettled: () => invalidate(keys.ports.all),
  });
}

/** Deletes one port; a batch sends it per port. */
export function deletePort(portId: string) {
  return apiFetch<void>(`/api/network/ports/${portId}`, { method: "DELETE" });
}

export function useCreateRouter() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: RouterCreateRequest) =>
      apiFetch<Router>("/api/network/routers", { method: "POST", json: body }),
    onSettled: () => invalidate(...routerWriteKeys),
  });
}

export function useUpdateRouter() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.routers.all),
  });
}

/** Deletes one router; a batch sends it per router. */
export function deleteRouter(routerId: string) {
  return apiFetch<void>(`/api/network/routers/${routerId}`, {
    method: "DELETE",
  });
}

export function useSetGateway() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.routers.all, keys.topology.all),
  });
}

/** Clears one router's external gateway; a batch sends it per router. */
export function clearGateway(routerId: string) {
  return apiFetch<Router>(`/api/network/routers/${routerId}/gateway`, {
    method: "DELETE",
  });
}

export function useAddInterface() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      routerId,
      ...body
    }: AddInterfaceRequest & { routerId: string }) =>
      apiFetch<AddInterfaceResult>(
        `/api/network/routers/${routerId}/interfaces`,
        { method: "POST", json: body },
      ),
    onSettled: () => invalidate(...routerInterfaceWriteKeys),
  });
}

/**
 * Removes one interface (or the gateway port) from a router; a batch sends
 * it per interface.
 */
export function removeInterface(routerId: string, portId: string) {
  return apiFetch<void>(
    `/api/network/routers/${routerId}/interfaces/${portId}`,
    { method: "DELETE" },
  );
}

/**
 * Replaces a router's static routes with `routes`. Neutron keeps the list
 * whole, so adding or deleting routes sends the list that should remain.
 */
export function setRouterRoutes(routerId: string, routes: HostRoute[]) {
  return apiFetch<Router>(`/api/network/routers/${routerId}/routes`, {
    method: "PUT",
    json: { routes },
  });
}

export function useSetRoutes() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      routerId,
      routes,
    }: {
      routerId: string;
      routes: HostRoute[];
    }) => setRouterRoutes(routerId, routes),
    onSettled: () => invalidate(...routerRouteWriteKeys),
  });
}

export function useAllocateFloatingIp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: FloatingIpAllocateRequest) =>
      apiFetch<FloatingIp>("/api/network/floating-ips", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...floatingIpWriteKeys),
  });
}

/**
 * The floating IP to associate: one the project holds, or a new one
 * allocated from a pool first (`allocateFrom`, the floating network).
 */
export type AssociateFloatingIpVariables = {
  portId: string;
  fixedIp?: string;
} & ({ floatingIpId: string } | { allocateFrom: string });

/** Associates a floating IP the project holds with a port address. */
function associateFloatingIp(
  floatingIpId: string,
  portId: string,
  fixedIp: string | undefined,
) {
  return apiFetch<FloatingIp>(
    `/api/network/floating-ips/${floatingIpId}/associate`,
    {
      method: "POST",
      json: {
        port_id: portId,
        ...(fixedIp ? { fixed_ip_address: fixedIp } : {}),
      },
    },
  );
}

/**
 * Associates a floating IP with a port, allocating it first when asked
 * (Horizon's "+" beside the IP list in the associate form). When the
 * allocation succeeds but the association does not, the error names the
 * new address, which stays with the project.
 */
export function useAssociateFloatingIp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (variables: AssociateFloatingIpVariables) => {
      if ("floatingIpId" in variables) {
        return associateFloatingIp(
          variables.floatingIpId,
          variables.portId,
          variables.fixedIp,
        );
      }
      const allocated = await apiFetch<FloatingIp>(
        "/api/network/floating-ips",
        {
          method: "POST",
          json: { floating_network_id: variables.allocateFrom },
        },
      );
      try {
        return await associateFloatingIp(
          allocated.id,
          variables.portId,
          variables.fixedIp,
        );
      } catch (error) {
        // Keeps the error's kind (a 401 still ends the session) and says
        // which address is now the project's.
        if (error instanceof Error) {
          error.message = `allocated ${allocated.floating_ip_address ?? allocated.id}, but could not associate it: ${error.message}`;
        }
        throw error;
      }
    },
    onSettled: () => invalidate(...floatingIpWriteKeys),
  });
}

/** Disassociates one floating IP from its port; it stays allocated. */
export function disassociateFloatingIp(floatingIpId: string) {
  return apiFetch<FloatingIp>(
    `/api/network/floating-ips/${floatingIpId}/disassociate`,
    { method: "POST" },
  );
}

export function useDisassociateFloatingIp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: disassociateFloatingIp,
    onSettled: () => invalidate(...floatingIpWriteKeys),
  });
}

/** Releases one floating IP from the project; a batch sends it per IP. */
export function releaseFloatingIp(floatingIpId: string) {
  return apiFetch<void>(`/api/network/floating-ips/${floatingIpId}`, {
    method: "DELETE",
  });
}

export function useCreatePortForwarding() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      floatingIpId,
      ...body
    }: PortForwardingRequest & { floatingIpId: string }) =>
      apiFetch<PortForwarding>(
        `/api/network/floating-ips/${floatingIpId}/port-forwardings`,
        { method: "POST", json: body },
      ),
    onSettled: () => invalidate(...portForwardingWriteKeys),
  });
}

export function useUpdatePortForwarding() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.portForwardings.all),
  });
}

/** Deletes one port forwarding rule; a batch sends it per rule. */
export function deletePortForwarding(floatingIpId: string, ruleId: string) {
  return apiFetch<void>(
    `/api/network/floating-ips/${floatingIpId}/port-forwardings/${ruleId}`,
    { method: "DELETE" },
  );
}

export function useCreateTrunk() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: TrunkCreateRequest) =>
      apiFetch<Trunk>("/api/network/trunks", { method: "POST", json: body }),
    onSettled: () => invalidate(...trunkWriteKeys),
  });
}

export function useUpdateTrunk() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(keys.trunks.all),
  });
}

/** Deletes one trunk; a batch sends it per trunk. */
export function deleteTrunk(trunkId: string) {
  return apiFetch<void>(`/api/network/trunks/${trunkId}`, { method: "DELETE" });
}

export function useAddSubports() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(...trunkWriteKeys),
  });
}

/** Removes subports from a trunk in one request; the ports themselves stay. */
export function removeSubports(trunkId: string, portIds: string[]) {
  return apiFetch<Trunk>(`/api/network/trunks/${trunkId}/subports/remove`, {
    method: "POST",
    json: { port_ids: portIds },
  });
}

export function useCreateSecurityGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      apiFetch<SecurityGroupDetail>("/api/network/security-groups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...securityGroupWriteKeys),
  });
}

export function useUpdateSecurityGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      groupId,
      ...body
    }: {
      groupId: string;
      name?: string;
      description?: string;
    }) =>
      apiFetch<SecurityGroupDetail>(`/api/network/security-groups/${groupId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate(...securityGroupWriteKeys),
  });
}

/** Deletes one security group; a batch sends it per group. */
export function deleteSecurityGroup(groupId: string) {
  return apiFetch<void>(`/api/network/security-groups/${groupId}`, {
    method: "DELETE",
  });
}

export function useCreateRule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ groupId, ...body }: RuleCreate & { groupId: string }) =>
      apiFetch<SecurityGroupRule>(
        `/api/network/security-groups/${groupId}/rules`,
        { method: "POST", json: body },
      ),
    onSettled: () => invalidate(...securityGroupWriteKeys),
  });
}

/** Deletes one rule from a security group; a batch sends it per rule. */
export function deleteSecurityGroupRule(groupId: string, ruleId: string) {
  return apiFetch<void>(
    `/api/network/security-groups/${groupId}/rules/${ruleId}`,
    { method: "DELETE" },
  );
}
