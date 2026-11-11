import { describe, expect, it } from "vitest";
import {
  CREATE_DEFAULTS,
  createFormSchema,
  protocolLinks,
  type CreateForm,
} from "./createForm";

const SUBNETS = [{ id: "subnet-1", name: "private", cidr: "192.168.1.0/24" }];

/** The wizard's issues for the defaults with `changes`, as "path: message". */
function issues(changes: Partial<CreateForm>): string[] {
  const result = createFormSchema(SUBNETS).safeParse({
    ...CREATE_DEFAULTS,
    vip_subnet_id: "subnet-1",
    ...changes,
  });
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

const MEMBER = {
  name: "",
  address: "10.9.9.9",
  subnet_id: "subnet-1",
  protocol_port: 80,
  weight: 1,
  backup: false,
};

describe("the create wizard's schema", () => {
  it("takes a VIP address on the chosen subnet, or none", () => {
    expect(issues({})).toStrictEqual([]);
    expect(issues({ vip_address: "192.168.1.9" })).toStrictEqual([]);
    expect(issues({ vip_address: "10.9.9.9" })).toStrictEqual([
      "vip_address: Use an address on the subnet private (192.168.1.0/24)",
    ]);
    expect(issues({ vip_address: "192.168.1.300" })).toStrictEqual([
      "vip_address: Enter a valid IP address",
    ]);
  });

  it("checks each member address while the pool is on", () => {
    expect(issues({ members: [MEMBER] })).toStrictEqual([
      "members.0.address: Use an address on the subnet private (192.168.1.0/24)",
    ]);
    expect(
      issues({
        create_listener: false,
        create_pool: false,
        members: [MEMBER],
      }),
    ).toStrictEqual([]);
  });
});

describe("protocolLinks", () => {
  const types = ["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"];

  it("moves the ports to the new protocol's defaults", () => {
    expect(protocolLinks("TERMINATED_HTTPS", "", types)).toEqual({
      listenerPort: 443,
      memberPort: 80,
      persistence: "",
    });
  });

  it("empties the ports of a protocol without defaults", () => {
    expect(protocolLinks("TCP", "HTTP_COOKIE", types)).toEqual({
      listenerPort: undefined,
      memberPort: undefined,
      persistence: "HTTP_COOKIE",
    });
  });

  it("drops a persistence type the new pool cannot use", () => {
    expect(protocolLinks("UDP", "HTTP_COOKIE", types).persistence).toBe("");
    expect(protocolLinks("UDP", "SOURCE_IP", types).persistence).toBe(
      "SOURCE_IP",
    );
  });
});
