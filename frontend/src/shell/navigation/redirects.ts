// The same Horizon redirect map the backend serves as 301s, applied by the
// SPA so the Vite dev server (no backend in front) and in-app stale links
// behave identically.
import rows from "../../../../backend/hive/data/horizon-redirects.json";

interface Row {
  from: string;
  to: string;
  kind: string;
  preserveQuery?: boolean;
}

interface Rule {
  pattern: RegExp;
  to: string;
  kind: string;
  preserveQuery: boolean;
}

function compile(row: Row): Rule | null {
  if (row.kind === "linkout" || row.from === "/") return null;
  const source = row.from.replace(/\/$/, "");
  const escaped = source
    .split(/(:[A-Za-z_][A-Za-z0-9_]*)/)
    .map((part) =>
      part.startsWith(":")
        ? `(?<${part.slice(1)}>[^/]+)`
        : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  return {
    pattern: new RegExp(`^${escaped}/?$`),
    to: row.to,
    kind: row.kind,
    preserveQuery: Boolean(row.preserveQuery),
  };
}

const RULES: Rule[] = (rows as Row[])
  .map(compile)
  .filter((rule): rule is Rule => rule !== null);

export interface Redirect {
  status: 301 | 410;
  to: string;
}

/**
 * Put the captured values into a target's ":name" tokens. Whole tokens
 * only, so ":id" never replaces the head of ":id_2".
 */
export function fillTokens(
  target: string,
  values: Record<string, string | undefined>,
): string {
  return target.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (token, name: string) => {
    const value = values[name];
    return value === undefined ? token : encodeURIComponent(value);
  });
}

export function matchRedirect(pathname: string, search = ""): Redirect | null {
  for (const rule of RULES) {
    const found = rule.pattern.exec(pathname);
    if (!found) continue;
    if (rule.kind === "gone") return { status: 410, to: "" };
    let target = fillTokens(rule.to, found.groups ?? {});
    const query = search.replace(/^\?/, "");
    if (rule.preserveQuery && query) {
      target += (target.includes("?") ? "&" : "?") + query;
    }
    return { status: 301, to: target };
  }
  return null;
}
