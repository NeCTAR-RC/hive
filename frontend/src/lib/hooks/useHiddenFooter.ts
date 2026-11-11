import { useEffect } from "react";

/**
 * Hides the agency footer while the calling page is mounted.
 *
 * The footer is the `<ardc-footer>` its layout renders after the page, so a
 * page cannot leave it out of its own tree. The hook marks the body instead
 * and the global stylesheet hides the footer under that mark; the mark goes
 * when the page unmounts.
 */
export function useHiddenFooter() {
  useEffect(() => {
    document.body.dataset.footer = "hidden";
    return () => {
      delete document.body.dataset.footer;
    };
  }, []);
}
