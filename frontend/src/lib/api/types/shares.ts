/**
 * Shares (Manila): shares, access rules, snapshots, share groups and
 * security services.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type ShareType = Schemas["ShareType"];
export type ShareOptions = Schemas["ShareOptions"];
export type Share = Schemas["Share"];
export type ShareAccessRule = Schemas["ShareAccessRule"];
export type ShareDetail = Schemas["ShareDetail"];
export type SharesResponse = Schemas["SharesResponse"];

/** The create body (the backend's `ShareCreate`). */
export type ShareCreateRequest = Schemas["ShareCreate"];

export type ShareMetadataSaved = Schemas["ShareMetadataSaved"];

export type ShareAccessResponse = Schemas["ShareAccessResponse"];
export type ShareSnapshot = Schemas["ShareSnapshot"];
export type ShareSnapshotDetail = Schemas["ShareSnapshotDetail"];
export type ShareSnapshotsResponse = Schemas["ShareSnapshotsResponse"];
export type SecurityService = Schemas["SecurityService"];

/** The create body (the backend's `SecurityServiceCreate`). */
export type SecurityServiceRequest = Schemas["SecurityServiceCreate"];

/**
 * A security service edit: the type is fixed, and an omitted field is left
 * as it is. The backend passes `null` through, but the edit dialog clears a
 * field with "", as manila-ui does.
 */
export type SecurityServiceUpdate = Schemas["SecurityServiceUpdate"];

export type ShareGroup = Schemas["ShareGroup"];

/**
 * A share group with its members. `share_types_detail` holds the full
 * share type when Manila still lists it, else its id and name only.
 */
export type ShareGroupDetail = Schemas["ShareGroupDetail"];

export type ShareGroupSnapshot = Schemas["ShareGroupSnapshot"];
