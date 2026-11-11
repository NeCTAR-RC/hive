// The request body the add rule dialog sends.
import type { RuleCreate } from "../../../../lib/api/types/network";
import { isIcmpValue, type RuleForm } from "./schema";

/**
 * The new rule: a preset by id, or a custom rule's protocol and ports.
 * ICMP becomes ipv6-icmp on IPv6, with the type and code in the port
 * fields; a blank code is left out rather than sent as -1, as Horizon's
 * api/neutron.py does. The remote is the CIDR or the group.
 */
export function ruleRequest(values: RuleForm): RuleCreate {
  const request: RuleCreate = {
    direction: values.direction,
    ethertype: values.ethertype,
    description: values.description,
  };
  if (values.kind.startsWith("custom_")) {
    request.protocol = values.kind.replace("custom_", "");
    if (request.protocol === "icmp") {
      if (values.ethertype === "IPv6") request.protocol = "ipv6-icmp";
      if (isIcmpValue(values.icmp_type)) {
        request.port_range_min = values.icmp_type;
        if (isIcmpValue(values.icmp_code)) {
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
    request.protocol = values.protocol;
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
