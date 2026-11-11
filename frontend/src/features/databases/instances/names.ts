// The names and passwords a database instance takes, by datastore, as
// Trove's guest models check them (`trove/common/db/mysql/models.py`,
// `trove/common/db/postgresql/models.py`, the `ignore_dbs` and
// `ignore_users` defaults in `trove/common/cfg.py`). Checking here says
// what is wrong in the form instead of after the instance has refused it.

/** The datastores whose guests use Trove's MySQL models. */
const MYSQL_FAMILY = ["mysql", "mariadb", "percona", "pxc"];

/** Which naming rules a datastore follows, or null for one not covered. */
function family(datastore: string | null): "mysql" | "postgresql" | null {
  const name = (datastore ?? "").toLowerCase();
  if (MYSQL_FAMILY.includes(name)) return "mysql";
  return name === "postgresql" ? "postgresql" : null;
}

/** Hive's minimum password length (the backend holds the same). */
export const PASSWORD_MIN_LENGTH = 8;

/** A MySQL database name (`MySQLSchema.dbname`), 64 characters at most. */
const MYSQL_DATABASE = /^[A-Za-z0-9_-]+[\s?#@]*[A-Za-z0-9_-]+$/;
/** The characters a MySQL user name or password cannot hold or start or
 * end with (`MySQLUser.not_supported_chars`). */
const MYSQL_UNSUPPORTED = /^\s|\s$|['";`,/\\]/;
/** The databases and users Trove keeps for itself on MySQL. */
const MYSQL_RESERVED_DATABASES = [
  "mysql",
  "information_schema",
  "performance_schema",
  "sys",
];
const MYSQL_RESERVED_USERS = ["os_admin", "root"];

/** Why `name` cannot be a database on the datastore, or null. */
export function databaseNameError(
  datastore: string | null,
  name: string,
): string | null {
  switch (family(datastore)) {
    case "mysql":
      if (MYSQL_RESERVED_DATABASES.includes(name.toLowerCase())) {
        return `${name} is reserved`;
      }
      return name.length <= 64 && MYSQL_DATABASE.test(name)
        ? null
        : `${name} is not a database name: use 2 to 64 letters, digits, underscores and dashes`;
    case "postgresql":
      return name.length >= 2 && name.length <= 63 && /\S$/.test(name)
        ? null
        : `${name} is not a database name: use 2 to 63 characters`;
    default:
      return null;
  }
}

/**
 * Why a comma-separated list of names cannot be created on the datastore
 * (the first bad name), or null.
 */
export function databaseNamesError(
  datastore: string | null,
  names: string[],
): string | null {
  for (const name of names) {
    const message = databaseNameError(datastore, name);
    if (message) return message;
  }
  return null;
}

/** Why `name` cannot be a user on the datastore, or null. */
export function userNameError(
  datastore: string | null,
  name: string,
): string | null {
  switch (family(datastore)) {
    case "mysql":
      if (MYSQL_RESERVED_USERS.includes(name)) return `${name} is reserved`;
      return name.length <= 16 && !MYSQL_UNSUPPORTED.test(name)
        ? null
        : "Use up to 16 characters, without spaces at either end or any of ' \" ; ` , / \\";
    case "postgresql":
      return name.length <= 63 ? null : "Use up to 63 characters";
    default:
      return null;
  }
}

/** Why `password` cannot be a user's password on the datastore, or null. */
export function passwordError(
  datastore: string | null,
  password: string,
): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  return family(datastore) === "mysql" && MYSQL_UNSUPPORTED.test(password)
    ? "Use no spaces at either end and none of ' \" ; ` , / \\"
    : null;
}
