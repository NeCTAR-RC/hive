import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Extras = typeof import("./extras");
type Help = typeof import("./help");

let extras: Extras;
let help: Help;

/** The sources of the scripts appended to the head, in order. */
function scripts(): string[] {
  return [...document.head.querySelectorAll("script")].map(
    (script) => script.src,
  );
}

// The module remembers what it has loaded, so each test gets a fresh copy.
beforeEach(async () => {
  vi.resetModules();
  extras = await import("./extras");
  help = await import("./help");
});

afterEach(() => {
  document.head.replaceChildren();
  delete window.gtag;
  delete window.dataLayer;
  delete window.FreshworksWidget;
  delete window.fwSettings;
  vi.restoreAllMocks();
});

describe("loadSiteExtras", () => {
  it("loads nothing when the deployment configures nothing", () => {
    extras.loadSiteExtras({ ga_id: null, freshworks_widget_id: null });
    expect(scripts()).toEqual([]);
    expect(window.gtag).toBeUndefined();
    expect(window.FreshworksWidget).toBeUndefined();
  });

  it("loads Google Analytics once, with no inline script", () => {
    extras.loadSiteExtras({ ga_id: "G-TEST", freshworks_widget_id: null });
    extras.loadSiteExtras({ ga_id: "G-TEST", freshworks_widget_id: null });
    expect(scripts()).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-TEST",
    ]);
    expect(document.querySelector("script:not([src])")).toBeNull();
    const calls = (window.dataLayer ?? []).map((args) =>
      Array.from(args as ArrayLike<unknown>),
    );
    expect(calls[0]?.[0]).toBe("js");
    expect(calls[1]).toEqual(["config", "G-TEST"]);
  });
});

describe("the help widget", () => {
  it("opens the widget only once its script has loaded", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    extras.loadSiteExtras({ ga_id: null, freshworks_widget_id: "1200" });
    const [script] = document.head.querySelectorAll("script");
    expect(script?.src).toBe("https://widget.freshworks.com/widgets/1200.js");
    expect(window.fwSettings).toEqual({ widget_id: "1200" });
    expect(window.FreshworksWidget?.q).toEqual([["hide", "launcher"]]);

    // Still loading: the support site opens instead.
    help.openHelpWidget(undefined);
    expect(open).toHaveBeenCalledWith(
      "https://support.ehelp.edu.au/",
      "_blank",
      "noopener",
    );

    script?.dispatchEvent(new Event("load"));
    expect(extras.isHelpWidgetReady()).toBe(true);
    help.openHelpWidget(undefined);
    expect(window.FreshworksWidget?.q?.at(-1)).toEqual(["open"]);
    expect(open).toHaveBeenCalledOnce();
  });

  it("falls back to the support site when the widget is blocked", () => {
    extras.loadSiteExtras({ ga_id: null, freshworks_widget_id: "1200" });
    document.head.querySelector("script")?.dispatchEvent(new Event("error"));
    expect(window.FreshworksWidget).toBeUndefined();
    expect(extras.isHelpWidgetReady()).toBe(false);
  });
});
