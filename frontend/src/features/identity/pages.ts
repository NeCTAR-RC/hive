/**
 * The identity pages as one chunk. The routes in `routes.tsx` load this
 * module the first time one of them is visited, so the group's code stays
 * out of the first paint and arrives whole for the group's other pages.
 */
export { ApplicationCredentialDetailPage } from "./appcreds/ApplicationCredentialDetailPage";
export { ApplicationCredentialsPage } from "./appcreds/ApplicationCredentialsPage";
export { CredentialsPage } from "./credentials/CredentialsPage";
export { UserDetailPage } from "./lookup/UserDetailPage";
export { UserLookupPage } from "./lookup/UserLookupPage";
export { MembersPage } from "./members/MembersPage";
