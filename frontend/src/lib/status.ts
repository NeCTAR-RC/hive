/**
 * How a raw upstream status reads and which tone its badge takes. Each
 * feature's status module holds its tables (which statuses are busy, which
 * are good or bad, the words that differ from the raw value) and builds its
 * readers with these helpers, so the wording rules live in one place.
 */
import type { StatusTone } from "../components/StatusPill/StatusPill";

/** Words that stay in capitals inside a sentence-case label. */
const ACRONYMS = new Set([
  "API",
  "DNS",
  "HTTP",
  "HTTPS",
  "ID",
  "IP",
  "SCTP",
  "SSL",
  "TCP",
  "TLS",
  "UDP",
  "URL",
]);

/**
 * A raw status or enum value in sentence case, with underscores and dashes
 * as spaces: "in-use" reads "In use", "NO_MONITOR" reads "No monitor". An
 * acronym keeps its capitals: "REDIRECT_TO_URL" reads "Redirect to URL".
 */
export function humanise(raw: string): string {
  const words = raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word.toUpperCase())
        ? word.toUpperCase()
        : word.toLowerCase(),
    );
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * An upstream enum value with underscores as spaces and its case kept, for
 * the places Horizon shows the API's own words ("ROUND_ROBIN" reads
 * "ROUND ROBIN", an instance's "SHUTOFF" stays as it is).
 */
export function enumLabel(raw: string): string {
  return raw.replace(/_/g, " ");
}

/** How one status reads. */
export interface StatusReading {
  tone: StatusTone;
  label: string;
  isTransitional: boolean;
}

/** The readers a status table gives: each takes the raw status. */
export interface StatusReaders {
  tone: (status: string | null | undefined) => StatusTone;
  label: (status: string | null | undefined) => string;
  isTransitional: (status: string | null | undefined) => boolean;
}

/** Statuses listed by value, or a test for a family such as "error_*". */
export type StatusMatch = readonly string[] | ((status: string) => boolean);

export interface StatusTable {
  /** Busy statuses: shown with the progress tone, and polled. */
  transitional?: StatusMatch;
  success?: StatusMatch;
  info?: StatusMatch;
  warning?: StatusMatch;
  danger?: StatusMatch;
  neutral?: StatusMatch;
  /** The tone of a status no list names; neutral unless given. */
  otherwise?: StatusTone;
  /** Words that differ from how an unlisted status reads. */
  labels?: Readonly<Record<string, string>>;
  /**
   * How a status without a label reads: in sentence case (the default), or
   * as the API sent it, as a Horizon panel shows a status it has no words
   * for.
   */
  unlisted?: "humanise" | "as-is";
  /** The label when there is no status; "Unknown" unless given. */
  missing?: string;
}

function matches(match: StatusMatch | undefined, status: string): boolean {
  if (!match) return false;
  return typeof match === "function" ? match(status) : match.includes(status);
}

/**
 * The tone, label and busy readers for one status table. Tones are looked
 * up in order (transitional, success, info, warning, danger, neutral), so a
 * busy status reads as busy even when another list also names it.
 */
export function defineStatus(table: StatusTable): StatusReaders {
  const tones: [StatusMatch | undefined, StatusTone][] = [
    [table.transitional, "progress"],
    [table.success, "success"],
    [table.info, "info"],
    [table.warning, "warning"],
    [table.danger, "danger"],
    [table.neutral, "neutral"],
  ];
  return {
    tone: (status) => {
      if (!status) return "neutral";
      const found = tones.find(([match]) => matches(match, status));
      return found ? found[1] : (table.otherwise ?? "neutral");
    },
    label: (status) => {
      if (!status) return table.missing ?? "Unknown";
      const label = table.labels?.[status];
      if (label !== undefined) return label;
      return table.unlisted === "as-is" ? status : humanise(status);
    },
    isTransitional: (status) =>
      status ? matches(table.transitional, status) : false,
  };
}

const HEAT_STATUS = /^([A-Z]+)_(IN_PROGRESS|COMPLETE|FAILED)$/;

/**
 * A Heat-style `<ACTION>_<STATE>` status, as Heat stacks and Magnum
 * clusters report them: busy while IN_PROGRESS, bad once FAILED, good once
 * COMPLETE (except DELETE_COMPLETE, which is neutral). The label is
 * "Create in progress"; a status of another shape shows as it is.
 */
export function heatStatus(status: string | null | undefined): StatusReading {
  if (!status) {
    return { tone: "neutral", label: "Unknown", isTransitional: false };
  }
  const match = HEAT_STATUS.exec(status);
  if (!match) {
    return { tone: "neutral", label: status, isTransitional: false };
  }
  const [, action = "", state = ""] = match;
  const label = `${humanise(action)} ${humanise(state).toLowerCase()}`;
  if (state === "IN_PROGRESS") {
    return { tone: "progress", label, isTransitional: true };
  }
  if (state === "FAILED") {
    return { tone: "danger", label, isTransitional: false };
  }
  const tone = status === "DELETE_COMPLETE" ? "neutral" : "success";
  return { tone, label, isTransitional: false };
}

/** Each Heat action as the past participle a sentence needs. */
const HEAT_PARTICIPLES: Readonly<Record<string, string>> = {
  ADOPT: "adopted",
  CHECK: "checked",
  CREATE: "created",
  DELETE: "deleted",
  INIT: "initialised",
  RESTORE: "restored",
  RESUME: "resumed",
  ROLLBACK: "rolled back",
  SNAPSHOT: "snapshotted",
  SUSPEND: "suspended",
  UPDATE: "updated",
};

/**
 * What a Heat-style status in progress is doing, to end a sentence such as
 * "while it is being created": "CREATE_IN_PROGRESS" reads "being created".
 * Null for a status that is not in progress, or an action without words.
 */
export function heatActivity(status: string | null | undefined): string | null {
  const match = HEAT_STATUS.exec(status ?? "");
  if (!match || match[2] !== "IN_PROGRESS") return null;
  const participle = HEAT_PARTICIPLES[match[1] ?? ""];
  return participle ? `being ${participle}` : null;
}
