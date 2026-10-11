// Mocked API for the orchestration, DNS, share and database panels.
import { http, HttpResponse } from "msw";
import type {
  DbBackup,
  DbConfiguration,
  DbInstance,
  DbInstanceDetail,
  DbLog,
  ParameterSpec,
  RecordSet,
  SecurityService,
  Share,
  ShareGroup,
  ShareGroupSnapshot,
  ShareSnapshot,
  Stack,
  StackDetail,
  Zone,
} from "../lib/api/types";

let counter = 100;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

// --- orchestration -------------------------------------------------------------

const stackBase = (
  overrides: Partial<Stack> & { id: string; name: string },
): Stack => ({
  description: null,
  status: "CREATE_COMPLETE",
  status_reason: "Stack CREATE completed successfully",
  creation_time: "2026-10-01T01:00:00Z",
  updated_time: null,
  deletion_time: null,
  timeout_mins: 60,
  disable_rollback: true,
  tags: [],
  parent: null,
  stack_owner: "sam",
  is_transitional: false,
  actions: ["suspend", "check", "update", "delete"],
  ...overrides,
});

let stacks: StackDetail[] = [
  {
    ...stackBase({
      id: "stack-1",
      name: "web-tier",
      description: "Two web servers",
    }),
    parameters: { "OS::stack_id": "stack-1", count: "2", flavor: "m3.small" },
    outputs: [
      {
        key: "ip",
        value: "203.0.113.10",
        description: "Public address",
        error: null,
      },
    ],
    capabilities: [],
    notification_topics: [],
    template_description: "Two web servers",
  },
  {
    ...stackBase({
      id: "stack-2",
      name: "building",
      status: "CREATE_IN_PROGRESS",
      status_reason: "Stack CREATE started",
      is_transitional: true,
      actions: ["delete"],
    }),
    parameters: {},
    outputs: [],
    capabilities: [],
    notification_topics: [],
    template_description: null,
  },
];

const PARAMETERS: ParameterSpec[] = [
  {
    name: "flavor",
    type: "string",
    label: "Flavour",
    description: "Server size",
    group: "Sizing",
    default: "m3.small",
    no_echo: false,
    required: false,
    allowed_values: ["m3.small", "m3.medium"],
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    custom_constraint: "nova.flavor",
    constraint_description: null,
  },
  {
    name: "count",
    type: "number",
    label: "Server count",
    description: "",
    group: "Sizing",
    default: 1,
    no_echo: false,
    required: false,
    allowed_values: null,
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: 1,
    max_value: 5,
    custom_constraint: null,
    constraint_description: null,
  },
  {
    name: "key_name",
    type: "string",
    label: "Key pair",
    description: "SSH key pair name",
    group: null,
    default: null,
    no_echo: false,
    required: true,
    allowed_values: null,
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    custom_constraint: "nova.keypair",
    constraint_description: null,
  },
];

const orchestrationHandlers = [
  http.get("/api/orchestration/stacks", () =>
    HttpResponse.json({ items: stacks }),
  ),
  http.post("/api/orchestration/validate", async ({ request }) => {
    const body = (await request.json()) as {
      template?: string;
      template_url?: string;
    };
    if (!body.template && !body.template_url) {
      return HttpResponse.json(
        {
          error: "bad_request",
          message: "Provide a template or a template URL.",
        },
        { status: 400 },
      );
    }
    if (body.template?.includes("broken")) {
      return HttpResponse.json(
        {
          error: "bad_request",
          message: "The template is not valid YAML or JSON.",
        },
        { status: 400 },
      );
    }
    return HttpResponse.json({
      description: "Two web servers",
      parameters: PARAMETERS,
    });
  }),
  http.post("/api/orchestration/stacks", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      parameters: Record<string, unknown>;
    };
    const id = nextId("stack");
    stacks.push({
      ...stackBase({
        id,
        name: body.name,
        status: "CREATE_IN_PROGRESS",
        status_reason: "Stack CREATE started",
        is_transitional: true,
        actions: ["delete"],
      }),
      parameters: body.parameters,
      outputs: [],
      capabilities: [],
      notification_topics: [],
      template_description: null,
    });
    return HttpResponse.json({ id, name: body.name }, { status: 202 });
  }),
  http.get("/api/orchestration/stacks/:id", ({ params }) => {
    const stack = stacks.find((s) => s.id === params["id"]);
    return stack
      ? HttpResponse.json(stack)
      : HttpResponse.json(
          { error: "not_found", message: "no such stack" },
          { status: 404 },
        );
  }),
  http.patch("/api/orchestration/stacks/:id", ({ params }) => {
    const stack = stacks.find((s) => s.id === params["id"]);
    if (stack) {
      stack.status = "UPDATE_IN_PROGRESS";
      stack.is_transitional = true;
      stack.actions = ["delete"];
    }
    return HttpResponse.json(
      { id: params["id"], name: stack?.name },
      { status: 202 },
    );
  }),
  http.post("/api/orchestration/stacks/:id/actions/:action", ({ params }) => {
    const stack = stacks.find((s) => s.id === params["id"]);
    if (stack && params["action"] === "suspend") {
      stack.status = "SUSPEND_COMPLETE";
      stack.actions = ["resume", "update", "delete"];
    }
    if (stack && params["action"] === "resume") {
      stack.status = "RESUME_COMPLETE";
      stack.actions = ["suspend", "check", "update", "delete"];
    }
    return HttpResponse.json(
      { id: params["id"], action: params["action"] },
      { status: 202 },
    );
  }),
  http.delete("/api/orchestration/stacks/:id", ({ params }) => {
    stacks = stacks.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/orchestration/stacks/:id/resources", () =>
    HttpResponse.json({
      items: [
        {
          name: "server",
          logical_id: "server",
          physical_id: "i-1",
          type: "OS::Nova::Server",
          status: "CREATE_COMPLETE",
          status_reason: "state changed",
          updated_time: "2026-10-01T01:02:00Z",
          creation_time: "2026-10-01T01:00:00Z",
          required_by: [],
          is_transitional: false,
          attributes: null,
          description: null,
        },
      ],
    }),
  ),
  http.get("/api/orchestration/stacks/:id/events", () =>
    HttpResponse.json({
      items: [
        {
          id: "ev-1",
          resource_name: "server",
          logical_id: "server",
          physical_id: "i-1",
          status: "CREATE_COMPLETE",
          status_reason: "state changed",
          event_time: "2026-10-01T01:02:00Z",
        },
      ],
    }),
  ),
  http.get("/api/orchestration/stacks/:id/template", () =>
    HttpResponse.json({
      template: { heat_template_version: "2021-04-16", resources: {} },
      template_yaml: "heat_template_version: 2021-04-16\nresources: {}\n",
      environment: { parameters: { count: "2" } },
      environment_yaml: "parameters:\n  count: '2'\n",
    }),
  ),
  http.get("/api/orchestration/resource-types", () =>
    HttpResponse.json({
      items: [
        { name: "OS::Cinder::Volume", description: "A volume." },
        { name: "OS::Nova::Server", description: "A server.\n\nMore detail." },
      ],
    }),
  ),
  http.get("/api/orchestration/resource-types/*", ({ request }) => {
    const name = decodeURIComponent(
      new URL(request.url).pathname.split("/resource-types/")[1] ?? "",
    );
    return HttpResponse.json({
      name,
      attributes: { first_address: { description: "The first address" } },
      properties: {
        flavor: { type: "string", required: true, description: "The flavour" },
      },
      support_status: { status: "SUPPORTED" },
      template: { heat_template_version: "2016-10-14" },
      template_yaml: "heat_template_version: 2016-10-14\n",
    });
  }),
  http.get("/api/orchestration/template-versions", () =>
    HttpResponse.json({
      items: [
        { version: "AWSTemplateFormatVersion.2010-09-09", type: "cfn" },
        {
          version: "heat_template_version.2021-04-16",
          type: "hot",
          aliases: ["wallaby"],
        },
      ],
    }),
  ),
  http.get(
    "/api/orchestration/template-versions/:version/functions",
    ({ params }) =>
      HttpResponse.json({
        version: params["version"],
        items: [
          { functions: "get_attr", description: "Get an attribute." },
          { functions: "str_replace", description: "Replace text." },
        ],
      }),
  ),
];

// --- dns ---------------------------------------------------------------------

let zones: Zone[] = [
  {
    id: "zone-1",
    name: "example.org.",
    type: "PRIMARY",
    email: "admin@example.org",
    ttl: 3600,
    serial: 7,
    description: "Lab zone",
    status: "ACTIVE",
    action: "NONE",
    masters: [],
    shared: false,
    created_at: "2026-09-01T00:00:00",
    updated_at: null,
    is_transitional: false,
  },
];
let recordsets: RecordSet[] = [
  {
    id: "rs-soa",
    zone_id: "zone-1",
    name: "example.org.",
    type: "SOA",
    ttl: null,
    description: null,
    records: ["ns1.example.net. admin.example.org. 7 3600 600 86400 3600"],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: false,
  },
  {
    id: "rs-ns",
    zone_id: "zone-1",
    name: "example.org.",
    type: "NS",
    ttl: null,
    description: null,
    records: ["ns1.example.net."],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: false,
  },
  {
    id: "rs-www",
    zone_id: "zone-1",
    name: "www.example.org.",
    type: "A",
    ttl: 300,
    description: null,
    records: ["203.0.113.10"],
    status: "ACTIVE",
    action: "NONE",
    created_at: null,
    updated_at: null,
    is_transitional: false,
    can_edit: true,
  },
];

const dnsHandlers = [
  http.get("/api/dns/zones", () =>
    HttpResponse.json({
      items: zones,
      quota: { zones: 10, zone_recordsets: 500 },
      record_types: [
        "A",
        "AAAA",
        "CNAME",
        "MX",
        "NS",
        "PTR",
        "SPF",
        "SRV",
        "SSHFP",
        "TXT",
        "CAA",
      ],
    }),
  ),
  http.post("/api/dns/zones", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      email: string;
      ttl?: number;
      description?: string;
    };
    if (!body.name.endsWith(".")) {
      return HttpResponse.json(
        {
          error: "bad_request",
          message: "The zone name must end with a dot, such as example.com.",
        },
        { status: 400 },
      );
    }
    const zone: Zone = {
      ...zones[0]!,
      id: nextId("zone"),
      name: body.name,
      email: body.email,
      ttl: body.ttl ?? 3600,
      description: body.description ?? null,
      status: "PENDING",
      action: "CREATE",
      is_transitional: true,
    };
    zones.push(zone);
    return HttpResponse.json(zone, { status: 202 });
  }),
  http.get("/api/dns/zones/:id", ({ params }) => {
    const zone = zones.find((z) => z.id === params["id"]);
    return zone
      ? HttpResponse.json(zone)
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),
  http.patch("/api/dns/zones/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<Zone>;
    const zone = zones.find((z) => z.id === params["id"]);
    if (zone) Object.assign(zone, body);
    return HttpResponse.json(zone);
  }),
  http.delete("/api/dns/zones/:id", ({ params }) => {
    zones = zones.filter((z) => z.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/dns/zones/:id/recordsets", ({ params }) =>
    HttpResponse.json({
      zone: zones.find((z) => z.id === params["id"]) ?? zones[0],
      items: recordsets.filter((r) => r.zone_id === params["id"]),
    }),
  ),
  http.post("/api/dns/zones/:id/recordsets", async ({ params, request }) => {
    const body = (await request.json()) as {
      name: string;
      type: string;
      records: string[];
      ttl?: number;
    };
    const zone = zones.find((z) => z.id === params["id"]);
    const name = body.name
      ? body.name.endsWith(".")
        ? body.name
        : `${body.name}.${zone?.name}`
      : (zone?.name ?? "");
    const recordset: RecordSet = {
      id: nextId("rs"),
      zone_id: String(params["id"]),
      name,
      type: body.type,
      ttl: body.ttl ?? null,
      description: null,
      records: body.records,
      status: "PENDING",
      action: "CREATE",
      created_at: null,
      updated_at: null,
      is_transitional: false,
      can_edit: true,
    };
    recordsets.push(recordset);
    return HttpResponse.json(recordset, { status: 202 });
  }),
  http.put("/api/dns/zones/:id/recordsets/:rs", async ({ params, request }) => {
    const body = (await request.json()) as { records: string[]; ttl?: number };
    const recordset = recordsets.find((r) => r.id === params["rs"]);
    if (recordset) {
      recordset.records = body.records;
      if (body.ttl !== undefined) recordset.ttl = body.ttl;
    }
    return HttpResponse.json(recordset);
  }),
  http.delete("/api/dns/zones/:id/recordsets/:rs", ({ params }) => {
    recordsets = recordsets.filter((r) => r.id !== params["rs"]);
    return new HttpResponse(null, { status: 204 });
  }),
];

// --- shares ------------------------------------------------------------------

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
const shareLimits = {
  maxTotalShares: 10,
  totalSharesUsed: 2,
  maxTotalShareGigabytes: 100,
  totalShareGigabytesUsed: 10,
  maxTotalShareSnapshots: 10,
  totalShareSnapshotsUsed: 1,
  maxTotalSnapshotGigabytes: 100,
  totalSnapshotGigabytesUsed: 5,
};

const shareHandlers = [
  http.get("/api/shares/options", () =>
    HttpResponse.json({
      protocols: ["NFS", "CIFS", "CephFS"],
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
      snapshots: shareSnapshots.map((s) => ({
        id: s.id,
        name: s.name,
        size: s.size,
        share_id: s.share_id,
      })),
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
      quota: shareLimits,
      can_create: true,
      create_reason: null,
      can_snapshot: true,
      snapshot_reason: null,
      access_types: ["ip", "user", "cert", "cephx"],
      access_levels: ["rw", "ro"],
      security_service_types: ["active_directory", "ldap", "kerberos"],
    }),
  ),
  http.get("/api/shares/shares", () =>
    HttpResponse.json({
      items: shares.map((s) => ({
        ...s,
        has_snapshot: shareSnapshots.some((snap) => snap.share_id === s.id),
        actions: shareSnapshots.some((snap) => snap.share_id === s.id)
          ? s.actions.filter((a) => a !== "delete")
          : s.actions,
      })),
      quota: shareLimits,
      can_create: true,
      create_reason: null,
    }),
  ),
  http.post("/api/shares/shares", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      size: number;
      protocol: string;
    };
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
    return HttpResponse.json(share, { status: 202 });
  }),
  http.get("/api/shares/shares/:id", ({ params }) => {
    const share = shares.find((s) => s.id === params["id"]);
    if (!share)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
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
    const body = (await request.json()) as Partial<Share>;
    const share = shares.find((s) => s.id === params["id"]);
    if (share) Object.assign(share, body);
    return HttpResponse.json(share);
  }),
  http.delete("/api/shares/shares/:id", ({ params }) => {
    shares = shares.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put("/api/shares/shares/:id/metadata", async ({ params, request }) => {
    const body = (await request.json()) as { metadata: string };
    const metadata = Object.fromEntries(
      body.metadata
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => l.split("=", 2) as [string, string]),
    );
    const share = shares.find((s) => s.id === params["id"]);
    if (share) share.metadata = metadata;
    return HttpResponse.json({ metadata });
  }),
  http.post("/api/shares/shares/:id/resize", async ({ params, request }) => {
    const body = (await request.json()) as { size: number };
    const share = shares.find((s) => s.id === params["id"]);
    if (share) share.size = body.size;
    return HttpResponse.json(
      { id: params["id"], size: body.size },
      { status: 202 },
    );
  }),
  http.post("/api/shares/shares/:id/revert", ({ params }) =>
    HttpResponse.json({ id: params["id"] }, { status: 202 }),
  ),
  http.get("/api/shares/shares/:id/access", ({ params }) => {
    const share = shares.find((s) => s.id === params["id"]);
    return HttpResponse.json({
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
      can_add: share?.status === "available",
    });
  }),
  http.post("/api/shares/shares/:id/access", async ({ request }) => {
    const body = (await request.json()) as {
      access_type: string;
      access_to: string;
      access_level: string;
    };
    return HttpResponse.json(
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
    HttpResponse.json({ items: shareSnapshots, quota: shareLimits }),
  ),
  http.post("/api/shares/snapshots", async ({ request }) => {
    const body = (await request.json()) as { share_id: string; name: string };
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
      created_at: null,
      is_transitional: true,
      actions: ["edit"],
    };
    shareSnapshots.push(snapshot);
    return HttpResponse.json(snapshot, { status: 202 });
  }),
  http.get("/api/shares/snapshots/:id", ({ params }) => {
    const snapshot = shareSnapshots.find((s) => s.id === params["id"]);
    if (!snapshot)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
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
    const body = (await request.json()) as Partial<ShareSnapshot>;
    const snapshot = shareSnapshots.find((s) => s.id === params["id"]);
    if (snapshot) Object.assign(snapshot, body);
    return HttpResponse.json(snapshot);
  }),
  http.delete("/api/shares/snapshots/:id", ({ params }) => {
    shareSnapshots = shareSnapshots.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post("/api/shares/snapshots/:id/access", () =>
    HttpResponse.json({ id: nextId("sa") }, { status: 202 }),
  ),
  http.delete(
    "/api/shares/snapshots/:id/access/:rule",
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get("/api/shares/security-services", () =>
    HttpResponse.json({
      items: securityServices,
      types: ["active_directory", "ldap", "kerberos"],
    }),
  ),
  http.post("/api/shares/security-services", async ({ request }) => {
    const body = (await request.json()) as SecurityService & { type: string };
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
      dns_ip: body.dns_ip ?? null,
      ou: body.ou ?? null,
      server: body.server ?? null,
      domain: body.domain ?? null,
      user: body.user ?? null,
      status: null,
      created_at: null,
    };
    securityServices.push(service);
    return HttpResponse.json(service, { status: 201 });
  }),
  http.get("/api/shares/security-services/:id", ({ params }) => {
    const service = securityServices.find((s) => s.id === params["id"]);
    return service
      ? HttpResponse.json(service)
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),
  http.patch(
    "/api/shares/security-services/:id",
    async ({ params, request }) => {
      const body = (await request.json()) as Partial<SecurityService>;
      const service = securityServices.find((s) => s.id === params["id"]);
      if (service) Object.assign(service, body);
      return HttpResponse.json(service);
    },
  ),
  http.delete("/api/shares/security-services/:id", ({ params }) => {
    securityServices = securityServices.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/shares/groups", () =>
    HttpResponse.json({ items: shareGroups }),
  ),
  http.post("/api/shares/groups", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const group: ShareGroup = {
      ...shareGroups[0]!,
      id: nextId("sg"),
      name: body.name,
      status: "creating",
      is_transitional: true,
      actions: [],
    };
    shareGroups.push(group);
    return HttpResponse.json(group, { status: 202 });
  }),
  http.get("/api/shares/groups/:id", ({ params }) => {
    const group = shareGroups.find((g) => g.id === params["id"]);
    if (!group)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
      ...group,
      share_types_detail: [{ id: "st-1", name: "cephfs_share_type" }],
      members: shares.filter((s) => s.share_group_id === group.id),
    });
  }),
  http.patch("/api/shares/groups/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<ShareGroup>;
    const group = shareGroups.find((g) => g.id === params["id"]);
    if (group) Object.assign(group, body);
    return HttpResponse.json(group);
  }),
  http.delete("/api/shares/groups/:id", ({ params }) => {
    shareGroups = shareGroups.filter((g) => g.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/shares/group-snapshots", () =>
    HttpResponse.json({ items: shareGroupSnapshots }),
  ),
  http.post("/api/shares/group-snapshots", async ({ request }) => {
    const body = (await request.json()) as {
      share_group_id: string;
      name: string;
    };
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
    return HttpResponse.json(snapshot, { status: 202 });
  }),
  http.get("/api/shares/group-snapshots/:id", ({ params }) => {
    const snapshot = shareGroupSnapshots.find((s) => s.id === params["id"]);
    return snapshot
      ? HttpResponse.json(snapshot)
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),
  http.patch("/api/shares/group-snapshots/:id", async ({ params, request }) => {
    const body = (await request.json()) as Partial<ShareGroupSnapshot>;
    const snapshot = shareGroupSnapshots.find((s) => s.id === params["id"]);
    if (snapshot) Object.assign(snapshot, body);
    return HttpResponse.json(snapshot);
  }),
  http.delete("/api/shares/group-snapshots/:id", ({ params }) => {
    shareGroupSnapshots = shareGroupSnapshots.filter(
      (s) => s.id !== params["id"],
    );
    return new HttpResponse(null, { status: 204 });
  }),
];

// --- databases -----------------------------------------------------------------

const quota = {
  max_instances: 10,
  max_backups: 20,
  max_volumes: 10,
  max_ram: 40960,
};
const dbBase = (
  overrides: Partial<DbInstance> & { id: string; name: string },
): DbInstance => ({
  status: "HEALTHY",
  status_kind: "ok",
  operating_status: null,
  datastore: "mysql",
  datastore_version: "8.0",
  flavor_id: "db3.small",
  flavor_name: "db3.small",
  ram: 2048,
  hostname: null,
  addresses: ["10.0.0.7"],
  volume_size: 5,
  volume_used: 1.25,
  region: null,
  created: "2026-09-20T00:00:00",
  updated: "2026-09-20T01:00:00",
  configuration: null,
  replica_of: null,
  replicas: [],
  is_transitional: false,
  actions: [
    "backup",
    "update",
    "resize_volume",
    "root",
    "attach_configuration",
    "resize",
    "upgrade",
    "restart",
    "delete",
  ],
  ...overrides,
});
let dbInstances: DbInstance[] = [
  dbBase({ id: "db-1", name: "appdb" }),
  dbBase({
    id: "db-2",
    name: "building",
    status: "BUILD",
    status_kind: "transitional",
    is_transitional: true,
    addresses: [],
    actions: ["delete"],
    configuration: { id: "cfg-1", name: "tuned" },
  }),
];
let dbBackups: DbBackup[] = [
  {
    id: "bk-1",
    name: "nightly",
    description: null,
    status: "COMPLETED",
    status_kind: "ok",
    datastore: "mysql",
    datastore_version: "8.0",
    instance_id: "db-1",
    instance_name: "appdb",
    parent_id: null,
    incremental: false,
    size: 0.2,
    location: "swift://backups/bk-1.xbstream.gz.enc",
    created: "2026-10-01T02:00:00",
    updated: "2026-10-01T02:03:00",
    is_transitional: false,
    can_restore: true,
  },
];
let dbConfigurations: DbConfiguration[] = [
  {
    id: "cfg-1",
    name: "tuned",
    description: "More connections",
    datastore: "mysql",
    datastore_version: "8.0",
    datastore_version_id: "v-80",
    values: { max_connections: 200 },
    created: "2026-09-15T00:00:00",
    updated: null,
  },
];
let dbUsers = [{ name: "app", host: "%", databases: ["app"] }];
let dbDatabases = [{ name: "app" }, { name: "reports" }];
const logActions = (log: DbLog): string[] => [
  ...(log.published > 0 ? ["view"] : []),
  "publish",
  "enable",
  ...(log.type !== "SYS" ? ["disable"] : []),
  "discard",
];
const dbLog = (
  overrides: Partial<DbLog> & { name: string; type: string },
): DbLog => {
  const log: DbLog = {
    status: "Disabled",
    status_kind: "unknown",
    published: 0,
    pending: 0,
    container: null,
    prefix: null,
    metafile: `db-1/mysql-${overrides.name}_metafile`,
    actions: [],
    ...overrides,
  };
  log.actions = logActions(log);
  return log;
};
const dbLogs: DbLog[] = [
  dbLog({ name: "general", type: "USER" }),
  dbLog({ name: "slow_query", type: "USER", pending: 512 }),
  dbLog({
    name: "error",
    type: "SYS",
    status: "Published",
    status_kind: "ok",
    published: 2048,
    container: "database_logs",
    prefix: "db-1/mysql-error",
  }),
];
const configDefaults = [
  { name: "basedir", value: "/usr" },
  { name: "max_connections", value: 200 },
  { name: "port", value: 3306 },
  { name: "skip-external-locking", value: 1 },
];
const datastores = [
  {
    datastore: "mysql",
    datastore_id: "ds-mysql",
    version: "8.0",
    version_id: "v-80",
    label: "mysql - 8.0",
  },
  {
    datastore: "mysql",
    datastore_id: "ds-mysql",
    version: "8.4",
    version_id: "v-84",
    label: "mysql - 8.4",
  },
  {
    datastore: "postgresql",
    datastore_id: "ds-pg",
    version: "16",
    version_id: "v-16",
    label: "postgresql - 16",
  },
];
const flavors = [
  {
    id: "db3.small",
    name: "db3.small",
    ram: 2048,
    vcpus: 1,
    disk: null,
    ephemeral: null,
  },
  {
    id: "db3.medium",
    name: "db3.medium",
    ram: 4096,
    vcpus: 2,
    disk: null,
    ephemeral: null,
  },
];

const detailOf = (instance: DbInstance): DbInstanceDetail => ({
  ...instance,
  allowed_cidrs: ["0.0.0.0/0"],
  is_public: false,
  addresses_detail: instance.addresses.map((address) => ({
    type: "private",
    address,
  })),
  availability_zone: "ardctest-artm",
  fault: null,
  service_status_updated: null,
  port: 3306,
  cidr_warning:
    "Allowing 0.0.0.0/0 may expose the database instance to the whole Internet. Restrict access to the networks that need it.",
});

const databaseHandlers = [
  http.get("/api/databases/options", () =>
    HttpResponse.json({
      datastores,
      flavors,
      flavors_by_version: {
        "mysql/8.0": flavors.slice(0, 1),
        "mysql/8.4": flavors,
        "postgresql/16": flavors,
      },
      availability_zones: ["ardctest-artm"],
      networks: [{ id: "net-1", name: "private", classic: false }],
      configurations: dbConfigurations,
      backups: dbBackups.filter((b) => b.can_restore),
      quota,
      default_cidr: "0.0.0.0/0",
    }),
  ),
  http.get("/api/databases/instances", () =>
    HttpResponse.json({ items: dbInstances, quota }),
  ),
  http.post("/api/databases/instances", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      datastore: string;
      version: string;
      volume: number;
      flavor: string;
    };
    const instance = dbBase({
      id: nextId("db"),
      name: body.name,
      datastore: body.datastore,
      datastore_version: body.version,
      volume_size: body.volume,
      flavor_id: body.flavor,
      flavor_name: body.flavor,
      status: "BUILD",
      status_kind: "transitional",
      is_transitional: true,
      addresses: [],
      actions: ["delete"],
    });
    dbInstances.push(instance);
    return HttpResponse.json(instance, { status: 202 });
  }),
  http.get("/api/databases/instances/:id", ({ params }) => {
    const instance = dbInstances.find((i) => i.id === params["id"]);
    return instance
      ? HttpResponse.json(detailOf(instance))
      : HttpResponse.json(
          { error: "not_found", message: "no such instance" },
          { status: 404 },
        );
  }),
  http.patch("/api/databases/instances/:id", async ({ params, request }) => {
    const body = (await request.json()) as { name?: string };
    const instance = dbInstances.find((i) => i.id === params["id"]);
    if (instance && body.name) instance.name = body.name;
    return HttpResponse.json({ id: params["id"] });
  }),
  http.delete("/api/databases/instances/:id", ({ params }) => {
    dbInstances = dbInstances.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(
    "/api/databases/instances/:id/resize-volume",
    async ({ params, request }) => {
      const body = (await request.json()) as { size: number };
      const instance = dbInstances.find((i) => i.id === params["id"]);
      if (instance) instance.volume_size = body.size;
      return HttpResponse.json(
        { id: params["id"], size: body.size },
        { status: 202 },
      );
    },
  ),
  http.post("/api/databases/instances/:id/resize", ({ params }) =>
    HttpResponse.json({ id: params["id"] }, { status: 202 }),
  ),
  http.get("/api/databases/instances/:id/resize-flavors", ({ params }) => {
    const instance = dbInstances.find((i) => i.id === params["id"]);
    return HttpResponse.json({
      current: instance?.flavor_id ?? null,
      datastore: instance?.datastore ?? null,
      datastore_version: instance?.datastore_version ?? null,
      items: flavors.filter((f) => f.id !== instance?.flavor_id),
    });
  }),
  http.get("/api/databases/instances/:id/configuration-defaults", () =>
    HttpResponse.json({ items: configDefaults }),
  ),
  http.get("/api/databases/instances/:id/logs", () =>
    HttpResponse.json({ items: dbLogs }),
  ),
  http.post(
    "/api/databases/instances/:id/logs/:name/actions/:action",
    ({ params }) => {
      const log = dbLogs.find((l) => l.name === params["name"]);
      if (!log) {
        return HttpResponse.json(
          { error: "not_found", message: "no such log" },
          { status: 404 },
        );
      }
      switch (params["action"]) {
        case "publish":
          log.status = "Published";
          log.status_kind = "ok";
          log.published += log.pending || 4096;
          log.pending = 0;
          log.container = "database_logs";
          log.prefix = `db-1/mysql-${log.name}`;
          break;
        case "enable":
          log.status = "Enabled";
          log.status_kind = "ok";
          break;
        case "disable":
          log.status = "Disabled";
          log.status_kind = "unknown";
          break;
        case "discard":
          log.published = 0;
          log.container = null;
          log.prefix = null;
          log.status = "Disabled";
          log.status_kind = "unknown";
          break;
        default:
          return HttpResponse.json(
            { error: "bad_request", message: "unknown action" },
            { status: 400 },
          );
      }
      log.actions = logActions(log);
      return HttpResponse.json(log);
    },
  ),
  http.get(
    "/api/databases/instances/:id/logs/:name/contents",
    ({ params, request }) => {
      const lines = Number(
        new URL(request.url).searchParams.get("lines") ?? "50",
      );
      const all = Array.from(
        { length: 120 },
        (_, i) =>
          `2026-10-12T00:${String(i % 60).padStart(2, "0")}:00 ${String(params["name"])} line ${String(i + 1).padStart(3, "0")}`,
      );
      const shown = lines > 0 ? all.slice(-lines) : all;
      return HttpResponse.json({
        name: params["name"],
        lines,
        text: shown.join("\n") + "\n",
        partial: lines > 0 && lines < all.length,
        truncated: false,
        parts: 2,
        published: 4096,
      });
    },
  ),
  http.get(
    "/api/databases/instances/:id/logs/:name/download",
    ({ params }) =>
      new HttpResponse(`${String(params["name"])} whole log\n`, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
  ),
  http.get("/api/databases/instances/:id/upgrade-targets", () =>
    HttpResponse.json({
      current: "8.0",
      items: datastores.filter((d) => d.version === "8.4"),
    }),
  ),
  http.post("/api/databases/instances/:id/upgrade", ({ params }) =>
    HttpResponse.json({ id: params["id"] }, { status: 202 }),
  ),
  http.post("/api/databases/instances/:id/restart", ({ params }) =>
    HttpResponse.json({ id: params["id"] }, { status: 202 }),
  ),
  http.post(
    "/api/databases/instances/:id/configuration",
    async ({ params, request }) => {
      const body = (await request.json()) as { configuration_id: string };
      const instance = dbInstances.find((i) => i.id === params["id"]);
      if (instance) {
        instance.configuration = { id: body.configuration_id };
        instance.actions = instance.actions
          .filter((a) => a !== "attach_configuration")
          .concat("detach_configuration");
      }
      return HttpResponse.json({ id: params["id"] }, { status: 202 });
    },
  ),
  http.delete("/api/databases/instances/:id/configuration", ({ params }) => {
    const instance = dbInstances.find((i) => i.id === params["id"]);
    if (instance) {
      instance.configuration = null;
      instance.actions = instance.actions
        .filter((a) => a !== "detach_configuration")
        .concat("attach_configuration");
    }
    return HttpResponse.json({ id: params["id"] }, { status: 202 });
  }),
  http.get("/api/databases/instances/:id/root", ({ params }) =>
    HttpResponse.json({ id: params["id"], root_enabled: false }),
  ),
  http.post("/api/databases/instances/:id/root", ({ params }) =>
    HttpResponse.json({
      id: params["id"],
      name: "root",
      password: "generated-secret",
    }),
  ),
  http.get("/api/databases/instances/:id/backups", ({ params }) =>
    HttpResponse.json({
      items: dbBackups.filter((b) => b.instance_id === params["id"]),
    }),
  ),
  http.get("/api/databases/instances/:id/users", () =>
    HttpResponse.json({ items: dbUsers }),
  ),
  http.post("/api/databases/instances/:id/users", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      host?: string;
      databases?: string[];
    };
    dbUsers.push({
      name: body.name,
      host: body.host ?? "%",
      databases: body.databases ?? [],
    });
    return HttpResponse.json({ name: body.name }, { status: 202 });
  }),
  http.delete("/api/databases/instances/:id/users/:name", ({ params }) => {
    dbUsers = dbUsers.filter((u) => u.name !== params["name"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/instances/:id/users/:name/access", ({ params }) => {
    const user = dbUsers.find((u) => u.name === params["name"]);
    return HttpResponse.json({
      items: dbDatabases.map((d) => ({
        name: d.name,
        granted: user?.databases.includes(d.name) ?? false,
      })),
    });
  }),
  http.put(
    "/api/databases/instances/:id/users/:name/access",
    async ({ params, request }) => {
      const body = (await request.json()) as { databases: string[] };
      const user = dbUsers.find((u) => u.name === params["name"]);
      if (user)
        user.databases = [...new Set([...user.databases, ...body.databases])];
      return HttpResponse.json({ name: params["name"] }, { status: 202 });
    },
  ),
  http.delete(
    "/api/databases/instances/:id/users/:name/access/:db",
    ({ params }) => {
      const user = dbUsers.find((u) => u.name === params["name"]);
      if (user)
        user.databases = user.databases.filter((d) => d !== params["db"]);
      return new HttpResponse(null, { status: 204 });
    },
  ),
  http.get("/api/databases/instances/:id/databases", () =>
    HttpResponse.json({ items: dbDatabases }),
  ),
  http.post("/api/databases/instances/:id/databases", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    dbDatabases.push({ name: body.name });
    return HttpResponse.json({ name: body.name }, { status: 202 });
  }),
  http.delete("/api/databases/instances/:id/databases/:name", ({ params }) => {
    dbDatabases = dbDatabases.filter((d) => d.name !== params["name"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/backups", () =>
    HttpResponse.json({
      items: dbBackups,
      quota,
      instances: dbInstances
        .filter((i) => i.status_kind === "ok")
        .map((i) => ({ id: i.id, name: i.name })),
    }),
  ),
  http.post("/api/databases/backups", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      instance_id: string;
      parent_id?: string;
    };
    const instance = dbInstances.find((i) => i.id === body.instance_id);
    const backup: DbBackup = {
      ...dbBackups[0]!,
      id: nextId("bk"),
      name: body.name,
      status: "NEW",
      status_kind: "transitional",
      instance_id: body.instance_id,
      instance_name: instance?.name ?? null,
      parent_id: body.parent_id ?? null,
      incremental: Boolean(body.parent_id),
      is_transitional: true,
      can_restore: false,
    };
    dbBackups.push(backup);
    return HttpResponse.json(backup, { status: 202 });
  }),
  http.get("/api/databases/backups/:id", ({ params }) => {
    const backup = dbBackups.find((b) => b.id === params["id"]);
    return backup
      ? HttpResponse.json({ ...backup, instance_status: "HEALTHY" })
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),
  http.delete("/api/databases/backups/:id", ({ params }) => {
    dbBackups = dbBackups.filter((b) => b.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/configurations", () =>
    HttpResponse.json({ items: dbConfigurations, datastores }),
  ),
  http.post("/api/databases/configurations", async ({ request }) => {
    const body = (await request.json()) as {
      name: string;
      description?: string;
      datastore: string;
      version: string;
    };
    const configuration: DbConfiguration = {
      id: nextId("cfg"),
      name: body.name,
      description: body.description ?? null,
      datastore: body.datastore,
      datastore_version: body.version,
      datastore_version_id: null,
      values: {},
      created: null,
      updated: null,
    };
    dbConfigurations.push(configuration);
    return HttpResponse.json(configuration, { status: 201 });
  }),
  http.get("/api/databases/configurations/:id", ({ params }) => {
    const configuration = dbConfigurations.find((c) => c.id === params["id"]);
    if (!configuration)
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    return HttpResponse.json({
      ...configuration,
      instances: dbInstances
        .filter((i) => i.configuration?.id === configuration.id)
        .map((i) => ({ id: i.id, name: i.name })),
      parameters: [
        {
          name: "autocommit",
          type: "boolean",
          min: null,
          max: null,
          restart_required: false,
        },
        {
          name: "max_connections",
          type: "integer",
          min: 1,
          max: 100000,
          restart_required: false,
        },
      ],
    });
  }),
  http.put(
    "/api/databases/configurations/:id/values",
    async ({ params, request }) => {
      const body = (await request.json()) as { values: Record<string, string> };
      const configuration = dbConfigurations.find((c) => c.id === params["id"]);
      if (configuration) configuration.values = body.values;
      return HttpResponse.json({ id: params["id"], values: body.values });
    },
  ),
  http.delete("/api/databases/configurations/:id", ({ params }) => {
    dbConfigurations = dbConfigurations.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
];

export const m6Handlers = [
  ...orchestrationHandlers,
  ...dnsHandlers,
  ...shareHandlers,
  ...databaseHandlers,
];
