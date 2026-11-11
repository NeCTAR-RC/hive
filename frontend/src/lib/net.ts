/**
 * Address checks every form that takes an IP address, a CIDR or a port
 * shares: security group rules, subnets and gateways, floating IPs, load
 * balancer members and VIPs, DNS records, share access rules. Pure, so a
 * form schema calls them in a refinement and a test can pin every case.
 *
 * The checks follow what Neutron, Octavia and Designate accept: dotted
 * IPv4 with octets 0 to 255, IPv6 as RFC 4291 text (including `::`
 * compression and an embedded IPv4 tail), a prefix of 0 to 32 or 0 to 128,
 * and ports 1 to 65535.
 */

export type IpVersion = 4 | 6;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/i;

/** The four octets of a dotted IPv4 address, or null. */
function ipv4Octets(text: string): number[] | null {
  const match = IPV4.exec(text);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

/** The eight hextets of an IPv6 address, or null when the text is not one. */
function ipv6Hextets(text: string): number[] | null {
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":");
    const last = groups[groups.length - 1] ?? "";
    const tail = ipv4Octets(last);
    if (tail) {
      // An embedded IPv4 address stands for the last two hextets.
      const [a = 0, b = 0, c = 0, d = 0] = tail;
      groups.pop();
      const head = parse(groups.join(":"));
      return head && groups.length === head.length
        ? [...head, (a << 8) | b, (c << 8) | d]
        : null;
    }
    const values = groups.map((group) =>
      HEXTET.test(group) ? parseInt(group, 16) : NaN,
    );
    return values.some(Number.isNaN) ? null : values;
  };
  const head = parse(halves[0] ?? "");
  const tail = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - tail.length;
  return missing < 1
    ? null
    : [...head, ...Array<number>(missing).fill(0), ...tail];
}

/** Whether `text` is one IPv4 or IPv6 address (no prefix, no port). */
export function isIpAddress(text: string, version?: IpVersion): boolean {
  return ipVersion(text) !== null && (!version || ipVersion(text) === version);
}

/** The IP version of an address, or null when it is not an address. */
export function ipVersion(text: string): IpVersion | null {
  if (ipv4Octets(text)) return 4;
  if (text.includes(":") && ipv6Hextets(text)) return 6;
  return null;
}

/** A parsed CIDR: the network address as a BigInt and its prefix length. */
export interface Cidr {
  version: IpVersion;
  address: string;
  prefix: number;
  /** The network's first address, as a number. */
  network: bigint;
  /** The network's last address, as a number. */
  broadcast: bigint;
}

/**
 * An address as one number with its version, for range arithmetic (a
 * pool's start before its end, a gateway inside a pool), or null when
 * `text` is not an address.
 */
export function addressValue(
  text: string,
): { version: IpVersion; value: bigint } | null {
  const octets = ipv4Octets(text);
  if (octets) {
    return {
      version: 4,
      value: octets.reduce((sum, octet) => (sum << 8n) | BigInt(octet), 0n),
    };
  }
  const hextets = text.includes(":") ? ipv6Hextets(text) : null;
  if (hextets) {
    return {
      version: 6,
      value: hextets.reduce((sum, group) => (sum << 16n) | BigInt(group), 0n),
    };
  }
  return null;
}

/**
 * `text` as a CIDR ("203.0.113.0/24", "2001:db8::/32"), or null when the
 * address or the prefix is not one. The prefix must suit the version
 * (0 to 32, 0 to 128); an address with host bits set is still accepted, as
 * Neutron accepts it, and `network` holds the masked value.
 */
export function parseCidr(text: string): Cidr | null {
  const [address, prefixText, ...rest] = text.split("/");
  if (!address || prefixText === undefined || rest.length > 0) return null;
  if (!/^\d{1,3}$/.test(prefixText)) return null;
  const parsed = addressValue(address);
  if (!parsed) return null;
  const bits = parsed.version === 4 ? 32 : 128;
  const prefix = Number(prefixText);
  if (prefix > bits) return null;
  const hostBits = BigInt(bits - prefix);
  const network = (parsed.value >> hostBits) << hostBits;
  return {
    version: parsed.version,
    address,
    prefix,
    network,
    broadcast: network | ((1n << hostBits) - 1n),
  };
}

/** Whether `text` is a CIDR, of the given version when one is asked for. */
export function isCidr(text: string, version?: IpVersion): boolean {
  const cidr = parseCidr(text);
  return cidr !== null && (!version || cidr.version === version);
}

/** Whether the address lies inside the CIDR (same version, within range). */
export function inCidr(address: string, cidr: string | Cidr): boolean {
  const range = typeof cidr === "string" ? parseCidr(cidr) : cidr;
  const parsed = addressValue(address);
  if (!range || !parsed || parsed.version !== range.version) return false;
  return parsed.value >= range.network && parsed.value <= range.broadcast;
}

/** Whether two CIDRs share any address. */
export function cidrsOverlap(a: string | Cidr, b: string | Cidr): boolean {
  const first = typeof a === "string" ? parseCidr(a) : a;
  const second = typeof b === "string" ? parseCidr(b) : b;
  if (!first || !second || first.version !== second.version) return false;
  return first.network <= second.broadcast && second.network <= first.broadcast;
}

export const PORT_MIN = 1;
export const PORT_MAX = 65535;

/** Whether `port` is a TCP or UDP port number. */
export function isPort(port: number): boolean {
  return Number.isInteger(port) && port >= PORT_MIN && port <= PORT_MAX;
}

/**
 * A port or a port range as text ("22", "8000:8080", "8000-8080"), as
 * `{ min, max }`, or null when it is neither or the range is backwards.
 */
export function parsePortRange(
  text: string,
): { min: number; max: number } | null {
  const match = /^(\d{1,5})(?:[:-](\d{1,5}))?$/.exec(text.trim());
  if (!match) return null;
  const min = Number(match[1]);
  const max = match[2] === undefined ? min : Number(match[2]);
  return isPort(min) && isPort(max) && min <= max ? { min, max } : null;
}

/**
 * Whether `text` is a host name as DNS wants it: labels of letters,
 * digits and hyphens, 1 to 63 characters, not starting or ending with a
 * hyphen, joined by dots, with an optional trailing dot; 253 characters at
 * most without the trailing dot.
 */
export function isHostName(text: string): boolean {
  return isName(text, /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i);
}

/**
 * Whether `text` is a DNS name: as `isHostName`, but a label may also
 * hold underscores, which DNS allows and service records use
 * (`_dmarc.example.org.`, `selector1._domainkey.example.org.`); only a
 * host's own name is held to the stricter host name form.
 */
export function isDnsName(text: string): boolean {
  return isName(text, /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/i);
}

/** A dotted name whose every label matches `label`, within DNS's lengths. */
function isName(text: string, label: RegExp): boolean {
  const name = text.endsWith(".") ? text.slice(0, -1) : text;
  if (name.length === 0 || name.length > 253) return false;
  return name.split(".").every((part) => label.test(part));
}
