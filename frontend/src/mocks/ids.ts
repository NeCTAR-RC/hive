// Identifiers the mocked domains share, so a project or user means the same
// thing in every handler.

/** The signed-in user's current project. */
export const PROJECT_ID = "p1";

/** The signed-in user. */
export const USER_ID = "u1";

/** The identity domain every mocked user and project lives in. */
export const DOMAIN_ID = "default";

let counter = 100;

/**
 * A fresh id for a created resource, such as "vol-101". One counter for
 * every domain; the prefix says what the id is for.
 */
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
