// Queries and mutations for the Object Store panel, keyed under
// `['project', pid, 'swift', ...]`. Uploads go through upload.ts.
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  ContainerCreateRequest,
  ContainerDetail,
  ContainersResponse,
  CopyObjectRequest,
  DeleteObjectsResult,
  ObjectDetail,
  ObjectListing,
  StoreInfo,
  UploadPlan,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function swiftKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "swift", ...rest] as const;
}

const BASE = "/api/object-store";

export function encodePath(name: string): string {
  return name.split("/").map(encodeURIComponent).join("/");
}

export function containerPath(container: string): string {
  return `${BASE}/containers/${encodeURIComponent(container)}`;
}

export function objectPath(container: string, name: string): string {
  return `${containerPath(container)}/objects/${encodePath(name)}`;
}

export function storeInfoQuery(projectId: string) {
  return queryOptions({
    queryKey: swiftKey(projectId, "info"),
    queryFn: ({ signal }) => apiFetch<StoreInfo>(`${BASE}/info`, { signal }),
    staleTime: staleTimes.quota,
  });
}

export function containersQuery(projectId: string) {
  return queryOptions({
    queryKey: swiftKey(projectId, "containers"),
    queryFn: ({ signal }) =>
      apiFetch<ContainersResponse>(`${BASE}/containers`, { signal }),
    staleTime: staleTimes.list,
  });
}

export function containerQuery(projectId: string, container: string) {
  return queryOptions({
    queryKey: swiftKey(projectId, "container", container),
    queryFn: ({ signal }) =>
      apiFetch<ContainerDetail>(containerPath(container), { signal }),
    staleTime: staleTimes.detail,
  });
}

/**
 * One folder's listing, a page (the backend's 500 entries) at a time:
 * each page names the marker for the next, as Horizon pages with markers.
 */
export function objectsQuery(
  projectId: string,
  container: string,
  path: string,
) {
  return infiniteQueryOptions({
    queryKey: swiftKey(projectId, "objects", container, path),
    queryFn: ({ signal, pageParam }) =>
      apiFetch<ObjectListing>(`${containerPath(container)}/objects`, {
        signal,
        query: { path, marker: pageParam },
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ObjectListing) =>
      last.has_more && last.next_marker ? last.next_marker : null,
    staleTime: staleTimes.list,
  });
}

export function objectQuery(
  projectId: string,
  container: string,
  name: string,
) {
  return queryOptions({
    queryKey: swiftKey(projectId, "object", container, name),
    queryFn: ({ signal }) =>
      apiFetch<ObjectDetail>(`${objectPath(container, name)}/metadata`, {
        signal,
      }),
    staleTime: staleTimes.detail,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return (...rest: unknown[]) =>
    queryClient.invalidateQueries({ queryKey: swiftKey(projectId, ...rest) });
}

export function useCreateContainer(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (body: ContainerCreateRequest) =>
      apiFetch<ContainerDetail>(`${BASE}/containers`, {
        method: "POST",
        json: body,
      }),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateContainer(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      container,
      ...body
    }: {
      container: string;
      is_public?: boolean;
      metadata?: Record<string, string>;
    }) =>
      apiFetch<ContainerDetail>(containerPath(container), {
        method: "PATCH",
        json: body,
      }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteContainer(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: (container: string) =>
      apiFetch<void>(containerPath(container), { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

export function useCreateFolder(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({ container, path }: { container: string; path: string }) =>
      apiFetch<{ name: string }>(`${containerPath(container)}/folders`, {
        method: "POST",
        json: { path },
      }),
    onSuccess: () => invalidate(),
  });
}

export function useCopyObject(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      container,
      name,
      ...body
    }: CopyObjectRequest & { container: string; name: string }) =>
      apiFetch<{ container: string; name: string }>(
        `${objectPath(container, name)}/copy`,
        { method: "POST", json: body },
      ),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteObjects(projectId: string) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: ({
      container,
      names,
    }: {
      container: string;
      names: string[];
    }) =>
      apiFetch<DeleteObjectsResult>(`${containerPath(container)}/delete`, {
        method: "POST",
        json: { names },
      }),
    onSuccess: () => invalidate(),
  });
}

export function requestUploadPlan(
  container: string,
  objects: { name: string; size: number; content_type: string | null }[],
) {
  return apiFetch<UploadPlan>(`${containerPath(container)}/upload-plan`, {
    method: "POST",
    json: { objects },
  });
}

export function completeUpload(
  container: string,
  name: string,
  segments: { path: string; size_bytes: number; etag?: string }[],
) {
  return apiFetch<{ name: string; bytes: number }>(
    `${objectPath(container, name)}/manifest`,
    { method: "POST", json: { segments } },
  );
}

export function downloadPath(container: string, name: string): string {
  return `${objectPath(container, name)}/download`;
}

/** The SPA route for a folder inside a container. */
export function folderHref(container: string, path: string): string {
  const base = `/object-store/containers/${encodeURIComponent(container)}`;
  if (!path) return base;
  return `${base}/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;
}
