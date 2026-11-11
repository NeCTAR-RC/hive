// Send a file to the backend with upload progress, through the shared
// xhrPut so it carries the same CSRF header and error handling as apiFetch.
import { parseJson } from "./errors";
import { csrfHeader, xhrPut } from "./http";

export interface UploadOptions {
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
}

/** PUTs `file` to a backend path and returns the JSON body as `T`. */
export async function uploadFile<T>(
  path: string,
  file: Blob,
  { onProgress, signal }: UploadOptions = {},
): Promise<T> {
  const { text } = await xhrPut(path, file, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/octet-stream",
      ...csrfHeader(),
    },
    onProgress,
    signal,
    withCredentials: true,
  });
  // The backend's response types are the contract (lib/api/types/).
  return parseJson(text) as T;
}
