/**
 * Security risks (Varroa) found on the project's resources.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth. Varroa's records pass through with any
 * extra fields, so both record types allow unknown keys.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type SecurityRiskType = Schemas["SecurityRiskType"];
export type SecurityRisk = Schemas["SecurityRisk"];
export type RisksResponse = Schemas["RisksResponse"];
