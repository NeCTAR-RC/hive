import type { PublicConfig } from "./api/types";

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

/** Only relative, single-slash paths are honoured, as the backend does. */
export function safeNext(value: string | undefined | null): string {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  if (/[\\\r\n]/.test(value)) return "/";
  if (value.startsWith("/auth/")) return "/";
  return value;
}
