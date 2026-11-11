/**
 * The signed-in session: public site config, the session probe and the
 * current user, project and services the shell is built from.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type PublicConfig = Schemas["PublicConfig"];

/** `/api/session`: the backend's `SignedIn | SignedOut`, told apart by `authenticated`. */
export type SessionProbe = Schemas["SignedIn"] | Schemas["SignedOut"];

export type UserRef = Schemas["UserRef"];
export type ProjectRef = Schemas["ProjectRef"];
export type Me = Schemas["Me"];

/**
 * The keys of `Me.capabilities.services`. The backend sends a string-keyed
 * map (its `SERVICE_KEYS`), so the SPA names the keys it gates panels on.
 */
export type ServiceKey =
  | "compute"
  | "volume"
  | "network"
  | "image"
  | "object-store"
  | "container-infra"
  | "load-balancer"
  | "orchestration"
  | "dns"
  | "share"
  | "database"
  | "reservation"
  | "security"
  | "rating"
  | "metric"
  | "allocations"
  | "account"
  | "ops";
