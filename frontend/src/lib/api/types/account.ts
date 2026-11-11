/**
 * The user's own account: the Nectar profile and password reset.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type ExternalId = Schemas["ExternalId"];
export type Affiliation = Schemas["Affiliation"];

/** The Nectar profile, read in full from the allocation API. */
export type Profile = Schemas["Profile"];

/**
 * The profile's stand-in when the allocation API could not be read
 * (`partial: true`): the error to show and the ORCID links alone.
 */
export type ProfileUnavailable = Schemas["ProfileUnavailable"];

/** `GET /api/me/profile`: told apart by `partial`. */
export type ProfileReply = Profile | ProfileUnavailable;

/** The body of `PATCH /api/me/profile` (the backend's `ProfileUpdate`). */
export type ProfileUpdateRequest = Schemas["ProfileUpdate"];

export type PasswordReset = Schemas["PasswordReset"];
