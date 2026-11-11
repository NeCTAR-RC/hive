// Browser-side uploads: the backend signs TempURLs and the browser PUTs
// each file (or its segments) straight to Swift, then asks the backend to
// write the large-object manifest. In proxy mode the file streams through
// the backend instead. Progress is reported per file for the dialog.
import { ApiError } from "../../lib/api/client";
import { csrfHeader, xhrPut } from "../../lib/api/http";
import type {
  UploadPlan,
  UploadPlanObject,
} from "../../lib/api/types/objectstore";
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
 * Runs `tasks` with at most `limit` in flight; the results keep the
 * tasks' order. The first failure rejects, and no task starts after it.
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
      if (!task) continue;
      try {
        results[index] = await task();
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

/**
 * Why a file did not upload, for its row: the error's message, followed by
 * each field message of a 422 (`detail[].msg`), which the bare message
 * ("Request validation failed") would leave out.
 */
export function uploadErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const detail =
    error instanceof ApiError && Array.isArray(error.detail)
      ? error.detail
          .map((entry: unknown) =>
            entry && typeof entry === "object" && "msg" in entry
              ? String(entry.msg)
              : "",
          )
          .filter(Boolean)
      : [];
  return detail.length > 0
    ? `${error.message}: ${detail.join("; ")}`
    : error.message;
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
      item.error = uploadErrorMessage(error);
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
    await xhrPut(url, item.file, {
      headers: { "Content-Type": contentType, ...csrfHeader() },
      onProgress,
      signal,
      withCredentials: true,
    });
    return;
  }
  const entry = plan.objects.find((o) => o.name === item.name);
  if (!entry) throw new Error("no upload plan for this file");
  if (entry.url) {
    await xhrPut(entry.url, item.file, {
      headers: { "Content-Type": contentType },
      onProgress,
      signal,
    });
    return;
  }
  // Segments go up SEGMENT_CONCURRENCY at a time; the file's progress is
  // what every segment has sent so far, and the manifest keeps their order.
  const segments = sliceSegments(item.file, entry);
  const sent = segments.map(() => 0);
  const progress = (index: number, bytes: number) => {
    sent[index] = bytes;
    onProgress(sent.reduce((sum, value) => sum + value, 0));
  };
  const manifest = await runPool(
    segments.map((segment, index) => async () => {
      const { etag } = await xhrPut(segment.url, segment.blob, {
        headers: { "Content-Type": "application/octet-stream" },
        onProgress: (bytes) => progress(index, bytes),
        signal,
      });
      progress(index, segment.length);
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
