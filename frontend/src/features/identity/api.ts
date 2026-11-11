// Queries and mutations for the Identity dashboard: project members, the
// helpdesk user lookup, application credentials, EC2 credentials and the
// user's generic Keystone credentials.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  ApplicationCredential,
  ApplicationCredentialCreateRequest,
  ApplicationCredentialCreated,
  ApplicationCredentialOptions,
  Credential,
  Ec2Response,
  MemberAddRequest,
  MemberRow,
  MembersResponse,
  UserDetails,
  UserSearchResult,
} from "../../lib/api/types/identity";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { useProjectId } from "../../lib/hooks/useProjectId";
import { getJson, staleTimes } from "../../lib/queries";
import { queryKeys, userKeys } from "../../lib/queryKeys";

const keys = queryKeys.identity;

export function membersQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.members.list(projectId),
    queryFn: getJson<MembersResponse>("/api/identity/members"),
    staleTime: staleTimes.list,
  });
}

/** What a membership write makes stale. */
export const memberWriteKeys = [keys.members.all];

export function useAddMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: MemberAddRequest) =>
      apiFetch<MemberRow>("/api/identity/members", {
        method: "POST",
        json: body,
      }),
    onSettled: () => invalidate(...memberWriteKeys),
  });
}

/** Takes one role on the project away from a user. */
export function removeMemberRole(userId: string, roleId: string) {
  return apiFetch<void>(`/api/identity/members/${userId}/roles/${roleId}`, {
    method: "DELETE",
  });
}

export function userSearchQuery(q: string) {
  return queryOptions({
    queryKey: userKeys.users.list({ q }),
    queryFn: getJson<Items<UserSearchResult>>("/api/identity/users/search", {
      q,
    }),
    staleTime: staleTimes.list,
    enabled: q.trim().length >= 3,
  });
}

export function userDetailsQuery(userId: string) {
  return queryOptions({
    queryKey: userKeys.users.detail(userId),
    queryFn: getJson<UserDetails>(`/api/identity/users/${userId}`),
    staleTime: staleTimes.detail,
  });
}

export const appCredentialsQuery = queryOptions({
  queryKey: userKeys.applicationCredentials.list(),
  queryFn: getJson<Items<ApplicationCredential>>(
    "/api/identity/application-credentials",
  ),
  staleTime: staleTimes.list,
});

export function appCredentialQuery(credentialId: string) {
  return queryOptions({
    queryKey: userKeys.applicationCredentials.detail(credentialId),
    queryFn: getJson<ApplicationCredential>(
      `/api/identity/application-credentials/${credentialId}`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function appCredentialOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.applicationCredentialOptions.all(projectId),
    queryFn: getJson<ApplicationCredentialOptions>(
      "/api/identity/application-credentials/options",
    ),
    staleTime: staleTimes.static,
  });
}

/** What an application credential write makes stale. */
export const appCredentialWriteKeys = [userKeys.applicationCredentials.all];

/**
 * Creates an application credential. Its secret goes to the page's
 * one-time dialog only: the mutation leaves the cache as soon as the create
 * dialog lets go of it (`gcTime: 0`) instead of staying for minutes.
 */
export function useCreateAppCredential() {
  const invalidate = useInvalidate();
  return useMutation({
    gcTime: 0,
    mutationFn: (body: ApplicationCredentialCreateRequest) =>
      apiFetch<ApplicationCredentialCreated>(
        "/api/identity/application-credentials",
        {
          method: "POST",
          json: body,
        },
      ),
    onSettled: () => invalidate(...appCredentialWriteKeys),
  });
}

/** Deletes one of the user's application credentials. */
export function deleteAppCredential(credentialId: string) {
  return apiFetch<void>(
    `/api/identity/application-credentials/${credentialId}`,
    { method: "DELETE" },
  );
}

export function ec2Query(projectId: string) {
  return queryOptions({
    queryKey: keys.ec2Credentials.all(projectId),
    queryFn: getJson<Ec2Response>("/api/identity/ec2-credentials"),
    staleTime: staleTimes.detail,
  });
}

/**
 * What a credential write makes stale: the user's credentials and the
 * project's EC2 pair, which is one of them.
 */
export const credentialWriteKeys = [
  userKeys.credentials.all,
  keys.ec2Credentials.all,
];

export const userCredentialsQuery = queryOptions({
  queryKey: userKeys.credentials.list(),
  queryFn: getJson<Items<Credential>>("/api/identity/credentials"),
  staleTime: staleTimes.list,
});

/** Creates the project's EC2 pair if it has none, and shows it at once. */
export function useEnsureEc2() {
  const queryClient = useQueryClient();
  const projectId = useProjectId();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      apiFetch<Ec2Response>("/api/identity/ec2-credentials", {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(ec2Query(projectId).queryKey, data);
    },
    onSettled: (_data, error) => {
      // After a failure the server may still have changed the pair.
      if (error) void invalidate(keys.ec2Credentials.all);
      return invalidate(userKeys.credentials.all);
    },
  });
}

/** Replaces the project's EC2 pair; the old one is deleted. */
export function recreateEc2Credentials() {
  return apiFetch<Ec2Response>("/api/identity/ec2-credentials/recreate", {
    method: "POST",
  });
}

/** Deletes one of the user's credentials. */
export function deleteCredential(credentialId: string) {
  return apiFetch<void>(`/api/identity/credentials/${credentialId}`, {
    method: "DELETE",
  });
}
