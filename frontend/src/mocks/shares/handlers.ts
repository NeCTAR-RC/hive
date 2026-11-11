// Mocked API for the share panels: shares, snapshots, security services
// and share groups.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  SecurityService,
  Share,
  ShareGroup,
  ShareGroupSnapshot,
  ShareSnapshot,
} from "../../lib/api/types/shares";
import { nextId } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  accessRuleBody,
  groupSnapshotCreateBody,
  groupSnapshotUpdateBody,
  securityServiceBody,
  securityServiceUpdateBody,
  shareCreateBody,
  shareGroupCreateBody,
  shareGroupUpdateBody,
  shareMetadataBody,
  shareResizeBody,
  shareRevertBody,
  shareUpdateBody,
  snapshotAccessBody,
  snapshotCreateBody,
  snapshotUpdateBody,
} from "./schemas";

const shareBase = (
  overrides: Partial<Share> & { id: string; name: string },
): Share => ({
  description: null,
  size: 5,
  status: "available",
  protocol: "CEPHFS",
  is_public: false,
  share_type: "cephfs_share_type",
  share_type_id: "st-1",
  availability_zone: "ardctest-artm",
  share_group_id: null,
  snapshot_id: null,
  metadata: {},
  created_at: "2026-09-10T00:00:00",
  snapshot_support: true,
  revert_to_snapshot_support: true,
  mount_snapshot_support: true,
  has_snapshot: false,
  is_transitional: false,
  actions: [
    "edit",
    "metadata",
    "snapshot",
    "resize",
    "revert",
    "rules",
    "delete",
  ],
  ...overrides,
});
let shares: Share[] = [
  shareBase({
    id: "share-1",
    name: "datasets",
    description: "Project data",
    metadata: { owner: "sam" },
  }),
  shareBase({
    id: "share-2",
    name: "scratch",
    status: "creating",
    is_transitional: true,
    actions: ["rules"],
  }),
];
let shareSnapshots: ShareSnapshot[] = [
  {
    id: "ssnap-1",
    name: "datasets-snap",
    description: null,
    size: 5,
    status: "available",
    share_id: "share-1",
    share_name: "datasets",
    share_proto: "CEPHFS",
    share_size: 5,
    created_at: "2026-09-12T00:00:00",
    is_transitional: false,
    actions: ["edit", "create_share", "rules", "delete"],
  },
];
let securityServices: SecurityService[] = [
  {
    id: "ss-1",
    name: "corp-ad",
    description: null,
    type: "active_directory",
    type_label: "Active Directory",
    dns_ip: "10.0.0.2",
    ou: null,
    server: "ad.corp.example",
    domain: "corp.example",
    user: "svc",
    status: null,
    created_at: "2026-09-01T00:00:00",
  },
];
let shareGroups: ShareGroup[] = [
  {
    id: "sg-1",
    name: "group-a",
    description: null,
    status: "available",
    availability_zone: "ardctest-artm",
    share_group_type_id: "sgt-1",
    share_types: ["st-1"],
    source_share_group_snapshot_id: null,
    consistent_snapshot_support: null,
    created_at: "2026-09-05T00:00:00",
    is_transitional: false,
    actions: ["snapshot", "edit", "delete"],
  },
];
let shareGroupSnapshots: ShareGroupSnapshot[] = [];
/** Manila's absolute limits, the used figures counted from the state. */
const shareLimits = () => {
  const total = (items: { size: number | null }[]) =>
    items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  return {
    maxTotalShares: 10,
    totalSharesUsed: shares.length,
    maxTotalShareGigabytes: 100,
    totalShareGigabytesUsed: total(shares),
    maxTotalShareSnapshots: 10,
    totalShareSnapshotsUsed: shareSnapshots.length,
    maxTotalSnapshotGigabytes: 100,
    totalSnapshotGigabytesUsed: total(shareSnapshots),
  };
};

export const shareHandlers = [
  http.get("/api/shares/options", () =>
    HttpResponse.json<Reply<"/api/shares/options", "get">>({
      protocols: ["CephFS"],
      share_types: [
        {
          id: "st-1",
          name: "cephfs_share_type",
          description: null,
          is_public: true,
          driver_handles_share_servers: false,
          snapshot_support: true,
          extra_specs: {},
        },
      ],
      availability_zones: ["ardctest-artm"],
      // Manila sizes every snapshot and ties it to its share.
      snapshots: shareSnapshots.flatMap((s) =>
        s.size === null || s.share_id === null
          ? []
          : [{ id: s.id, name: s.name, size: s.size, share_id: s.share_id }],
      ),
      share_groups: shareGroups.map((g) => ({
        id: g.id,
        name: g.name,
        availability_zone: g.availability_zone,
      })),
      share_group_types: [
        {
          id: "sgt-1",
          name: "default",
          share_types: ["st-1"],
          group_specs: {},
        },
      ],
      quota: shareLimits(),
      can_create: true,
      create_reason: null,
      can_snapshot: true,
      snapshot_reason: null,
      public_shares_allowed: false,
      access_types: ["ip", "user", "cert", "cephx"],
      access_levels: ["rw", "ro"],
      security_service_types: ["active_directory", "ldap", "kerberos"],
    }),
  ),
  http.get("/api/shares/shares", () =>
    HttpResponse.json<Reply<"/api/shares/shares", "get">>({
      items: shares.map((s) => ({
        ...s,
        has_snapshot: shareSnapshots.some((snap) => snap.share_id === s.id),
        actions: shareSnapshots.some((snap) => snap.share_id === s.id)
          ? s.actions.filter((a) => a !== "delete")
          : s.actions,
      })),
      quota: shareLimits(),
      can_create: true,
      create_reason: null,
    }),
  ),
  http.post("/api/shares/shares", async ({ request }) => {
    const body = await readBody(request, shareCreateBody);
    const share = shareBase({
      id: nextId("share"),
      name: body.name,
      size: body.size,
      protocol: body.protocol.toUpperCase(),
      status: "creating",
      is_transitional: true,
      actions: ["rules"],
    });
    shares.push(share);
    return HttpResponse.json<Reply<"/api/shares/shares", "post">>(share, {
      status: 202,
    });
  }),
  http.get("/api/shares/shares/:id", ({ params }) => {
    const share = shares.find((s) => s.id === params["id"]);
    if (!share) return notFound();
    return HttpResponse.json<Reply<"/api/shares/shares/{share_id}", "get">>({
      ...share,
      has_snapshot: shareSnapshots.some((snap) => snap.share_id === share.id),
      host: null,
      task_state: null,
      export_locations:
        share.status === "available"
          ? [
              {
                path: "10.0.0.9:/volumes/_nogroup/abc",
                preferred: true,
                id: "el-1",
              },
            ]
          : [],
      access_rules: [
        {
          id: "ar-1",
          access_type: "cephx",
          access_to: "alice",
          access_level: "rw",
          state: "active",
          access_key: "AQ==",
          metadata: {},
          created_at: null,
          updated_at: null,
        },
      ],
    });
  }),
  http.patch("/api/shares/shares/:id", async ({ params, request }) => {
    const body = await readBody(request, shareUpdateBody);
    const share = shares.find((s) => s.id === params["id"]);
    if (share) Object.assign(share, body);
    return HttpResponse.json<Reply<"/api/shares/shares/{share_id}", "patch">>(
      share,
    );
  }),
  http.delete("/api/shares/shares/:id", ({ params }) => {
    shares = shares.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("/api/shares/shares/:id/metadata", async ({ params, request }) => {
    const body = await readBody(request, shareMetadataBody);
    const metadata = Object.fromEntries(
      body.metadata
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => l.split("=", 2) as [string, string]),
    );
    const share = shares.find((s) => s.id === params["id"]);
    if (share) share.metadata = metadata;
    return HttpResponse.json<
      Reply<"/api/shares/shares/{share_id}/metadata", "put">
    >({ metadata });
  }),
  http.post("/api/shares/shares/:id/resize", async ({ params, request }) => {
    const body = await readBody(request, shareResizeBody);
    const share = shares.find((s) => s.id === params["id"]);
    if (share) share.size = body.size;
    return HttpResponse.json<
      Reply<"/api/shares/shares/{share_id}/resize", "post">
    >({ id: String(params["id"]), size: body.size }, { status: 202 });
  }),
  http.post("/api/shares/shares/:id/revert", async ({ params, request }) => {
    const { snapshot_id } = await readBody(request, shareRevertBody);
    // Manila reverts only to the newest snapshot, as the backend checks.
    const newest = shareSnapshots
      .filter((snapshot) => snapshot.share_id === String(params["id"]))
      .sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      )[0];
    if (newest?.id !== snapshot_id) {
      return apiError(
        400,
        "bad_request",
        "Only the newest snapshot can be reverted to.",
      );
    }
    return HttpResponse.json<
      Reply<"/api/shares/shares/{share_id}/revert", "post">
    >({ id: String(params["id"]), snapshot_id }, { status: 202 });
  }),
  http.get("/api/shares/shares/:id/access", ({ params }) => {
    const share = shares.find((s) => s.id === params["id"]);
    if (!share) return notFound("share not found", "manila");
    return HttpResponse.json<
      Reply<"/api/shares/shares/{share_id}/access", "get">
    >({
      share,
      items: [
        {
          id: "ar-1",
          access_type: "cephx",
          access_to: "alice",
          access_level: "rw",
          state: "active",
          access_key: "AQ==",
          metadata: {},
          created_at: null,
          updated_at: null,
        },
      ],
      can_add: share.status === "available",
    });
  }),
  http.post("/api/shares/shares/:id/access", async ({ request }) => {
    const body = await readBody(request, accessRuleBody);
    return HttpResponse.json<
      Reply<"/api/shares/shares/{share_id}/access", "post">
    >(
      {
        id: nextId("ar"),
        ...body,
        state: "queued_to_apply",
        access_key: null,
        metadata: {},
        created_at: null,
        updated_at: null,
      },
      { status: 202 },
    );
  }),
  http.delete(
    "/api/shares/shares/:id/access/:rule",
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get("/api/shares/snapshots", () =>
    HttpResponse.json<Reply<"/api/shares/snapshots", "get">>({
      items: shareSnapshots,
      quota: shareLimits(),
    }),
  ),
  http.post("/api/shares/snapshots", async ({ request }) => {
    const body = await readBody(request, snapshotCreateBody);
    const share = shares.find((s) => s.id === body.share_id);
    const snapshot: ShareSnapshot = {
      id: nextId("ssnap"),
      name: body.name,
      description: null,
      size: share?.size ?? 1,
      status: "creating",
      share_id: body.share_id,
      share_name: share?.name ?? null,
      share_proto: share?.protocol ?? null,
      share_size: share?.size ?? null,
      created_at: new Date().toISOString(),
      is_transitional: true,
      actions: ["edit"],
    };
    shareSnapshots.push(snapshot);
    return HttpResponse.json<Reply<"/api/shares/snapshots", "post">>(snapshot, {
      status: 202,
    });
  }),
  http.get("/api/shares/snapshots/:id", ({ params }) => {
    const snapshot = shareSnapshots.find((s) => s.id === params["id"]);
    if (!snapshot) return notFound();
    return HttpResponse.json<
      Reply<"/api/shares/snapshots/{snapshot_id}", "get">
    >({
      ...snapshot,
      mount_snapshot_support: true,
      export_locations: [{ path: "10.0.0.9:/snapshots/abc", id: "sel-1" }],
      access_rules: [
        {
          id: "sa-1",
          access_type: "ip",
          access_to: "10.0.0.5",
          state: "active",
        },
      ],
    });
  }),
  http.patch("/api/shares/snapshots/:id", async ({ params, request }) => {
    const body = await readBody(request, snapshotUpdateBody);
    const snapshot = shareSnapshots.find((s) => s.id === params["id"]);
    if (snapshot) Object.assign(snapshot, body);
    return HttpResponse.json<
      Reply<"/api/shares/snapshots/{snapshot_id}", "patch">
    >(snapshot);
  }),
  http.delete("/api/shares/snapshots/:id", ({ params }) => {
    shareSnapshots = shareSnapshots.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/shares/snapshots/:id/access", async ({ request }) => {
    const body = await readBody(request, snapshotAccessBody);
    return HttpResponse.json<
      Reply<"/api/shares/snapshots/{snapshot_id}/access", "post">
    >({ id: nextId("sa"), ...body, state: "queued_to_apply" }, { status: 202 });
  }),
  http.delete(
    "/api/shares/snapshots/:id/access/:rule",
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get("/api/shares/security-services", () =>
    HttpResponse.json<Reply<"/api/shares/security-services", "get">>({
      items: securityServices,
      types: ["active_directory", "ldap", "kerberos"],
    }),
  ),
  http.post("/api/shares/security-services", async ({ request }) => {
    const body = await readBody(request, securityServiceBody);
    const labels: Record<string, string> = {
      active_directory: "Active Directory",
      ldap: "LDAP",
      kerberos: "Kerberos",
    };
    const service: SecurityService = {
      id: nextId("ss"),
      name: body.name,
      description: body.description ?? null,
      type: body.type,
      type_label: labels[body.type] ?? body.type,
      dns_ip: body.dns_ip,
      ou: body.ou ?? null,
      server: body.server,
      domain: body.domain,
      user: body.user ?? null,
      status: null,
      created_at: null,
    };
    securityServices.push(service);
    return HttpResponse.json<Reply<"/api/shares/security-services", "post">>(
      service,
      { status: 201 },
    );
  }),
  http.get("/api/shares/security-services/:id", ({ params }) => {
    const service = securityServices.find((s) => s.id === params["id"]);
    return service
      ? HttpResponse.json<
          Reply<"/api/shares/security-services/{service_id}", "get">
        >(service)
      : notFound();
  }),
  http.patch(
    "/api/shares/security-services/:id",
    async ({ params, request }) => {
      const body = await readBody(request, securityServiceUpdateBody);
      const service = securityServices.find((s) => s.id === params["id"]);
      if (service) Object.assign(service, body);
      return HttpResponse.json<
        Reply<"/api/shares/security-services/{service_id}", "patch">
      >(service);
    },
  ),
  http.delete("/api/shares/security-services/:id", ({ params }) => {
    securityServices = securityServices.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/shares/groups", () =>
    HttpResponse.json<Reply<"/api/shares/groups", "get">>({
      items: shareGroups,
    }),
  ),
  http.post("/api/shares/groups", async ({ request }) => {
    const body = await readBody(request, shareGroupCreateBody);
    const group: ShareGroup = {
      ...shareGroups[0]!,
      id: nextId("sg"),
      name: body.name,
      status: "creating",
      is_transitional: true,
      actions: [],
    };
    shareGroups.push(group);
    return HttpResponse.json<Reply<"/api/shares/groups", "post">>(group, {
      status: 202,
    });
  }),
  http.get("/api/shares/groups/:id", ({ params }) => {
    const group = shareGroups.find((g) => g.id === params["id"]);
    if (!group) return notFound();
    return HttpResponse.json<Reply<"/api/shares/groups/{group_id}", "get">>({
      ...group,
      share_types_detail: [{ id: "st-1", name: "cephfs_share_type" }],
      members: shares.filter((s) => s.share_group_id === group.id),
    });
  }),
  http.patch("/api/shares/groups/:id", async ({ params, request }) => {
    const body = await readBody(request, shareGroupUpdateBody);
    const group = shareGroups.find((g) => g.id === params["id"]);
    if (group) Object.assign(group, body);
    return HttpResponse.json<Reply<"/api/shares/groups/{group_id}", "patch">>(
      group,
    );
  }),
  http.delete("/api/shares/groups/:id", ({ params }) => {
    shareGroups = shareGroups.filter((g) => g.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/shares/group-snapshots", () =>
    HttpResponse.json<Reply<"/api/shares/group-snapshots", "get">>({
      items: shareGroupSnapshots,
    }),
  ),
  http.post("/api/shares/group-snapshots", async ({ request }) => {
    const body = await readBody(request, groupSnapshotCreateBody);
    const group = shareGroups.find((g) => g.id === body.share_group_id);
    const snapshot: ShareGroupSnapshot = {
      id: nextId("sgs"),
      name: body.name,
      description: null,
      status: "creating",
      share_group_id: body.share_group_id,
      share_group_name: group?.name ?? null,
      created_at: null,
      members: [],
      is_transitional: true,
      actions: [],
    };
    shareGroupSnapshots.push(snapshot);
    return HttpResponse.json<Reply<"/api/shares/group-snapshots", "post">>(
      snapshot,
      { status: 202 },
    );
  }),
  http.get("/api/shares/group-snapshots/:id", ({ params }) => {
    const snapshot = shareGroupSnapshots.find((s) => s.id === params["id"]);
    return snapshot
      ? HttpResponse.json<
          Reply<"/api/shares/group-snapshots/{snapshot_id}", "get">
        >(snapshot)
      : notFound();
  }),
  http.patch("/api/shares/group-snapshots/:id", async ({ params, request }) => {
    const body = await readBody(request, groupSnapshotUpdateBody);
    const snapshot = shareGroupSnapshots.find((s) => s.id === params["id"]);
    if (snapshot) Object.assign(snapshot, body);
    return HttpResponse.json<
      Reply<"/api/shares/group-snapshots/{snapshot_id}", "patch">
    >(snapshot);
  }),
  http.delete("/api/shares/group-snapshots/:id", ({ params }) => {
    shareGroupSnapshots = shareGroupSnapshots.filter(
      (s) => s.id !== params["id"],
    );
    return new HttpResponse(null, { status: 204 });
  }),
];
