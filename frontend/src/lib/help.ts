import type { PublicConfig } from "./api/types";

declare global {
  interface Window {
    FreshworksWidget?: (action: string) => void;
  }
}

const SUPPORT_CENTRE = "https://support.ehelp.edu.au/";

/** Open the Freshworks help widget, or the support site when it is absent. */
export function openHelpWidget(config: PublicConfig | undefined): void {
  if (window.FreshworksWidget) {
    window.FreshworksWidget("open");
  } else {
    window.open(config?.help_url ?? SUPPORT_CENTRE, "_blank", "noopener");
  }
}
