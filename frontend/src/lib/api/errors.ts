// The backend's error envelope and the one error type the app reasons about.

export interface ErrorEnvelope {
  error: string;
  message: string;
  service?: string | null;
  request_id?: string | null;
  upstream_request_id?: string | null;
  login_url?: string;
  detail?: unknown;
}

/** The envelope keys ApiError reads into fields of its own. */
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
  /**
   * Any other key the backend put in the envelope, such as
   * `provisioning_status` on a load balancer that is busy.
   */
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

/** The longest stretch of a non-JSON error body (an HTML page) kept. */
const PLAIN_MESSAGE_LIMIT = 200;

/**
 * Reads a response body as JSON; an empty or non-JSON body reads as null,
 * because proxies and object stores answer errors with HTML or nothing.
 */
export function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The ApiError for a failed response: the backend's envelope when the body
 * is one, otherwise the start of the body as the message.
 */
export function parseErrorEnvelope(status: number, text: string): ApiError {
  const body = parseJson(text);
  const envelope: Partial<ErrorEnvelope> =
    body !== null && typeof body === "object"
      ? body
      : { message: text.slice(0, PLAIN_MESSAGE_LIMIT) || undefined };
  return new ApiError(status, envelope);
}

/** A request that never reached the server (offline, DNS, CORS). */
export function networkError(message: string): ApiError {
  return new ApiError(0, { error: "network", message });
}
