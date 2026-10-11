import { describe, expect, it } from "vitest";
import type { Me } from "../../lib/api/types";
import { DASHBOARDS, linkoutHref, panelVisible } from "./panels";

function me(overrides: Partial<Me> = {}): Me {
  return {
    user: { id: "u1", name: "sam", domain_id: "default" },
    project: {
      id: "p1",
      name: "research",
      domain_id: "default",
      enabled: true,
      is_trial: false,
    },
    roles: ["member"],
    projects: [],
    capabilities: {
      tenantmanager: false,
      user_lookup: false,
      services: {
        compute: true,
        volume: true,
        network: true,
        image: true,
        "object-store": true,
        "container-infra": false,
        "load-balancer": false,
        orchestration: false,
        dns: false,
        share: false,
        database: false,
        reservation: false,
        security: false,
        rating: true,
        metric: true,
        allocations: true,
        account: true,
        ops: true,
      },
    },
    session: { expires_at: 0, server_time: 0 },
    ...overrides,
  };
}

const panel = (id: string) =>
  DASHBOARDS.flatMap((d) => d.groups.flatMap((g) => g.panels)).find(
    (p) => p.id === id,
  )!;

describe("panelVisible", () => {
  it("hides panels whose service is absent from the catalog", () => {
    expect(panelVisible(panel("instances"), me())).toBe(true);
    expect(panelVisible(panel("clusters"), me())).toBe(false);
    expect(panelVisible(panel("reservations"), me())).toBe(false);
  });

  it("gates role-restricted panels", () => {
    expect(panelVisible(panel("members"), me())).toBe(false);
    const manager = me();
    manager.capabilities.tenantmanager = true;
    expect(panelVisible(panel("members"), manager)).toBe(true);
  });

  it("shows allocation usage only with an SU budget, never for trials", () => {
    const budget = { su_budget: 5000 } as never;
    const trial = me();
    trial.project.is_trial = true;
    expect(
      panelVisible(panel("allocation-usage"), trial, undefined, budget),
    ).toBe(false);
    expect(panelVisible(panel("allocation-usage"), me())).toBe(false);
    expect(
      panelVisible(panel("allocation-usage"), me(), undefined, {
        su_budget: 0,
      } as never),
    ).toBe(false);
    expect(
      panelVisible(panel("allocation-usage"), me(), undefined, budget),
    ).toBe(true);
  });

  it("shows extension-gated panels only when the cloud offers them", () => {
    expect(panelVisible(panel("trunks"), me())).toBe(false);
    expect(panelVisible(panel("port-forwardings"), me())).toBe(false);
    const extensions = {
      port_forwarding: true,
      trunk: false,
      dns_integration: true,
      extraroute: true,
      network_availability_zone: true,
      router_availability_zone: true,
      subnet_allocation: true,
      port_security: true,
    };
    expect(panelVisible(panel("port-forwardings"), me(), extensions)).toBe(
      true,
    );
    expect(panelVisible(panel("trunks"), me(), extensions)).toBe(false);
    expect(panelVisible(panel("networks"), me(), extensions)).toBe(true);
  });

  it("shows unrestricted panels before the session loads", () => {
    expect(panelVisible(panel("api-access"), undefined)).toBe(true);
    expect(panelVisible(panel("instances"), undefined)).toBe(false);
  });

  it("builds link-outs against the Horizon origin", () => {
    expect(linkoutHref("https://dashboard.test/", panel("instances"))).toBe(
      "https://dashboard.test/project/instances/",
    );
  });
});
