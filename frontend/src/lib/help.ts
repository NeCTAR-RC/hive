import type { PublicConfig } from "./api/types/session";
import { isHelpWidgetReady } from "./extras";

const SUPPORT_CENTRE = "https://support.ehelp.edu.au/";

/**
 * Opens the Freshworks help widget (loaded by extras.ts when the deployment
 * configures one), or the support site while it is absent, blocked or
 * still loading.
 */
export function openHelpWidget(config: PublicConfig | undefined): void {
  if (isHelpWidgetReady()) {
    window.FreshworksWidget?.("open");
  } else {
    window.open(config?.help_url ?? SUPPORT_CENTRE, "_blank", "noopener");
  }
}
