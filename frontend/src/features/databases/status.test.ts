import { describe, expect, it } from "vitest";
import type { ActionOffer } from "../../lib/actions";
import type {
  DbBackup,
  DbInstance,
  DbLog,
} from "../../lib/api/types/databases";
import {
  availableDbBackupActions,
  availableDbInstanceActions,
  availableDbLogActions,
  CONNECTION_EXAMPLES,
  datastoreLabel,
  flavorLabel,
  hasOpenCidr,
  parentBackups,
  splitCidrs,
  statusLabel,
  statusTone,
  validParentId,
} from "./status";

const flavor = {
  id: "f1",
  name: "db.small",
  ram: 4096,
  vcpus: 2,
  disk: null,
  ephemeral: null,
};

describe("database status", () => {
  it.each([
    { kind: "ok", tone: "success" },
    { kind: "error", tone: "danger" },
    { kind: "transitional", tone: "progress" },
    { kind: "warning", tone: "warning" },
    { kind: "unknown", tone: "neutral" },
  ] as const)("$kind is $tone", ({ kind, tone }) => {
    expect(statusTone(kind)).toBe(tone);
  });

  it.each([
    { status: "BUILD", label: "Building" },
    { status: "RESTART_REQUIRED", label: "Restart required" },
    { status: "Restart_Completed", label: "Restart completed" },
    { status: "SOMETHING_NEW", label: "SOMETHING_NEW" },
    { status: null, label: "Unknown" },
  ])("$status is $label", ({ status, label }) => {
    expect(statusLabel(status)).toBe(label);
  });
});

describe("flavorLabel", () => {
  it.each([
    { over: {}, label: "db.small (2 vCPU, 4 GB)" },
    { over: { vcpus: null }, label: "db.small (4 GB)" },
    { over: { vcpus: null, ram: null }, label: "db.small" },
    { over: { vcpus: null, ram: null, name: null }, label: "" },
  ])("$label", ({ over, label }) => {
    expect(flavorLabel({ ...flavor, ...over })).toBe(label);
  });
});

describe("datastoreLabel", () => {
  it.each([
    {
      case: "joins the datastore and its version",
      datastore: "mysql",
      datastore_version: "8.0",
      label: "mysql 8.0",
    },
    {
      case: "shows the datastore alone when the version is missing",
      datastore: "mysql",
      datastore_version: null,
      label: "mysql",
    },
    {
      case: "is empty without a datastore, whatever the version",
      datastore: null,
      datastore_version: "8.0",
      label: "",
    },
    {
      case: "is empty when Trove sent neither",
      datastore: null,
      datastore_version: null,
      label: "",
    },
  ])("$case", ({ datastore, datastore_version, label }) => {
    expect(datastoreLabel({ datastore, datastore_version })).toBe(label);
  });
});

describe("access CIDRs", () => {
  it.each([
    {
      text: "10.0.0.0/8, 192.168.0.0/16",
      cidrs: ["10.0.0.0/8", "192.168.0.0/16"],
      open: false,
    },
    { text: " 0.0.0.0/0 ", cidrs: ["0.0.0.0/0"], open: true },
    { text: "::/0\n10.0.0.0/8", cidrs: ["::/0", "10.0.0.0/8"], open: true },
    { text: "", cidrs: [], open: false },
  ])("$text", ({ text, cidrs, open }) => {
    expect(splitCidrs(text)).toEqual(cidrs);
    expect(hasOpenCidr(splitCidrs(text))).toBe(open);
  });

  it("gives a client command per datastore", () => {
    expect(CONNECTION_EXAMPLES["postgresql"]?.("db.example.org")).toBe(
      "psql -h db.example.org -p 5432 -U <user> <database>",
    );
  });
});

/** The offers as `id: reason` pairs, with "" for an enabled action. */
const reasons = (offers: ActionOffer<string>[]) =>
  Object.fromEntries(offers.map((o) => [o.id, o.disabledReason ?? ""]));

const instance = (overrides: Partial<DbInstance> = {}): DbInstance => ({
  id: "i1",
  name: "db1",
  status: "ACTIVE",
  status_kind: "ok",
  operating_status: null,
  datastore: "mysql",
  datastore_version: "8.0",
  flavor_id: null,
  flavor_name: null,
  ram: null,
  hostname: null,
  addresses: [],
  volume_size: 5,
  volume_used: null,
  region: null,
  created: null,
  updated: null,
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

describe("database instance actions", () => {
  it("offers everything but detach on an active instance without a group", () => {
    expect(reasons(availableDbInstanceActions(instance()))).toEqual({
      backup: "",
      update: "",
      resize_volume: "",
      resize: "",
      upgrade: "",
      attach: "",
      detach: "No configuration group is attached",
      root: "",
      restart: "",
      delete: "",
    });
  });

  it("offers detach, not attach, once a group is attached", () => {
    const attached = instance({
      configuration: { id: "c1", name: "tuned" },
      actions: ["detach_configuration", "delete"],
    });
    const offers = reasons(availableDbInstanceActions(attached));
    expect(offers["attach"]).toBe(
      "Detach the current configuration group first",
    );
    expect(offers["detach"]).toBe("");
  });

  it("explains each action a building instance cannot run", () => {
    const building = instance({ status: "BUILD", actions: ["delete"] });
    expect(reasons(availableDbInstanceActions(building))).toEqual({
      backup: "Backups can be taken once the instance is active",
      update: "The instance can be updated once it is active",
      resize_volume: "The volume can be resized once the instance is active",
      resize: "The instance can be resized once it is active or shut off",
      upgrade: "The instance can be upgraded once it is active or shut off",
      attach: "The instance must be active",
      detach: "No configuration group is attached",
      root: "Root access can be managed once the instance is active",
      restart: "The instance cannot be restarted right now",
      delete: "",
    });
  });
});

describe("database backup actions", () => {
  const backup = (canRestore: boolean) =>
    ({ id: "b1", can_restore: canRestore }) as DbBackup;

  it("restores only a completed backup and always deletes", () => {
    expect(reasons(availableDbBackupActions(backup(true)))).toEqual({
      restore: "",
      delete: "",
    });
    expect(reasons(availableDbBackupActions(backup(false)))).toEqual({
      restore: "Only completed backups can be restored",
      delete: "",
    });
  });
});

describe("parent backups", () => {
  const backup = (id: string, instance: string, status = "COMPLETED") =>
    ({ id, instance_id: instance, status }) as DbBackup;
  const backups = [
    backup("full-a", "a"),
    backup("busy-a", "a", "BUILDING"),
    backup("full-b", "b"),
  ];

  it("offers only the instance's own completed backups", () => {
    expect(parentBackups(backups, "a").map((b) => b.id)).toEqual(["full-a"]);
    expect(parentBackups(backups, "c")).toEqual([]);
  });

  it("keeps a parent of the chosen instance and drops any other", () => {
    expect(validParentId(backups, "a", "full-a")).toBe("full-a");
    expect(validParentId(backups, "b", "full-a")).toBe("");
    expect(validParentId(backups, "a", "busy-a")).toBe("");
    expect(validParentId(backups, "a", "")).toBe("");
  });
});

describe("database log actions", () => {
  const log = (type: string, actions: string[]) =>
    ({ name: "general", type, actions }) as DbLog;

  it("lists every log action, disabling those the log's state rules out", () => {
    expect(
      reasons(
        availableDbLogActions(log("USER", ["publish", "enable", "discard"])),
      ),
    ).toEqual({
      view: "Publish the log first",
      publish: "",
      enable: "",
      disable: "The log is already off",
      discard: "",
    });
    expect(
      reasons(
        availableDbLogActions(
          log("USER", ["view", "publish", "disable", "discard"]),
        ),
      ),
    ).toEqual({
      view: "",
      publish: "",
      enable: "The log is already on",
      disable: "",
      discard: "",
    });
    expect(
      reasons(
        availableDbLogActions(log("SYS", ["view", "publish", "discard"])),
      ),
    ).toEqual({
      view: "",
      publish: "",
      enable: "System logs are always on",
      disable: "System logs cannot be disabled",
      discard: "",
    });
  });
});
