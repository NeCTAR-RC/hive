import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  addressProblem,
  listEntries,
  isHttpMonitor,
  memberFields,
  enteredPort,
  listenerFields,
  monitorFields,
  poolFields,
  refineListener,
  refineMonitor,
  refineMember,
  refinePool,
} from "./schemas";

/** The issues a schema raises, as "path: message" lines. */
function issues(schema: z.ZodType, values: unknown): string[] {
  const result = schema.safeParse(values);
  return result.success
    ? []
    : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

const listener = z.object(listenerFields).superRefine(refineListener);
const LISTENER = {
  name: "",
  protocol: "HTTP",
  protocol_port: 80,
  connection_limit: -1,
  allowed_cidrs: "",
  xff: false,
  xfp: false,
  xfproto: false,
  tls_ref: "",
};

describe("listener rules", () => {
  it.each<[string, Partial<typeof LISTENER>, string[]]>([
    ["a plain HTTP listener", {}, []],
    [
      "a terminated HTTPS listener with its certificate",
      { protocol: "TERMINATED_HTTPS", tls_ref: "https://barbican/c/1" },
      [],
    ],
    [
      "a terminated HTTPS listener without one",
      { protocol: "TERMINATED_HTTPS" },
      ["tls_ref: Enter the certificate reference"],
    ],
    ["no protocol", { protocol: "" }, ["protocol: Choose a protocol"]],
    [
      "CIDRs one per line or space",
      { allowed_cidrs: "10.0.0.0/8\n192.168.1.0/24 2001:db8::/32" },
      [],
    ],
    [
      "a source that is not a CIDR, named",
      { allowed_cidrs: "10.0.0.0/8 nonsense" },
      ['allowed_cidrs: "nonsense" is not a CIDR'],
    ],
  ])("%s", (_, patch, expected) => {
    expect(issues(listener, { ...LISTENER, ...patch })).toStrictEqual(expected);
  });

  it.each([0, 65536])("refuses port %i", (port) => {
    expect(
      issues(listener, { ...LISTENER, protocol_port: port }),
    ).toStrictEqual(["protocol_port: Ports run from 1 to 65535"]);
  });

  it.each([null, undefined])("asks for a port left empty (%s)", (empty) => {
    expect(
      issues(listener, { ...LISTENER, protocol_port: empty }),
    ).toStrictEqual(["protocol_port: Enter a port"]);
  });

  it("hands a typed port to the request, and refuses an empty one", () => {
    expect(enteredPort(8080)).toBe(8080);
    expect(() => enteredPort(null)).toThrow();
    expect(() => enteredPort(undefined)).toThrow();
  });

  it("checks only the sources when the protocol is fixed (editing)", () => {
    const edit = z
      .object({ allowed_cidrs: listenerFields.allowed_cidrs })
      .superRefine(refineListener);
    expect(issues(edit, { allowed_cidrs: "" })).toStrictEqual([]);
    expect(issues(edit, { allowed_cidrs: "10.0.0.1" })).toStrictEqual([
      'allowed_cidrs: "10.0.0.1" is not a CIDR',
    ]);
  });

  it("splits the sources on any whitespace", () => {
    expect(listEntries(" 10.0.0.0/8\n\n10.1.0.0/16 ")).toStrictEqual([
      "10.0.0.0/8",
      "10.1.0.0/16",
    ]);
  });
});

const pool = z.object(poolFields).superRefine(refinePool);
const POOL = {
  name: "",
  lb_algorithm: "ROUND_ROBIN",
  persistence: "",
  cookie_name: "",
};

describe("pool rules", () => {
  it.each<[string, Partial<typeof POOL>, string[]]>([
    ["a round robin pool", {}, []],
    [
      "no algorithm",
      { lb_algorithm: "" },
      ["lb_algorithm: Choose an algorithm"],
    ],
    [
      "application cookie persistence with its cookie",
      { persistence: "APP_COOKIE", cookie_name: "session" },
      [],
    ],
    [
      "application cookie persistence without one",
      { persistence: "APP_COOKIE" },
      ["cookie_name: Enter the cookie name"],
    ],
    [
      "HTTP cookie persistence, which names none",
      { persistence: "HTTP_COOKIE" },
      [],
    ],
  ])("%s", (_, patch, expected) => {
    expect(issues(pool, { ...POOL, ...patch })).toStrictEqual(expected);
  });
});

const monitor = z.object(monitorFields).superRefine(refineMonitor);
const MONITOR = {
  type: "HTTP",
  delay: 5,
  timeout: 5,
  max_retries: 3,
  max_retries_down: 3,
  http_method: "GET",
  url_path: "/",
  expected_codes: "200",
};

describe("monitor rules", () => {
  it.each<[string, Partial<typeof MONITOR>, string[]]>([
    ["an HTTP monitor", {}, []],
    ["no type", { type: "" }, ["type: Choose a monitor type"]],
    [
      "a delay shorter than the timeout",
      { delay: 4, timeout: 5 },
      ["delay: The delay must be at least the timeout"],
    ],
    ["a range of codes", { expected_codes: "200-204" }, []],
    ["a list of codes", { expected_codes: "200,301" }, []],
    [
      "blank codes and path (Octavia's defaults)",
      { expected_codes: "", url_path: "" },
      [],
    ],
    [
      "codes that are not a code, range or list",
      { expected_codes: "ok" },
      ["expected_codes: A code, a range (200-204) or a list (200,301)"],
    ],
    [
      "a path without a slash",
      { url_path: "health" },
      ["url_path: The path must start with a slash"],
    ],
    [
      "a ping monitor, which has no codes or path",
      { type: "PING", expected_codes: "ok", url_path: "health" },
      [],
    ],
  ])("%s", (_, patch, expected) => {
    expect(issues(monitor, { ...MONITOR, ...patch })).toStrictEqual(expected);
  });

  it.each([11, 0])("refuses %i retries", (retries) => {
    expect(issues(monitor, { ...MONITOR, max_retries: retries })).toHaveLength(
      1,
    );
  });

  it("knows which types probe over HTTP", () => {
    expect(["HTTP", "HTTPS", "TCP"].map(isHttpMonitor)).toStrictEqual([
      true,
      true,
      false,
    ]);
  });
});

const SUBNETS = [
  { id: "subnet-1", name: "private", cidr: "192.168.1.0/24" },
  { id: "subnet-6", name: null, cidr: "2001:db8::/64" },
  { id: "subnet-x", name: "unknown", cidr: null },
];

describe("address rule", () => {
  it.each<[string, string, string, string | null]>([
    ["an address on the subnet", "192.168.1.20", "subnet-1", null],
    ["an IPv6 address on its subnet", "2001:db8::5", "subnet-6", null],
    ["any address without a subnet", "10.9.9.9", "", null],
    ["any address on a subnet of unknown range", "10.9.9.9", "subnet-x", null],
    ["octets past 255", "999.1.1.1", "", "Enter a valid IP address"],
    ["text", "not-an-ip", "subnet-1", "Enter a valid IP address"],
    [
      "an address off the subnet",
      "10.9.9.9",
      "subnet-1",
      "Use an address on the subnet private (192.168.1.0/24)",
    ],
    [
      "an IPv4 address on an IPv6 subnet",
      "192.168.1.20",
      "subnet-6",
      "Use an address on the subnet subnet-6 (2001:db8::/64)",
    ],
  ])("judges %s", (_, address, subnetId, expected) => {
    expect(addressProblem(address, subnetId, SUBNETS)).toBe(expected);
  });

  it("reports under the member's address, and asks for one when empty", () => {
    const member = z
      .object(memberFields)
      .superRefine((v, ctx) => refineMember(v, SUBNETS, ctx, ["members", 0]));
    const values = {
      name: "",
      address: "10.9.9.9",
      subnet_id: "subnet-1",
      protocol_port: 80,
      weight: 1,
      backup: false,
    };
    expect(issues(member, values)).toStrictEqual([
      "members.0.address: Use an address on the subnet private (192.168.1.0/24)",
    ]);
    expect(issues(member, { ...values, address: "" })).toStrictEqual([
      "address: Enter an IP address",
    ]);
  });
});

describe("the wizard's composition", () => {
  const wizard = z
    .object({
      create_listener: z.boolean(),
      listener: z.object(listenerFields),
      create_pool: z.boolean(),
      pool: z.object(poolFields),
      create_monitor: z.boolean(),
      monitor: z.object(monitorFields),
    })
    .superRefine((v, ctx) => {
      if (v.create_listener) refineListener(v.listener, ctx, ["listener"]);
      if (v.create_pool) refinePool(v.pool, ctx, ["pool"]);
      if (v.create_monitor) refineMonitor(v.monitor, ctx, ["monitor"]);
    });
  const broken = {
    listener: { ...LISTENER, protocol: "TERMINATED_HTTPS" },
    pool: { ...POOL, persistence: "APP_COOKIE" },
    monitor: { ...MONITOR, delay: 1 },
  };

  it("reports each part's rules under the part", () => {
    expect(
      issues(wizard, {
        ...broken,
        create_listener: true,
        create_pool: true,
        create_monitor: true,
      }),
    ).toStrictEqual([
      "listener.tls_ref: Enter the certificate reference",
      "pool.cookie_name: Enter the cookie name",
      "monitor.delay: The delay must be at least the timeout",
    ]);
  });

  it("skips the rules of a part that is switched off", () => {
    expect(
      issues(wizard, {
        ...broken,
        create_listener: false,
        create_pool: false,
        create_monitor: false,
      }),
    ).toStrictEqual([]);
  });
});
