// The transport details every request shares: the CSRF header the backend
// requires on unsafe methods (its token from the session probe), and a PUT
// with upload progress, which fetch() cannot report.
import { networkError, parseErrorEnvelope } from "./errors";

/**
 * The backend's default CSRF cookie (`HIVE_CSRF_COOKIE_NAME`). The name is a
 * deployment setting, so the token the session probe returns wins; the
 * cookie only serves a request made before the probe has answered.
 */
const CSRF_COOKIE = "hive_csrf";

/** The CSRF token from the last session probe, if it carried one. */
let probedCsrfToken: string | null = null;

export function readCookie(name: string): string | undefined {
  const prefix = `${name}=`;
  const found = document.cookie
    .split("; ")
    .find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined;
}

/**
 * Records the CSRF token a session probe returned; a probe without one (no
 * session) clears it, so the cookie is read again.
 */
export function setCsrfToken(token: string | null | undefined): void {
  probedCsrfToken = token || null;
}

/** The header that proves a same-origin request to the backend. */
export function csrfHeader(): Record<string, string> {
  return {
    "X-CSRF-Token": probedCsrfToken ?? readCookie(CSRF_COOKIE) ?? "",
  };
}

export interface XhrPutOptions {
  headers?: Record<string, string>;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** Send cookies: for the backend, never for a signed object-store URL. */
  withCredentials?: boolean;
}

export interface XhrPutResult {
  /** The response body, empty when there is none. */
  text: string;
  /** The ETag the server returned, which object-store manifests need. */
  etag: string | null;
}

/**
 * PUTs `body` with upload progress. Resolves on a 2xx; rejects with the
 * ApiError for any other status (so a 401 reaches the session policy like
 * any API error), a network ApiError when the request never completes, and
 * an AbortError when `signal` aborts. The abort listener is removed once
 * the request settles.
 */
export function xhrPut(
  url: string,
  body: Blob,
  {
    headers = {},
    onProgress,
    signal,
    withCredentials = false,
  }: XhrPutOptions = {},
): Promise<XhrPutResult> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("the upload was cancelled", "AbortError"));
      return;
    }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const settle = (finish: () => void) => {
      signal?.removeEventListener("abort", abort);
      finish();
    };

    xhr.open("PUT", url);
    xhr.responseType = "text";
    xhr.withCredentials = withCredentials;
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    xhr.onload = () =>
      settle(() => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            text: xhr.responseText,
            etag: xhr.getResponseHeader("ETag"),
          });
        } else {
          reject(parseErrorEnvelope(xhr.status, xhr.responseText));
        }
      });
    xhr.onerror = () =>
      settle(() => reject(networkError("the upload was interrupted")));
    xhr.onabort = () =>
      settle(() =>
        reject(new DOMException("the upload was cancelled", "AbortError")),
      );

    signal?.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}
