import { appendScript } from "../lib/scripts";

/** The agency's loader, which hydrates `<ardc-megamenu>` elements. */
export const MEGAMENU_LOADER =
  "https://ardc.edu.au/wp-content/plugins/ardc-custom-web-components/dist/loaders/megamenu.min.js";

/** The id of the `<ardc-megamenu>` element index.html places above the app. */
export const MEGAMENU_ID = "ardc-menu";

/**
 * Loads the agency mega menu into the element index.html places above the
 * app. If the loader cannot load (blocked, offline, ardc.edu.au down), the
 * element is hidden, so the strip reserved for it does not stay empty. The
 * loader is appended from code rather than given an inline `onerror`, which
 * a CSP without `'unsafe-inline'` blocks.
 */
export function loadMegamenu(): void {
  const menu = document.getElementById(MEGAMENU_ID);
  if (!menu) return;
  appendScript(MEGAMENU_LOADER, {
    onError: () => {
      menu.hidden = true;
    },
  });
}
