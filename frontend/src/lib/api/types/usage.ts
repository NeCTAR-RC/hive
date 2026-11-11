/**
 * Allocation and usage: the allocation summary, CloudKitty usage and the
 * service unit burn-down.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type AllocationSummary = Schemas["AllocationSummary"];

/** One CloudKitty summary row; the keys depend on the groupby. */
export type UsageRow = Schemas["UsageRow"];

export type UsageSummary = Schemas["UsageSummary"];
export type UsageOptions = Schemas["UsageOptions"];
export type UsageInstance = Schemas["UsageInstance"];
export type MostUsed = Schemas["MostUsed"];
export type UsageInstancesResponse = Schemas["UsageInstancesResponse"];
export type BurnDownPoint = Schemas["BurnDownPoint"];
export type AllocationUsage = Schemas["AllocationUsage"];
