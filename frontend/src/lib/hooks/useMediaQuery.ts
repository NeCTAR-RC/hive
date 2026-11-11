import { useCallback, useSyncExternalStore } from "react";

/**
 * True when the media query matches; false during server rendering. The
 * subscription is stable per query, so React subscribes once rather than on
 * every render.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const DESKTOP = "(width >= 1024px)";
export const TABLET = "(width >= 768px)";
export const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
