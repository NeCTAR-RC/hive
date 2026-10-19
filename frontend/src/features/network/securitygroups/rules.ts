// Security group rule helpers: the port column text, and the add-rule
// form's schema and request mapping, after Horizon's
// security_groups/forms.py AddRule (the ethertype follows the CIDR,
// ICMP on IPv6 is ipv6-icmp) and api/neutron.py:539-542 (a blank ICMP
// code is left out rather than sent as -1).
import { z } from "zod";
import type { RuleCreate, SecurityGroupRule } from "../../../lib/api/types";
import { parseCidr } from "../networks/subnetRules";

/** "80", "8000 - 9000", "type 8, code any" or "Any" for a rule. */
export function portRange(rule: SecurityGroupRule): string {
  const protocol = (rule.protocol ?? "").toLowerCase();
  if (
    protocol === "icmp" ||
    protocol === "ipv6-icmp" ||
    protocol === "icmpv6"
  ) {
    if (rule.port_range_min === null || rule.port_range_min < 0) return "Any";
    const code =
      rule.port_range_max === null || rule.port_range_max < 0
        ? "any"
        : rule.port_range_max;
    return `type ${rule.port_range_min}, code ${code}`;
  }
  if (rule.port_range_min === null && rule.port_range_max === null)
    return "Any";
  if (rule.port_range_min === rule.port_range_max)
    return String(rule.port_range_min);
  return `${rule.port_range_min ?? "any"} - ${rule.port_range_max ?? "any"}`;
}

/** The protocol names neutron accepts on a rule (the backend's
 * nectar/secgroups.py NEUTRON_PROTOCOLS); a number 0-255 is accepted too. */
export const NEUTRON_PROTOCOLS = new Set([
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

export function isNeutronProtocol(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text) <= 255;
  return NEUTRON_PROTOCOLS.has(text);
}

const PORT_MESSAGE = "Enter a port from 1 to 65535";
const ICMP_MESSAGE = "Enter a number from -1 to 255";

const port = z
  .number(PORT_MESSAGE)
  .int(PORT_MESSAGE)
  .min(1, PORT_MESSAGE)
  .max(65535, PORT_MESSAGE)
  .optional();
const icmp = z
  .number(ICMP_MESSAGE)
  .int(ICMP_MESSAGE)
  .min(-1, ICMP_MESSAGE)
  .max(255, ICMP_MESSAGE)
  .optional();

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
    protocol: z.string().trim().max(32, "At most 32 characters"),
    remote: z.enum(["cidr", "group"]),
    cidr: z.string().trim(),
    remote_group_id: z.string(),
    description: z.string().trim().max(255, "At most 255 characters"),
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
      value.icmp_code !== undefined &&
      value.icmp_code >= 0 &&
      (value.icmp_type === undefined || value.icmp_type < 0)
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
      if (!value.cidr) {
        ctx.addIssue({
          code: "custom",
          path: ["cidr"],
          message: "Enter a CIDR, for example 203.0.113.0/24",
        });
      } else if (!parseCidr(value.cidr)) {
        ctx.addIssue({
          code: "custom",
          path: ["cidr"],
          message: "Enter a CIDR, for example 203.0.113.0/24 or 2001:db8::/32",
        });
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

/** The ethertype the rule gets: a CIDR decides it, as in Horizon. */
export function ruleEthertype(values: RuleForm): "IPv4" | "IPv6" {
  if (values.remote === "cidr") {
    const cidr = parseCidr(values.cidr);
    if (cidr) return cidr.version === 6 ? "IPv6" : "IPv4";
  }
  return values.ethertype;
}

export function toRuleRequest(values: RuleForm): RuleCreate {
  const ethertype = ruleEthertype(values);
  const request: RuleCreate = {
    direction: values.direction,
    ethertype,
    description: values.description,
  };
  if (values.kind.startsWith("custom_")) {
    request.protocol = values.kind.replace("custom_", "");
    if (request.protocol === "icmp") {
      if (ethertype === "IPv6") request.protocol = "ipv6-icmp";
      if (values.icmp_type !== undefined && values.icmp_type >= 0) {
        request.port_range_min = values.icmp_type;
        if (values.icmp_code !== undefined && values.icmp_code >= 0) {
          request.port_range_max = values.icmp_code;
        }
      }
    } else if (values.port_mode === "port") {
      request.port_range_min = values.port ?? null;
      request.port_range_max = values.port ?? null;
    } else if (values.port_mode === "range") {
      request.port_range_min = values.port_from ?? null;
      request.port_range_max = values.port_to ?? null;
    }
  } else if (values.kind === "other") {
    request.protocol = values.protocol.trim().toLowerCase();
  } else {
    request.preset = values.kind;
  }
  if (values.remote === "cidr") {
    request.remote_ip_prefix = values.cidr;
  } else {
    request.remote_group_id = values.remote_group_id;
  }
  return request;
}
