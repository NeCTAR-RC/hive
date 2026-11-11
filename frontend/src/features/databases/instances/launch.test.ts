import { describe, expect, it } from "vitest";
import type { DatastoreOption } from "../../../lib/api/types/databases";
import { instanceLaunchBody } from "../../../mocks/databases/schemas";
import {
  datastoreKey,
  launchRequest,
  launchRoom,
  launchSchema,
  offeredConfigurations,
  offeredDatastores,
  restoreVolumeSize,
  type LaunchContext,
  type LaunchValues,
} from "./launch";

/** A form filled with the required fields only. */
const required: LaunchValues = {
  name: "appdb",
  datastore: "mysql/8.0",
  flavor: "db.small",
  volume: 5,
  availability_zone: "",
  network_id: "net-1",
  allowed_cidrs: "10.0.0.0/8\n 192.168.0.0/16,",
  databases: "",
  user: "",
  password: "",
  host: "",
  configuration: "",
  backup_id: "",
};

/** The request every variant shares: the required fields, CIDRs split. */
const base = {
  name: "appdb",
  flavor: "db.small",
  volume: 5,
  datastore: "mysql",
  version: "8.0",
  network_id: "net-1",
  allowed_cidrs: ["10.0.0.0/8", "192.168.0.0/16"],
};

describe("launchRequest", () => {
  it.each([
    {
      case: "sends only the required fields when nothing optional is given",
      values: required,
      body: base,
    },
    {
      case: "sends every optional part that is given",
      values: {
        ...required,
        availability_zone: "melbourne-qh2",
        databases: "app, reports",
        user: "admin",
        password: "secret",
        host: "10.0.0.%",
        configuration: "cfg-1",
      },
      body: {
        ...base,
        availability_zone: "melbourne-qh2",
        databases: "app, reports",
        user: "admin",
        password: "secret",
        host: "10.0.0.%",
        configuration: "cfg-1",
      },
    },
    {
      case: "sends a user without a host when the host is blank",
      values: {
        ...required,
        databases: "app",
        user: "admin",
        password: "secret",
      },
      body: { ...base, databases: "app", user: "admin", password: "secret" },
    },
    {
      case: "drops a host typed without a user",
      values: { ...required, host: "10.0.0.%" },
      body: base,
    },
    {
      case: "restores from a backup",
      values: { ...required, backup_id: "bk-1" },
      body: { ...base, backup_id: "bk-1" },
    },
    {
      case: "restores from a backup with a configuration group",
      values: { ...required, backup_id: "bk-1", configuration: "cfg-1" },
      body: { ...base, configuration: "cfg-1", backup_id: "bk-1" },
    },
  ])("$case", ({ values, body }) => {
    const request = launchRequest(values);
    expect(request).toEqual(body);
    expect(instanceLaunchBody.safeParse(request).success).toBe(true);
  });
});

/** Room for anything: no quota limits and nothing to restore. */
const unlimited = {
  room: launchRoom(undefined, []),
  flavors: [],
  backups: [],
};

/** The fields the schema flags for the values, by path. */
const flagged = (values: LaunchValues, context: LaunchContext = unlimited) =>
  launchSchema(context)
    .safeParse(values)
    .error?.issues.map((issue) => issue.path.join("."));

/** The message the schema gives for the values, at a path. */
const messageAt = (
  values: LaunchValues,
  path: string,
  context: LaunchContext = unlimited,
) =>
  launchSchema(context)
    .safeParse(values)
    .error?.issues.find((issue) => issue.path.join(".") === path)?.message;

describe("launchSchema", () => {
  it.each([
    {
      case: "accepts a launch without an initial user",
      values: required,
      paths: undefined,
    },
    {
      case: "asks for a password and a database for an initial user",
      values: { ...required, user: "admin" },
      paths: ["password", "databases"],
    },
    {
      case: "accepts an initial user with a password and a database",
      values: {
        ...required,
        user: "admin",
        password: "long enough",
        databases: "app",
      },
      paths: undefined,
    },
    {
      case: "asks for a longer password",
      values: { ...required, user: "admin", password: "x", databases: "app" },
      paths: ["password"],
    },
    {
      case: "checks the initial database names against the datastore",
      values: { ...required, databases: "good, bad name!, ok" },
      paths: ["databases"],
    },
    {
      case: "asks for at least one allowed CIDR",
      values: { ...required, allowed_cidrs: " ,\n" },
      paths: ["allowed_cidrs"],
    },
    {
      case: "checks each allowed CIDR",
      values: { ...required, allowed_cidrs: "10.0.0.0/8\n10.0.0.300/8" },
      paths: ["allowed_cidrs"],
    },
  ])("$case", ({ values, paths }) => {
    expect(flagged(values)).toEqual(paths);
  });

  it("asks for a prefix on a bare address", () => {
    expect(
      messageAt({ ...required, allowed_cidrs: "203.0.113.5" }, "allowed_cidrs"),
    ).toBe("Add a prefix to 203.0.113.5, such as 203.0.113.5/32");
  });

  const tight: LaunchContext = {
    room: launchRoom(
      { max_instances: 10, max_volumes: 20, max_ram: 8192, max_backups: 5 },
      [
        { volume_size: 10, ram: 4096 },
        { volume_size: 5, ram: 2048 },
      ],
    ),
    flavors: [
      {
        id: "db.small",
        name: "db.small",
        ram: 2048,
        vcpus: 1,
        disk: null,
        ephemeral: null,
      },
      {
        id: "db.large",
        name: "db.large",
        ram: 4096,
        vcpus: 2,
        disk: null,
        ephemeral: null,
      },
    ],
    backups: [{ id: "bk-1", size: 7.2 }],
  };

  it("refuses a volume above what the quota has left", () => {
    expect(messageAt({ ...required, volume: 6 }, "volume", tight)).toBe(
      "A 6 GB volume does not fit: 5 GB of your database volume quota is left",
    );
    expect(flagged({ ...required, volume: 5 }, tight)).toBeUndefined();
  });

  it("refuses a flavour whose RAM the quota cannot hold", () => {
    expect(
      messageAt({ ...required, flavor: "db.large" }, "flavor", tight),
    ).toBe(
      "This flavour needs 4 GB of RAM: 2 GB of your database RAM quota is left",
    );
  });

  it("asks a restore for a volume that holds the backup", () => {
    expect(
      messageAt({ ...required, volume: 5, backup_id: "bk-1" }, "volume", {
        ...unlimited,
        backups: tight.backups,
      }),
    ).toBe("This backup needs a volume of at least 8 GB");
  });
});

describe("launchRoom", () => {
  it("counts the use from the instances against Trove's limits", () => {
    expect(
      launchRoom(
        { max_instances: 10, max_volumes: 40, max_ram: -1, max_backups: 5 },
        [
          { volume_size: 5, ram: 2048 },
          { volume_size: null, ram: null },
        ],
      ),
    ).toEqual({
      instances: { used: 2, max: 10 },
      volumeGb: { used: 5, max: 40 },
      ramMb: { used: 2048, max: null },
    });
  });
});

describe("restoreVolumeSize", () => {
  const instances = [{ id: "db-1", volume_size: 5 }];

  it("starts at the source instance's volume", () => {
    expect(
      restoreVolumeSize({ size: 0.2, instance_id: "db-1" }, instances),
    ).toBe(5);
  });

  it("holds the backup when the source is gone or smaller", () => {
    expect(
      restoreVolumeSize({ size: 7.2, instance_id: "db-1" }, instances),
    ).toBe(8);
    expect(
      restoreVolumeSize({ size: 0.2, instance_id: "gone" }, instances),
    ).toBe(1);
  });
});

const mysql80: DatastoreOption = {
  datastore: "mysql",
  datastore_id: "ds-mysql",
  version: "8.0",
  version_id: "v-80",
  label: "mysql - 8.0",
};
const mysql84: DatastoreOption = {
  ...mysql80,
  version: "8.4",
  version_id: "v-84",
  label: "mysql - 8.4",
};
const postgres16: DatastoreOption = {
  datastore: "postgresql",
  datastore_id: "ds-pg",
  version: "16",
  version_id: "v-16",
  label: "postgresql - 16",
};
const datastores = [mysql80, mysql84, postgres16];

describe("datastoreKey", () => {
  it("picks a datastore version as datastore/version", () => {
    expect(datastoreKey(mysql84)).toBe("mysql/8.4");
  });
});

describe("offeredDatastores", () => {
  it("offers every datastore version for a new instance", () => {
    expect(offeredDatastores(datastores, undefined)).toEqual(datastores);
  });

  it("offers only the backup's own version when restoring", () => {
    expect(
      offeredDatastores(datastores, {
        datastore: "mysql",
        datastore_version: "8.4",
      }),
    ).toEqual([mysql84]);
  });
});

describe("offeredConfigurations", () => {
  const configurations = [
    { id: "cfg-80", datastore: "mysql", datastore_version: "8.0" },
    { id: "cfg-84", datastore: "mysql", datastore_version: "8.4" },
    { id: "cfg-pg", datastore: "postgresql", datastore_version: "16" },
  ];

  it.each([
    { datastore: "mysql/8.0", ids: ["cfg-80"] },
    { datastore: "postgresql/16", ids: ["cfg-pg"] },
    { datastore: "mysql/5.7", ids: [] },
    { datastore: "", ids: [] },
  ])("offers $ids for '$datastore'", ({ datastore, ids }) => {
    expect(
      offeredConfigurations(configurations, datastore).map((c) => c.id),
    ).toEqual(ids);
  });
});
