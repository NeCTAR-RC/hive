// A form's unsent input, kept in session storage across a login. When the
// session ends while a submit is on its way (a 401), the app goes through
// the login and comes back to the same address, which reopens a dialog
// opened by a URL flag (`?create=true`); the form then starts from what the
// user had typed instead of empty. `useMutationForm` stashes and restores.

/** The parts of `Storage` a draft needs, so tests can pass a plain object. */
export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** What is stored: the form's field names, and the values safe to keep. */
interface Draft {
  fields: string[];
  values: Record<string, unknown>;
}

const PREFIX = "hive.draft:";

/**
 * Fields never written to storage: a password or secret typed into a form
 * is asked for again rather than kept where any script on the page can read
 * it.
 */
const SECRET_FIELD = /password|secret|passphrase|private|token/i;

/** Whether a value survives JSON unchanged (no File, Date or class). */
function isPlainJson(value: unknown): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      if (Array.isArray(value)) return value.every(isPlainJson);
      return (
        Object.getPrototypeOf(value) === Object.prototype &&
        Object.values(value).every(isPlainJson)
      );
    default:
      return false;
  }
}

function sameFields(a: string[], b: string[]): boolean {
  const left = [...a].sort();
  const right = [...b].sort();
  return (
    left.length === right.length &&
    left.every((name, index) => name === right[index])
  );
}

/** The session store, or undefined where storage is blocked. */
export function sessionDrafts(): DraftStorage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/**
 * Keeps the form's values for its address (path and search, which holds
 * the dialog's URL flag). Secret fields and values JSON cannot carry (a
 * chosen file) are left out; the field names are kept whole, so the draft
 * is only ever restored into the same form.
 */
export function stashDraft(
  storage: DraftStorage | undefined,
  location: string,
  values: Record<string, unknown>,
): void {
  const kept = Object.fromEntries(
    Object.entries(values).filter(
      ([name, value]) => !SECRET_FIELD.test(name) && isPlainJson(value),
    ),
  );
  const draft: Draft = { fields: Object.keys(values), values: kept };
  try {
    storage?.setItem(PREFIX + location, JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the form simply starts empty after login.
  }
}

/** Forgets the draft for the address: the submit succeeded or was refused. */
export function dropDraft(
  storage: DraftStorage | undefined,
  location: string,
): void {
  try {
    storage?.removeItem(PREFIX + location);
  } catch {
    // Nothing to forget where storage is blocked.
  }
}

/**
 * The values to restore into a form opening at `location` with `fields`,
 * once: a draft stashed by a form with the same field names is returned and
 * forgotten. A draft from another form at the same address stays for that
 * form.
 */
export function takeDraft(
  storage: DraftStorage | undefined,
  location: string,
  fields: string[],
): Record<string, unknown> | undefined {
  let draft: Draft;
  try {
    const raw = storage?.getItem(PREFIX + location);
    if (!raw) return undefined;
    draft = JSON.parse(raw) as Draft;
  } catch {
    return undefined;
  }
  if (!Array.isArray(draft.fields) || !sameFields(draft.fields, fields)) {
    return undefined;
  }
  dropDraft(storage, location);
  return draft.values;
}
