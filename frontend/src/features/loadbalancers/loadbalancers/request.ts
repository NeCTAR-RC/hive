// The create request the wizard's values become: the load balancer, then
// each part switched on, which the backend creates one after another once
// the load balancer is active.
import { offered } from "../../../lib/api/offered";
import type {
  ListenerSpec,
  LoadBalancerCreateRequest,
  MemberSpec,
  MonitorSpec,
  PoolSpec,
} from "../../../lib/api/types/loadbalancers";
import {
  httpCheckPart,
  insertHeadersPart,
  sessionPersistence,
  timeoutsPart,
} from "../bodies";
import { enteredPort, listEntries } from "../schemas";
import type { CreateForm } from "./createForm";

/**
 * The create body. Optional fields go only when set. A part is sent only
 * when switched on and its predecessor is too: no pool without a listener,
 * no members or monitor without a pool. The listener's forwarded headers
 * go on HTTP and terminated HTTPS, its certificate on terminated HTTPS,
 * and its timeouts on every protocol but UDP and SCTP.
 */
export function createRequest(v: CreateForm): LoadBalancerCreateRequest {
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
  const listener = v.listener;
  const cidrs = listEntries(listener.allowed_cidrs);
  request.listener = {
    protocol: offered<ListenerSpec["protocol"]>(listener.protocol),
    protocol_port: enteredPort(listener.protocol_port),
    connection_limit: listener.connection_limit,
    admin_state_up: true,
    ...(listener.name ? { name: listener.name } : {}),
    ...(cidrs.length ? { allowed_cidrs: cidrs } : {}),
    ...insertHeadersPart(listener.protocol, listener),
    ...(listener.protocol === "TERMINATED_HTTPS" && listener.tls_ref
      ? { default_tls_container_ref: listener.tls_ref }
      : {}),
    ...timeoutsPart(listener.protocol, listener),
  };
  if (!v.create_pool) return request;
  const pool = v.pool;
  request.pool = {
    lb_algorithm: offered<PoolSpec["lb_algorithm"]>(pool.lb_algorithm),
    admin_state_up: true,
    ...(pool.name ? { name: pool.name } : {}),
    session_persistence: sessionPersistence(pool.persistence, pool.cookie_name),
  };
  request.members = v.members.map<MemberSpec>((m) => ({
    address: m.address,
    protocol_port: enteredPort(m.protocol_port),
    weight: m.weight,
    backup: m.backup,
    admin_state_up: true,
    ...(m.subnet_id ? { subnet_id: m.subnet_id } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
  if (v.create_monitor) {
    const monitor = v.monitor;
    request.monitor = {
      type: offered<MonitorSpec["type"]>(monitor.type),
      delay: monitor.delay,
      timeout: monitor.timeout,
      max_retries: monitor.max_retries,
      max_retries_down: monitor.max_retries_down,
      admin_state_up: true,
      ...httpCheckPart(monitor),
    };
  }
  return request;
}
