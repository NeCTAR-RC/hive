// Queries and mutations for the Load Balancers panel (Octavia), keyed by
// `queryKeys.loadBalancers`. Lists poll while anything is PENDING, as the
// Angular panel reloads with a backoff. Every write refreshes the whole
// service and the floating IPs, which a load balancer's VIP can hold
// (`loadBalancerWriteKeys`).
import { queryOptions, useMutation } from "@tanstack/react-query";
import { ApiError, apiFetch, type ApiInit } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  HealthMonitor,
  L7Policy,
  L7PolicyCreate,
  L7PolicyDetail,
  L7PolicyUpdate,
  L7Rule,
  L7RuleSpec,
  L7RuleUpdate,
  Listener,
  ListenerCreate,
  ListenerUpdate,
  LoadBalancer,
  LoadBalancerCreateRequest,
  LoadBalancerOptions,
  LoadBalancerTree,
  Member,
  MemberSpec,
  MemberUpdate,
  MonitorCreate,
  MonitorUpdate,
  Pool,
  PoolCreate,
  PoolUpdate,
} from "../../lib/api/types/loadbalancers";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";
import { isChainRunning, isPolicyPending, isTreePending } from "./status";

const keys = queryKeys.loadBalancers;

const BASE = "/api/load-balancers";

export function loadBalancersQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.loadBalancers.list(projectId),
    queryFn: getJson<Items<LoadBalancer>>(BASE),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((lb) => lb.is_transitional),
      ),
  });
}

export function loadBalancerTreeQuery(projectId: string, lbId: string) {
  return queryOptions({
    queryKey: [...keys.loadBalancers.detail(projectId, lbId), "tree"],
    queryFn: getJson<LoadBalancerTree>(`${BASE}/${lbId}/tree`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) => {
      const data = query.state.data;
      return pollWhile(
        query,
        data && (isChainRunning(data.chain) || isTreePending(data)),
      );
    },
  });
}

export function loadBalancerOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<LoadBalancerOptions>(`${BASE}/options`),
    staleTime: staleTimes.list,
  });
}

export function l7PolicyQuery(projectId: string, policyId: string) {
  return queryOptions({
    queryKey: keys.l7Policies.detail(projectId, policyId),
    queryFn: getJson<L7PolicyDetail>(`${BASE}/l7policies/${policyId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data && isPolicyPending(query.state.data)),
  });
}

/** A change refused while the load balancer is busy, in the panel's words. */
export const BUSY_MESSAGE =
  "The load balancer is applying another change. Try again once it is Active.";

/**
 * Sends one write of the panel. Octavia refuses every change while the
 * load balancer is PENDING_*, and the backend answers `load_balancer_busy`
 * in Octavia's status names; the panel says it in its own words
 * (`BUSY_MESSAGE`), and the refetch that ends every write shows the lock.
 */
export async function lbWrite<T>(path: string, init: ApiInit): Promise<T> {
  try {
    return await apiFetch<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.code === "load_balancer_busy") {
      throw new ApiError(error.status, {
        error: error.code,
        message: BUSY_MESSAGE,
        service: error.service,
        request_id: error.requestId,
      });
    }
    throw error;
  }
}

/** What every write makes stale: the service and the floating IPs. */
export const loadBalancerWriteKeys = [
  keys.service.all,
  queryKeys.network.floatingIps.all,
];

export function useCreateLoadBalancer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: LoadBalancerCreateRequest) =>
      lbWrite<LoadBalancer>(BASE, { method: "POST", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateLoadBalancer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      description?: string;
      admin_state_up?: boolean;
    }) =>
      lbWrite<LoadBalancer>(`${BASE}/${id}`, { method: "PATCH", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one load balancer with its children; a batch sends it per item. */
export function deleteLoadBalancer(id: string) {
  return lbWrite<void>(`${BASE}/${id}`, { method: "DELETE" });
}

export function useAssociateLbFloatingIp() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      floatingIpId,
      poolId,
    }: {
      id: string;
      floatingIpId?: string;
      poolId?: string;
    }) =>
      lbWrite<unknown>(`${BASE}/${id}/floating-ip`, {
        method: "POST",
        json: { floating_ip_id: floatingIpId ?? null, pool_id: poolId ?? null },
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Takes the floating IP off a load balancer's VIP; the IP stays allocated. */
export function disassociateLbFloatingIp(id: string) {
  return lbWrite<unknown>(`${BASE}/${id}/floating-ip`, { method: "DELETE" });
}

export function useCreateListener() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ListenerCreate) =>
      lbWrite<Listener>(`${BASE}/listeners`, { method: "POST", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateListener() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ListenerUpdate) =>
      lbWrite<Listener>(`${BASE}/listeners/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one listener with its L7 policies. */
export function deleteListener(id: string) {
  return lbWrite<void>(`${BASE}/listeners/${id}`, { method: "DELETE" });
}

export function useCreatePool() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: PoolCreate) =>
      lbWrite<Pool>(`${BASE}/pools`, { method: "POST", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdatePool() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PoolUpdate) =>
      lbWrite<Pool>(`${BASE}/pools/${id}`, { method: "PATCH", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one pool with its members and health monitor. */
export function deletePool(id: string) {
  return lbWrite<void>(`${BASE}/pools/${id}`, { method: "DELETE" });
}

export function useAddMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      lbId,
      poolId,
      ...body
    }: MemberSpec & { lbId: string; poolId: string }) =>
      lbWrite<Member>(`${BASE}/${lbId}/pools/${poolId}/members`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      poolId,
      memberId,
      ...body
    }: { poolId: string; memberId: string } & MemberUpdate) =>
      lbWrite<Member>(`${BASE}/pools/${poolId}/members/${memberId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Removes one member from its pool. */
export function deleteMember(poolId: string, memberId: string) {
  return lbWrite<void>(`${BASE}/pools/${poolId}/members/${memberId}`, {
    method: "DELETE",
  });
}

export function useCreateMonitor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: MonitorCreate) =>
      lbWrite<HealthMonitor>(`${BASE}/monitors`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateMonitor() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & MonitorUpdate) =>
      lbWrite<HealthMonitor>(`${BASE}/monitors/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one health monitor; its pool's members are no longer checked. */
export function deleteMonitor(id: string) {
  return lbWrite<void>(`${BASE}/monitors/${id}`, { method: "DELETE" });
}

export function useCreateL7Policy() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: L7PolicyCreate) =>
      lbWrite<L7Policy>(`${BASE}/l7policies`, { method: "POST", json: body }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateL7Policy() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & L7PolicyUpdate) =>
      lbWrite<L7Policy>(`${BASE}/l7policies/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one L7 policy with its rules. */
export function deleteL7Policy(id: string) {
  return lbWrite<void>(`${BASE}/l7policies/${id}`, { method: "DELETE" });
}

export function useCreateL7Rule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ policyId, ...body }: L7RuleSpec & { policyId: string }) =>
      lbWrite<L7Rule>(`${BASE}/l7policies/${policyId}/rules`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

export function useUpdateL7Rule() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      policyId,
      ruleId,
      ...body
    }: L7RuleUpdate & { policyId: string; ruleId: string }) =>
      lbWrite<L7Rule>(`${BASE}/l7policies/${policyId}/rules/${ruleId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => void invalidate(...loadBalancerWriteKeys),
  });
}

/** Deletes one rule of an L7 policy. */
export function deleteL7Rule(policyId: string, ruleId: string) {
  return lbWrite<void>(`${BASE}/l7policies/${policyId}/rules/${ruleId}`, {
    method: "DELETE",
  });
}
