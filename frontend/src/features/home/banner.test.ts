import { describe, expect, it } from "vitest";
import { bannerButtonVariant, isOtherSite, parseBannerInfo } from "./banner";

describe("parseBannerInfo", () => {
  it("keeps http(s) anchors as links between runs of text", () => {
    expect(
      parseBannerInfo(
        "Based on the <a href='https://example.org/criteria' target='_blank'>eligibility criteria</a>. Apply now.",
      ),
    ).toEqual([
      { text: "Based on the " },
      { text: "eligibility criteria", href: "https://example.org/criteria" },
      { text: ". Apply now." },
    ]);
  });

  it("reduces any other markup to its text", () => {
    expect(
      parseBannerInfo(
        'Select <strong>"Workshops only"</strong><script>alert(1)</script><img src=x onerror="alert(2)"> then <a href="javascript:alert(3)">continue</a>.',
      ),
    ).toEqual([{ text: 'Select "Workshops only" then continue.' }]);
  });

  it("returns plain text unchanged and nothing for an empty string", () => {
    expect(parseBannerInfo("No cost to attend.")).toEqual([
      { text: "No cost to attend." },
    ]);
    expect(parseBannerInfo("")).toEqual([]);
  });
});

describe("isOtherSite", () => {
  const origin = "https://dashboard.rc.nectar.org.au";

  it("keeps paths and same-origin URLs in the dashboard", () => {
    expect(isOtherSite("/project/reservations/", origin)).toBe(false);
    expect(isOtherSite(`${origin}/reservations`, origin)).toBe(false);
  });

  it("sends other origins to a new tab", () => {
    expect(isOtherSite("https://eligibility.rc.nectar.org.au/", origin)).toBe(
      true,
    );
  });
});

describe("bannerButtonVariant", () => {
  it("maps the brand colours to primary and the rest to secondary", () => {
    expect(bannerButtonVariant("orange")).toBe("primary");
    expect(bannerButtonVariant("purple")).toBe("primary");
    expect(bannerButtonVariant("grey")).toBe("secondary");
    expect(bannerButtonVariant(undefined)).toBe("secondary");
  });
});
