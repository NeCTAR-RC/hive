// The Usage Trend page's "Download CSV": the per-instance table for the
// range shown, built in the browser from the rows already loaded.
import type { UsageInstance } from "../../lib/api/types/usage";

const HEADER = [
  "Instance",
  "Instance ID",
  "Started",
  "Ended",
  "Availability zone",
  "Flavour",
  "Instance hours",
  "Service units",
];

/**
 * One CSV field (RFC 4180): quoted when it holds a comma, quote or line
 * break. Text a spreadsheet would run as a formula (starting with =, +, -,
 * @ or a tab) gets a leading apostrophe, since instance names are free
 * text.
 */
function field(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/**
 * The rows as CSV, one line per instance with the table's columns: raw
 * ISO times and unrounded numbers, for spreadsheets rather than reading;
 * an instance still running has no end.
 */
export function usageCsv(rows: UsageInstance[]): string {
  const lines = [
    HEADER,
    ...rows.map((row) => [
      row.name,
      row.id,
      row.started_at,
      row.ended_at,
      row.availability_zone,
      row.flavor_name,
      row.qty,
      row.rate,
    ]),
  ];
  return lines.map((line) => line.map(field).join(",")).join("\r\n") + "\r\n";
}

/** The file's name: the project and the range, in characters any system keeps. */
export function usageCsvName(
  project: string,
  begin: string,
  end: string,
): string {
  const safe = project.replace(/[^A-Za-z0-9._-]+/g, "-") || "project";
  return `usage-${safe}-${begin}-to-${end}.csv`;
}
