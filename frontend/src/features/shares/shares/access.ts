// The access rules a share or a mountable snapshot can take: the access
// types its protocol supports, the help and the check for each type's
// value, and a new rule's starting values. Pure, so both access dialogs
// and their tests share one table.
import { isCidr, isIpAddress } from "../../../lib/net";
import { tooLongMessage } from "../../../lib/validation";
import { ACCESS_TYPES } from "../status";

/** An access type Manila knows: ip, user, cert or cephx. */
export type AccessType = "ip" | "user" | "cert" | "cephx";

/**
 * The access types each share protocol's drivers take, as the Manila
 * share back end feature support mapping describes them (believed; the
 * upstream table is not vendored): CephFS shares grant CephX users, NFS
 * shares IP addresses, CIFS shares users or IP addresses. A protocol not
 * listed is offered every type and left to Manila.
 */
const ACCESS_TYPES_BY_PROTOCOL: Readonly<Record<string, AccessType[]>> = {
  CEPHFS: ["cephx"],
  NFS: ["ip"],
  CIFS: ["user", "ip"],
  GLUSTERFS: ["cert", "ip"],
  HDFS: ["user"],
  MAPRFS: ["user"],
};

/** The access type choices for a share of `protocol`, in the order offered. */
export function accessTypesFor(protocol: string | null) {
  const types = ACCESS_TYPES_BY_PROTOCOL[(protocol ?? "").toUpperCase()];
  return types
    ? ACCESS_TYPES.filter((type) => types.includes(type.id as AccessType))
    : ACCESS_TYPES;
}

/** The help under the "Access to" field for each access type. */
export const ACCESS_TO_HINTS: Readonly<Record<string, string>> = {
  ip: "An IP address or network, such as 203.0.113.10 or 203.0.113.0/24.",
  user: "A user or group name of 4 to 255 characters.",
  cert: "The client certificate's common name (CN), up to 64 characters.",
  cephx: "A CephX user name without the client. prefix, such as alice.",
};

/**
 * A user or group name as Manila's `validate_username` reads it: any first
 * character, then 3 to 254 without `"/\[]:;|=,+*?<>`.
 */
const USER_NAME = /^.[^"/\\[\]:;|=,+*?<>]{3,254}$/;

/**
 * Why `value` cannot be granted access as `type`, or null when it can.
 * The checks are Manila's API checks (`manila/api/common.py`
 * `validate_access`), as the backend applies them
 * (`backend/hive/nectar/shares.py`): an IP address or network; a user or
 * group name (`USER_NAME`), not only periods and spaces; a certificate
 * common name of at most 64 characters; a CephX user of letters, digits,
 * dashes and underscores (Manila refuses periods, so nobody types the
 * "client." prefix).
 */
export function accessToError(type: string, value: string): string | null {
  switch (type) {
    case "ip":
      return isIpAddress(value) || isCidr(value)
        ? null
        : "Enter an IP address or network, such as 203.0.113.0/24";
    case "user":
      return USER_NAME.test(value) && /[^.\s]/.test(value)
        ? null
        : 'Use 4 to 255 characters, none of them "/\\[]:;|=,+*?<>';
    case "cert":
      return value.length <= 64 ? null : tooLongMessage(64);
    case "cephx":
      return /^[A-Za-z0-9_-]+$/.test(value)
        ? null
        : "Use letters, digits, dashes and underscores, without the client. prefix";
    default:
      return null;
  }
}

/** The access rule form's values, sent as the rule request. */
export interface AccessRuleValues {
  access_type: string;
  access_to: string;
  access_level: string;
}

/**
 * A new access rule's starting values for a share of `protocol`: the
 * first access type the protocol supports, and read and write.
 */
export function accessRuleDefaults(protocol: string | null): AccessRuleValues {
  return {
    access_type: accessTypesFor(protocol)[0]?.id ?? "ip",
    access_to: "",
    access_level: "rw",
  };
}
