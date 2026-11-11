// The one way the SPA talks to the backend: same origin, session cookie,
// CSRF header on unsafe methods, and the backend's error envelope turned into
// an ApiError the rest of the app can reason about. What happens on a 401 is
// the query client's job (app/query-client.ts), not the transport's.
import { networkError, parseErrorEnvelope, parseJson } from "./errors";
import { csrfHeader } from "./http";

// Callers catch the client's errors, so they import both from here.
export { ApiError, type ErrorEnvelope } from "./errors";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

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

/**
 * Calls the backend and returns its JSON body as `T` (undefined for a 204).
 * Rejects with an ApiError for any failure, or with the AbortError when
 * `signal` aborts.
 */
export async function apiFetch<T>(
  path: string,
  init: ApiInit = {},
): Promise<T> {
  const response = await send(path, init, "application/json");
  if (response.status === 204) {
    return undefined as T;
  }
  // The backend's response types are the contract (lib/api/types/).
  return parseJson(await response.text()) as T;
}

/**
 * Calls the backend for a file it serves as text (a certificate, a log)
 * and returns the text, so the caller can save it and report a failure,
 * which a plain download link cannot. Rejects as `apiFetch` does.
 */
export async function apiFetchText(
  path: string,
  init: ApiInit = {},
): Promise<string> {
  const response = await send(path, init, "*/*");
  return response.text();
}

/**
 * Sends one request with the session cookie and, on an unsafe method, the
 * CSRF header, and returns the response once it is known to be a success;
 * a failure becomes an ApiError from the backend's error envelope.
 */
async function send(
  path: string,
  init: ApiInit,
  accept: string,
): Promise<Response> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("Accept", accept);
  if (!SAFE.has(method)) {
    for (const [name, value] of Object.entries(csrfHeader())) {
      headers.set(name, value);
    }
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
    throw networkError("could not reach the dashboard service");
  }

  if (!response.ok) {
    throw parseErrorEnvelope(response.status, await response.text());
  }
  return response;
}
