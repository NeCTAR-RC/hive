import { useSyncExternalStore } from "react";

function subscribe(query: string, callback: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}

/** True when the media query matches; false during server rendering. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const DESKTOP = "(width >= 1024px)";
export const TABLET = "(width >= 768px)";
