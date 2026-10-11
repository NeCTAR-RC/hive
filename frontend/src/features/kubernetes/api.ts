// Queries and mutations for the Kubernetes (Magnum) panels, keyed under
// `['project', pid, 'kubernetes', ...]`.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  Cluster,
  ClusterConfig,
  ClusterCreateRequest,
  ClusterOptions,
  ClustersResponse,
  ClusterTemplate,
  Items,
  NodeGroup,
  NodeGroupCreateRequest,
  NodeGroupsResponse,
  UpgradeOptions,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";
import { isTransitional } from "./status";

export function k8sKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "kubernetes", ...rest] as const;
}

const BASE = "/api/kubernetes";
const POLL_MS = 10_000;

export function clustersQuery(projectId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "clusters"),
    queryFn: () => apiFetch<ClustersResponse>(`${BASE}/clusters`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((c) => isTransitional(c.status))
        ? POLL_MS
        : false,
  });
}

export function clusterQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "cluster", clusterId),
    queryFn: () => apiFetch<Cluster>(`${BASE}/clusters/${clusterId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      isTransitional(query.state.data?.status) ? POLL_MS : false,
  });
}

export function clusterOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "options"),
    queryFn: () => apiFetch<ClusterOptions>(`${BASE}/clusters/options`),
    staleTime: staleTimes.static,
  });
}

export function upgradeOptionsQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "upgrade", clusterId),
    queryFn: () =>
      apiFetch<UpgradeOptions>(`${BASE}/clusters/${clusterId}/upgrade-options`),
    staleTime: 0,
  });
}

export function nodeGroupsQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "nodegroups", clusterId),
    queryFn: () =>
      apiFetch<NodeGroupsResponse>(`${BASE}/clusters/${clusterId}/nodegroups`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      isTransitional(query.state.data?.cluster_status) ||
      query.state.data?.items.some((g) => isTransitional(g.status))
        ? POLL_MS
        : false,
  });
}

export function templatesQuery(projectId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "templates"),
    queryFn: () =>
      apiFetch<Items<ClusterTemplate>>(`${BASE}/cluster-templates`),
    staleTime: staleTimes.static,
  });
}

export function templateQuery(projectId: string, templateId: string) {
  return queryOptions({
    queryKey: k8sKey(projectId, "template", templateId),
    queryFn: () =>
      apiFetch<ClusterTemplate>(`${BASE}/cluster-templates/${templateId}`),
    staleTime: staleTimes.static,
  });
}

export function fetchClusterConfig(clusterId: string) {
  return apiFetch<ClusterConfig>(`${BASE}/clusters/${clusterId}/config`);
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: k8sKey(projectId) });
}

export function useCreateCluster(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: ClusterCreateRequest) =>
      apiFetch<{ id: string; name: string }>(`${BASE}/clusters`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteCluster(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (clusterId: string) =>
      apiFetch<void>(`${BASE}/clusters/${clusterId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useUpgradeCluster(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      templateId,
    }: {
      clusterId: string;
      templateId: string;
    }) =>
      apiFetch<{ id: string }>(`${BASE}/clusters/${clusterId}/upgrade`, {
        method: "POST",
        json: { cluster_template_id: templateId, max_batch_size: 1 },
      }),
    onSuccess: invalidate,
  });
}

export function useSignCertificate() {
  return useMutation({
    mutationFn: ({ clusterId, csr }: { clusterId: string; csr: string }) =>
      apiFetch<{ pem: string }>(`${BASE}/clusters/${clusterId}/sign`, {
        method: "POST",
        json: { csr },
      }),
  });
}

export function useCreateNodeGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      ...body
    }: NodeGroupCreateRequest & { clusterId: string }) =>
      apiFetch<NodeGroup>(`${BASE}/clusters/${clusterId}/nodegroups`, {
        method: "POST",
        json: body,
      }),
    onSuccess: invalidate,
  });
}

export function useResizeNodeGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      nodeGroupId,
      nodeCount,
    }: {
      clusterId: string;
      nodeGroupId: string;
      nodeCount: number;
    }) =>
      apiFetch<{ id: string }>(
        `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}/resize`,
        { method: "POST", json: { node_count: nodeCount } },
      ),
    onSuccess: invalidate,
  });
}

export function useSetAutoscaling(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      nodeGroupId,
      min,
      max,
    }: {
      clusterId: string;
      nodeGroupId: string;
      min: number;
      max: number;
    }) =>
      apiFetch<NodeGroup>(
        `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}/autoscaling`,
        { method: "PUT", json: { min_node_count: min, max_node_count: max } },
      ),
    onSuccess: invalidate,
  });
}

export function useSetNodeLabels(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      nodeGroupId,
      labels,
      taints,
    }: {
      clusterId: string;
      nodeGroupId: string;
      labels: string;
      taints: string;
    }) =>
      apiFetch<NodeGroup>(
        `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}/labels`,
        { method: "PUT", json: { node_labels: labels, node_taints: taints } },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteNodeGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      clusterId,
      nodeGroupId,
    }: {
      clusterId: string;
      nodeGroupId: string;
    }) =>
      apiFetch<void>(
        `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}`,
        {
          method: "DELETE",
        },
      ),
    onSuccess: invalidate,
  });
}
