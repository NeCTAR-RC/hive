// The one way the SPA talks to the backend: same origin, session cookie,
// CSRF header on unsafe methods, and the backend's error envelope turned into
// an ApiError the rest of the app can reason about.

export interface ErrorEnvelope {
  error: string;
  message: string;
  service?: string | null;
  request_id?: string | null;
  upstream_request_id?: string | null;
  login_url?: string;
  detail?: unknown;
}

const KNOWN_ENVELOPE_KEYS = new Set([
  "error",
  "message",
  "service",
  "request_id",
  "upstream_request_id",
  "login_url",
  "detail",
]);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly service: string | null;
  readonly requestId: string | null;
  readonly loginUrl: string | null;
  readonly detail: unknown;
  /** Any other key the backend put in the envelope (`provisioning_status`
   * on a busy load balancer, `floating_ip_id` after a failed association). */
  readonly extra: Record<string, unknown>;

  constructor(status: number, envelope: Partial<ErrorEnvelope>) {
    super(envelope.message ?? `request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.error ?? (status === 0 ? "network" : "unknown");
    this.service = envelope.service ?? null;
    this.requestId = envelope.request_id ?? null;
    this.loginUrl = envelope.login_url ?? null;
    this.detail = envelope.detail;
    this.extra = Object.fromEntries(
      Object.entries(envelope).filter(([key]) => !KNOWN_ENVELOPE_KEYS.has(key)),
    );
  }

  get isAuth(): boolean {
    return this.status === 401;
  }
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
// The backend's default `HIVE_CSRF_COOKIE_NAME`. The cookie name is a
// deployment setting, so the token from the /api/session probe wins; the
// cookie is only the fallback for a request made before the probe ran.
const DEFAULT_CSRF_COOKIE = "hive_csrf";
const SESSION_PROBE = "/api/session";

/** Shown when an error body is not the JSON envelope (an ingress HTML 502). */
export const UNAVAILABLE_MESSAGE =
  "the dashboard service is unavailable; try again shortly";

let probedCsrfToken: string | null = null;

/** Record the CSRF token the session probe returned (null clears it). */
export function setCsrfToken(token: string | null | undefined): void {
  probedCsrfToken = token || null;
}

/** The value for the X-CSRF-Token header on unsafe requests. */
export function csrfToken(): string {
  return probedCsrfToken ?? readCookie(DEFAULT_CSRF_COOKIE) ?? "";
}

/** The error envelope from a parsed body, or the fixed unavailable message. */
export function envelopeFrom(body: unknown): Partial<ErrorEnvelope> {
  return body && typeof body === "object"
    ? (body as Partial<ErrorEnvelope>)
    : { error: "unavailable", message: UNAVAILABLE_MESSAGE };
}

type Listener = (error: ApiError) => void;
let unauthenticatedListener: Listener | null = null;

/** Called whenever the backend answers 401; the app redirects to login. */
export function setUnauthenticatedHandler(listener: Listener | null): void {
  unauthenticatedListener = listener;
}

export function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const found = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
}

export interface ApiInit {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  json?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function buildUrl(path: string, query?: ApiInit["query"]): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
}

export async function apiFetch<T>(
  path: string,
  init: ApiInit = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!SAFE.has(method)) {
    headers.set("X-CSRF-Token", csrfToken());
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, init.query), {
      method,
      headers,
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
      credentials: "same-origin",
      signal: init.signal ?? null,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw cause;
    }
    throw new ApiError(0, {
      error: "network",
      message: "could not reach the dashboard service",
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const error = new ApiError(response.status, envelopeFrom(body));
    if (error.isAuth && unauthenticatedListener) {
      unauthenticatedListener(error);
    }
    throw error;
  }
  if (path === SESSION_PROBE && method === "GET") {
    const probe = body as { csrf_token?: string } | null;
    setCsrfToken(probe?.csrf_token);
  }
  return body as T;
}
