import { describe, expect, it } from "vitest";
import { resourceHref } from "./resources";

describe("resourceHref", () => {
  it.each([
    ["OS::Nova::Server", "i-1", "/compute/instances/i-1"],
    ["OS::Cinder::Volume", "vol-1", "/storage/volumes/vol-1"],
    ["OS::Neutron::Net", "net-1", "/network/networks/net-1"],
    ["OS::Neutron::Subnet", "subnet-1", "/network/subnets/subnet-1"],
    ["OS::Neutron::Port", "port-1", "/network/ports/port-1"],
    ["OS::Neutron::Router", "r-1", "/network/routers/r-1"],
    ["OS::Neutron::SecurityGroup", "sg-1", "/network/security-groups/sg-1"],
    ["OS::Octavia::LoadBalancer", "lb-1", "/load-balancers/lb-1"],
  ])("links a %s to its page", (type, id, href) => {
    expect(resourceHref(type, id)).toBe(href);
  });

  it("has no link for a type without a page, or a resource not made yet", () => {
    expect(resourceHref("OS::Heat::RandomString", "web-x")).toBeNull();
    expect(resourceHref("OS::Nova::Server", null)).toBeNull();
    expect(resourceHref("OS::Nova::Server", "")).toBeNull();
    expect(resourceHref(null, "i-1")).toBeNull();
  });
});
