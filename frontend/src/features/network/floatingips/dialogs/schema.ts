// The form schemas of the Floating IPs panel's dialogs whose values become
// a request body: allocate an IP, and add or edit a port forwarding rule.
import { z } from "zod";
import { isIpAddress } from "../../../../lib/net";
import { NAME } from "../../schema";
import { checkPortPairing, checkPorts } from "./ports";

/** The allocate form: a pool, and optionally an address and DNS names. */
export const allocateSchema = z
  .object({
    floating_network_id: z.string().min(1, "Choose a pool"),
    floating_ip_address: z.string().trim(),
    description: NAME,
    dns_domain: NAME,
    dns_name: NAME,
  })
  .superRefine((values, ctx) => {
    if (
      values.floating_ip_address &&
      !isIpAddress(values.floating_ip_address)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["floating_ip_address"],
        message: "Enter an IP address",
      });
    }
  });

export type AllocateValues = z.infer<typeof allocateSchema>;

/**
 * The port forwarding rule form. `target_id` names an internal address
 * (`<port id>_<address>`, as the targets list gives them).
 */
export const portForwardingSchema = z
  .object({
    protocol: z.enum(["tcp", "udp"]),
    target_id: z.string().min(1, "Choose an internal address"),
    internal_port: z.string().trim().min(1, "Enter the internal port"),
    external_port: z.string().trim().min(1, "Enter the external port"),
    description: NAME,
  })
  .superRefine((values, ctx) => {
    for (const key of ["internal_port", "external_port"] as const) {
      const problem = checkPorts(values[key]);
      if (problem)
        ctx.addIssue({ code: "custom", path: [key], message: problem });
    }
    const pairing = checkPortPairing(
      values.external_port,
      values.internal_port,
    );
    if (pairing) {
      ctx.addIssue({
        code: "custom",
        path: ["internal_port"],
        message: pairing,
      });
    }
  });

export type PortForwardingValues = z.infer<typeof portForwardingSchema>;
