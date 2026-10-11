// Browser-side uploads: the backend signs TempURLs and the browser PUTs
// each file (or its segments) straight to Swift, then asks the backend to
// write the large-object manifest. In proxy mode the file streams through
// the backend instead. Progress is reported per file for the dialog.
import { readCookie } from "../../lib/api/client";
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
      xhr.setRequestHeader("X-CSRF-Token", readCookie("hive_csrf") ?? "");
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader("ETag") });
      } else {
        reject(new Error(`upload failed with status ${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("upload failed (network or CORS)"));
    xhr.onabort = () => reject(new Error("upload cancelled"));
    signal?.addEventListener("abort", () => xhr.abort());
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
  const segments = sliceSegments(item.file, entry);
  const manifest: { path: string; size_bytes: number; etag?: string }[] = [];
  let done = 0;
  for (const segment of segments) {
    const { etag } = await putWithProgress(segment.url, segment.blob, {
      contentType: "application/octet-stream",
      sameOrigin: false,
      onProgress: (sent) => onProgress(done + sent),
      signal,
    });
    done += segment.length;
    onProgress(done);
    manifest.push({
      path: segment.path,
      size_bytes: segment.length,
      ...(etag ? { etag: etag.replace(/"/g, "") } : {}),
    });
  }
  await completeUpload(container, item.name, manifest);
}
