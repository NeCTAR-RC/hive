import { ApiError } from "../../lib/api/errors";

/** A rule failure the backend tied to one of the form's fields. */
export interface ServerFieldError {
  field: string;
  message: string;
}

/** Pydantic's lead-in to a validator's own words, which the backend also drops. */
const VALUE_ERROR_PREFIX = "Value error, ";

interface DetailEntry {
  loc: unknown[];
  msg: string;
}

function isDetailEntry(entry: unknown): entry is DetailEntry {
  if (typeof entry !== "object" || entry === null) return false;
  const { loc, msg } = entry as Record<string, unknown>;
  return Array.isArray(loc) && typeof msg === "string";
}

/**
 * The field errors in a 422 answer: each `detail` entry whose `loc` names
 * one of `fields`, on the last segment that does (so `["body",
 * "allowed_cidrs", 0]` lands on `allowed_cidrs`), with its `msg` as the
 * message. Entries that name no field are left to the form-level error.
 */
export function serverFieldErrors(
  error: unknown,
  fields: readonly string[],
): ServerFieldError[] {
  if (!(error instanceof ApiError) || error.status !== 422) return [];
  if (!Array.isArray(error.detail)) return [];
  return error.detail.filter(isDetailEntry).flatMap(({ loc, msg }) => {
    const field = [...loc]
      .reverse()
      .find(
        (segment): segment is string =>
          typeof segment === "string" && fields.includes(segment),
      );
    const message = msg.startsWith(VALUE_ERROR_PREFIX)
      ? msg.slice(VALUE_ERROR_PREFIX.length)
      : msg;
    return field === undefined ? [] : [{ field, message }];
  });
}

/**
 * Whether the request's error has already been said under a field, so the
 * dialog need not repeat it above the form.
 */
export function isSaidByAField(
  error: unknown,
  fieldErrors: readonly ServerFieldError[],
): boolean {
  return (
    error instanceof Error &&
    fieldErrors.some(({ message }) => message === error.message)
  );
}
