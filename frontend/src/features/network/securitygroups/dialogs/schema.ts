// The form schemas of the Security groups panel's dialogs: a group's name
// and description, and a new rule.
import { z } from "zod";
import { parseCidr } from "../../../../lib/net";
import { maxLength } from "../../../../lib/validation";

/** The create and edit group form: a required name and a description. */
export const groupSchema = z.object({
  name: maxLength(255).min(1, "Enter a name"),
  description: maxLength(255),
});

export type GroupValues = z.infer<typeof groupSchema>;

/**
 * The protocol names Neutron accepts on a rule, as the backend checks them
 * (`hive.nectar.secgroups.NEUTRON_PROTOCOLS`); a number from 0 to 255 is
 * accepted too.
 */
const NEUTRON_PROTOCOLS: ReadonlySet<string> = new Set([
  "any",
  "ah",
  "dccp",
  "egp",
  "esp",
  "gre",
  "hopopt",
  "icmp",
  "icmpv6",
  "igmp",
  "ip",
  "ipip",
  "ipv6-encap",
  "ipv6-frag",
  "ipv6-icmp",
  "ipv6-nonxt",
  "ipv6-opts",
  "ipv6-route",
  "ospf",
  "pgm",
  "rsvp",
  "sctp",
  "tcp",
  "udp",
  "udplite",
  "vrrp",
]);

/** Whether Neutron takes `value` as a rule's protocol: a name or 0 to 255. */
export function isNeutronProtocol(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text) <= 255;
  return NEUTRON_PROTOCOLS.has(text);
}

const PORT_MESSAGE = "Enter a port from 1 to 65535";
const ICMP_MESSAGE = "Enter a number from -1 to 255";

/** An optional port, with a message that reads well under the field. */
const port = z
  .number(PORT_MESSAGE)
  .int(PORT_MESSAGE)
  .min(1, PORT_MESSAGE)
  .max(65535, PORT_MESSAGE)
  .optional();

/** An optional ICMP type or code; -1 or empty means any. */
const icmp = z
  .number(ICMP_MESSAGE)
  .int(ICMP_MESSAGE)
  .min(-1, ICMP_MESSAGE)
  .max(255, ICMP_MESSAGE)
  .optional();

/** Whether an ICMP type or code field names one value (not empty or -1). */
export function isIcmpValue(value: number | undefined): value is number {
  return value !== undefined && value >= 0;
}

/** Why `cidr` cannot be the remote of a rule of `ethertype`, or null. */
export function checkRemoteCidr(
  cidr: string,
  ethertype: "IPv4" | "IPv6",
): string | null {
  if (!cidr) return "Enter an address range such as 203.0.113.0/24";
  const range = parseCidr(cidr);
  if (!range) {
    return ethertype === "IPv6"
      ? "Enter an address range such as 2001:db8::/32"
      : "Enter an address range such as 203.0.113.0/24";
  }
  const version = ethertype === "IPv6" ? 6 : 4;
  if (range.version !== version) {
    return `This is an IPv${range.version} range; choose IPv${range.version} as the ether type`;
  }
  return null;
}

/**
 * The add rule form. `kind` is a custom TCP, UDP or ICMP rule, another
 * protocol, or the id of one of Nectar's presets; the ports, ICMP type and
 * code, and protocol fields count only for the kinds that show them. An
 * ICMP code needs a type, and another protocol is one Neutron knows. The
 * remote is a CIDR of the chosen ether type, or another security group.
 */
export const ruleSchema = z
  .object({
    kind: z.string().min(1, "Choose a rule"),
    direction: z.enum(["ingress", "egress"]),
    ethertype: z.enum(["IPv4", "IPv6"]),
    port_mode: z.enum(["all", "port", "range"]),
    port,
    port_from: port,
    port_to: port,
    icmp_type: icmp,
    icmp_code: icmp,
    protocol: maxLength(32),
    remote: z.enum(["cidr", "group"]),
    cidr: z.string().trim(),
    remote_group_id: z.string(),
    description: maxLength(255),
  })
  .superRefine((value, ctx) => {
    const custom = value.kind === "custom_tcp" || value.kind === "custom_udp";
    if (custom && value.port_mode === "port" && value.port === undefined) {
      ctx.addIssue({ code: "custom", path: ["port"], message: "Enter a port" });
    }
    if (custom && value.port_mode === "range") {
      if (value.port_from === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["port_from"],
          message: "Enter the first port",
        });
      }
      if (value.port_to === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["port_to"],
          message: "Enter the last port",
        });
      }
      if (
        value.port_from !== undefined &&
        value.port_to !== undefined &&
        value.port_from > value.port_to
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["port_to"],
          message: "Must not be lower than the first port",
        });
      }
    }
    if (
      value.kind === "custom_icmp" &&
      isIcmpValue(value.icmp_code) &&
      !isIcmpValue(value.icmp_type)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["icmp_type"],
        message: "Enter an ICMP type to set a code",
      });
    }
    if (value.kind === "other") {
      if (!value.protocol) {
        ctx.addIssue({
          code: "custom",
          path: ["protocol"],
          message: "Enter a protocol name or number",
        });
      } else if (!isNeutronProtocol(value.protocol)) {
        ctx.addIssue({
          code: "custom",
          path: ["protocol"],
          message:
            "Enter a protocol name such as gre, or a number from 0 to 255",
        });
      }
    }
    if (value.remote === "cidr") {
      const problem = checkRemoteCidr(value.cidr, value.ethertype);
      if (problem) {
        ctx.addIssue({ code: "custom", path: ["cidr"], message: problem });
      }
    } else if (!value.remote_group_id) {
      ctx.addIssue({
        code: "custom",
        path: ["remote_group_id"],
        message: "Choose a security group",
      });
    }
  });

export type RuleForm = z.infer<typeof ruleSchema>;
