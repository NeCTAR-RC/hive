// Mocked API for the object store panels: containers, folders, objects
// and uploads.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type { Container, StoreObject } from "../../lib/api/types/objectstore";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  containerCreateBody,
  containerUpdateBody,
  copyObjectBody,
  deleteObjectsBody,
  folderCreateBody,
  uploadPlanBody,
} from "./schemas";

let containers: Container[] = [
  {
    name: "docs",
    object_count: 3,
    bytes: 4096,
    public_url: "https://store.test/v1/AUTH_p1/docs",
  },
  {
    name: "backups",
    object_count: 0,
    bytes: 0,
    public_url: "https://store.test/v1/AUTH_p1/backups",
  },
  {
    name: "archive",
    object_count: 0,
    bytes: 0,
    public_url: "https://store.test/v1/AUTH_p1/archive",
  },
];
const publicContainers = new Set<string>(["docs"]);
/** The backend's page of a folder listing (`hive.clients.swift`). */
const LISTING_PAGE = 500;

/**
 * Folders (as "container/folder/") holding more objects than a recursive
 * delete can list before the backend's page cap; deleting one is refused
 * with `listing_truncated`, as the backend refuses it.
 */
const OVERSIZED_FOLDERS = new Set(["archive/aged/"]);

let objects: Record<string, StoreObject[]> = {
  docs: [
    {
      name: "notes/",
      basename: "notes",
      is_folder: true,
      bytes: 0,
      content_type: "application/directory",
      hash: null,
      last_modified: null,
    },
    {
      name: "readme.txt",
      basename: "readme.txt",
      is_folder: false,
      bytes: 1024,
      content_type: "text/plain",
      hash: "abc",
      last_modified: "2026-10-09T01:00:00.000000",
    },
    {
      name: "notes/todo.txt",
      basename: "todo.txt",
      is_folder: false,
      bytes: 3072,
      content_type: "text/plain",
      hash: "def",
      last_modified: "2026-10-08T01:00:00.000000",
    },
  ],
  backups: [],
  // More entries than one listing page holds, so the folder loads more.
  archive: [
    {
      name: "aged/",
      basename: "aged",
      is_folder: true,
      bytes: 0,
      content_type: "application/directory",
      hash: null,
      last_modified: null,
    },
    ...archiveLogs(),
  ],
};

/** 520 daily log objects, more than a listing page. */
function archiveLogs(): StoreObject[] {
  return Array.from({ length: LISTING_PAGE + 20 }, (_, index) => {
    const name = `log-${String(index + 1).padStart(4, "0")}.txt`;
    return {
      name,
      basename: name,
      is_folder: false,
      bytes: 1024,
      content_type: "text/plain",
      hash: null,
      last_modified: "2026-10-01T00:00:00.000000",
    };
  });
}

/**
 * The container with its object count and bytes counted from the state, as
 * Swift reports them (folder markers count as objects).
 */
function withStats(container: Container): Container {
  const list = objects[container.name] ?? [];
  return {
    ...container,
    object_count: list.length,
    bytes: list.reduce((sum, o) => sum + o.bytes, 0),
  };
}

/**
 * One page of a folder's listing, in name order after `marker`, as the
 * backend pages Swift: `has_more` and the marker of the next page.
 */
function listing(container: string, path: string, marker: string | null) {
  const prefix = path ? `${path.replace(/^\/+|\/+$/g, "")}/` : "";
  const items = (objects[container] ?? [])
    .filter((o) => o.name.startsWith(prefix) && o.name !== prefix)
    .filter(
      (o) => !o.name.slice(prefix.length).replace(/\/$/, "").includes("/"),
    )
    .map((o) => ({
      ...o,
      basename: o.name.slice(prefix.length).replace(/\/$/, ""),
    }));
  const after = items
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((o) => !marker || o.name > marker);
  const page = after.slice(0, LISTING_PAGE);
  const hasMore = after.length > LISTING_PAGE;
  return {
    container,
    prefix,
    items: page,
    has_more: hasMore,
    next_marker: hasMore ? (page[page.length - 1]?.name ?? null) : null,
  };
}

export const objectStoreHandlers = [
  http.get("/api/object-store/info", () =>
    HttpResponse.json<Reply<"/api/object-store/info", "get">>({
      upload_mode: "tempurl",
      max_file_size: 5368709120,
      segment_bytes: 1073741824,
      proxy_max_bytes: 5368709120,
      slo: true,
      bulk_delete: 1000,
      policies: [{ name: "default-placement", default: true }],
      account: {
        container_count: containers.length,
        object_count: containers
          .map(withStats)
          .reduce((sum, c) => sum + c.object_count, 0),
        bytes: containers.map(withStats).reduce((sum, c) => sum + c.bytes, 0),
        quota_containers: "1000",
        quota_bytes: null,
      },
      public_url: "https://store.test/v1/AUTH_p1",
    }),
  ),
  http.get("/api/object-store/containers", () =>
    HttpResponse.json<Reply<"/api/object-store/containers", "get">>({
      items: containers.map(withStats),
      truncated: false,
    }),
  ),
  http.post("/api/object-store/containers", async ({ request }) => {
    const body = await readBody(request, containerCreateBody);
    if (containers.some((c) => c.name === body.name)) {
      return apiError(
        409,
        "conflict",
        `A container named "${body.name}" already exists.`,
      );
    }
    const created = {
      name: body.name,
      object_count: 0,
      bytes: 0,
      public_url: `https://store.test/v1/AUTH_p1/${body.name}`,
    };
    containers = [...containers, created];
    objects[body.name] = [];
    if (body.is_public) publicContainers.add(body.name);
    return HttpResponse.json<Reply<"/api/object-store/containers", "post">>(
      {
        ...created,
        is_public: body.is_public,
        read_acl: null,
        storage_policy: "default-placement",
        cors_origin: null,
        metadata: {},
        timestamp: null,
      },
      { status: 201 },
    );
  }),
  http.get("/api/object-store/containers/:container", ({ params }) => {
    const found = containers.find((c) => c.name === params["container"]);
    if (!found) return notFound();
    return HttpResponse.json<
      Reply<"/api/object-store/containers/{container}", "get">
    >({
      ...withStats(found),
      is_public: publicContainers.has(found.name),
      read_acl: null,
      storage_policy: "default-placement",
      cors_origin: null,
      metadata: {},
      timestamp: null,
    });
  }),
  http.patch(
    "/api/object-store/containers/:container",
    async ({ params, request }) => {
      const body = await readBody(request, containerUpdateBody);
      const name = String(params["container"]);
      if (body.is_public) publicContainers.add(name);
      else if (body.is_public === false) publicContainers.delete(name);
      const found = containers.find((c) => c.name === name)!;
      return HttpResponse.json<
        Reply<"/api/object-store/containers/{container}", "patch">
      >({
        ...withStats(found),
        is_public: publicContainers.has(name),
        read_acl: null,
        storage_policy: "default-placement",
        cors_origin: null,
        metadata: {},
        timestamp: null,
      });
    },
  ),
  http.delete(
    "/api/object-store/containers/:container",
    ({ params, request }) => {
      const name = String(params["container"]);
      const withObjects =
        new URL(request.url).searchParams.get("with_objects") === "true";
      if (withObjects) objects = { ...objects, [name]: [] };
      if ((objects[name] ?? []).length > 0) {
        return apiError(
          409,
          "conflict",
          "The container must be empty before it can be deleted.",
        );
      }
      containers = containers.filter((c) => c.name !== name);
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.get(
    "/api/object-store/containers/:container/objects",
    ({ params, request }) =>
      HttpResponse.json<
        Reply<"/api/object-store/containers/{container}/objects", "get">
      >(
        listing(
          String(params["container"]),
          new URL(request.url).searchParams.get("path") ?? "",
          new URL(request.url).searchParams.get("marker"),
        ),
      ),
  ),
  http.post(
    "/api/object-store/containers/:container/folders",
    async ({ params, request }) => {
      const body = await readBody(request, folderCreateBody);
      const name = `${body.path.replace(/^\/+|\/+$/g, "")}/`;
      const list = objects[String(params["container"])] ?? [];
      list.push({
        name,
        basename: name,
        is_folder: true,
        bytes: 0,
        content_type: "application/directory",
        hash: null,
        last_modified: null,
      });
      objects = { ...objects, [String(params["container"])]: list };
      return HttpResponse.json<
        Reply<"/api/object-store/containers/{container}/folders", "post">
      >({ name, is_folder: true }, { status: 201 });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/upload-plan",
    async ({ request }) => {
      const body = await readBody(request, uploadPlanBody);
      return HttpResponse.json<
        Reply<"/api/object-store/containers/{container}/upload-plan", "post">
      >({
        mode: "proxy",
        max_bytes: 5368709120,
        objects: body.objects.map((o) => ({
          name: o.name,
          size: o.size,
          url: null,
          manifest: false,
          segments: null,
        })),
      });
    },
  ),
  http.put(
    "/api/object-store/containers/:container/objects/*",
    async ({ params, request }) => {
      const container = String(params["container"]);
      const name = decodeURIComponent(
        new URL(request.url).pathname.split("/objects/")[1] ?? "",
      );
      const bytes = (await request.arrayBuffer()).byteLength;
      const list = (objects[container] ?? []).filter((o) => o.name !== name);
      list.push({
        name,
        basename: name,
        is_folder: false,
        bytes,
        content_type: request.headers.get("content-type"),
        hash: "new",
        last_modified: new Date().toISOString(),
      });
      objects = { ...objects, [container]: list };
      return HttpResponse.json<
        Reply<"/api/object-store/containers/{container}/objects/{name}", "put">
      >({ name, etag: "new" }, { status: 201 });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/delete",
    async ({ params, request }) => {
      const body = await readBody(request, deleteObjectsBody);
      const container = String(params["container"]);
      const oversized = body.names.find((name) =>
        OVERSIZED_FOLDERS.has(`${container}/${name}`),
      );
      if (oversized) {
        return apiError(
          409,
          "listing_truncated",
          `"${oversized}" holds too many objects to delete here; use the OpenStack command line tools instead.`,
        );
      }
      const before = objects[container] ?? [];
      const after = before.filter(
        (o) =>
          !body.names.some(
            (n) => o.name === n || (n.endsWith("/") && o.name.startsWith(n)),
          ),
      );
      objects = { ...objects, [container]: after };
      return HttpResponse.json<
        Reply<"/api/object-store/containers/{container}/delete", "post">
      >({
        deleted: before.length - after.length,
        failed: [],
      });
    },
  ),
  http.get(
    "/api/object-store/containers/:container/objects/*",
    ({ params, request }) => {
      const url = new URL(request.url);
      const rest = url.pathname.split("/objects/")[1] ?? "";
      if (rest.endsWith("/metadata")) {
        const name = decodeURIComponent(rest.slice(0, -"/metadata".length));
        const found = (objects[String(params["container"])] ?? []).find(
          (o) => o.name === name,
        );
        return HttpResponse.json<
          Reply<
            "/api/object-store/containers/{container}/objects/{name}/metadata",
            "get"
          >
        >({
          name,
          container: String(params["container"]),
          orig_filename: null,
          bytes: found?.bytes ?? 0,
          content_type: found?.content_type ?? null,
          hash: found?.hash ?? null,
          last_modified: found?.last_modified ?? null,
          timestamp: null,
          is_slo: false,
          manifest: null,
          metadata: { owner: "ada" },
        });
      }
      return new HttpResponse("mock file contents", {
        headers: { "Content-Type": "text/plain" },
      });
    },
  ),
  http.post(
    "/api/object-store/containers/:container/objects/*/copy",
    async ({ params, request }) => {
      const body = await readBody(request, copyObjectBody);
      const list = objects[body.dest_container] ?? [];
      // The backend refuses a taken destination (copy_object), so a
      // listing never holds a name twice.
      if (list.some((o) => o.name === body.dest_name)) {
        return apiError(
          409,
          "conflict",
          `"${body.dest_name}" already exists in ${body.dest_container}.`,
        );
      }
      const sourceName = decodeURIComponent(
        (new URL(request.url).pathname.split("/objects/")[1] ?? "").replace(
          /\/copy$/,
          "",
        ),
      );
      const source = (objects[String(params["container"])] ?? []).find(
        (o) => o.name === sourceName,
      );
      list.push({
        name: body.dest_name,
        basename: body.dest_name,
        is_folder: false,
        bytes: source?.bytes ?? 0,
        content_type: "text/plain",
        hash: "copy",
        last_modified: new Date().toISOString(),
      });
      objects = { ...objects, [body.dest_container]: list };
      return HttpResponse.json<
        Reply<
          "/api/object-store/containers/{container}/objects/{name}/copy",
          "post"
        >
      >(
        { container: body.dest_container, name: body.dest_name },
        { status: 201 },
      );
    },
  ),
  http.post(
    "/api/object-store/containers/:container/objects/*/manifest",
    ({ request }) => {
      const rest = new URL(request.url).pathname.split("/objects/")[1] ?? "";
      return HttpResponse.json<
        Reply<
          "/api/object-store/containers/{container}/objects/{name}/manifest",
          "post"
        >
      >(
        {
          name: decodeURIComponent(rest.replace(/\/manifest$/, "")),
          bytes: 0,
          is_slo: true,
        },
        { status: 201 },
      );
    },
  ),
];
