import type { PublicConfig } from "./api/types/session";

/**
 * Build the manuka login URL that returns the user to Hive, mirroring the
 * backend's `login_start_url`: the receiver (with `?next=` folded in) goes in
 * `return-path`, and manuka's whitelist ignores the query string.
 */
export function buildLoginUrl(
  config: Pick<PublicConfig, "login_base_url" | "receiver_url">,
  next: string | undefined,
): string {
  let receiver = config.receiver_url;
  if (next) {
    receiver += `?next=${encodeURIComponent(next)}`;
  }
  const base = config.login_base_url;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}return-path=${encodeURIComponent(receiver)}`;
}

const SUPPORT_SITE = "https://support.ehelp.edu.au/";
const LOGIN_HELP_ARTICLE = "/support/solutions/articles/6000055377";

/**
 * The "Having trouble logging in?" article on the support site `help_url`
 * points at, as Horizon's login page links it. The configured URL is a page
 * of that site (by default `.../support/home`), so the article's path is
 * resolved against its origin rather than appended to it.
 */
export function loginHelpUrl(helpUrl: string | undefined): string {
  try {
    return new URL(LOGIN_HELP_ARTICLE, helpUrl || SUPPORT_SITE).href;
  } catch {
    return new URL(LOGIN_HELP_ARTICLE, SUPPORT_SITE).href;
  }
}

/** Only relative, single-slash paths are honoured, as the backend does. */
export function safeNext(value: string | undefined | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\\\r\n]/.test(value)) return "/";
  if (value.startsWith("/auth/")) return "/";
  return value;
}
