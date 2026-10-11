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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly service: string | null;
  readonly requestId: string | null;
  readonly loginUrl: string | null;
  readonly detail: unknown;

  constructor(status: number, envelope: Partial<ErrorEnvelope>) {
    super(envelope.message ?? `request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = envelope.error ?? (status === 0 ? "network" : "unknown");
    this.service = envelope.service ?? null;
    this.requestId = envelope.request_id ?? null;
    this.loginUrl = envelope.login_url ?? null;
    this.detail = envelope.detail;
  }

  get isAuth(): boolean {
    return this.status === 401;
  }
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_COOKIE = "hive_csrf";

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
    headers.set("X-CSRF-Token", readCookie(CSRF_COOKIE) ?? "");
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
    const envelope =
      body && typeof body === "object"
        ? (body as Partial<ErrorEnvelope>)
        : { message: text.slice(0, 200) };
    const error = new ApiError(response.status, envelope);
    if (error.isAuth && unauthenticatedListener) {
      unauthenticatedListener(error);
    }
    throw error;
  }
  return body as T;
}
