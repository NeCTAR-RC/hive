/**
 * Project identity: members, user lookup, application credentials and
 * Keystone credentials (EC2, TOTP, certificates).
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type UserSearchResult = Schemas["UserSearchResult"];

/** Another user's Nectar profile, as the user lookup panel shows it. */
export type UserDetails = Schemas["UserDetails"];

export type MemberRow = Schemas["MemberRow"];
export type RoleChoice = Schemas["RoleChoice"];
export type MembersResponse = Schemas["MembersResponse"];

/** The body that adds a member (the backend's `MemberAdd`). */
export type MemberAddRequest = Schemas["MemberAdd"];

export type AppCredRole = Schemas["AppCredRole"];
export type AccessRule = Schemas["AccessRule"];
export type ApplicationCredential = Schemas["ApplicationCredential"];

/** The create reply: the credential with its secret, shown this once only. */
export type ApplicationCredentialCreated =
  Schemas["ApplicationCredentialCreated"];

export type ApplicationCredentialOptions =
  Schemas["ApplicationCredentialOptions"];

/** The create body (the backend's `ApplicationCredentialCreate`). */
export type ApplicationCredentialCreateRequest =
  Schemas["ApplicationCredentialCreate"];

export type Ec2Credential = Schemas["Ec2Credential"];
export type Ec2Response = Schemas["Ec2Response"];
export type Credential = Schemas["Credential"];
