import { describe, expect, it } from "vitest";
import { fillTokens, matchRedirect } from "./redirects";
import { allPanels } from "./panels";

describe("matchRedirect", () => {
  it("maps Horizon paths with and without trailing slashes", () => {
    expect(matchRedirect("/project/instances/")).toEqual({
      status: 301,
      to: "/compute/instances",
      reloadDocument: false,
      horizon: false,
    });
    expect(matchRedirect("/project/instances/abc-123")).toEqual({
      status: 301,
      to: "/compute/instances/abc-123",
      reloadDocument: false,
      horizon: false,
    });
  });

  it("preserves the query where the map says so", () => {
    expect(matchRedirect("/settings/my-details/", "?orcid=1")).toEqual({
      status: 301,
      to: "/account/my-details?orcid=1",
      reloadDocument: false,
      horizon: false,
    });
    expect(matchRedirect("/project/key_pairs/", "?x=1")?.to).toBe(
      "/compute/key-pairs",
    );
  });

  it("loads a download in full, since the backend serves it", () => {
    expect(matchRedirect("/project/api_access/openrc/")).toEqual({
      status: 301,
      to: "/api/api-access/openrc",
      reloadDocument: true,
      horizon: false,
    });
    expect(matchRedirect("/project/reservations/r-1/calendar.ics")).toEqual({
      status: 301,
      to: "/api/reservations/r-1/calendar.ics",
      reloadDocument: true,
      horizon: false,
    });
  });

  it("marks retired features gone and leaves Hive's own paths alone", () => {
    expect(matchRedirect("/app-catalog/")?.status).toBe(410);
    expect(matchRedirect("/compute/instances")).toBeNull();
  });

  it("sends the allocation pages, at any depth, to Horizon", () => {
    expect(matchRedirect("/allocation/")).toEqual({
      status: 301,
      to: "/allocation/",
      reloadDocument: true,
      horizon: true,
    });
    expect(
      matchRedirect("/allocation/user_requests/12/edit/", "?a=1")?.to,
    ).toBe("/allocation/user_requests/12/edit/?a=1");
    expect(matchRedirect("/allocationx/")).toBeNull();
  });

  it("maps Angular detail pages, whose type segment is literal", () => {
    expect(matchRedirect("/ngdetails/OS::Octavia::LoadBalancer/lb-1")?.to).toBe(
      "/load-balancers/lb-1",
    );
    expect(matchRedirect("/ngdetails/OS::Nova::Keypair/my key")?.to).toBe(
      "/compute/key-pairs/my%20key",
    );
    expect(matchRedirect("/ngdetails/OS::Unknown::Thing/x")).toBeNull();
  });

  it("has a redirect row for every built panel's Horizon path", () => {
    for (const panel of allPanels().filter((p) => p.status === "built")) {
      if (panel.horizonPath === "/dashboard_home/") continue;
      const match = matchRedirect(panel.horizonPath);
      expect(match, panel.horizonPath).not.toBeNull();
      expect(match?.to).toBe(panel.to);
    }
  });

  it("never redirects a path to itself", () => {
    expect(matchRedirect("/auth/login/", "?next=%2F")?.to).toBe(
      "/auth/login?next=%2F",
    );
    expect(matchRedirect("/auth/login", "?next=%2F")).toBeNull();
    expect(matchRedirect("/terms")).toBeNull();
    expect(matchRedirect("/identity/credentials")).toBeNull();
    expect(matchRedirect("/auth/switch/abc")).toBeNull();
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
