// Client-side checks and conversions for the subnet forms, mirroring
// Horizon's CreateSubnetInfoAction and CreateSubnetDetailAction: the
// address and gateway must parse and share an IP version, and the
// one-entry-per-line text areas become allocation pools, name servers and
// host routes. The backend repeats the checks before calling neutron.
import type {
  AllocationPool,
  HostRoute,
  SubnetDetail,
  SubnetFields,
} from "../../../lib/api/types";

export type IpVersion = 4 | 6;

export function parseIp(value: string): IpVersion | null {
  const text = value.trim();
  if (
    /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(
      text,
    )
  ) {
    return 4;
  }
  if (!text.includes(":") || !/^[0-9a-f:.]+$/i.test(text)) return null;
  if (text.includes(":::")) return null;
  const doubles = text.split("::").length - 1;
  if (doubles > 1) return null;
  const groups = text.split(":").filter((g) => g !== "");
  if (groups.some((g) => g.length > 4 && !g.includes("."))) return null;
  if (doubles === 0 && groups.length !== 8) return null;
  if (doubles === 1 && groups.length > 7) return null;
  return 6;
}

export function parseCidr(
  value: string,
): { version: IpVersion; prefix: number } | null {
  const [address, prefixText, ...rest] = value.trim().split("/");
  if (!address || prefixText === undefined || rest.length > 0) return null;
  if (!/^\d+$/.test(prefixText)) return null;
  const version = parseIp(address);
  if (!version) return null;
  const prefix = Number(prefixText);
  const max = version === 4 ? 32 : 128;
  if (prefix < 0 || prefix > max) return null;
  return { version, prefix };
}

export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parsePools(text: string): {
  pools: AllocationPool[];
  error?: string;
} {
  const pools: AllocationPool[] = [];
  for (const line of parseLines(text)) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        pools,
        error: `Start and end addresses must be specified (value=${line})`,
      };
    }
    const [start, end] = parts as [string, string];
    if (!parseIp(start) || !parseIp(end)) {
      return { pools, error: `Invalid IP address in allocation pool ${line}` };
    }
    pools.push({ start, end });
  }
  return { pools };
}

export function parseNameservers(text: string): {
  servers: string[];
  error?: string;
} {
  const servers = parseLines(text);
  const bad = servers.find((s) => !parseIp(s));
  if (bad) return { servers, error: `Invalid IP address (value=${bad})` };
  return { servers };
}

export function parseRoutes(text: string): {
  routes: HostRoute[];
  error?: string;
} {
  const routes: HostRoute[] = [];
  for (const line of parseLines(text)) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return {
        routes,
        error: `Destination CIDR and next hop must be specified (value=${line})`,
      };
    }
    const [destination, nexthop] = parts as [string, string];
    if (!parseCidr(destination)) {
      return {
        routes,
        error: `Invalid destination CIDR (value=${destination})`,
      };
    }
    if (!parseIp(nexthop)) {
      return { routes, error: `Invalid next hop address (value=${nexthop})` };
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
  gateway_ip: string;
  no_gateway: boolean;
  enable_dhcp: boolean;
  allocation_pools: string;
  dns_nameservers: string;
  host_routes: string;
}

export function emptySubnetForm(defaultDns: string[]): SubnetFormValues {
  return {
    name: "",
    address_source: "manual",
    subnetpool_id: "",
    prefixlen: "",
    cidr: "",
    ip_version: "4",
    gateway_ip: "",
    no_gateway: false,
    enable_dhcp: true,
    allocation_pools: "",
    dns_nameservers: defaultDns.join("\n"),
    host_routes: "",
  };
}

export function subnetFormFromDetail(subnet: SubnetDetail): SubnetFormValues {
  return {
    name: subnet.name ?? "",
    address_source: "manual",
    subnetpool_id: "",
    prefixlen: "",
    cidr: subnet.cidr ?? "",
    ip_version: subnet.ip_version === 6 ? "6" : "4",
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

/** Field-level problems with the form, keyed by field name. */
export function checkSubnetForm(
  values: SubnetFormValues,
  options: { isCreate: boolean; enableIpv6: boolean },
): Partial<Record<keyof SubnetFormValues, string>> {
  const errors: Partial<Record<keyof SubnetFormValues, string>> = {};
  const version: IpVersion = values.ip_version === "6" ? 6 : 4;
  if (options.isCreate) {
    if (values.address_source === "pool") {
      if (!values.subnetpool_id)
        errors.subnetpool_id = "Choose an address pool";
      const prefixlen = values.prefixlen.trim();
      const max = version === 4 ? 32 : 128;
      if (
        prefixlen &&
        (!/^\d+$/.test(prefixlen) ||
          Number(prefixlen) < 1 ||
          Number(prefixlen) > max)
      ) {
        errors.prefixlen = `Enter a prefix length from 1 to ${max}`;
      }
    } else if (!values.cidr.trim()) {
      errors.cidr = "Specify a network address";
    } else {
      const cidr = parseCidr(values.cidr);
      if (!cidr) {
        errors.cidr =
          "Enter a network address in CIDR form, such as 192.168.0.0/24";
      } else if (cidr.version !== version) {
        errors.cidr = "The network address and IP version are inconsistent";
      } else if (cidr.prefix === (cidr.version === 4 ? 32 : 128)) {
        errors.cidr = `The subnet in the network address is too small (/${cidr.prefix})`;
      } else if (!options.enableIpv6 && cidr.version === 6) {
        errors.cidr = "IPv6 subnets are not available";
      }
    }
  }
  if (!values.no_gateway && values.gateway_ip.trim()) {
    const gateway = parseIp(values.gateway_ip);
    if (!gateway) errors.gateway_ip = "Enter an IP address";
    else if (gateway !== version) {
      errors.gateway_ip = "The gateway IP and IP version are inconsistent";
    }
  }
  const pools = parsePools(values.allocation_pools);
  if (pools.error) errors.allocation_pools = pools.error;
  const dns = parseNameservers(values.dns_nameservers);
  if (dns.error) errors.dns_nameservers = dns.error;
  const routes = parseRoutes(values.host_routes);
  if (routes.error) errors.host_routes = routes.error;
  return errors;
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
      const prefixlen = values.prefixlen.trim();
      if (/^\d+$/.test(prefixlen)) fields.prefixlen = Number(prefixlen);
    } else {
      fields.cidr = values.cidr.trim();
    }
    fields.ip_version = values.ip_version === "6" ? 6 : 4;
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
