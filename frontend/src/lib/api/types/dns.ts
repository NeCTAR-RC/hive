/**
 * DNS (Designate): zones and record sets.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type Zone = Schemas["Zone"];
export type ZonesResponse = Schemas["ZonesResponse"];

/** The body of `POST /api/dns/zones` (the backend's `ZoneCreate`). */
export type ZoneCreateRequest = Schemas["ZoneCreate"];

export type RecordSet = Schemas["RecordSet"];
export type RecordSetsResponse = Schemas["RecordSetsResponse"];

/** The body that creates a record set (the backend's `RecordSetCreate`). */
export type RecordSetCreateRequest = Schemas["RecordSetCreate"];
