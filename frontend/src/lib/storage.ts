// Per-browser conveniences only (dismissed panels, table page sizes). Every
// call is wrapped: private windows and blocked storage must not break pages.
const PREFIX = "hive.";

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage unavailable: the preference simply does not persist.
  }
}
