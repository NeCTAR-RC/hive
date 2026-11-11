// The request bodies the mocked load balancer endpoints accept, each tied to
// the frontend's request type so the two cannot drift apart unnoticed.
import { z } from "zod";
import type {
  L7PolicySpec,
  L7PolicyUpdate,
  L7RuleSpec,
  L7RuleUpdate,
  ListenerSpec,
  ListenerUpdate,
  LoadBalancerCreateRequest,
  MemberSpec,
  MemberUpdate,
  MonitorSpec,
  MonitorUpdate,
  PoolSpec,
  PoolUpdate,
} from "../../lib/api/types/loadbalancers";

const port = z.number().int().min(1).max(65535);
const id = z.string().min(1);

// The values the backend's Literal fields accept
// (backend/hive/schemas/loadbalancer.py).
const listenerProtocol = z.enum([
  "HTTP",
  "TCP",
  "TERMINATED_HTTPS",
  "HTTPS",
  "UDP",
  "SCTP",
]);
const poolProtocol = z.enum([
  "HTTP",
  "HTTPS",
  "PROXY",
  "PROXYV2",
  "TCP",
  "UDP",
  "SCTP",
]);
const algorithm = z.enum(["LEAST_CONNECTIONS", "ROUND_ROBIN", "SOURCE_IP"]);
const persistenceType = z.enum(["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"]);
const monitorType = z.enum([
  "HTTP",
  "HTTPS",
  "PING",
  "TCP",
  "TLS-HELLO",
  "UDP-CONNECT",
  "SCTP",
]);
const httpMethod = z.enum([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "TRACE",
  "OPTIONS",
  "PATCH",
  "CONNECT",
]);
const l7Action = z.enum([
  "REJECT",
  "REDIRECT_TO_URL",
  "REDIRECT_TO_POOL",
  "REDIRECT_PREFIX",
]);
/** An update field: left out to keep it, null to clear it. */
const clearable = <T extends z.ZodType>(schema: T) =>
  schema.nullable().optional();

const listenerSpec = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  protocol: listenerProtocol,
  protocol_port: port,
  connection_limit: z.number().int().optional(),
  timeout_client_data: z.number().int().optional(),
  timeout_member_connect: z.number().int().optional(),
  timeout_member_data: z.number().int().optional(),
  timeout_tcp_inspect: z.number().int().optional(),
  allowed_cidrs: z.array(z.string()).optional(),
  insert_headers: z.record(z.string(), z.boolean()).optional(),
  default_tls_container_ref: z.string().optional(),
  sni_container_refs: z.array(z.string()).optional(),
  tls_ciphers: z.string().optional(),
  default_pool_id: z.string().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<ListenerSpec>;

const poolSpec = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  protocol: poolProtocol.optional(),
  lb_algorithm: algorithm,
  session_persistence: z
    .object({
      type: persistenceType.nullable().optional(),
      cookie_name: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  tls_enabled: z.boolean().optional(),
  tls_ciphers: z.string().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<PoolSpec>;

const memberSpec = z.object({
  name: z.string().optional(),
  address: z.string().min(1),
  subnet_id: z.string().optional(),
  protocol_port: port,
  weight: z.number().int().optional(),
  monitor_address: z.string().optional(),
  monitor_port: port.optional(),
  backup: z.boolean().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<MemberSpec>;

const monitorSpec = z.object({
  name: z.string().optional(),
  type: monitorType,
  delay: z.number().int().optional(),
  timeout: z.number().int().optional(),
  max_retries: z.number().int().optional(),
  max_retries_down: z.number().int().optional(),
  http_method: httpMethod.optional(),
  url_path: z.string().optional(),
  expected_codes: z.string().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<MonitorSpec>;

const l7PolicySpec = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  action: l7Action,
  redirect_url: z.string().optional(),
  redirect_pool_id: z.string().optional(),
  redirect_prefix: z.string().optional(),
  position: z.number().int().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<L7PolicySpec>;

export const loadBalancerCreateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  vip_subnet_id: id,
  vip_address: z.string().optional(),
  flavor_id: z.string().optional(),
  availability_zone: z.string().optional(),
  admin_state_up: z.boolean().optional(),
  listener: listenerSpec.optional(),
  pool: poolSpec.optional(),
  members: z.array(memberSpec).optional(),
  monitor: monitorSpec.optional(),
}) satisfies z.ZodType<LoadBalancerCreateRequest>;

export const loadBalancerUpdateBody = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  admin_state_up: z.boolean().optional(),
});

export const listenerCreateBody = listenerSpec.extend({ loadbalancer_id: id });
export const listenerUpdateBody = z.object({
  name: clearable(z.string()),
  description: clearable(z.string()),
  connection_limit: clearable(z.number().int()),
  timeout_client_data: clearable(z.number().int()),
  timeout_member_connect: clearable(z.number().int()),
  timeout_member_data: clearable(z.number().int()),
  timeout_tcp_inspect: clearable(z.number().int()),
  allowed_cidrs: clearable(z.array(z.string())),
  insert_headers: clearable(z.record(z.string(), z.boolean())),
  default_tls_container_ref: clearable(z.string()),
  sni_container_refs: clearable(z.array(z.string())),
  tls_ciphers: clearable(z.string()),
  default_pool_id: clearable(z.string()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<ListenerUpdate>;

export const poolCreateBody = poolSpec.extend({
  loadbalancer_id: id,
  listener_id: id.optional(),
});
export const poolUpdateBody = z.object({
  name: clearable(z.string()),
  description: clearable(z.string()),
  lb_algorithm: clearable(algorithm),
  session_persistence: poolSpec.shape.session_persistence,
  tls_enabled: clearable(z.boolean()),
  tls_ciphers: clearable(z.string()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<PoolUpdate>;

export const memberCreateBody = memberSpec;
export const memberUpdateBody = z.object({
  name: clearable(z.string()),
  weight: clearable(z.number().int()),
  monitor_address: clearable(z.string()),
  monitor_port: clearable(port),
  backup: clearable(z.boolean()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<MemberUpdate>;

export const monitorCreateBody = monitorSpec.extend({ pool_id: id });
export const monitorUpdateBody = z.object({
  name: clearable(z.string()),
  delay: clearable(z.number().int()),
  timeout: clearable(z.number().int()),
  max_retries: clearable(z.number().int()),
  max_retries_down: clearable(z.number().int()),
  http_method: clearable(httpMethod),
  url_path: clearable(z.string()),
  expected_codes: clearable(z.string()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<MonitorUpdate>;

export const l7PolicyCreateBody = l7PolicySpec.extend({ listener_id: id });
export const l7PolicyUpdateBody = z.object({
  name: clearable(z.string()),
  description: clearable(z.string()),
  action: clearable(l7Action),
  redirect_url: clearable(z.string()),
  redirect_pool_id: clearable(z.string()),
  redirect_prefix: clearable(z.string()),
  position: clearable(z.number().int()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<L7PolicyUpdate>;

export const l7RuleCreateBody = z.object({
  type: z.enum(["HOST_NAME", "PATH", "FILE_TYPE", "HEADER", "COOKIE"]),
  compare_type: z.enum([
    "REGEX",
    "EQUAL_TO",
    "STARTS_WITH",
    "ENDS_WITH",
    "CONTAINS",
  ]),
  key: z.string().optional(),
  value: z.string().min(1),
  invert: z.boolean().optional(),
  admin_state_up: z.boolean().optional(),
}) satisfies z.ZodType<L7RuleSpec>;

export const l7RuleUpdateBody = z.object({
  type: clearable(l7RuleCreateBody.shape.type),
  compare_type: clearable(l7RuleCreateBody.shape.compare_type),
  key: clearable(z.string()),
  value: clearable(z.string().min(1)),
  invert: clearable(z.boolean()),
  admin_state_up: clearable(z.boolean()),
}) satisfies z.ZodType<L7RuleUpdate>;
