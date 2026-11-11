// How a security group rule reads: its port range, and the rule in one
// line for confirmations and toasts.
import type { SecurityGroupRule } from "../../../lib/api/types/network";

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

/**
 * "ingress TCP 22 from 203.0.113.0/24": a rule in one line. A remote group
 * reads by its name from `groupNames` (id to name), else "any".
 */
export function describeRule(
  rule: SecurityGroupRule,
  groupNames: ReadonlyMap<string, string>,
): string {
  return (
    `${rule.direction} ${(rule.protocol ?? "any").toUpperCase()} ` +
    `${portRange(rule)} from ` +
    (rule.remote_ip_prefix ??
      groupNames.get(rule.remote_group_id ?? "") ??
      "any")
  );
}
