// Browser-side uploads: the backend signs TempURLs and the browser PUTs
// each file (or its segments) straight to Swift, then asks the backend to
// write the large-object manifest. In proxy mode the file streams through
// the backend instead. Progress is reported per file for the dialog.
import { ApiError, csrfToken, envelopeFrom } from "../../lib/api/client";
import type { UploadPlan, UploadPlanObject } from "../../lib/api/types";
import { completeUpload, objectPath, requestUploadPlan } from "./api";

export type UploadStatus = "pending" | "uploading" | "done" | "error";

export interface UploadItem {
  name: string;
  file: File;
  sent: number;
  status: UploadStatus;
  error?: string;
}

export interface UploadOptions {
  container: string;
  prefix: string;
  files: File[];
  onProgress: (items: UploadItem[]) => void;
  signal?: AbortSignal;
}

/** The object name for a file dropped into a folder. */
export function objectName(prefix: string, file: File): string {
  const relative =
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name;
  return `${prefix}${relative.replace(/^\/+/, "")}`;
}

/** The blob for each segment of the plan, from the file's byte ranges. */
export function sliceSegments(
  file: File,
  plan: UploadPlanObject,
): { blob: Blob; path: string; url: string; length: number }[] {
  return (plan.segments ?? []).map((segment) => ({
    blob: file.slice(segment.offset, segment.offset + segment.length),
    path: segment.path,
    url: segment.url,
    length: segment.length,
  }));
}

/** How many segments of one large file go up at once. */
export const SEGMENT_CONCURRENCY = 3;

/**
 * Run the tasks with at most `limit` in flight; the results keep the
 * tasks' order. The first failure rejects, and no new task starts after it.
 */
export async function runPool<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results = new Array<T>(tasks.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < tasks.length) {
      const index = next++;
      const task = tasks[index];
      try {
        if (task) results[index] = await task();
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, worker),
  );
  return results;
}

/** The message for a failed upload: the backend's own wording for a
 * proxied upload (411, 400 and 422 included), else the status. */
export function uploadError(status: number, responseText: string): Error {
  let body: unknown;
  try {
    body = responseText ? JSON.parse(responseText) : null;
  } catch {
    body = null;
  }
  if (body && typeof body === "object" && "message" in body) {
    const error = new ApiError(status, envelopeFrom(body));
    const detail = Array.isArray(error.detail)
      ? (error.detail as { msg?: unknown }[])
          .map((entry) => (typeof entry.msg === "string" ? entry.msg : ""))
          .filter(Boolean)
      : [];
    if (detail.length > 0) {
      return new ApiError(status, {
        ...envelopeFrom(body),
        message: `${error.message}: ${detail.join("; ")}`,
      });
    }
    return error;
  }
  return new Error(`upload failed with status ${status}`);
}

/** A PUT with upload progress, which fetch() cannot report. */
export function putWithProgress(
  url: string,
  body: Blob,
  {
    contentType,
    sameOrigin,
    onProgress,
    signal,
  }: {
    contentType: string;
    sameOrigin: boolean;
    onProgress: (sent: number) => void;
    signal?: AbortSignal | undefined;
  },
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType);
    if (sameOrigin) {
      xhr.withCredentials = true;
      xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    const onAbort = () => xhr.abort();
    const settle = () => signal?.removeEventListener("abort", onAbort);
    xhr.onload = () => {
      settle();
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(
          sameOrigin
            ? uploadError(xhr.status, xhr.responseText)
            : new Error(`upload failed with status ${xhr.status}`),
        );
      }
    };
    xhr.onerror = () => {
      settle();
      reject(new Error("upload failed (network or CORS)"));
    };
    xhr.onabort = () => {
      settle();
      reject(new Error("upload cancelled"));
    };
    if (signal?.aborted) {
      reject(new Error("upload cancelled"));
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.send(body);
  });
}

export async function uploadFiles({
  container,
  prefix,
  files,
  onProgress,
  signal,
}: UploadOptions): Promise<UploadItem[]> {
  const items: UploadItem[] = files.map((file) => ({
    name: objectName(prefix, file),
    file,
    sent: 0,
    status: "pending",
  }));
  const report = () => onProgress(items.map((item) => ({ ...item })));
  report();
  const plan = await requestUploadPlan(
    container,
    items.map((item) => ({
      name: item.name,
      size: item.file.size,
      content_type: item.file.type || null,
    })),
  );
  for (const item of items) {
    if (signal?.aborted) {
      item.status = "error";
      item.error = "cancelled";
      continue;
    }
    item.status = "uploading";
    report();
    try {
      await uploadOne(
        container,
        item,
        plan,
        (sent) => {
          item.sent = sent;
          report();
        },
        signal,
      );
      item.sent = item.file.size;
      item.status = "done";
    } catch (error) {
      item.status = "error";
      item.error = error instanceof Error ? error.message : String(error);
    }
    report();
  }
  return items;
}

async function uploadOne(
  container: string,
  item: UploadItem,
  plan: UploadPlan,
  onProgress: (sent: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  const contentType = item.file.type || "application/octet-stream";
  if (plan.mode === "proxy") {
    if (plan.max_bytes && item.file.size > plan.max_bytes) {
      throw new Error("the file is too large to upload through the dashboard");
    }
    const url = `${objectPath(container, item.name)}?filename=${encodeURIComponent(item.file.name)}`;
    await putWithProgress(url, item.file, {
      contentType,
      sameOrigin: true,
      onProgress,
      signal,
    });
    return;
  }
  const entry = plan.objects.find((o) => o.name === item.name);
  if (!entry) throw new Error("no upload plan for this file");
  if (entry.url) {
    await putWithProgress(entry.url, item.file, {
      contentType,
      sameOrigin: false,
      onProgress,
      signal,
    });
    return;
  }
  // Segments go up a few at a time; progress is the sum over segments and
  // the manifest keeps the plan's order.
  const segments = sliceSegments(item.file, entry);
  const sent = segments.map(() => 0);
  const total = () => sent.reduce((sum, value) => sum + value, 0);
  const manifest = await runPool(
    segments.map((segment, index) => async () => {
      const { etag } = await putWithProgress(segment.url, segment.blob, {
        contentType: "application/octet-stream",
        sameOrigin: false,
        onProgress: (bytes) => {
          sent[index] = bytes;
          onProgress(total());
        },
        signal,
      });
      sent[index] = segment.length;
      onProgress(total());
      return {
        path: segment.path,
        size_bytes: segment.length,
        ...(etag ? { etag: etag.replace(/"/g, "") } : {}),
      };
    }),
    SEGMENT_CONCURRENCY,
  );
  await completeUpload(container, item.name, manifest);
}
