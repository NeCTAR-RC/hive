// Mocked API for the database panels: instances, backups,
// configurations, users, databases and logs.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  DbBackup,
  DbConfiguration,
  DbInstance,
  DbInstanceDetail,
  DbLog,
} from "../../lib/api/types/databases";
import { nextId } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  attachConfigurationBody,
  backupCreateBody,
  configurationCreateBody,
  configurationValuesBody,
  databaseCreateBody,
  instanceLaunchBody,
  instanceUpdateBody,
  logActionBody,
  resizeInstanceBody,
  resizeVolumeBody,
  upgradeBody,
  userAccessBody,
  userCreateBody,
  userUpdateBody,
} from "./schemas";

const quota = {
  max_instances: 10,
  max_backups: 20,
  max_volumes: 100,
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
  dbBase({ id: "db-3", name: "reports" }),
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
const logActions = (log: DbLog): string[] => {
  const isUser = log.type !== "SYS";
  const isDisabled = log.status === "Disabled";
  return [
    ...(log.published > 0 ? ["view"] : []),
    "publish",
    ...(isUser && isDisabled ? ["enable"] : []),
    ...(isUser && !isDisabled ? ["disable"] : []),
    "discard",
  ];
};
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

export const databaseHandlers = [
  http.get("/api/databases/options", () =>
    HttpResponse.json<Reply<"/api/databases/options", "get">>({
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
    }),
  ),
  http.get("/api/databases/instances", () =>
    HttpResponse.json<Reply<"/api/databases/instances", "get">>({
      items: dbInstances,
      quota,
    }),
  ),
  http.post("/api/databases/instances", async ({ request }) => {
    const body = await readBody(request, instanceLaunchBody);
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
    return HttpResponse.json<Reply<"/api/databases/instances", "post">>(
      instance,
      { status: 202 },
    );
  }),
  http.get("/api/databases/instances/:id", ({ params }) => {
    const instance = dbInstances.find((i) => i.id === params["id"]);
    return instance
      ? HttpResponse.json<
          Reply<"/api/databases/instances/{instance_id}", "get">
        >(detailOf(instance))
      : notFound("no such instance");
  }),
  http.patch("/api/databases/instances/:id", async ({ params, request }) => {
    const body = await readBody(request, instanceUpdateBody);
    const instance = dbInstances.find((i) => i.id === params["id"]);
    if (instance && body.name) instance.name = body.name;
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}", "patch">
    >({ id: String(params["id"]) });
  }),
  http.delete("/api/databases/instances/:id", ({ params }) => {
    dbInstances = dbInstances.filter((i) => i.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(
    "/api/databases/instances/:id/resize-volume",
    async ({ params, request }) => {
      const body = await readBody(request, resizeVolumeBody);
      const instance = dbInstances.find((i) => i.id === params["id"]);
      if (instance) instance.volume_size = body.size;
      return HttpResponse.json<
        Reply<"/api/databases/instances/{instance_id}/resize-volume", "post">
      >({ id: String(params["id"]), size: body.size }, { status: 202 });
    },
  ),
  http.post(
    "/api/databases/instances/:id/resize",
    async ({ params, request }) => {
      const { flavor } = await readBody(request, resizeInstanceBody);
      return HttpResponse.json<
        Reply<"/api/databases/instances/{instance_id}/resize", "post">
      >({ id: String(params["id"]), flavor }, { status: 202 });
    },
  ),
  http.get("/api/databases/instances/:id/resize-flavors", ({ params }) => {
    const instance = dbInstances.find((i) => i.id === params["id"]);
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/resize-flavors", "get">
    >({
      current: instance?.flavor_id ?? null,
      datastore: instance?.datastore ?? null,
      datastore_version: instance?.datastore_version ?? null,
      items: flavors.filter((f) => f.id !== instance?.flavor_id),
    });
  }),
  http.get("/api/databases/instances/:id/configuration-defaults", () =>
    HttpResponse.json<
      Reply<
        "/api/databases/instances/{instance_id}/configuration-defaults",
        "get"
      >
    >({ items: configDefaults }),
  ),
  http.get("/api/databases/instances/:id/logs", () =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/logs", "get">
    >({ items: dbLogs }),
  ),
  http.post(
    "/api/databases/instances/:id/logs/:name/actions",
    async ({ params, request }) => {
      const { action } = await readBody(request, logActionBody);
      const log = dbLogs.find((l) => l.name === params["name"]);
      if (!log) {
        return notFound("no such log");
      }
      switch (action) {
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
          break;
      }
      log.actions = logActions(log);
      return HttpResponse.json<
        Reply<
          "/api/databases/instances/{instance_id}/logs/{name}/actions",
          "post"
        >
      >(log);
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
      return HttpResponse.json<
        Reply<
          "/api/databases/instances/{instance_id}/logs/{name}/contents",
          "get"
        >
      >({
        name: String(params["name"]),
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
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/upgrade-targets", "get">
    >({
      current: "8.0",
      items: datastores.filter((d) => d.version === "8.4"),
    }),
  ),
  http.post(
    "/api/databases/instances/:id/upgrade",
    async ({ params, request }) => {
      const { version_id } = await readBody(request, upgradeBody);
      return HttpResponse.json<
        Reply<"/api/databases/instances/{instance_id}/upgrade", "post">
      >({ id: String(params["id"]), version_id }, { status: 202 });
    },
  ),
  http.post("/api/databases/instances/:id/restart", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/restart", "post">
    >({ id: String(params["id"]) }, { status: 202 }),
  ),
  http.post(
    "/api/databases/instances/:id/configuration",
    async ({ params, request }) => {
      const body = await readBody(request, attachConfigurationBody);
      const instance = dbInstances.find((i) => i.id === params["id"]);
      if (instance) {
        instance.configuration = { id: body.configuration_id };
        instance.actions = instance.actions
          .filter((a) => a !== "attach_configuration")
          .concat("detach_configuration");
      }
      return HttpResponse.json<
        Reply<"/api/databases/instances/{instance_id}/configuration", "post">
      >(
        { id: String(params["id"]), configuration_id: body.configuration_id },
        { status: 202 },
      );
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
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/configuration", "delete">
    >({ id: String(params["id"]) }, { status: 202 });
  }),
  http.get("/api/databases/instances/:id/root", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/root", "get">
    >({ id: String(params["id"]), root_enabled: false }),
  ),
  http.post("/api/databases/instances/:id/root", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/root", "post">
    >({
      id: String(params["id"]),
      name: "root",
      password: "generated-secret",
    }),
  ),
  http.get("/api/databases/instances/:id/backups", ({ params }) =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/backups", "get">
    >({
      items: dbBackups.filter((b) => b.instance_id === params["id"]),
    }),
  ),
  http.get("/api/databases/instances/:id/users", () =>
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/users", "get">
    >({ items: dbUsers }),
  ),
  http.post("/api/databases/instances/:id/users", async ({ request }) => {
    const body = await readBody(request, userCreateBody);
    dbUsers.push({
      name: body.name,
      host: body.host ?? "%",
      databases: body.databases ?? [],
    });
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/users", "post">
    >({ name: body.name }, { status: 202 });
  }),
  http.patch(
    "/api/databases/instances/:id/users/:name",
    async ({ params, request }) => {
      const body = await readBody(request, userUpdateBody);
      const user = dbUsers.find((u) => u.name === params["name"]);
      if (!user) return notFound();
      if (body.name) user.name = body.name;
      if (body.host) user.host = body.host;
      return HttpResponse.json<
        Reply<"/api/databases/instances/{instance_id}/users/{name}", "patch">
      >({ name: user.name, host: user.host }, { status: 202 });
    },
  ),
  http.delete("/api/databases/instances/:id/users/:name", ({ params }) => {
    dbUsers = dbUsers.filter((u) => u.name !== params["name"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/instances/:id/users/:name/access", ({ params }) => {
    const user = dbUsers.find((u) => u.name === params["name"]);
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/users/{name}/access", "get">
    >({
      items: dbDatabases.map((d) => ({
        name: d.name,
        granted: user?.databases.includes(d.name) ?? false,
      })),
    });
  }),
  http.put(
    "/api/databases/instances/:id/users/:name/access",
    async ({ params, request }) => {
      const body = await readBody(request, userAccessBody);
      const user = dbUsers.find((u) => u.name === params["name"]);
      if (user)
        user.databases = [...new Set([...user.databases, ...body.databases])];
      return HttpResponse.json<
        Reply<
          "/api/databases/instances/{instance_id}/users/{name}/access",
          "put"
        >
      >(
        { name: String(params["name"]), databases: body.databases },
        { status: 202 },
      );
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
    HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/databases", "get">
    >({ items: dbDatabases }),
  ),
  http.post("/api/databases/instances/:id/databases", async ({ request }) => {
    const body = await readBody(request, databaseCreateBody);
    dbDatabases.push({ name: body.name });
    return HttpResponse.json<
      Reply<"/api/databases/instances/{instance_id}/databases", "post">
    >({ name: body.name }, { status: 202 });
  }),
  http.delete("/api/databases/instances/:id/databases/:name", ({ params }) => {
    dbDatabases = dbDatabases.filter((d) => d.name !== params["name"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/backups", () =>
    HttpResponse.json<Reply<"/api/databases/backups", "get">>({
      items: dbBackups,
      quota,
      instances: dbInstances
        .filter((i) => i.status_kind === "ok")
        .map((i) => ({ id: i.id, name: i.name })),
    }),
  ),
  http.post("/api/databases/backups", async ({ request }) => {
    const body = await readBody(request, backupCreateBody);
    const instance = dbInstances.find((i) => i.id === body.instance_id);
    // A parent backup must belong to the same instance, as in the backend.
    const parent = dbBackups.find((b) => b.id === body.parent_id);
    if (body.parent_id && parent?.instance_id !== body.instance_id) {
      return apiError(
        400,
        "bad_request",
        "The parent backup must belong to the same instance.",
        "databases",
      );
    }
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
    return HttpResponse.json<Reply<"/api/databases/backups", "post">>(backup, {
      status: 202,
    });
  }),
  http.get("/api/databases/backups/:id", ({ params }) => {
    const backup = dbBackups.find((b) => b.id === params["id"]);
    return backup
      ? HttpResponse.json<Reply<"/api/databases/backups/{backup_id}", "get">>({
          ...backup,
          instance_status: "HEALTHY",
        })
      : notFound();
  }),
  http.delete("/api/databases/backups/:id", ({ params }) => {
    dbBackups = dbBackups.filter((b) => b.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/databases/configurations", () =>
    HttpResponse.json<Reply<"/api/databases/configurations", "get">>({
      items: dbConfigurations,
      datastores,
    }),
  ),
  http.post("/api/databases/configurations", async ({ request }) => {
    const body = await readBody(request, configurationCreateBody);
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
    return HttpResponse.json<Reply<"/api/databases/configurations", "post">>(
      configuration,
      { status: 201 },
    );
  }),
  http.get("/api/databases/configurations/:id", ({ params }) => {
    const configuration = dbConfigurations.find((c) => c.id === params["id"]);
    if (!configuration) return notFound();
    return HttpResponse.json<
      Reply<"/api/databases/configurations/{configuration_id}", "get">
    >({
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
        {
          name: "character_set_server",
          type: "string",
          min: null,
          max: null,
          restart_required: true,
        },
      ],
    });
  }),
  http.put(
    "/api/databases/configurations/:id/values",
    async ({ params, request }) => {
      const body = await readBody(request, configurationValuesBody);
      const configuration = dbConfigurations.find((c) => c.id === params["id"]);
      if (configuration) configuration.values = body.values;
      return HttpResponse.json<
        Reply<"/api/databases/configurations/{configuration_id}/values", "put">
      >({ id: String(params["id"]), values: body.values });
    },
  ),
  http.delete("/api/databases/configurations/:id", ({ params }) => {
    dbConfigurations = dbConfigurations.filter((c) => c.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
];
