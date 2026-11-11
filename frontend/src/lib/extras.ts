// The third-party extras a deployment switches on through /api/config:
// Google Analytics (`ga_id`) and the Freshworks help widget
// (`freshworks_widget_id`), as Horizon loads them. Both are external scripts
// appended once at start-up, which the CSP's script-src allows by origin.
//
// Analytics caveat: GA4's enhanced measurement of outbound clicks listens at
// the document, and React Aria's press handling (every library `Link`) stops
// the click from reaching it, so those clicks go unrecorded. Page views are
// recorded: GA4 follows the router's history changes.
import type { PublicConfig } from "./api/types/session";
import { appendScript } from "./scripts";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fwSettings?: { widget_id: string };
    FreshworksWidget?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js";
const FRESHWORKS_SRC = "https://widget.freshworks.com/widgets";

let started = false;
let helpWidgetReady = false;

/** Google's gtag.js snippet, with the script appended rather than inline. */
function loadAnalytics(id: string): void {
  const dataLayer = (window.dataLayer ??= []);
  // gtag.js reads the `arguments` object itself off the data layer, as
  // Google's snippet pushes it; an array of the arguments is not read.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
  appendScript(`${GTAG_SRC}?id=${encodeURIComponent(id)}`);
}

/**
 * The Freshworks embed: its settings, the queueing stub the widget replays
 * once loaded, and the script. The floating launcher stays hidden; the
 * shell's "Request help" opens the widget (see help.ts).
 */
function loadHelpWidget(id: string): void {
  window.fwSettings = { widget_id: id };
  if (typeof window.FreshworksWidget !== "function") {
    const queue: unknown[] = [];
    const stub = (...args: unknown[]) => {
      queue.push(args);
    };
    window.FreshworksWidget = Object.assign(stub, { q: queue });
  }
  window.FreshworksWidget("hide", "launcher");
  appendScript(`${FRESHWORKS_SRC}/${encodeURIComponent(id)}.js`, {
    onLoad: () => {
      helpWidgetReady = true;
    },
    // Blocked or offline: help falls back to the support site.
    onError: () => {
      delete window.FreshworksWidget;
    },
  });
}

/** Loads the extras the deployment configures; later calls do nothing. */
export function loadSiteExtras(
  config: Pick<PublicConfig, "ga_id" | "freshworks_widget_id">,
): void {
  if (started) return;
  started = true;
  if (config.ga_id) loadAnalytics(config.ga_id);
  if (config.freshworks_widget_id) {
    loadHelpWidget(config.freshworks_widget_id);
  }
}

/** Whether the Freshworks widget has loaded and can open. */
export function isHelpWidgetReady(): boolean {
  return helpWidgetReady && typeof window.FreshworksWidget === "function";
}
