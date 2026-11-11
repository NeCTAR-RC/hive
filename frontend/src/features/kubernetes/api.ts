// Queries and mutations for the Kubernetes (Magnum) panels, keyed by
// `queryKeys.kubernetes`. Clusters take minutes to change, so they poll on
// the slow interval; every write refreshes the whole service, without the
// mutation waiting for the refetch. Queries pass React Query's abort signal
// on, so leaving a page cancels its requests.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch, apiFetchText } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  Cluster,
  ClusterCertificate,
  ClusterConfig,
  ClusterCreated,
  ClusterCreateRequest,
  ClusterOptions,
  ClustersResponse,
  ClusterTemplate,
  ClusterUpgrading,
  NodeGroup,
  NodeGroupCreateRequest,
  NodeGroupResized,
  NodeGroupsResponse,
  UpgradeOptions,
} from "../../lib/api/types/kubernetes";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import {
  getJson,
  pollWhile,
  pollIntervals,
  staleTimes,
} from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";
import { isTransitional } from "./status";

const keys = queryKeys.kubernetes;

const BASE = "/api/kubernetes";

/** What any Magnum write marks stale: the whole service. */
export const kubernetesWriteKeys = [keys.service.all];

export function clustersQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.clusters.list(projectId),
    queryFn: getJson<ClustersResponse>(`${BASE}/clusters`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((c) => isTransitional(c.status)),
        pollIntervals.slow,
      ),
  });
}

export function clusterQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: keys.clusters.detail(projectId, clusterId),
    queryFn: getJson<Cluster>(`${BASE}/clusters/${clusterId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        isTransitional(query.state.data?.status),
        pollIntervals.slow,
      ),
  });
}

export function clusterOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<ClusterOptions>(`${BASE}/clusters/options`),
    staleTime: staleTimes.static,
  });
}

export function upgradeOptionsQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: [
      ...keys.clusters.detail(projectId, clusterId),
      "upgrade-options",
    ],
    queryFn: getJson<UpgradeOptions>(
      `${BASE}/clusters/${clusterId}/upgrade-options`,
    ),
    staleTime: staleTimes.none,
  });
}

export function nodeGroupsQuery(projectId: string, clusterId: string) {
  return queryOptions({
    queryKey: [...keys.clusters.detail(projectId, clusterId), "nodegroups"],
    queryFn: getJson<NodeGroupsResponse>(
      `${BASE}/clusters/${clusterId}/nodegroups`,
    ),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        isTransitional(query.state.data?.cluster_status) ||
          query.state.data?.items.some((g) => isTransitional(g.status)),
        pollIntervals.slow,
      ),
  });
}

export function templatesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.clusterTemplates.list(projectId),
    queryFn: getJson<Items<ClusterTemplate>>(`${BASE}/cluster-templates`),
    staleTime: staleTimes.static,
  });
}

export function templateQuery(projectId: string, templateId: string) {
  return queryOptions({
    queryKey: keys.clusterTemplates.detail(projectId, templateId),
    queryFn: getJson<ClusterTemplate>(
      `${BASE}/cluster-templates/${templateId}`,
    ),
    staleTime: staleTimes.static,
  });
}

export function fetchClusterConfig(clusterId: string) {
  return apiFetch<ClusterConfig>(`${BASE}/clusters/${clusterId}/config`);
}

/** The cluster's CA certificate, as PEM text. */
export function fetchClusterCa(clusterId: string) {
  return apiFetchText(`${BASE}/clusters/${clusterId}/ca.pem`);
}

export function useCreateCluster() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ClusterCreateRequest) =>
      apiFetch<ClusterCreated>(`${BASE}/clusters`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

/** Deletes one cluster with its nodes; a batch sends it per cluster. */
export function deleteCluster(clusterId: string) {
  return apiFetch<void>(`${BASE}/clusters/${clusterId}`, { method: "DELETE" });
}

export function useUpgradeCluster() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      clusterId,
      templateId,
    }: {
      clusterId: string;
      templateId: string;
    }) =>
      apiFetch<ClusterUpgrading>(`${BASE}/clusters/${clusterId}/upgrade`, {
        method: "POST",
        json: { cluster_template_id: templateId, max_batch_size: 1 },
      }),
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

export function useSignCertificate() {
  return useMutation({
    mutationFn: ({ clusterId, csr }: { clusterId: string; csr: string }) =>
      apiFetch<ClusterCertificate>(`${BASE}/clusters/${clusterId}/sign`, {
        method: "POST",
        json: { csr },
      }),
  });
}

export function useCreateNodeGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      clusterId,
      ...body
    }: NodeGroupCreateRequest & { clusterId: string }) =>
      apiFetch<NodeGroup>(`${BASE}/clusters/${clusterId}/nodegroups`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

export function useResizeNodeGroup() {
  const invalidate = useInvalidate();
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
      apiFetch<NodeGroupResized>(
        `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}/resize`,
        { method: "POST", json: { node_count: nodeCount } },
      ),
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

export function useSetAutoscaling() {
  const invalidate = useInvalidate();
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
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

export function useSetNodeLabels() {
  const invalidate = useInvalidate();
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
    onSettled: () => void invalidate(...kubernetesWriteKeys),
  });
}

/** Deletes one node group of a cluster; a batch sends it per group. */
export function deleteNodeGroup(clusterId: string, nodeGroupId: string) {
  return apiFetch<void>(
    `${BASE}/clusters/${clusterId}/nodegroups/${nodeGroupId}`,
    { method: "DELETE" },
  );
}
