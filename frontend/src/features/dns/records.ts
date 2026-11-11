// Record set rules the record set dialogs apply before Designate sees a
// request: the format of each record type, the absolute name a relative
// name stands for, and the record set a new one would duplicate. The
// backend checks the same formats (`backend/hive/nectar/dns.py`).
import type { RecordSet } from "../../lib/api/types/dns";
import { isDnsName, isIpAddress } from "../../lib/net";

/** How one record type's records look, and the check each must pass. */
interface RecordFormat {
  /** What a record of this type is, for an error: "an IPv4 address". */
  noun: string;
  /** The help under the records field, with an example. */
  hint: string;
  /** Whether one record (trimmed, not blank) has the type's format. */
  check?: (record: string) => boolean;
}

/** A whole number from 0 to `max`, written in digits only. */
function isWholeUpTo(text: string, max: number): boolean {
  return /^\d+$/.test(text) && Number(text) <= max;
}

/**
 * An absolute DNS name: a name ending with a dot. Underscore labels are
 * allowed, as a CNAME to a mail provider's DKIM selector needs, and as the
 * backend's check allows (`backend/hive/nectar/dns.py` LABEL).
 */
function isAbsoluteName(text: string): boolean {
  return text.endsWith(".") && isDnsName(text);
}

const TARGET: RecordFormat = {
  noun: "a host name ending with a dot",
  hint: "A host name ending with a dot, such as host.example.com.",
  check: isAbsoluteName,
};

/**
 * The record formats by type, as Designate accepts them (Designate v2 API
 * reference; designate-dashboard is believed to check A and AAAA as
 * addresses and the MX and SRV parts). TXT and SPF take any text.
 */
export const RECORD_FORMATS: Readonly<Record<string, RecordFormat>> = {
  A: {
    noun: "an IPv4 address",
    hint: "An IPv4 address, such as 203.0.113.10",
    check: (record) => isIpAddress(record, 4),
  },
  AAAA: {
    noun: "an IPv6 address",
    hint: "An IPv6 address, such as 2001:db8::10",
    check: (record) => isIpAddress(record, 6),
  },
  CNAME: {
    ...TARGET,
    hint: "A canonical name ending with a dot, such as www.example.com.",
  },
  NS: {
    ...TARGET,
    hint: "A name server ending with a dot, such as ns1.example.com.",
  },
  PTR: TARGET,
  MX: {
    noun: "a priority and a mail host ending with a dot",
    hint: "Priority and mail host, such as 10 mail.example.com.",
    check: (record) => {
      const [priority = "", host = "", ...rest] = record.split(/\s+/);
      return (
        rest.length === 0 &&
        isWholeUpTo(priority, 65535) &&
        isAbsoluteName(host)
      );
    },
  },
  SRV: {
    noun: "a priority, weight, port and target ending with a dot",
    hint: "Priority, weight, port and target, such as 10 5 5060 sip.example.com.",
    check: (record) => {
      const parts = record.split(/\s+/);
      const target = parts[3] ?? "";
      return (
        parts.length === 4 &&
        parts.slice(0, 3).every((part) => isWholeUpTo(part, 65535)) &&
        isAbsoluteName(target)
      );
    },
  },
  SSHFP: {
    noun: "an algorithm, a type and a hexadecimal fingerprint",
    hint: "Algorithm, type and fingerprint, such as 1 1 <hex>",
    check: (record) => {
      const [algorithm = "", type = "", fingerprint = "", ...rest] =
        record.split(/\s+/);
      return (
        rest.length === 0 &&
        isWholeUpTo(algorithm, 255) &&
        isWholeUpTo(type, 255) &&
        /^[0-9a-f]+$/i.test(fingerprint)
      );
    },
  },
  CAA: {
    noun: "flags, a tag and a value",
    hint: 'Flags, tag and value, such as 0 issue "letsencrypt.org"',
    check: (record) => {
      const match = /^(\S+)\s+([A-Za-z0-9]+)\s+\S/.exec(record);
      return match !== null && isWholeUpTo(match[1] ?? "", 255);
    },
  },
  SPF: { noun: "an SPF policy", hint: "An SPF policy, such as v=spf1 -all" },
  TXT: { noun: "text", hint: "Free text; quotes are added for you" },
};

/** The help under the records field for a type: "One per line. ...". */
export function recordsHint(type: string): string {
  const hint = RECORD_FORMATS[type]?.hint;
  return hint ? `One per line. ${hint}` : "One per line.";
}

/** The records typed one per line, trimmed, blank lines dropped. */
export function splitRecords(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * The body of a record set edit. A blank TTL goes out as null, which
 * restores the zone's default TTL; leaving `ttl` out would keep the
 * current one, so a cleared field would silently change nothing.
 */
export function recordSetUpdateBody(values: {
  records: string;
  ttl?: number | undefined;
  description: string;
}): { records: string[]; ttl: number | null; description: string } {
  return {
    records: splitRecords(values.records),
    ttl: values.ttl ?? null,
    description: values.description,
  };
}

/**
 * Why the records cannot make a record set of `type`, or null when they
 * can: none at all, more than one CNAME, or the first record that does not
 * have the type's format.
 */
export function recordsError(type: string, records: string[]): string | null {
  if (records.length === 0) return "Enter at least one record";
  if (type === "CNAME" && records.length > 1) {
    return "A CNAME record set holds one record";
  }
  const format = RECORD_FORMATS[type];
  const check = format?.check;
  if (!format || !check) return null;
  const bad = records.find((record) => !check(record));
  return bad === undefined ? null : `"${bad}" is not ${format.noun}`;
}

/**
 * The absolute name a record set name typed in a zone stands for, as the
 * backend reads it (`recordset_name` in `backend/hive/nectar/dns.py`):
 * blank or "@" is the zone itself, a name ending with a dot is already
 * absolute, and any other name is relative to the zone.
 */
export function absoluteName(zoneName: string, name: string): string {
  const clean = name.trim();
  if (!clean || clean === "@") return zoneName;
  return clean.endsWith(".") ? clean : `${clean}.${zoneName}`;
}

/**
 * The record set in `recordsets` with the same absolute name and type as
 * the one about to be created, which Designate would refuse as a
 * duplicate; DNS names compare without regard to case.
 */
export function duplicateRecordSet(
  recordsets: readonly RecordSet[],
  zoneName: string,
  name: string,
  type: string,
): RecordSet | undefined {
  const wanted = absoluteName(zoneName, name).toLowerCase();
  return recordsets.find(
    (recordset) =>
      recordset.type === type && recordset.name?.toLowerCase() === wanted,
  );
}

/**
 * The record type with its article, as it is read aloud: "an A", "an MX",
 * "a CNAME". A letter whose name starts with a vowel sound takes "an".
 */
export function withArticle(type: string): string {
  return `${/^[AEFHILMNORSX]/.test(type) ? "an" : "a"} ${type}`;
}
