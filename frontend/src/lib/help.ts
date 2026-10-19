import type { PublicConfig } from "./api/types";
import { isHelpWidgetReady } from "./extras";

const SUPPORT_CENTRE = "https://support.ehelp.edu.au/";

/**
 * Open the Freshworks help widget (loaded by lib/extras.ts when
 * `freshworks_widget_id` is configured), or the support site when it is
 * absent, blocked or still loading.
 */
export function openHelpWidget(config: PublicConfig | undefined): void {
  if (isHelpWidgetReady()) {
    window.FreshworksWidget!("open");
  } else {
    window.open(config?.help_url ?? SUPPORT_CENTRE, "_blank", "noopener");
  }
}
