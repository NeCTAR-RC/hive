// Send a file to the backend with upload progress. fetch() cannot report
// progress, so this is the one place XMLHttpRequest is used; it carries the
// same CSRF header and error envelope handling as apiFetch.
import { ApiError, csrfToken, envelopeFrom } from "./client";

export interface UploadOptions {
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

export function uploadFile<T>(
  path: string,
  file: Blob,
  options: UploadOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", path);
    xhr.responseType = "text";
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    const onAbort = () => xhr.abort();
    // Drop the abort listener once the request settles, so a long-lived
    // signal shared by many uploads does not accumulate them.
    xhr.onloadend = () => options.signal?.removeEventListener("abort", onAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onProgress?.(event.loaded, event.total);
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError(0, {
          error: "network",
          message: "the upload was interrupted",
        }),
      );
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
        return;
      }
      reject(new ApiError(xhr.status, envelopeFrom(body)));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      options.signal.addEventListener("abort", onAbort, { once: true });
    }
    xhr.send(file);
  });
}
