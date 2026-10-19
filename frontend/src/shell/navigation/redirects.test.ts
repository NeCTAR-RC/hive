import { describe, expect, it } from "vitest";
import { fillTokens, matchRedirect } from "./redirects";
import { allPanels } from "./panels";

describe("matchRedirect", () => {
  it("maps Horizon paths with and without trailing slashes", () => {
    expect(matchRedirect("/project/instances/")).toEqual({
      status: 301,
      to: "/compute/instances",
    });
    expect(matchRedirect("/project/instances/abc-123")).toEqual({
      status: 301,
      to: "/compute/instances/abc-123",
    });
  });

  it("preserves the query where the map says so", () => {
    expect(matchRedirect("/settings/my-details/", "?orcid=1")).toEqual({
      status: 301,
      to: "/account/my-details?orcid=1",
    });
    expect(matchRedirect("/project/key_pairs/", "?x=1")?.to).toBe(
      "/compute/key-pairs",
    );
  });

  it("marks retired features gone and leaves link-outs alone", () => {
    expect(matchRedirect("/app-catalog/")?.status).toBe(410);
    expect(matchRedirect("/allocation/")).toBeNull();
    expect(matchRedirect("/compute/instances")).toBeNull();
  });

  it("has a redirect row for every built panel's Horizon path", () => {
    for (const panel of allPanels().filter((p) => p.status === "built")) {
      if (panel.horizonPath === "/dashboard_home/") continue;
      const match = matchRedirect(panel.horizonPath);
      expect(match, panel.horizonPath).not.toBeNull();
      expect(match?.to).toBe(panel.to);
    }
  });
});

describe("fillTokens", () => {
  it("replaces whole tokens only", () => {
    expect(fillTokens("/a/:id/b/:id_2", { id: "x", id_2: "y z" })).toBe(
      "/a/x/b/y%20z",
    );
    expect(fillTokens("/a/:id_2/:id", { id: "x" })).toBe("/a/:id_2/x");
  });
});
