// Pure rules of the database launch page: the form's schema with the
// quota it draws on, the request it sends, and the datastores and
// configuration groups it offers.
import { z } from "zod";
import type {
  DatastoreOption,
  DbBackup,
  DbConfiguration,
  DbFlavor,
  DbInstance,
  DbLaunchRequest,
  DbQuota,
} from "../../../lib/api/types/databases";
import { formatMb } from "../../../lib/format";
import { quotaLeft, type QuotaPair } from "../../../lib/quota";
import { maxLength } from "../../../lib/validation";
import { cidrsError, splitCidrs } from "../status";
import { databaseNamesError, passwordError, userNameError } from "./names";

/** The launch form's field rules, whatever the quota and datastore. */
const launchFields = z.object({
  name: maxLength(80).min(1, "Enter an instance name"),
  datastore: z.string().min(1, "Choose a datastore"),
  flavor: z.string().min(1, "Choose a flavour"),
  volume: z.number().int().min(1, "At least 1 GB"),
  availability_zone: z.string(),
  network_id: z.string().min(1, "Choose a network"),
  allowed_cidrs: z.string(),
  databases: z.string().trim(),
  user: maxLength(128),
  password: maxLength(255, { trim: false }),
  host: maxLength(255),
  configuration: z.string(),
  backup_id: z.string(),
});

export type LaunchValues = z.infer<typeof launchFields>;

/** What the project's database quota holds: used of limit for each. */
export interface LaunchRoom {
  instances: QuotaPair;
  volumeGb: QuotaPair;
  ramMb: QuotaPair;
}

/** A Trove limit as a quota maximum: null or negative is unlimited. */
function limit(max: number | null | undefined): number | null {
  return max === null || max === undefined || max < 0 ? null : max;
}

/**
 * The quota a new instance draws on. Trove's limits carry the maximums
 * only, so the use is counted from the project's instances, as Trove
 * counts it: one per instance, its volume in GB and its flavour's RAM.
 */
export function launchRoom(
  quota: DbQuota | undefined,
  instances: readonly Pick<DbInstance, "volume_size" | "ram">[],
): LaunchRoom {
  const total = (pick: (i: (typeof instances)[number]) => number | null) =>
    instances.reduce((sum, instance) => sum + (pick(instance) ?? 0), 0);
  return {
    instances: { used: instances.length, max: limit(quota?.max_instances) },
    volumeGb: {
      used: total((i) => i.volume_size),
      max: limit(quota?.max_volumes),
    },
    ramMb: { used: total((i) => i.ram), max: limit(quota?.max_ram) },
  };
}

/** The initial databases typed as "app, reports", one name each. */
export function splitDatabaseNames(text: string): string[] {
  return text
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * The smallest volume a backup restores into, in whole GB: Trove refuses
 * a volume smaller than the backup (`trove/instance/models.py:1411`,
 * `BackupTooLarge`).
 */
export function backupFloor(backup: Pick<DbBackup, "size">): number {
  return Math.max(1, Math.ceil(backup.size ?? 0));
}

/**
 * The volume a restore starts at: the source instance's own volume while
 * it still exists, never below what the backup needs.
 */
export function restoreVolumeSize(
  backup: Pick<DbBackup, "size" | "instance_id">,
  instances: readonly Pick<DbInstance, "id" | "volume_size">[],
): number {
  const source = instances.find((i) => i.id === backup.instance_id);
  return Math.max(backupFloor(backup), source?.volume_size ?? 0);
}

/** What the launch form checks its values against. */
export interface LaunchContext {
  room: LaunchRoom;
  /** Every flavour on offer, for the chosen one's RAM. */
  flavors: readonly DbFlavor[];
  /** The backups the form can restore from, for the chosen one's size. */
  backups: readonly Pick<DbBackup, "id" | "size">[];
}

/**
 * The launch form. An initial user needs a password and at least one
 * initial database; the CIDRs, database names, user name and password
 * must suit the datastore; the volume and the flavour's RAM must fit what
 * the quota has left, and a restore's volume must hold the backup.
 */
export function launchSchema({ room, flavors, backups }: LaunchContext) {
  const volumeLeft = quotaLeft(room.volumeGb);
  const ramLeft = quotaLeft(room.ramMb);
  return launchFields.superRefine((values, ctx) => {
    const issue = (path: keyof LaunchValues, message: string | null) => {
      if (message) ctx.addIssue({ code: "custom", path: [path], message });
    };
    const datastore = values.datastore.split("/", 1)[0] ?? "";
    issue("allowed_cidrs", cidrsError(splitCidrs(values.allowed_cidrs)));
    if (volumeLeft !== null && values.volume > volumeLeft) {
      issue(
        "volume",
        `A ${values.volume} GB volume does not fit: ${volumeLeft} GB of your database volume quota is left`,
      );
    }
    const backup = backups.find((b) => b.id === values.backup_id);
    if (backup && values.volume < backupFloor(backup)) {
      issue(
        "volume",
        `This backup needs a volume of at least ${backupFloor(backup)} GB`,
      );
    }
    const ram = flavors.find((f) => f.id === values.flavor)?.ram ?? 0;
    if (ramLeft !== null && ram > ramLeft) {
      issue(
        "flavor",
        `This flavour needs ${formatMb(ram)} of RAM: ${formatMb(ramLeft)} of your database RAM quota is left`,
      );
    }
    issue(
      "databases",
      databaseNamesError(datastore, splitDatabaseNames(values.databases)),
    );
    if (values.user) {
      issue("user", userNameError(datastore, values.user));
      issue(
        "password",
        values.password
          ? passwordError(datastore, values.password)
          : "A password is required for the user",
      );
      if (!values.databases) {
        issue(
          "databases",
          "At least one database is required when creating a user",
        );
      }
    }
  });
}

/** The key a datastore version is picked by, as "mysql/8.0". */
export function datastoreKey(option: DatastoreOption): string {
  return `${option.datastore}/${option.version}`;
}

/**
 * The launch request for the form's values. Optional parts are sent only
 * when given; the user's host only with a user, as it belongs to the user.
 */
export function launchRequest(values: LaunchValues): DbLaunchRequest {
  const [type, version] = values.datastore.split("/", 2);
  return {
    name: values.name,
    flavor: values.flavor,
    volume: values.volume,
    datastore: type ?? "",
    version: version ?? "",
    network_id: values.network_id,
    allowed_cidrs: splitCidrs(values.allowed_cidrs),
    ...(values.availability_zone
      ? { availability_zone: values.availability_zone }
      : {}),
    ...(values.databases ? { databases: values.databases } : {}),
    ...(values.user ? { user: values.user, password: values.password } : {}),
    ...(values.user && values.host ? { host: values.host } : {}),
    ...(values.configuration ? { configuration: values.configuration } : {}),
    ...(values.backup_id ? { backup_id: values.backup_id } : {}),
  };
}

/**
 * The datastore versions the form offers: every one, or only the backup's
 * own when restoring, since a backup restores to the version it was taken
 * from.
 */
export function offeredDatastores(
  datastores: DatastoreOption[],
  restoring: Pick<DbBackup, "datastore" | "datastore_version"> | undefined,
): DatastoreOption[] {
  if (!restoring) return datastores;
  return datastores.filter(
    (d) =>
      d.datastore === restoring.datastore &&
      d.version === restoring.datastore_version,
  );
}

/** The configuration groups made for the picked datastore version. */
export function offeredConfigurations<
  T extends Pick<DbConfiguration, "datastore" | "datastore_version">,
>(configurations: T[], datastore: string): T[] {
  const [name, version] = datastore.split("/", 2);
  return configurations.filter(
    (c) => c.datastore === name && c.datastore_version === version,
  );
}
