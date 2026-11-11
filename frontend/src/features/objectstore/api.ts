// Queries and mutations for the Object Store panel, keyed by
// `queryKeys.objectStore`: a container's listings and objects are keyed
// under the container. Uploads go through upload.ts.
import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
} from "@tanstack/react-query";
import type { BulkOutcome } from "../../lib/bulk";
import { apiFetch } from "../../lib/api/client";
import type {
  ContainerCreateRequest,
  ContainerList,
  ContainerDetail,
  CopyObjectRequest,
  DeleteObjectsResult,
  FolderCreated,
  ObjectCopied,
  ObjectDetail,
  ObjectListing,
  StoreInfo,
  StoreObject,
  UploadCompleted,
  UploadPlan,
} from "../../lib/api/types/objectstore";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, staleTimes } from "../../lib/queries";
import { queryKeys, type ProjectKeyOf } from "../../lib/queryKeys";

const keys = queryKeys.objectStore;

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
    queryKey: keys.info.all(projectId),
    queryFn: getJson<StoreInfo>(`${BASE}/info`),
    staleTime: staleTimes.quota,
  });
}

export function containersQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.containers.list(projectId),
    queryFn: getJson<ContainerList>(`${BASE}/containers`),
    staleTime: staleTimes.list,
  });
}

export function containerQuery(projectId: string, container: string) {
  return queryOptions({
    queryKey: keys.containers.detail(projectId, container),
    queryFn: getJson<ContainerDetail>(containerPath(container)),
    staleTime: staleTimes.detail,
  });
}

/**
 * One folder's listing, a page (the backend's 500 entries) at a time: each
 * page names the marker the next one starts after, as Horizon pages with
 * markers. `joinListing` reads the pages loaded so far as one list.
 */
export function objectsQuery(
  projectId: string,
  container: string,
  path: string,
) {
  return infiniteQueryOptions({
    queryKey: [
      ...keys.containers.detail(projectId, container),
      "objects",
      path,
    ],
    queryFn: ({ signal, pageParam }) =>
      apiFetch<ObjectListing>(`${containerPath(container)}/objects`, {
        query: { path, marker: pageParam },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: nextMarker,
    staleTime: staleTimes.list,
  });
}

/** The marker of the page after `last`, or null when it was the last. */
export function nextMarker(last: ObjectListing): string | null {
  return last.has_more && last.next_marker ? last.next_marker : null;
}

/** The pages of a folder loaded so far, as one list of its entries. */
export function joinListing(data: { pages: ObjectListing[] }): {
  items: StoreObject[];
} {
  return { items: data.pages.flatMap((page) => page.items) };
}

export function objectQuery(
  projectId: string,
  container: string,
  name: string,
) {
  return queryOptions({
    queryKey: [...keys.containers.detail(projectId, container), "object", name],
    queryFn: getJson<ObjectDetail>(`${objectPath(container, name)}/metadata`),
    staleTime: staleTimes.detail,
  });
}

/**
 * The keys a write to `containers` makes stale: the container list and the
 * store totals (object counts and bytes), and each named container's own
 * queries. Other containers' cached listings stay as they are.
 */
export function containerWriteKeys(...containers: string[]): ProjectKeyOf[] {
  return [
    keys.containers.list,
    keys.info.all,
    ...containers.map(
      (container) => (projectId: string) =>
        keys.containers.detail(projectId, container),
    ),
  ];
}

export function useCreateContainer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ContainerCreateRequest) =>
      apiFetch<ContainerDetail>(`${BASE}/containers`, {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...containerWriteKeys()),
  });
}

export function useUpdateContainer() {
  const invalidate = useInvalidate();
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
    onSettled: (_data, _error, { container }) =>
      invalidate(...containerWriteKeys(container)),
  });
}

/**
 * Deletes one container. Swift deletes only an empty one; `withObjects`
 * has the backend delete every object in it first.
 */
export function deleteContainer(container: string, withObjects = false) {
  return apiFetch<void>(containerPath(container), {
    method: "DELETE",
    ...(withObjects ? { query: { with_objects: "true" } } : {}),
  });
}

export function useCreateFolder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ container, path }: { container: string; path: string }) =>
      apiFetch<FolderCreated>(`${containerPath(container)}/folders`, {
        method: "POST",
        json: { path },
      }),
    onSettled: (_data, _error, { container }) =>
      invalidate(...containerWriteKeys(container)),
  });
}

export function useCopyObject() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      container,
      name,
      ...body
    }: CopyObjectRequest & { container: string; name: string }) =>
      apiFetch<ObjectCopied>(`${objectPath(container, name)}/copy`, {
        method: "POST",
        json: body,
      }),
    onSettled: (_data, _error, { container, dest_container }) =>
      invalidate(...containerWriteKeys(container, dest_container)),
  });
}

/**
 * The object a name the bulk delete could not delete stands for: the
 * backend reports a name (`photos/a.jpg`) or Swift's quoted path
 * (`/<container>/photos/a.jpg`).
 */
function failedName(container: string, entry: string): string {
  let name = entry;
  try {
    name = decodeURIComponent(entry);
  } catch {
    // A name with a stray "%" was never quoted.
  }
  const prefix = `/${container}/`;
  return name.startsWith(prefix) ? name.slice(prefix.length) : name;
}

/**
 * Splits a bulk delete's result over the objects asked for: an object
 * failed when its name is among `failed`, and a folder failed when it or
 * anything inside it did. The backend gives no reason for
 * a failure, so the failures carry no error.
 */
export function deleteOutcome(
  container: string,
  objects: StoreObject[],
  result: DeleteObjectsResult,
): BulkOutcome<StoreObject> {
  const failed = result.failed.map((entry) => failedName(container, entry));
  const didFail = (object: StoreObject) => {
    const inside = object.name.endsWith("/") ? object.name : `${object.name}/`;
    return failed.some(
      (name) =>
        name === object.name || (object.is_folder && name.startsWith(inside)),
    );
  };
  const outcome: BulkOutcome<StoreObject> = { succeeded: [], failed: [] };
  for (const object of objects) {
    if (didFail(object))
      outcome.failed.push({ item: object, error: undefined });
    else outcome.succeeded.push(object);
  }
  return outcome;
}

/**
 * Deletes objects and folders (with everything in them) in one request:
 * the backend's bulk delete, which reports the names it could not delete.
 */
export async function deleteObjects(
  container: string,
  objects: StoreObject[],
): Promise<BulkOutcome<StoreObject>> {
  const result = await apiFetch<DeleteObjectsResult>(
    `${containerPath(container)}/delete`,
    { method: "POST", json: { names: objects.map((object) => object.name) } },
  );
  return deleteOutcome(container, objects, result);
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
  return apiFetch<UploadCompleted>(`${objectPath(container, name)}/manifest`, {
    method: "POST",
    json: { segments },
  });
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
