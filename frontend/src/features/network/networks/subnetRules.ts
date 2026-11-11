// Client-side checks and conversions for the subnet forms, mirroring
// Horizon's CreateSubnetInfoAction and CreateSubnetDetailAction (the
// address and gateway must parse and share an IP version) plus the range
// checks Neutron would otherwise refuse the request on: the gateway inside
// the subnet, the pools inside it, apart and clear of the gateway. The
// one-entry-per-line text areas become allocation pools, name servers and
// host routes. The backend repeats the checks before calling Neutron.
import type { z } from "zod";
import type {
  AllocationPool,
  HostRoute,
  SubnetDetail,
  SubnetFields,
} from "../../../lib/api/types/network";
import {
  addressValue,
  inCidr,
  ipVersion,
  parseCidr,
  type Cidr,
  type IpVersion,
} from "../../../lib/net";

/** An address read for range arithmetic (`addressValue`). */
type IpAddress = NonNullable<ReturnType<typeof addressValue>>;

/**
 * Horizon's IPv6 address configuration menu (subnets/utils.py
 * IPV6_MODE_CHOICES): each choice sets the router advertisement and the
 * address mode, null for "none".
 */
export const IPV6_MODES = [
  {
    id: "none/none",
    label: "No options specified (default)",
    ra: null,
    address: null,
  },
  {
    id: "slaac/slaac",
    label: "SLAAC: address discovered from an OpenStack router",
    ra: "slaac",
    address: "slaac",
  },
  {
    id: "none/slaac",
    label: "SLAAC: address discovered from an external router",
    ra: null,
    address: "slaac",
  },
  {
    id: "dhcpv6-stateful/dhcpv6-stateful",
    label: "DHCPv6 stateful: address discovered from OpenStack DHCP",
    ra: "dhcpv6-stateful",
    address: "dhcpv6-stateful",
  },
  {
    id: "dhcpv6-stateless/dhcpv6-stateless",
    label:
      "DHCPv6 stateless: address discovered from an OpenStack router and additional information from OpenStack DHCP",
    ra: "dhcpv6-stateless",
    address: "dhcpv6-stateless",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  ra: SubnetFields["ipv6_ra_mode"];
  address: SubnetFields["ipv6_address_mode"];
}[];

export type Ipv6ModeId = (typeof IPV6_MODES)[number]["id"];

/** The non-blank lines of a text area, trimmed. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** One allocation pool with its addresses read. */
interface ReadPool {
  start: IpAddress;
  end: IpAddress;
  text: AllocationPool;
}

/** "start,end" lines as pools, stopping at the first bad line. */
function readPools(text: string): { pools: ReadPool[]; error?: string } {
  const pools: ReadPool[] = [];
  for (const line of parseLines(text)) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        pools,
        error: `Write "${line}" as a start and an end address, such as 10.0.0.10,10.0.0.20`,
      };
    }
    const [startText, endText] = parts as [string, string];
    const start = addressValue(startText);
    const end = addressValue(endText);
    if (!start || !end) {
      return {
        pools,
        error: `${start ? endText : startText} is not an IP address`,
      };
    }
    if (start.version !== end.version || start.value > end.value) {
      return {
        pools,
        error: `The pool start ${startText} is after its end ${endText}`,
      };
    }
    pools.push({ start, end, text: { start: startText, end: endText } });
  }
  return { pools };
}

/** "start,end" lines as allocation pools, stopping at the first bad line. */
export function parsePools(text: string): {
  pools: AllocationPool[];
  error?: string;
} {
  const { pools, error } = readPools(text);
  const result = pools.map((pool) => pool.text);
  return error ? { pools: result, error } : { pools: result };
}

/** One name server address per line; the error names the first bad one. */
export function parseNameservers(text: string): {
  servers: string[];
  error?: string;
} {
  const servers = parseLines(text);
  const bad = servers.find((s) => !ipVersion(s));
  if (bad) return { servers, error: `${bad} is not an IP address` };
  return { servers };
}

/**
 * "destination,nexthop" lines as host routes, stopping at the first bad
 * line; with `version`, both sides must be of the subnet's IP version.
 */
export function parseRoutes(
  text: string,
  version?: IpVersion,
): {
  routes: HostRoute[];
  error?: string;
} {
  const routes: HostRoute[] = [];
  for (const line of parseLines(text)) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        routes,
        error: `Write "${line}" as a destination and a next hop, such as 192.168.200.0/24,10.56.1.254`,
      };
    }
    const [destination, nexthop] = parts as [string, string];
    const range = parseCidr(destination);
    if (!range) {
      return {
        routes,
        error: `${destination} is not an address range such as 192.168.200.0/24`,
      };
    }
    const hop = ipVersion(nexthop);
    if (!hop) {
      return { routes, error: `${nexthop} is not an IP address` };
    }
    if (version && (range.version !== version || hop !== version)) {
      return { routes, error: `The route "${line}" is not IPv${version}` };
    }
    routes.push({ destination, nexthop });
  }
  return { routes };
}

/** The form's view of a subnet: text areas hold one entry per line. */
export interface SubnetFormValues {
  name: string;
  address_source: "manual" | "pool";
  subnetpool_id: string;
  prefixlen: string;
  cidr: string;
  ip_version: "4" | "6";
  ipv6_modes: Ipv6ModeId;
  gateway_ip: string;
  no_gateway: boolean;
  enable_dhcp: boolean;
  allocation_pools: string;
  dns_nameservers: string;
  host_routes: string;
}

/** A new subnet's form, with the cloud's default name servers filled in. */
export function emptySubnetForm(defaultDns: string[]): SubnetFormValues {
  return {
    name: "",
    address_source: "manual",
    subnetpool_id: "",
    prefixlen: "",
    cidr: "",
    ip_version: "4",
    ipv6_modes: "none/none",
    gateway_ip: "",
    no_gateway: false,
    enable_dhcp: true,
    allocation_pools: "",
    dns_nameservers: defaultDns.join("\n"),
    host_routes: "",
  };
}

/** An existing subnet as the edit form shows it. */
export function subnetFormFromDetail(subnet: SubnetDetail): SubnetFormValues {
  const modes = IPV6_MODES.find(
    (mode) =>
      mode.ra === subnet.ipv6_ra_mode &&
      mode.address === subnet.ipv6_address_mode,
  );
  return {
    name: subnet.name ?? "",
    address_source: "manual",
    subnetpool_id: "",
    prefixlen: "",
    cidr: subnet.cidr ?? "",
    ip_version: subnet.ip_version === 6 ? "6" : "4",
    ipv6_modes: modes?.id ?? "none/none",
    gateway_ip: subnet.gateway_ip ?? "",
    no_gateway: subnet.gateway_ip === null,
    enable_dhcp: subnet.enable_dhcp ?? true,
    allocation_pools: subnet.allocation_pools
      .map((p) => `${p.start},${p.end}`)
      .join("\n"),
    dns_nameservers: subnet.dns_nameservers.join("\n"),
    host_routes: subnet.host_routes
      .map((r) => `${r.destination},${r.nexthop}`)
      .join("\n"),
  };
}

export interface SubnetCheckOptions {
  isCreate: boolean;
  enableIpv6: boolean;
  /**
   * The stored subnet's form on an edit. Its gateway and pools are checked
   * against the range only when the edit changes one of them, so a rename
   * never trips over a subnet made by other rules.
   */
  previous?: SubnetFormValues | undefined;
}

type SubnetErrors = Partial<Record<keyof SubnetFormValues, string>>;

/** Field-level problems with the form, keyed by field name. */
export function checkSubnetForm(
  values: SubnetFormValues,
  options: SubnetCheckOptions,
): SubnetErrors {
  const errors: SubnetErrors = {};
  const version: IpVersion = values.ip_version === "6" ? 6 : 4;
  let range: Cidr | null = null;
  if (options.isCreate) {
    if (values.address_source === "pool") {
      if (!values.subnetpool_id)
        errors.subnetpool_id = "Choose an address pool";
      const prefixlen = prefixLengthProblem(values.prefixlen, version);
      if (prefixlen) errors.prefixlen = prefixlen;
    } else {
      const address = checkAddress(values.cidr, version, options.enableIpv6);
      if (typeof address === "string") errors.cidr = address;
      else range = address;
    }
  } else {
    range = parseCidr(values.cidr.trim());
  }
  let gateway: IpAddress | null = null;
  if (!values.no_gateway && values.gateway_ip.trim()) {
    gateway = addressValue(values.gateway_ip.trim());
    if (!gateway) errors.gateway_ip = "Enter an IP address";
    else if (gateway.version !== version) {
      errors.gateway_ip = "The gateway IP and IP version are inconsistent";
    }
  }
  const pools = readPools(values.allocation_pools);
  if (pools.error) errors.allocation_pools = pools.error;
  const previous = options.previous;
  const rangesChanged =
    options.isCreate ||
    !previous ||
    previous.gateway_ip !== values.gateway_ip ||
    previous.no_gateway !== values.no_gateway ||
    previous.allocation_pools !== values.allocation_pools;
  if (range && rangesChanged && !errors.gateway_ip) {
    // Pools that do not parse are reported as such; the gateway is still
    // checked against the range.
    const ranges = checkRanges(
      values.cidr.trim(),
      range,
      pools.error ? [] : pools.pools,
      {
        given: gateway,
        givenText: values.gateway_ip.trim(),
        // A create without a gateway gets Neutron's first address.
        implied:
          options.isCreate && !values.no_gateway && !gateway
            ? { version: range.version, value: range.network + 1n }
            : null,
      },
    );
    Object.assign(errors, ranges);
  }
  const dns = parseNameservers(values.dns_nameservers);
  if (dns.error) errors.dns_nameservers = dns.error;
  const routes = parseRoutes(values.host_routes, version);
  if (routes.error) errors.host_routes = routes.error;
  return errors;
}

/**
 * The prefix length typed for a subnet from a pool, as a number: undefined
 * when blank (the pool's default) or not a whole number.
 */
export function prefixLength(text: string): number | undefined {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/**
 * Why the typed prefix length cannot be used, or null: blank takes the
 * pool's default, otherwise it is a whole number from 1 to 32 (IPv4) or
 * 128 (IPv6).
 */
export function prefixLengthProblem(
  text: string,
  version: IpVersion,
): string | null {
  if (!text.trim()) return null;
  const max = version === 4 ? 32 : 128;
  const value = prefixLength(text);
  return value === undefined || value < 1 || value > max
    ? `Enter a prefix length from 1 to ${max}`
    : null;
}

/** The typed network address as a range, or why it cannot be one. */
function checkAddress(
  text: string,
  version: IpVersion,
  enableIpv6: boolean,
): Cidr | string {
  if (!text.trim()) return "Specify a network address";
  const range = parseCidr(text.trim());
  if (!range)
    return "Enter a network address in CIDR form, such as 192.168.0.0/24";
  if (range.version !== version) {
    return "The network address and IP version are inconsistent";
  }
  if (range.prefix === (range.version === 4 ? 32 : 128)) {
    return `The subnet in the network address is too small (/${range.prefix})`;
  }
  if (!enableIpv6 && range.version === 6)
    return "IPv6 subnets are not available";
  return range;
}

/**
 * The gateway and pools against the subnet's `range` (`written` as the
 * user typed it), as Neutron checks them: a given gateway inside the range
 * and not its network or broadcast address (IPv4 larger than a /31), every
 * pool inside the range, no two pools overlapping, and no pool holding the
 * gateway (`implied` is the gateway Neutron picks when none is given).
 */
function checkRanges(
  written: string,
  range: Cidr,
  pools: ReadPool[],
  gateways: {
    given: IpAddress | null;
    givenText: string;
    implied: IpAddress | null;
  },
): SubnetErrors {
  const errors: SubnetErrors = {};
  const { given, implied } = gateways;
  if (given) {
    if (!inCidr(gateways.givenText, range)) {
      errors.gateway_ip = `The gateway must be inside ${written}`;
    } else if (
      range.version === 4 &&
      range.prefix < 31 &&
      (given.value === range.network || given.value === range.broadcast)
    ) {
      errors.gateway_ip =
        "The gateway cannot be the network or broadcast address";
    }
  }
  const poolName = (pool: ReadPool) => `${pool.text.start}-${pool.text.end}`;
  const outside = pools.find(
    (pool) => !inCidr(pool.text.start, range) || !inCidr(pool.text.end, range),
  );
  if (outside) {
    errors.allocation_pools = `The pool ${poolName(outside)} is outside ${written}`;
    return errors;
  }
  const ordered = [...pools].sort((a, b) =>
    a.start.value < b.start.value ? -1 : a.start.value > b.start.value ? 1 : 0,
  );
  for (const [index, pool] of ordered.entries()) {
    const next = ordered[index + 1];
    if (next && next.start.value <= pool.end.value) {
      errors.allocation_pools = `The pools ${poolName(pool)} and ${poolName(next)} overlap`;
      return errors;
    }
  }
  const gateway = errors.gateway_ip ? null : (given ?? implied);
  const holder =
    gateway &&
    pools.find(
      (pool) =>
        gateway.value >= pool.start.value && gateway.value <= pool.end.value,
    );
  if (gateway && holder) {
    errors.allocation_pools = given
      ? `The pool ${poolName(holder)} holds the gateway ${gateways.givenText}`
      : `The pool ${poolName(holder)} holds the default gateway, the network's first address; start the pool after it or set another gateway`;
  }
  return errors;
}

/**
 * Reports `checkSubnetForm`'s problems as issues of the zod refinement
 * `ctx`, each under `prefix` (["subnet"] where the subnet fields sit
 * inside a larger form).
 */
export function addSubnetIssues(
  values: SubnetFormValues,
  ctx: z.RefinementCtx,
  options: SubnetCheckOptions,
  prefix: string[] = [],
) {
  for (const [field, message] of Object.entries(
    checkSubnetForm(values, options),
  )) {
    ctx.addIssue({ code: "custom", path: [...prefix, field], message });
  }
}

/** The request body for a create (every field) or an edit (what changed). */
export function subnetFieldsFromForm(
  values: SubnetFormValues,
  previous?: SubnetFormValues,
): SubnetFields {
  const fields: SubnetFields = {};
  const changed = (key: keyof SubnetFormValues) =>
    !previous || previous[key] !== values[key];
  if (changed("name")) fields.name = values.name.trim();
  if (!previous) {
    if (values.address_source === "pool") {
      fields.subnetpool_id = values.subnetpool_id;
      const prefixlen = prefixLength(values.prefixlen);
      if (prefixlen !== undefined) fields.prefixlen = prefixlen;
    } else {
      fields.cidr = values.cidr.trim();
    }
    fields.ip_version = values.ip_version === "6" ? 6 : 4;
    const modes = IPV6_MODES.find((mode) => mode.id === values.ipv6_modes);
    if (fields.ip_version === 6 && modes) {
      if (modes.ra) fields.ipv6_ra_mode = modes.ra;
      if (modes.address) fields.ipv6_address_mode = modes.address;
    }
  }
  if (changed("no_gateway") || changed("gateway_ip")) {
    if (values.no_gateway) fields.no_gateway = true;
    else if (values.gateway_ip.trim())
      fields.gateway_ip = values.gateway_ip.trim();
    else if (previous) fields.no_gateway = false;
  }
  if (changed("enable_dhcp")) fields.enable_dhcp = values.enable_dhcp;
  if (changed("allocation_pools")) {
    fields.allocation_pools = parsePools(values.allocation_pools).pools;
  }
  if (changed("dns_nameservers")) {
    fields.dns_nameservers = parseNameservers(values.dns_nameservers).servers;
  }
  if (changed("host_routes")) {
    fields.host_routes = parseRoutes(values.host_routes).routes;
  }
  return fields;
}
