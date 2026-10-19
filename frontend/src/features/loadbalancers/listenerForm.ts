// The listener forms' model (octavia-dashboard workflow/listener): the
// create and edit schemas, the protocol-change defaults, and the Edit
// listener PATCH body. Kept apart from the dialogs so it can be tested.
import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { z } from "zod";
import type { Listener, ListenerUpdate } from "../../lib/api/types";
import { defaultPort, isCidr } from "./status";

export const createListenerSchema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    protocol: z.string().min(1, "Choose a protocol"),
    protocol_port: z
      .number({ error: "Enter a port" })
      .int()
      .min(1, "Ports run from 1 to 65535")
      .max(65535, "Ports run from 1 to 65535"),
    connection_limit: z.number().int().min(-1),
    allowed_cidrs: z.string().trim(),
    xff: z.boolean(),
    xfp: z.boolean(),
    xfproto: z.boolean(),
    tls_ref: z.string().trim(),
    default_pool_id: z.string(),
    admin_state_up: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.protocol === "TERMINATED_HTTPS" && !v.tls_ref) {
      ctx.addIssue({
        code: "custom",
        path: ["tls_ref"],
        message: "Enter the certificate reference",
      });
    }
    for (const cidr of v.allowed_cidrs.split(/\s+/).filter(Boolean)) {
      if (!isCidr(cidr)) {
        ctx.addIssue({
          code: "custom",
          path: ["allowed_cidrs"],
          message: `"${cidr}" is not a CIDR`,
        });
        break;
      }
    }
  });

export type CreateListenerValues = z.infer<typeof createListenerSchema>;

/**
 * On a protocol change only (listener.controller.js `protocolChange`): the
 * default port, stepped past `used` and empty where the protocol has none,
 * and no default pool (pools must match the protocol).
 */
export function useProtocolDefaults(
  form: UseFormReturn<CreateListenerValues>,
  used: number[],
) {
  const usedKey = used.join(",");
  useEffect(() => {
    const ports = usedKey ? usedKey.split(",").map(Number) : [];
    const subscription = form.watch((values, { name }) => {
      if (name !== "protocol") return;
      form.setValue(
        "protocol_port",
        // Undefined empties the field for the user to fill.
        defaultPort(values.protocol ?? "", ports) as number,
      );
      form.setValue("default_pool_id", "");
    });
    return () => subscription.unsubscribe();
  }, [form, usedKey]);
}

function lines(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export const editListenerSchema = z.object({
  name: z.string().trim().max(255),
  description: z.string().trim().max(255),
  connection_limit: z.number().int().min(-1),
  allowed_cidrs: z
    .string()
    .trim()
    .refine((v) => lines(v).every(isCidr), "Enter one CIDR per line"),
  xff: z.boolean(),
  xfp: z.boolean(),
  xfproto: z.boolean(),
  default_pool_id: z.string(),
  timeout_client_data: z.number().int().min(0).optional(),
  timeout_member_connect: z.number().int().min(0).optional(),
  timeout_member_data: z.number().int().min(0).optional(),
  timeout_tcp_inspect: z.number().int().min(0).optional(),
  tls_ref: z.string().trim(),
  sni_refs: z.string().trim(),
  tls_ciphers: z.string().trim(),
  admin_state_up: z.boolean(),
});

/** The Edit listener body (octavia-dashboard listener update): every
 * field the protocol allows, `default_pool_id: null` for None, and
 * timeouts and TLS settings only where the protocol has them. */
export type EditListenerValues = z.infer<typeof editListenerSchema>;

export function editListenerBody(
  listener: Listener,
  v: EditListenerValues,
): ListenerUpdate {
  const http = ["HTTP", "TERMINATED_HTTPS"].includes(listener.protocol);
  const tls = listener.protocol === "TERMINATED_HTTPS";
  const timeouts = !["UDP", "SCTP"].includes(listener.protocol);
  return {
    name: v.name,
    description: v.description,
    connection_limit: v.connection_limit,
    allowed_cidrs: lines(v.allowed_cidrs),
    admin_state_up: v.admin_state_up,
    default_pool_id: v.default_pool_id || null,
    ...(http
      ? {
          insert_headers: {
            "X-Forwarded-For": v.xff,
            "X-Forwarded-Port": v.xfp,
            "X-Forwarded-Proto": v.xfproto,
          },
        }
      : {}),
    ...(timeouts
      ? {
          ...(v.timeout_client_data !== undefined
            ? { timeout_client_data: v.timeout_client_data }
            : {}),
          ...(v.timeout_member_connect !== undefined
            ? { timeout_member_connect: v.timeout_member_connect }
            : {}),
          ...(v.timeout_member_data !== undefined
            ? { timeout_member_data: v.timeout_member_data }
            : {}),
          ...(v.timeout_tcp_inspect !== undefined
            ? { timeout_tcp_inspect: v.timeout_tcp_inspect }
            : {}),
        }
      : {}),
    ...(tls
      ? {
          ...(v.tls_ref ? { default_tls_container_ref: v.tls_ref } : {}),
          sni_container_refs: lines(v.sni_refs),
          tls_ciphers: v.tls_ciphers || null,
        }
      : {}),
  };
}
