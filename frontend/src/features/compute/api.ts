// Queries and mutations for the Compute panels. Keys come from
// `queryKeys.compute`, and every write invalidates the resource family it
// touched.
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import { uploadFile } from "../../lib/api/upload";
import type { Items, Paginated } from "../../lib/api/types/common";
import type {
  ActionResult,
  AvailabilityZone,
  ComputeLimits,
  ConsoleOutput,
  Flavor,
  Image,
  ImageCreateRequest,
  ImageUpdateRequest,
  Instance,
  InstanceAction,
  InstanceActionRequest,
  InstanceDetail,
  InstancePort,
  InstanceVolume,
  KeyPair,
  KeyPairCreated,
  KeyPairDetail,
  LaunchOptions,
  LaunchRequest,
  LaunchResult,
  ServerGroup,
  ServerGroupPolicy,
} from "../../lib/api/types/compute";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys } from "../../lib/queryKeys";
import { isImageTransitional } from "./images/presentation";
import { isTransitional } from "./instances/status";

const keys = queryKeys.compute;

// Horizon lists every instance (API_RESULT_LIMIT 1000) and pages in the
// browser; the same here keeps sorting and filtering instant.
const LIST_LIMIT = 1000;
export function instancesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.instances.list(projectId),
    queryFn: getJson<Paginated<Instance>>("/api/compute/instances", {
      limit: LIST_LIMIT,
    }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.items.some(isTransitional)),
  });
}

export function instanceQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: keys.instances.detail(projectId, instanceId),
    queryFn: getJson<InstanceDetail>(`/api/compute/instances/${instanceId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data && isTransitional(query.state.data)),
  });
}

export function instanceVolumesQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "volumes"],
    queryFn: getJson<Items<InstanceVolume>>(
      `/api/compute/instances/${instanceId}/volumes`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function instancePortsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "ports"],
    queryFn: getJson<Items<InstancePort>>(
      `/api/compute/instances/${instanceId}/ports`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function instanceActionLogQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "action-log"],
    queryFn: getJson<Items<InstanceAction>>(
      `/api/compute/instances/${instanceId}/action-log`,
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
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "console-output",
      length,
    ],
    queryFn: getJson<ConsoleOutput>(
      `/api/compute/instances/${instanceId}/console-output`,
      { length },
    ),
    staleTime: staleTimes.none,
  });
}

export function resizeFlavorsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "resize-flavors",
    ],
    queryFn: getJson<Items<Flavor>>(
      `/api/compute/instances/${instanceId}/resize-flavors`,
    ),
    staleTime: staleTimes.static,
  });
}

export function flavorsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.flavors.list(projectId),
    queryFn: getJson<Items<Flavor>>("/api/compute/flavors"),
    staleTime: staleTimes.static,
  });
}

export function availabilityZonesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.availabilityZones.list(projectId),
    queryFn: getJson<Items<AvailabilityZone>>(
      "/api/compute/availability-zones",
    ),
    staleTime: staleTimes.static,
  });
}

export function limitsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.limits.all(projectId),
    queryFn: getJson<ComputeLimits>("/api/compute/limits"),
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
    queryKey: keys.images.list(projectId, params),
    queryFn: getJson<Items<Image>>("/api/compute/images", {
      visibility: params.visibility,
      q: params.q,
      snapshots: params.snapshots ? "true" : undefined,
    }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.items.some(isImageTransitional)),
  });
}

export function imageQuery(projectId: string, imageId: string) {
  return queryOptions({
    queryKey: keys.images.detail(projectId, imageId),
    queryFn: getJson<Image>(`/api/compute/images/${imageId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data && isImageTransitional(query.state.data),
      ),
  });
}

export function keyPairsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.keyPairs.list(projectId),
    queryFn: getJson<Items<KeyPair>>("/api/compute/keypairs"),
    staleTime: staleTimes.list,
  });
}

export function keyPairQuery(projectId: string, name: string) {
  return queryOptions({
    queryKey: keys.keyPairs.detail(projectId, name),
    queryFn: getJson<KeyPairDetail>(
      `/api/compute/keypairs/${encodeURIComponent(name)}`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function serverGroupsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.serverGroups.list(projectId),
    queryFn: getJson<Items<ServerGroup>>("/api/compute/server-groups"),
    staleTime: staleTimes.list,
  });
}

export function launchOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.launchOptions.all(projectId),
    queryFn: getJson<LaunchOptions>("/api/compute/launch-options"),
    staleTime: staleTimes.list,
  });
}

/**
 * The keys a write to a resource the launch options aggregate (images, key
 * pairs, server groups) makes stale: the resource and the wizard's options,
 * so a key pair created from the wizard can be selected there.
 */
function launchSourceKeys(resource: "images" | "keyPairs" | "serverGroups") {
  return [keys[resource].all, keys.launchOptions.all];
}

/** One instance action: the instance and the action's body. */
export interface InstanceActionVariables {
  instanceId: string;
  body: InstanceActionRequest;
}

/** What any instance write marks stale. */
export const instanceWriteKeys = [keys.instances.all];
/** What a key pair write marks stale, the launch wizard's choices too. */
export const keyPairWriteKeys = launchSourceKeys("keyPairs");
/** What a server group write marks stale, the launch wizard's choices too. */
export const serverGroupWriteKeys = launchSourceKeys("serverGroups");
/** What an image write marks stale, the launch wizard's choices too. */
export const imageWriteKeys = launchSourceKeys("images");

/** Sends one instance action (reboot, pause, snapshot, ...). */
export function requestInstanceAction({
  instanceId,
  body,
}: InstanceActionVariables) {
  return apiFetch<ActionResult>(
    `/api/compute/instances/${instanceId}/actions`,
    {
      method: "POST",
      json: body,
    },
  );
}

export function useInstanceAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: requestInstanceAction,
    onSettled: async (_data, _error, variables) => {
      await invalidate(...instanceWriteKeys);
      if (variables.body.action === "snapshot")
        await invalidate(...imageWriteKeys);
    },
  });
}

export function useUpdateInstance() {
  const invalidate = useInvalidate();
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
    onSettled: () => invalidate(...instanceWriteKeys),
  });
}

/** Deletes one instance; a batch sends it per instance. */
export function deleteInstance(instanceId: string) {
  return apiFetch<void>(`/api/compute/instances/${instanceId}`, {
    method: "DELETE",
  });
}

export function useLaunch() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (request: LaunchRequest) =>
      apiFetch<LaunchResult>("/api/compute/instances", {
        method: "POST",
        json: request,
      }),
    onSettled: () => invalidate(...instanceWriteKeys),
  });
}

/**
 * Creates or imports a key pair. A generated private key goes to the
 * download only: the mutation leaves the cache as soon as the dialog lets
 * go of it (`gcTime: 0`) instead of staying for minutes.
 */
export function useCreateKeyPair() {
  const invalidate = useInvalidate();
  return useMutation({
    gcTime: 0,
    mutationFn: (body: {
      name: string;
      public_key?: string;
      type?: "ssh" | "x509";
    }) =>
      apiFetch<KeyPairCreated>("/api/compute/keypairs", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...keyPairWriteKeys),
  });
}

/** Deletes one key pair; a batch sends it per key pair. */
export function deleteKeyPair(name: string) {
  return apiFetch<void>(`/api/compute/keypairs/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export function useCreateServerGroup() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { name: string; policy: ServerGroupPolicy }) =>
      apiFetch<ServerGroup>("/api/compute/server-groups", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...serverGroupWriteKeys),
  });
}

/** Deletes one server group; a batch sends it per group. */
export function deleteServerGroup(groupId: string) {
  return apiFetch<void>(`/api/compute/server-groups/${groupId}`, {
    method: "DELETE",
  });
}

export function useCreateImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ImageCreateRequest) =>
      apiFetch<Image>("/api/compute/images", { method: "POST", json: body }),
    onSettled: () => invalidate(...imageWriteKeys),
  });
}

export interface ImageUploadVariables {
  imageId: string;
  file: File;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/** Stream a file into a queued image; the image becomes active after. */
export function useUploadImageFile() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ imageId, file, onProgress, signal }: ImageUploadVariables) =>
      uploadFile<Image>(`/api/compute/images/${imageId}/file`, file, {
        ...(onProgress ? { onProgress } : {}),
        ...(signal ? { signal } : {}),
      }),
    onSettled: () => invalidate(...imageWriteKeys),
  });
}

/** An image edit: the image and the fields to change. */
export type ImageUpdateBody = { imageId: string } & ImageUpdateRequest;

export function useUpdateImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ imageId, ...body }: ImageUpdateBody) =>
      apiFetch<Image>(`/api/compute/images/${imageId}`, {
        method: "PATCH",
        json: body,
      }),
    onSettled: () => invalidate(...imageWriteKeys),
  });
}

/** Deletes one image; a batch sends it per image. */
export function deleteImage(imageId: string) {
  return apiFetch<void>(`/api/compute/images/${imageId}`, { method: "DELETE" });
}
