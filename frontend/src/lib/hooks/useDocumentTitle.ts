import { useEffect } from "react";

const SITE = "Nectar Dashboard";

/**
 * Sets the browser tab title to "<title> | Nectar Dashboard" while the
 * calling page is mounted, and restores the previous title after.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} | ${SITE}` : SITE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
