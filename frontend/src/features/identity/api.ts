// Queries and mutations for the Identity dashboard: project members, the
// helpdesk user lookup, application credentials, EC2 credentials and the
// user's generic Keystone credentials.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  ApplicationCredential,
  ApplicationCredentialCreateRequest,
  ApplicationCredentialOptions,
  Credential,
  CredentialCreateRequest,
  Ec2Response,
  Items,
  MemberAddRequest,
  MemberRow,
  MembersResponse,
  Profile,
  UserSearchResult,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function membersQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "identity", "members"],
    queryFn: () => apiFetch<MembersResponse>("/api/identity/members"),
    staleTime: staleTimes.list,
  });
}

export function useAddMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MemberAddRequest) =>
      apiFetch<MemberRow>("/api/identity/members", {
        method: "POST",
        json: body,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["project", projectId, "identity", "members"],
      }),
  });
}

export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (row: { user_id: string; role_id: string }) =>
      apiFetch<void>(
        `/api/identity/members/${row.user_id}/roles/${row.role_id}`,
        { method: "DELETE" },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["project", projectId, "identity", "members"],
      }),
  });
}

export function userSearchQuery(q: string) {
  return queryOptions({
    queryKey: ["identity", "users", "search", q],
    queryFn: () =>
      apiFetch<Items<UserSearchResult>>("/api/identity/users/search", {
        query: { q },
      }),
    staleTime: staleTimes.list,
    enabled: q.trim().length >= 3,
  });
}

export function userDetailsQuery(userId: string) {
  return queryOptions({
    queryKey: ["identity", "users", userId],
    queryFn: () => apiFetch<Profile>(`/api/identity/users/${userId}`),
    staleTime: staleTimes.detail,
  });
}

// --- application credentials -------------------------------------------------

const APP_CREDS = ["me", "application-credentials"] as const;

export const appCredentialsQuery = queryOptions({
  queryKey: APP_CREDS,
  queryFn: () =>
    apiFetch<Items<ApplicationCredential>>(
      "/api/identity/application-credentials",
    ),
  staleTime: staleTimes.list,
});

export function appCredentialQuery(credentialId: string) {
  return queryOptions({
    queryKey: [...APP_CREDS, credentialId],
    queryFn: () =>
      apiFetch<ApplicationCredential>(
        `/api/identity/application-credentials/${credentialId}`,
      ),
    staleTime: staleTimes.detail,
  });
}

export function appCredentialOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "identity", "app-cred-options"],
    queryFn: () =>
      apiFetch<ApplicationCredentialOptions>(
        "/api/identity/application-credentials/options",
      ),
    staleTime: staleTimes.static,
  });
}

export function useCreateAppCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ApplicationCredentialCreateRequest) =>
      apiFetch<ApplicationCredential>("/api/identity/application-credentials", {
        method: "POST",
        json: body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APP_CREDS }),
  });
}

export function useDeleteAppCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) =>
      apiFetch<void>(`/api/identity/application-credentials/${credentialId}`, {
        method: "DELETE",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: APP_CREDS }),
  });
}

// --- EC2 and generic credentials ---------------------------------------------

export function ec2Query(projectId: string) {
  return queryOptions({
    queryKey: ["project", projectId, "identity", "ec2"],
    queryFn: () => apiFetch<Ec2Response>("/api/identity/ec2-credentials"),
    staleTime: staleTimes.detail,
  });
}

const CREDENTIALS = ["me", "credentials"] as const;

export const credentialsQuery = queryOptions({
  queryKey: CREDENTIALS,
  queryFn: () => apiFetch<Items<Credential>>("/api/identity/credentials"),
  staleTime: staleTimes.list,
});

function useEc2Mutation(projectId: string, path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<Ec2Response>(path, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(ec2Query(projectId).queryKey, data);
      void queryClient.invalidateQueries({ queryKey: CREDENTIALS });
    },
  });
}

export function useEnsureEc2(projectId: string) {
  return useEc2Mutation(projectId, "/api/identity/ec2-credentials");
}

export function useRecreateEc2(projectId: string) {
  return useEc2Mutation(projectId, "/api/identity/ec2-credentials/recreate");
}

export function useCreateCredential() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CredentialCreateRequest) =>
      apiFetch<Credential>("/api/identity/credentials", {
        method: "POST",
        json: body,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CREDENTIALS }),
  });
}

export function useDeleteCredential(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentialId: string) =>
      apiFetch<void>(`/api/identity/credentials/${credentialId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CREDENTIALS });
      void queryClient.invalidateQueries({
        queryKey: ["project", projectId, "identity", "ec2"],
      });
    },
  });
}
