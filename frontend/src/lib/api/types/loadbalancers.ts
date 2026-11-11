/**
 * Load balancers (Octavia): the load balancer tree, its listeners, pools,
 * members, monitors and L7 policies, and the create specs.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth. In every update body an omitted field is
 * left as it is and `null` clears it.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

/** A load balancer as the list and the tree show it. */
export type LoadBalancer = Schemas["LoadBalancer"];

/** One load balancer with the create chain still running on it, if any. */
export type LoadBalancerDetail = Schemas["LoadBalancerDetail"];

/**
 * The backend's create chain (listener, pool, members, monitor);
 * `failed_step` names the step it stopped at once it has failed.
 */
export type ChainState = Schemas["ChainState"];

export type Listener = Schemas["Listener"];
export type Member = Schemas["Member"];
export type Pool = Schemas["Pool"];

/** A pool in the tree, with its member rows. */
export type PoolWithMembers = Schemas["PoolWithMembers"];

export type HealthMonitor = Schemas["HealthMonitor"];
export type L7Rule = Schemas["L7Rule"];
export type L7Policy = Schemas["L7Policy"];

/** One L7 policy with its rule rows. */
export type L7PolicyDetail = Schemas["L7PolicyDetail"];

export type LoadBalancerTree = Schemas["LoadBalancerTree"];
export type LbSubnet = Schemas["LbSubnet"];
export type LbInstance = Schemas["LbInstance"];
export type LoadBalancerOptions = Schemas["LoadBalancerOptions"];
export type ListenerSpec = Schemas["ListenerSpec"];
export type ListenerCreate = Schemas["ListenerCreate"];

/** The listener fields an update may change: Octavia fixes protocol and port. */
export type ListenerUpdate = Schemas["ListenerUpdate"];

export type PoolSpec = Schemas["PoolSpec"];
export type PoolCreate = Schemas["PoolCreate"];

/** The pool fields an update may change (the protocol is fixed). */
export type PoolUpdate = Schemas["PoolUpdate"];

export type MemberSpec = Schemas["MemberSpec"];

/** The member fields an update may change (address, subnet and port are fixed). */
export type MemberUpdate = Schemas["MemberUpdate"];

export type MonitorSpec = Schemas["MonitorSpec"];
export type MonitorCreate = Schemas["MonitorCreate"];

/** The monitor fields an update may change (the type is fixed). */
export type MonitorUpdate = Schemas["MonitorUpdate"];

/** The create body (the backend's `LoadBalancerCreate`). */
export type LoadBalancerCreateRequest = Schemas["LoadBalancerCreate"];

export type L7PolicyCreate = Schemas["L7PolicyCreate"];

/** A policy's own fields: the create body without the listener it joins. */
export type L7PolicySpec = Omit<L7PolicyCreate, "listener_id">;

export type L7PolicyUpdate = Schemas["L7PolicyUpdate"];
export type L7RuleSpec = Schemas["L7RuleSpec"];
export type L7RuleUpdate = Schemas["L7RuleUpdate"];
