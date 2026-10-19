import { afterEach, describe, expect, it } from "vitest";
import {
  isHelpWidgetReady,
  loadSiteExtras,
  resetSiteExtrasForTests,
  trackEvent,
} from "./extras";
import { openHelpWidget } from "./help";

function scripts() {
  return [...document.head.querySelectorAll("script")].map((s) => s.src);
}

describe("site extras", () => {
  afterEach(() => {
    resetSiteExtrasForTests();
    document.head.innerHTML = "";
    delete window.gtag;
    delete window.dataLayer;
    delete window.FreshworksWidget;
    delete window.fwSettings;
  });

  it("loads nothing when the deployment configures nothing", () => {
    loadSiteExtras({ ga_id: null, freshworks_widget_id: null });
    expect(scripts()).toEqual([]);
    expect(window.gtag).toBeUndefined();
    trackEvent("noop");
  });

  it("loads gtag once, without inline scripts", () => {
    loadSiteExtras({ ga_id: "G-TEST", freshworks_widget_id: null });
    loadSiteExtras({ ga_id: "G-TEST", freshworks_widget_id: null });
    expect(scripts()).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-TEST",
    ]);
    expect(document.head.querySelector("script:not([src])")).toBeNull();
    trackEvent("outbound_click", { link: "support" });
    const calls = (window.dataLayer ?? []).map((args) =>
      Array.from(args as ArrayLike<unknown>),
    );
    expect(calls[1]).toEqual(["config", "G-TEST"]);
    expect(calls[2]).toEqual(["event", "outbound_click", { link: "support" }]);
  });

  it("opens the Freshworks widget only once its script has loaded", () => {
    const opened: string[] = [];
    window.open = ((url: string) => {
      opened.push(url);
      return null;
    }) as typeof window.open;
    loadSiteExtras({ ga_id: null, freshworks_widget_id: "1200" });
    const script = document.head.querySelector("script")!;
    expect(script.src).toBe("https://widget.freshworks.com/widgets/1200.js");
    expect(window.fwSettings).toEqual({ widget_id: "1200" });
    expect(window.FreshworksWidget?.q).toEqual([["hide", "launcher"]]);

    // Still loading: fall back to the support site.
    openHelpWidget(undefined);
    expect(opened).toEqual(["https://support.ehelp.edu.au/"]);

    script.dispatchEvent(new Event("load"));
    expect(isHelpWidgetReady()).toBe(true);
    openHelpWidget(undefined);
    expect(window.FreshworksWidget?.q?.at(-1)).toEqual(["open"]);
  });

  it("falls back to the support site when the widget is blocked", () => {
    loadSiteExtras({ ga_id: null, freshworks_widget_id: "1200" });
    document.head.querySelector("script")!.dispatchEvent(new Event("error"));
    expect(window.FreshworksWidget).toBeUndefined();
    expect(isHelpWidgetReady()).toBe(false);
  });
});
