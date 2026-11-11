import { describe, expect, it } from "vitest";
import type { L7Policy, LoadBalancer } from "../../lib/api/types/loadbalancers";
import {
  availableListenerActions,
  availableLoadBalancerActions,
  availablePolicyActions,
  chainStepLabel,
  defaultPort,
  flavourLabel,
  isChainRunning,
  isPolicyPending,
  isTreePending,
  listenerProtocols,
  memberDefaultPort,
  operatingTone,
  pendingPhrase,
  persistenceTypesFor,
  poolProtocolFor,
  provisioningLabel,
  provisioningTone,
  usablePersistence,
} from "./status";

describe("load balancer status helpers", () => {
  it("labels and tones provisioning and operating statuses", () => {
    expect(provisioningLabel("PENDING_CREATE")).toBe("Creating");
    expect(provisioningTone("PENDING_UPDATE")).toBe("progress");
    expect(provisioningTone("ERROR")).toBe("danger");
    expect(operatingTone("DEGRADED")).toBe("warning");
    expect(operatingTone("ONLINE")).toBe("success");
  });

  it("picks default ports and pool protocols like the Angular wizard", () => {
    expect(defaultPort("HTTP", [])).toBe(80);
    expect(defaultPort("TERMINATED_HTTPS", [443, 444])).toBe(445);
    expect(poolProtocolFor("TERMINATED_HTTPS")).toBe("HTTP");
    expect(poolProtocolFor("TCP")).toBe("TCP");
  });

  it("leaves the port empty for protocols without a default", () => {
    expect(defaultPort("TCP", [])).toBeUndefined();
    expect(defaultPort("UDP", [80])).toBeUndefined();
  });

  it("offers terminated HTTPS only where Barbican runs", () => {
    const listener_protocols = ["HTTP", "TERMINATED_HTTPS", "TCP"];
    expect(
      listenerProtocols({ listener_protocols, barbican_available: true }),
    ).toEqual(listener_protocols);
    expect(
      listenerProtocols({ listener_protocols, barbican_available: false }),
    ).toEqual(["HTTP", "TCP"]);
    expect(listenerProtocols(undefined)).not.toContain("TERMINATED_HTTPS");
  });

  it("gives members port 80 on HTTP pools only", () => {
    expect(memberDefaultPort("HTTP")).toBe(80);
    expect(memberDefaultPort("HTTPS")).toBeUndefined();
    expect(memberDefaultPort("TCP")).toBeUndefined();
  });

  it("offers only source IP persistence on UDP and SCTP pools", () => {
    const types = ["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"];
    expect(persistenceTypesFor("UDP", types)).toEqual(["SOURCE_IP"]);
    expect(persistenceTypesFor("SCTP", types)).toEqual(["SOURCE_IP"]);
    expect(persistenceTypesFor("HTTP", types)).toEqual(types);
    expect(persistenceTypesFor(null, types)).toEqual(types);
    expect(usablePersistence("UDP", "HTTP_COOKIE", types)).toBe("");
    expect(usablePersistence("UDP", "SOURCE_IP", types)).toBe("SOURCE_IP");
    expect(usablePersistence("HTTP", "HTTP_COOKIE", types)).toBe("HTTP_COOKIE");
  });
});

const LB: LoadBalancer = {
  id: "lb-1",
  name: "web",
  description: null,
  provisioning_status: "ACTIVE",
  operating_status: "ONLINE",
  admin_state_up: true,
  vip_address: "192.168.1.5",
  vip_port_id: "port-1",
  vip_subnet_id: "subnet-1",
  vip_network_id: "net-1",
  provider: "amphora",
  flavor_id: null,
  availability_zone: null,
  listeners: [],
  pools: [],
  floating_ip: null,
  created_at: null,
  updated_at: null,
  can_delete: true,
  is_transitional: false,
};

/** The reason each action is disabled, or null when it is offered. */
function reasons(lb: LoadBalancer) {
  return Object.fromEntries(
    availableLoadBalancerActions(lb).map((offer) => [
      offer.id,
      offer.disabledReason ?? null,
    ]),
  );
}

describe("load balancer actions", () => {
  it("lists every action, associate only without a floating IP", () => {
    expect(availableLoadBalancerActions(LB).map((offer) => offer.id)).toEqual([
      "edit",
      "associate-fip",
      "disassociate-fip",
      "delete",
    ]);
    expect(reasons(LB)).toEqual({
      edit: null,
      "associate-fip": null,
      "disassociate-fip": "The load balancer has no floating IP",
      delete: null,
    });
  });

  it("offers disassociate once a floating IP is on the VIP", () => {
    const lb = { ...LB, floating_ip: { id: "fip-1", address: "203.0.113.9" } };
    expect(reasons(lb)).toMatchObject({
      "associate-fip": "The load balancer already has a floating IP",
      "disassociate-fip": null,
    });
  });

  it("needs a VIP port to associate", () => {
    expect(reasons({ ...LB, vip_port_id: null })["associate-fip"]).toBe(
      "The load balancer has no VIP port yet",
    );
  });

  it("waits for Active while Octavia is applying a change", () => {
    const lb = {
      ...LB,
      provisioning_status: "PENDING_CREATE",
      can_delete: false,
    };
    expect(reasons(lb)).toEqual({
      edit: "Wait until the load balancer is Active",
      "associate-fip": "Wait until the load balancer is Active",
      "disassociate-fip": "Wait until the load balancer is Active",
      delete: "Wait until the load balancer is Active",
    });
  });

  it("follows can_delete, naming the status", () => {
    const lb = { ...LB, provisioning_status: "INACTIVE", can_delete: false };
    expect(reasons(lb).delete).toBe(
      "Not available while the status is Inactive",
    );
  });
});

describe("child actions", () => {
  const listener = { provisioning_status: "ACTIVE" } as Parameters<
    typeof availableListenerActions
  >[0];
  const policy = { provisioning_status: "ACTIVE" } as L7Policy;
  const reasonsOf = (offers: { id: string; disabledReason?: string }[]) =>
    Object.fromEntries(offers.map((o) => [o.id, o.disabledReason ?? null]));

  it("offers every change while the load balancer and the child are active", () => {
    expect(reasonsOf(availableListenerActions(listener, "ACTIVE"))).toEqual({
      edit: null,
      delete: null,
    });
  });

  it("waits while the load balancer or the child itself is pending", () => {
    const wait = "Wait until the load balancer is Active";
    expect(
      reasonsOf(availableListenerActions(listener, "PENDING_UPDATE")),
    ).toEqual({ edit: wait, delete: wait });
    expect(
      reasonsOf(
        availableListenerActions(
          { ...listener, provisioning_status: "PENDING_CREATE" },
          "ACTIVE",
        ),
      ),
    ).toEqual({ edit: wait, delete: wait });
  });

  it("keeps a policy's rules open to look at while it waits", () => {
    expect(reasonsOf(availablePolicyActions(policy, "PENDING_UPDATE"))).toEqual(
      {
        rules: null,
        edit: "Wait until the load balancer is Active",
        delete: "Wait until the load balancer is Active",
      },
    );
  });
});

describe("busy load balancers", () => {
  const active = { provisioning_status: "ACTIVE" };
  const pending = { provisioning_status: "PENDING_UPDATE" };
  const tree = {
    load_balancer: active,
    listeners: [active],
    pools: [{ ...active, member_rows: [active] }],
    monitors: [active],
    l7policies: [active],
  };

  it("names the flavour from the offered ones", () => {
    const flavors = [{ id: "f-1", name: "amphora-ha" }];
    expect(flavourLabel({ flavor_id: "f-1" }, flavors)).toBe("amphora-ha");
    expect(flavourLabel({ flavor_id: "f-gone" }, flavors)).toBe("f-gone");
    expect(flavourLabel({ flavor_id: null }, flavors)).toBe("Default");
  });

  it("says what Octavia is doing for each pending status", () => {
    expect(pendingPhrase("PENDING_CREATE")).toBe("being created");
    expect(pendingPhrase("PENDING_UPDATE")).toBe("being updated");
    expect(pendingPhrase("PENDING_DELETE")).toBe("being deleted");
  });

  it("words every chain step, member removal included", () => {
    expect(chainStepLabel("delete_member")).toBe("removing a member");
    expect(chainStepLabel("member")).toBe("adding a member");
    expect(chainStepLabel("unheard-of")).toBe("working");
    expect(chainStepLabel(undefined)).toBe("working");
  });

  it("follows the create chain until it ends or fails", () => {
    const chain = {
      steps: ["listener", "pool"],
      done: ["listener"],
      error: null,
      started: 0,
    };
    expect(isChainRunning(null)).toBe(false);
    expect(isChainRunning(chain)).toBe(true);
    expect(isChainRunning({ ...chain, error: "refused" })).toBe(false);
    expect(isChainRunning({ ...chain, done: chain.steps })).toBe(false);
  });

  it("is pending while any part of the tree is", () => {
    expect(isTreePending(tree)).toBe(false);
    expect(
      isTreePending({
        ...tree,
        pools: [{ ...active, member_rows: [pending] }],
      }),
    ).toBe(true);
    expect(isTreePending({ ...tree, monitors: [pending] })).toBe(true);
    expect(isTreePending({ ...tree, l7policies: [pending] })).toBe(true);
  });

  it("is pending while a policy's rule is", () => {
    expect(isPolicyPending({ ...active, rule_rows: [active] })).toBe(false);
    expect(isPolicyPending({ ...active, rule_rows: [pending] })).toBe(true);
  });
});
