import { ApiError } from "../../lib/api/errors";

/**
 * What a detail page shows, decided once for every page:
 * - `loading`: the record has not arrived yet;
 * - `missing`: the cloud answered 404, or the loaded list or tree does not
 *   hold the record (a deleted server group, listener or pool);
 * - `unavailable`: the service behind the page is not part of this cloud
 *   (501, `service_not_enabled`);
 * - `failed`: any other failure, which a retry may fix;
 * - `ready`: the record is there.
 */
export type DetailState =
  "loading" | "missing" | "unavailable" | "failed" | "ready";

/** The parts of a query the decision reads. */
export interface DetailQuery {
  status: "pending" | "error" | "success";
  error: unknown;
}

/** Whether the backend said the record does not exist. */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** Whether the backend said the service is not part of this cloud. */
export function isServiceNotEnabled(error: unknown): boolean {
  return error instanceof ApiError && error.code === "service_not_enabled";
}

/**
 * The state of a detail page from its query and whether the record was
 * found in what the query loaded. A failure wins over data the query still
 * holds, so a record deleted while the page polls it reads as missing.
 */
export function detailState(query: DetailQuery, found: boolean): DetailState {
  if (query.status === "error") {
    if (isNotFound(query.error)) return "missing";
    if (isServiceNotEnabled(query.error)) return "unavailable";
    return "failed";
  }
  if (query.status === "pending") return "loading";
  return found ? "ready" : "missing";
}
