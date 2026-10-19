// Queries and mutations for the Compute panels. Every key is project
// scoped (`['project', pid, 'compute', ...]`) so a project switch drops the
// lot in one call, and every write invalidates the resource family it
// touched.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import { uploadFile } from "../../lib/api/upload";
import type {
  ActionResult,
  AvailabilityZone,
  ComputeLimits,
  Flavor,
  Image,
  Instance,
  InstanceAction,
  InstanceDetail,
  InstancePort,
  InstanceVolume,
  Items,
  KeyPair,
  LaunchOptions,
  LaunchRequest,
  LaunchResult,
  Paginated,
  ServerGroup,
  ServerGroupPolicy,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";
import { isTransitional } from "./instances/status";

export function computeKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "compute", ...rest] as const;
}

// Horizon lists every instance (API_RESULT_LIMIT 1000) and pages in the
// browser; the same here keeps sorting and filtering instant.
const LIST_LIMIT = 1000;
const POLL_MS = 5000;

export function instancesQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances"),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<Instance>>("/api/compute/instances", {
        signal,
        query: { limit: LIST_LIMIT },
      }),
    staleTime: staleTimes.list,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data?.items.some(isTransitional) ? POLL_MS : false,
  });
}

export function instanceQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId),
    queryFn: ({ signal }) =>
      apiFetch<InstanceDetail>(`/api/compute/instances/${instanceId}`, {
        signal,
      }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data && isTransitional(query.state.data) ? POLL_MS : false,
  });
}

export function instanceVolumesQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId, "volumes"),
    queryFn: ({ signal }) =>
      apiFetch<Items<InstanceVolume>>(
        `/api/compute/instances/${instanceId}/volumes`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function instancePortsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId, "ports"),
    queryFn: ({ signal }) =>
      apiFetch<Items<InstancePort>>(
        `/api/compute/instances/${instanceId}/ports`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function instanceActionLogQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId, "action-log"),
    queryFn: ({ signal }) =>
      apiFetch<Items<InstanceAction>>(
        `/api/compute/instances/${instanceId}/action-log`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function consoleOutputQuery(
  projectId: string,
  instanceId: string,
  length: number,
) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId, "log", length),
    queryFn: ({ signal }) =>
      apiFetch<{ output: string }>(
        `/api/compute/instances/${instanceId}/console-output`,
        { signal, query: { length } },
      ),
    staleTime: 0,
  });
}

export function resizeFlavorsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "instances", instanceId, "resize-flavors"),
    queryFn: ({ signal }) =>
      apiFetch<Items<Flavor>>(
        `/api/compute/instances/${instanceId}/resize-flavors`,
        { signal },
      ),
    staleTime: staleTimes.static,
  });
}

export function flavorsQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "flavors"),
    queryFn: ({ signal }) =>
      apiFetch<Items<Flavor>>("/api/compute/flavors", { signal }),
    staleTime: staleTimes.static,
  });
}

export function availabilityZonesQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "availability-zones"),
    queryFn: ({ signal }) =>
      apiFetch<Items<AvailabilityZone>>("/api/compute/availability-zones", {
        signal,
      }),
    staleTime: staleTimes.static,
  });
}

export function limitsQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "limits"),
    queryFn: ({ signal }) =>
      apiFetch<ComputeLimits>("/api/compute/limits", { signal }),
    staleTime: staleTimes.quota,
  });
}

export interface ImageListParams {
  visibility?: string;
  q?: string;
  snapshots?: boolean;
}

export function imagesQuery(projectId: string, params: ImageListParams) {
  return queryOptions({
    queryKey: computeKey(projectId, "images", params),
    queryFn: ({ signal }) =>
      apiFetch<Items<Image>>("/api/compute/images", {
        signal,
        query: {
          visibility: params.visibility,
          q: params.q,
          snapshots: params.snapshots ? "true" : undefined,
        },
      }),
    staleTime: staleTimes.list,
  });
}

export function imageQuery(projectId: string, imageId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "images", "detail", imageId),
    queryFn: ({ signal }) =>
      apiFetch<Image>(`/api/compute/images/${imageId}`, { signal }),
    staleTime: staleTimes.detail,
  });
}

export function keyPairsQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "keypairs"),
    queryFn: ({ signal }) =>
      apiFetch<Items<KeyPair>>("/api/compute/keypairs", { signal }),
    staleTime: staleTimes.list,
  });
}

export function keyPairQuery(projectId: string, name: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "keypairs", name),
    queryFn: ({ signal }) =>
      apiFetch<KeyPair>(`/api/compute/keypairs/${encodeURIComponent(name)}`, {
        signal,
      }),
    staleTime: staleTimes.detail,
  });
}

export function serverGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "server-groups"),
    queryFn: ({ signal }) =>
      apiFetch<Items<ServerGroup>>("/api/compute/server-groups", { signal }),
    staleTime: staleTimes.list,
  });
}

export function launchOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: computeKey(projectId, "launch-options"),
    queryFn: ({ signal }) =>
      apiFetch<LaunchOptions>("/api/compute/launch-options", { signal }),
    staleTime: staleTimes.list,
  });
}

// --- mutations ----------------------------------------------------------------

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return (...rest: unknown[]) =>
    queryClient.invalidateQueries({ queryKey: computeKey(projectId, ...rest) });
}

export interface InstanceActionVariables {
  instanceId: string;
  action: string;
  body?: Record<string, unknown>;
}

export function useInstanceAction(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ instanceId, action, body }: InstanceActionVariables) =>
      apiFetch<ActionResult>(
        `/api/compute/instances/${instanceId}/actions/${action}`,
        { method: "POST", json: body ?? {} },
      ),
    onSettled: async (_data, _error, variables) => {
      await invalidate("instances");
      if (variables.action === "snapshot") await invalidate("images");
    },
  });
}

/**
 * The same action on several instances, settled together and followed by a
 * single refetch of the list (one per instance would restart the 1000-row
 * fetch N times). Resolves with every outcome; it never rejects.
 */
export function useBatchInstanceAction(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      instanceIds,
      action,
      body,
    }: {
      instanceIds: string[];
      action: string;
      body?: Record<string, unknown>;
    }) =>
      Promise.allSettled(
        instanceIds.map((instanceId) =>
          apiFetch<ActionResult>(
            `/api/compute/instances/${instanceId}/actions/${action}`,
            { method: "POST", json: body ?? {} },
          ),
        ),
      ),
    onSettled: () => invalidate("instances"),
  });
}

export function useUpdateInstance(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      instanceId,
      ...fields
    }: {
      instanceId: string;
      name?: string;
      description?: string;
    }) =>
      apiFetch<Instance>(`/api/compute/instances/${instanceId}`, {
        method: "PATCH",
        json: fields,
      }),
    onSettled: () => invalidate("instances"),
  });
}

export function useDeleteInstances(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: async (instanceIds: string[]) => {
      const results = await Promise.allSettled(
        instanceIds.map((id) =>
          apiFetch<void>(`/api/compute/instances/${id}`, {
            method: "DELETE",
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        throw (failed[0] as PromiseRejectedResult).reason;
      }
    },
    onSettled: () => invalidate("instances"),
  });
}

export function useLaunch(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (request: LaunchRequest) =>
      apiFetch<LaunchResult>("/api/compute/instances", {
        method: "POST",
        json: request,
      }),
    onSettled: () => invalidate("instances"),
  });
}

export function useCreateKeyPair(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: {
      name: string;
      public_key?: string;
      type?: "ssh" | "x509";
    }) =>
      apiFetch<KeyPair>("/api/compute/keypairs", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate("keypairs"),
  });
}

export function useDeleteKeyPair(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<void>(`/api/compute/keypairs/${encodeURIComponent(name)}`, {
        method: "DELETE",
      }),
    onSettled: () => invalidate("keypairs"),
  });
}

export function useCreateServerGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: { name: string; policy: ServerGroupPolicy }) =>
      apiFetch<ServerGroup>("/api/compute/server-groups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate("server-groups"),
  });
}

export function useDeleteServerGroup(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (groupId: string) =>
      apiFetch<void>(`/api/compute/server-groups/${groupId}`, {
        method: "DELETE",
      }),
    onSettled: () => invalidate("server-groups"),
  });
}

export interface ImageCreateBody {
  name: string;
  /** Imported by the image service; omit when uploading a file instead. */
  source_url?: string;
  disk_format: string;
  container_format: string;
  visibility?: Image["visibility"];
  min_disk: number;
  min_ram: number;
  protected: boolean;
  properties: Record<string, string>;
}

export function useCreateImage(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: ImageCreateBody) =>
      apiFetch<Image>("/api/compute/images", { method: "POST", json: body }),
    onSettled: () => invalidate("images"),
  });
}

export interface ImageUploadVariables {
  imageId: string;
  file: File;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/** Stream a file into a queued image; the image becomes active after. */
export function useUploadImageFile(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ imageId, file, onProgress, signal }: ImageUploadVariables) =>
      uploadFile<Image>(`/api/compute/images/${imageId}/file`, file, {
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      }),
    onSettled: () => invalidate("images"),
  });
}

export interface ImageUpdateBody {
  imageId: string;
  name?: string;
  visibility?: Image["visibility"];
  min_disk?: number;
  min_ram?: number;
  protected?: boolean;
  properties?: Record<string, string | null>;
}

export function useUpdateImage(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ imageId, ...body }: ImageUpdateBody) =>
      apiFetch<Image>(`/api/compute/images/${imageId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate("images"),
  });
}

export function useDeleteImages(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: async (imageIds: string[]) => {
      const results = await Promise.allSettled(
        imageIds.map((id) =>
          apiFetch<void>(`/api/compute/images/${id}`, { method: "DELETE" }),
        ),
      );
      const failed = results.find((r) => r.status === "rejected");
      if (failed) throw (failed as PromiseRejectedResult).reason;
    },
    onSettled: () => invalidate("images"),
  });
}
