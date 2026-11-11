// The same Horizon redirect map the backend serves as 301s, applied by the
// SPA so the Vite dev server (no backend in front) and in-app stale links
// behave identically. The row syntax is the backend's (`hive/redirects.py`):
// a parameter is a whole segment (`/:id`), a `from` ending in `/*` matches
// everything below it and a `*` in `to` takes that rest, and a `horizon`
// row's `to` is a path on Horizon itself.
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
  splat: boolean;
}

const SPLAT = "/*";

function compile(row: Row): Rule | null {
  if (row.from === "/") return null;
  const splat = row.from.endsWith(SPLAT);
  const source = (splat ? row.from.slice(0, -SPLAT.length) : row.from).replace(
    /\/$/,
    "",
  );
  const escaped = source
    .split(/((?<=\/):[A-Za-z_][A-Za-z0-9_]*)/)
    .map((part, index) =>
      // The split puts the parameters at the odd indexes.
      index % 2 === 1
        ? `(?<${part.slice(1)}>[^/]+)`
        : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("");
  const tail = splat ? "(?:/(?<_rest>.*))?" : "/?";
  return {
    pattern: new RegExp(`^${escaped}${tail}$`),
    to: row.to,
    kind: row.kind,
    preserveQuery: Boolean(row.preserveQuery),
    splat,
  };
}

const RULES: Rule[] = (rows as Row[])
  .map(compile)
  .filter((rule): rule is Rule => rule !== null);

export interface Redirect {
  status: 301 | 410;
  to: string;
  /**
   * True when the target is a file the backend serves (an openrc, a
   * calendar), not an SPA page: the browser must load it in full, or the
   * router would look for a page at an `/api/` path.
   */
  reloadDocument: boolean;
  /**
   * True when `to` is a path on Horizon (the configured `horizon_url`): a
   * page Hive still links out to, such as the allocation requests.
   */
  horizon: boolean;
}

/**
 * Puts the captured values into a target's `:name` tokens. Whole tokens
 * only, so `:id` never replaces the head of `:id_2`; a token with no value
 * is left as it is.
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

/**
 * The redirect for a path, or null when no row maps it. A row whose target
 * is the requested path itself does not match, as in the backend: the
 * optional trailing slash lets `/terms/ -> /terms` also match `/terms`, and
 * redirecting that would loop.
 */
export function matchRedirect(pathname: string, search = ""): Redirect | null {
  for (const rule of RULES) {
    const found = rule.pattern.exec(pathname);
    if (!found) continue;
    if (rule.kind === "gone") {
      return { status: 410, to: "", reloadDocument: false, horizon: false };
    }
    const { _rest: rest = "", ...params } = found.groups ?? {};
    let target = fillTokens(rule.to, params);
    if (rule.splat) {
      target = target.replace("*", encodeURI(rest));
    }
    const horizon = rule.kind === "horizon";
    // A Horizon target is a path on another site, never this page.
    if (!horizon && target === pathname) return null;
    const query = search.replace(/^\?/, "");
    if (rule.preserveQuery && query) {
      target += (target.includes("?") ? "&" : "?") + query;
    }
    return {
      status: 301,
      to: target,
      reloadDocument: rule.kind === "download" || horizon,
      horizon,
    };
  }
  return null;
}
