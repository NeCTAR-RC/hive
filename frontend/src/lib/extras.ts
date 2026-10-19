// Third-party site extras the deployment switches on through /api/config:
// Google Analytics (`ga_id`) and the Freshworks help widget
// (`freshworks_widget_id`). Both are plain external scripts appended once at
// start-up, with no inline <script>, so the CSP's script-src
// (https://www.googletagmanager.com, https://*.freshworks.com) covers them.
//
// Analytics caveat: GA4's Enhanced Measurement "Outbound clicks" listens for
// clicks at the document, but the design-system `Link` (React Aria's
// `usePress`) stops click propagation, so GA never sees a DS Link click. A
// link that must be tracked needs an explicit `onPress` that calls
// `trackEvent` below. Page views are fine: GA4 follows history changes.
import type { PublicConfig } from "./api/types";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fwSettings?: { widget_id: number | string };
    FreshworksWidget?: ((...args: unknown[]) => void) & { q?: unknown[] };
  }
}

const GTAG_SRC = "https://www.googletagmanager.com/gtag/js";
const FRESHWORKS_SRC = "https://widget.freshworks.com/widgets";

let loaded = false;
let helpWidgetReady = false;

function appendScript(
  src: string,
  onLoad?: () => void,
  onError?: () => void,
): void {
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  if (onLoad) script.addEventListener("load", onLoad, { once: true });
  if (onError) script.addEventListener("error", onError, { once: true });
  document.head.appendChild(script);
}

function loadAnalytics(id: string): void {
  window.dataLayer = window.dataLayer ?? [];
  // gtag must push the `arguments` object itself, as Google's snippet does.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", id);
  appendScript(`${GTAG_SRC}?id=${encodeURIComponent(id)}`);
}

function loadHelpWidget(id: string): void {
  window.fwSettings = { widget_id: id };
  // The queueing stub from the Freshworks embed code; the widget script
  // replays the queue when it loads.
  if (typeof window.FreshworksWidget !== "function") {
    const queue: unknown[] = [];
    const stub = (...args: unknown[]) => {
      queue.push(args);
    };
    window.FreshworksWidget = Object.assign(stub, { q: queue });
  }
  // Keep the floating launcher hidden: "Request Help" in the shell opens it.
  window.FreshworksWidget("hide", "launcher");
  appendScript(
    `${FRESHWORKS_SRC}/${encodeURIComponent(id)}.js`,
    () => {
      helpWidgetReady = true;
    },
    () => {
      // Blocked or offline: let help fall back to the support site.
      delete window.FreshworksWidget;
    },
  );
}

/** Load the configured extras; safe to call more than once. */
export function loadSiteExtras(
  config: Pick<PublicConfig, "ga_id" | "freshworks_widget_id">,
): void {
  if (loaded) return;
  loaded = true;
  if (config.ga_id) loadAnalytics(config.ga_id);
  if (config.freshworks_widget_id) {
    loadHelpWidget(config.freshworks_widget_id);
  }
}

/** True once the Freshworks script has loaded and can open the widget. */
export function isHelpWidgetReady(): boolean {
  return helpWidgetReady && typeof window.FreshworksWidget === "function";
}

/** Send a GA4 event (no-op without analytics), for explicit `onPress`. */
export function trackEvent(
  name: string,
  params: Record<string, string | number | boolean> = {},
): void {
  window.gtag?.("event", name, params);
}

/** Test hook: forget what has been loaded. */
export function resetSiteExtrasForTests(): void {
  loaded = false;
  helpWidgetReady = false;
}
