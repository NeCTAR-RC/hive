/**
 * API access: the region's service endpoints and what an openrc or
 * clouds.yaml needs.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

/** A service endpoint of the current region, for the API Access panel. */
export type ServiceEndpoint = Schemas["ServiceEndpoint"];

/** What an openrc or clouds.yaml needs about the user and project. */
export type ApiCredentials = Schemas["ApiCredentials"];
