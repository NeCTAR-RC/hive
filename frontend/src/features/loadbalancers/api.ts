// Queries and mutations for the Load Balancers panel (Octavia), keyed
// under `['project', pid, 'lbaas', ...]`. Lists poll while anything is
// PENDING, as the Angular panel reloads with a backoff.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ApiError, apiFetch } from "../../lib/api/client";
import type {
  HealthMonitor,
  Items,
  L7Policy,
  L7PolicySpec,
  L7Rule,
  L7RuleSpec,
  Listener,
  ListenerSpec,
  ListenerUpdate,
  LoadBalancer,
  LoadBalancerCreateRequest,
  LoadBalancerOptions,
  LoadBalancerTree,
  Member,
  MemberSpec,
  MemberUpdate,
  MonitorSpec,
  Pool,
  PoolSpec,
  PoolUpdate,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function lbKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "lbaas", ...rest] as const;
}

const BASE = "/api/load-balancers";
const POLL_MS = 5000;

function busy(status: string | null | undefined): boolean {
  return Boolean(status && status.startsWith("PENDING_"));
}

/** The backend's 409 for a change asked of a load balancer that is not
 * ACTIVE (`load_balancer_busy`); the controls stay disabled while the
 * load balancer is transitional, so this is a race the user can retry. */
export function isLoadBalancerBusy(error: unknown): boolean {
  return error instanceof ApiError && error.code === "load_balancer_busy";
}

export function loadBalancersQuery(projectId: string) {
  return queryOptions({
    queryKey: lbKey(projectId, "list"),
    queryFn: ({ signal }) => apiFetch<Items<LoadBalancer>>(BASE, { signal }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((lb) => lb.is_transitional)
        ? POLL_MS
        : false,
  });
}

export function loadBalancerTreeQuery(projectId: string, lbId: string) {
  return queryOptions({
    queryKey: lbKey(projectId, "tree", lbId),
    queryFn: ({ signal }) =>
      apiFetch<LoadBalancerTree>(`${BASE}/${lbId}/tree`, { signal }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const chainRunning =
        data.chain &&
        !data.chain.error &&
        data.chain.done.length < data.chain.steps.length;
      const pending =
        busy(data.load_balancer.provisioning_status) ||
        data.listeners.some((l) => busy(l.provisioning_status)) ||
        data.pools.some(
          (p) =>
            busy(p.provisioning_status) ||
            (p.member_rows ?? []).some((m) => busy(m.provisioning_status)),
        ) ||
        data.monitors.some((m) => busy(m.provisioning_status)) ||
        data.l7policies.some((p) => busy(p.provisioning_status));
      return chainRunning || pending ? POLL_MS : false;
    },
  });
}

export function loadBalancerOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: lbKey(projectId, "options"),
    queryFn: ({ signal }) =>
      apiFetch<LoadBalancerOptions>(`${BASE}/options`, { signal }),
    staleTime: staleTimes.list,
  });
}

export function l7PolicyQuery(projectId: string, policyId: string) {
  return queryOptions({
    queryKey: lbKey(projectId, "l7policy", policyId),
    queryFn: ({ signal }) =>
      apiFetch<L7Policy>(`${BASE}/l7policies/${policyId}`, { signal }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data &&
        (busy(data.provisioning_status) ||
          (data.rule_rows ?? []).some((r) => busy(r.provisioning_status)))
        ? POLL_MS
        : false;
    },
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: lbKey(projectId) });
    void queryClient.invalidateQueries({
      queryKey: ["project", projectId, "network", "floating-ips"],
    });
  };
}

/** On a `load_balancer_busy` refusal, refetch so the page shows the
 * transitional status and disables the controls until it settles. */
function useRefreshWhenBusy(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return (error: unknown) => {
    if (isLoadBalancerBusy(error)) invalidate();
  };
}

export function useCreateLoadBalancer(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: LoadBalancerCreateRequest) =>
      apiFetch<LoadBalancer>(BASE, { method: "POST", json: body }),
    onSuccess: invalidate,
  });
}

export function useUpdateLoadBalancer(projectId: string) {
  const invalidate = useInvalidate(projectId);
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
      apiFetch<LoadBalancer>(`${BASE}/${id}`, { method: "PATCH", json: body }),
    onSuccess: invalidate,
  });
}

export function useDeleteLoadBalancer(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useAssociateLbFloatingIp(projectId: string) {
  const invalidate = useInvalidate(projectId);
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
      apiFetch<unknown>(`${BASE}/${id}/floating-ip`, {
        method: "POST",
        json: { floating_ip_id: floatingIpId ?? null, pool_id: poolId ?? null },
      }),
    onSuccess: invalidate,
    // A failed allocate-then-associate may leave the new IP behind.
    onError: invalidate,
  });
}

export function useDisassociateLbFloatingIp(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<unknown>(`${BASE}/${id}/floating-ip`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateListener(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const refreshWhenBusy = useRefreshWhenBusy(projectId);
  return useMutation({
    mutationFn: (
      body: ListenerSpec & {
        loadbalancer_id: string;
        pool?: PoolSpec;
        members?: MemberSpec[];
        monitor?: MonitorSpec;
      },
    ) =>
      apiFetch<Listener>(`${BASE}/listeners`, { method: "POST", json: body }),
    onSuccess: invalidate,
    onError: refreshWhenBusy,
  });
}

export function useUpdateListener(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ListenerUpdate) =>
      apiFetch<Listener>(`${BASE}/listeners/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteListener(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/listeners/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreatePool(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const refreshWhenBusy = useRefreshWhenBusy(projectId);
  return useMutation({
    mutationFn: (
      body: PoolSpec & {
        loadbalancer_id: string;
        listener_id?: string;
        members?: MemberSpec[];
        monitor?: MonitorSpec;
      },
    ) => apiFetch<Pool>(`${BASE}/pools`, { method: "POST", json: body }),
    onSuccess: invalidate,
    onError: refreshWhenBusy,
  });
}

export function useUpdatePool(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & PoolUpdate) =>
      apiFetch<Pool>(`${BASE}/pools/${id}`, { method: "PATCH", json: body }),
    onSuccess: invalidate,
  });
}

export function useDeletePool(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/pools/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useAddMember(projectId: string) {
  const invalidate = useInvalidate(projectId);
  const refreshWhenBusy = useRefreshWhenBusy(projectId);
  return useMutation({
    mutationFn: ({
      lbId,
      poolId,
      ...body
    }: MemberSpec & { lbId: string; poolId: string }) =>
      apiFetch<Member>(`${BASE}/${lbId}/pools/${poolId}/members`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
    onError: refreshWhenBusy,
  });
}

export function useUpdateMember(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      poolId,
      memberId,
      ...body
    }: { poolId: string; memberId: string } & MemberUpdate) =>
      apiFetch<Member>(`${BASE}/pools/${poolId}/members/${memberId}`, {
        method: "PATCH",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteMember(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ poolId, memberId }: { poolId: string; memberId: string }) =>
      apiFetch<void>(`${BASE}/pools/${poolId}/members/${memberId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}

export function useCreateMonitor(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: MonitorSpec & { pool_id: string }) =>
      apiFetch<HealthMonitor>(`${BASE}/monitors`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useUpdateMonitor(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<MonitorSpec>) =>
      apiFetch<HealthMonitor>(`${BASE}/monitors/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteMonitor(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/monitors/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateL7Policy(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: L7PolicySpec & { listener_id: string }) =>
      apiFetch<L7Policy>(`${BASE}/l7policies`, { method: "POST", json: body }),
    onSuccess: invalidate,
  });
}

export function useUpdateL7Policy(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<L7PolicySpec>) =>
      apiFetch<L7Policy>(`${BASE}/l7policies/${id}`, {
        method: "PATCH",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteL7Policy(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`${BASE}/l7policies/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateL7Rule(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ policyId, ...body }: L7RuleSpec & { policyId: string }) =>
      apiFetch<L7Rule>(`${BASE}/l7policies/${policyId}/rules`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteL7Rule(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ policyId, ruleId }: { policyId: string; ruleId: string }) =>
      apiFetch<void>(`${BASE}/l7policies/${policyId}/rules/${ruleId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  });
}
