// The create load balancer wizard's form model (octavia-dashboard
// workflow/model.service.js): the schema, the steps and the fields each
// step validates, the defaults, and `toRequest`, which turns the form into
// the backend's one-shot create body. Pure, so it is unit tested apart from
// the page.
import type { FieldPath } from "react-hook-form";
import { z } from "zod";
import type {
  LoadBalancerCreateRequest,
  MemberSpec,
} from "../../lib/api/types";
import { EXPECTED_CODES, isCidr, isIp, URL_PATH } from "./status";

const port = z
  .number({ error: "Enter a port" })
  .int()
  .min(1, "Ports run from 1 to 65535")
  .max(65535, "Ports run from 1 to 65535");

export const memberSchema = z.object({
  name: z.string().trim(),
  address: z
    .string()
    .trim()
    .min(1, "Enter an IP address")
    .refine(isIp, "Enter a valid IP address"),
  subnet_id: z.string(),
  protocol_port: port,
  weight: z.number().int().min(0).max(256),
  backup: z.boolean(),
});

export const wizardSchema = z
  .object({
    name: z.string().trim().max(255),
    description: z.string().trim().max(255),
    vip_subnet_id: z.string().min(1, "Choose a subnet"),
    vip_address: z
      .string()
      .trim()
      .refine((v) => !v || isIp(v), "The IP address is not valid."),
    flavor_id: z.string(),
    availability_zone: z.string(),
    admin_state_up: z.boolean(),
    create_listener: z.boolean(),
    l_name: z.string().trim().max(255),
    l_protocol: z.string(),
    l_protocol_port: port,
    l_connection_limit: z.number().int().min(-1),
    l_allowed_cidrs: z.string().trim(),
    l_xff: z.boolean(),
    l_xfp: z.boolean(),
    l_xfproto: z.boolean(),
    l_tls_ref: z.string().trim(),
    l_timeout_client_data: z.number().int().min(0),
    l_timeout_member_connect: z.number().int().min(0),
    l_timeout_member_data: z.number().int().min(0),
    l_timeout_tcp_inspect: z.number().int().min(0),
    create_pool: z.boolean(),
    p_name: z.string().trim().max(255),
    p_algorithm: z.string(),
    p_persistence: z.string(),
    p_cookie_name: z.string().trim(),
    members: z.array(memberSchema),
    create_monitor: z.boolean(),
    m_type: z.string(),
    m_delay: z.number().int().min(0),
    m_timeout: z.number().int().min(0),
    m_max_retries: z.number().int().min(1).max(10),
    m_max_retries_down: z.number().int().min(1).max(10),
    m_http_method: z.string(),
    m_url_path: z.string().trim(),
    m_expected_codes: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.create_listener) {
      if (!v.l_protocol)
        ctx.addIssue({
          code: "custom",
          path: ["l_protocol"],
          message: "Choose a protocol",
        });
      if (v.l_protocol === "TERMINATED_HTTPS" && !v.l_tls_ref) {
        ctx.addIssue({
          code: "custom",
          path: ["l_tls_ref"],
          message: "Enter the Barbican container or secret reference",
        });
      }
      for (const cidr of v.l_allowed_cidrs.split(/\s+/).filter(Boolean)) {
        if (!isCidr(cidr)) {
          ctx.addIssue({
            code: "custom",
            path: ["l_allowed_cidrs"],
            message: `"${cidr}" is not a CIDR`,
          });
          break;
        }
      }
    }
    if (v.create_pool) {
      if (!v.p_algorithm)
        ctx.addIssue({
          code: "custom",
          path: ["p_algorithm"],
          message: "Choose an algorithm",
        });
      if (v.p_persistence === "APP_COOKIE" && !v.p_cookie_name) {
        ctx.addIssue({
          code: "custom",
          path: ["p_cookie_name"],
          message: "Enter the cookie name",
        });
      }
    }
    if (v.create_monitor) {
      if (!v.m_type)
        ctx.addIssue({
          code: "custom",
          path: ["m_type"],
          message: "Choose a monitor type",
        });
      if (v.m_delay < v.m_timeout)
        ctx.addIssue({
          code: "custom",
          path: ["m_delay"],
          message: "The delay must be at least the timeout",
        });
      if (["HTTP", "HTTPS"].includes(v.m_type)) {
        if (!EXPECTED_CODES.test(v.m_expected_codes || "200")) {
          ctx.addIssue({
            code: "custom",
            path: ["m_expected_codes"],
            message: "A code, a range (200-204) or a list (200,301)",
          });
        }
        if (!URL_PATH.test(v.m_url_path || "/")) {
          ctx.addIssue({
            code: "custom",
            path: ["m_url_path"],
            message: "The path must start with a slash",
          });
        }
      }
    }
  });

export type WizardValues = z.infer<typeof wizardSchema>;
export type MemberValues = z.infer<typeof memberSchema>;

export interface WizardStep {
  id: string;
  title: string;
  fields: FieldPath<WizardValues>[];
}

export const STEPS: WizardStep[] = [
  {
    id: "details",
    title: "Load balancer",
    fields: [
      "name",
      "vip_subnet_id",
      "vip_address",
      "flavor_id",
      "availability_zone",
    ],
  },
  {
    id: "listener",
    title: "Listener",
    fields: [
      "create_listener",
      "l_protocol",
      "l_protocol_port",
      "l_connection_limit",
      "l_allowed_cidrs",
      "l_tls_ref",
    ],
  },
  {
    id: "pool",
    title: "Pool",
    fields: ["create_pool", "p_algorithm", "p_persistence", "p_cookie_name"],
  },
  { id: "members", title: "Members", fields: ["members"] },
  {
    id: "monitor",
    title: "Health monitor",
    fields: [
      "create_monitor",
      "m_type",
      "m_delay",
      "m_timeout",
      "m_max_retries",
      "m_max_retries_down",
      "m_url_path",
      "m_expected_codes",
    ],
  },
];

export const DEFAULTS: WizardValues = {
  name: "",
  description: "",
  vip_subnet_id: "",
  vip_address: "",
  flavor_id: "",
  availability_zone: "",
  admin_state_up: true,
  create_listener: true,
  l_name: "",
  l_protocol: "HTTP",
  l_protocol_port: 80,
  l_connection_limit: -1,
  l_allowed_cidrs: "",
  l_xff: false,
  l_xfp: false,
  l_xfproto: false,
  l_tls_ref: "",
  l_timeout_client_data: 50000,
  l_timeout_member_connect: 5000,
  l_timeout_member_data: 50000,
  l_timeout_tcp_inspect: 0,
  create_pool: true,
  p_name: "",
  p_algorithm: "ROUND_ROBIN",
  p_persistence: "",
  p_cookie_name: "",
  members: [],
  create_monitor: false,
  m_type: "HTTP",
  m_delay: 5,
  m_timeout: 5,
  m_max_retries: 3,
  m_max_retries_down: 3,
  m_http_method: "GET",
  m_url_path: "/",
  m_expected_codes: "200",
};

/** A new member row. `port` is undefined when the pool protocol has no
 * default, which leaves the required port field empty for the user. */
export function newMember(
  port: number | undefined,
  fields: Partial<MemberValues> = {},
): MemberValues {
  return {
    name: "",
    address: "",
    subnet_id: "",
    // An empty NumberInput holds undefined; the schema asks for a port.
    protocol_port: port as number,
    weight: 1,
    backup: false,
    ...fields,
  };
}

/** The create body. A pool is only sent with a listener and members and a
 * monitor only with a pool, which the backend requires (400 otherwise). */
export function toRequest(v: WizardValues): LoadBalancerCreateRequest {
  const request: LoadBalancerCreateRequest = {
    vip_subnet_id: v.vip_subnet_id,
    admin_state_up: v.admin_state_up,
    ...(v.name ? { name: v.name } : {}),
    ...(v.description ? { description: v.description } : {}),
    ...(v.vip_address ? { vip_address: v.vip_address } : {}),
    ...(v.flavor_id ? { flavor_id: v.flavor_id } : {}),
    ...(v.availability_zone ? { availability_zone: v.availability_zone } : {}),
  };
  if (!v.create_listener) return request;
  const cidrs = v.l_allowed_cidrs.split(/\s+/).filter(Boolean);
  request.listener = {
    protocol: v.l_protocol,
    protocol_port: v.l_protocol_port,
    connection_limit: v.l_connection_limit,
    admin_state_up: true,
    ...(v.l_name ? { name: v.l_name } : {}),
    ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
    ...(["HTTP", "TERMINATED_HTTPS"].includes(v.l_protocol)
      ? {
          insert_headers: {
            "X-Forwarded-For": v.l_xff,
            "X-Forwarded-Port": v.l_xfp,
            "X-Forwarded-Proto": v.l_xfproto,
          },
        }
      : {}),
    ...(v.l_protocol === "TERMINATED_HTTPS" && v.l_tls_ref
      ? { default_tls_container_ref: v.l_tls_ref }
      : {}),
    ...(!["UDP", "SCTP"].includes(v.l_protocol)
      ? {
          timeout_client_data: v.l_timeout_client_data,
          timeout_member_connect: v.l_timeout_member_connect,
          timeout_member_data: v.l_timeout_member_data,
          timeout_tcp_inspect: v.l_timeout_tcp_inspect,
        }
      : {}),
  };
  if (!v.create_pool) return request;
  request.pool = {
    lb_algorithm: v.p_algorithm,
    admin_state_up: true,
    ...(v.p_name ? { name: v.p_name } : {}),
    session_persistence: v.p_persistence
      ? {
          type: v.p_persistence,
          ...(v.p_persistence === "APP_COOKIE"
            ? { cookie_name: v.p_cookie_name }
            : {}),
        }
      : null,
  };
  request.members = v.members.map<MemberSpec>((m) => ({
    address: m.address,
    protocol_port: m.protocol_port,
    weight: m.weight,
    backup: m.backup,
    admin_state_up: true,
    ...(m.subnet_id ? { subnet_id: m.subnet_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
  if (v.create_monitor) {
    request.monitor = {
      type: v.m_type,
      delay: v.m_delay,
      timeout: v.m_timeout,
      max_retries: v.m_max_retries,
      max_retries_down: v.m_max_retries_down,
      admin_state_up: true,
      ...(["HTTP", "HTTPS"].includes(v.m_type)
        ? {
            http_method: v.m_http_method,
            url_path: v.m_url_path || "/",
            expected_codes: v.m_expected_codes || "200",
          }
        : {}),
    };
  }
  return request;
}
