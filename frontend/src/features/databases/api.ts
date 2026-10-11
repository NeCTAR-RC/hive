// Queries and mutations for the Database panels (Trove), keyed under
// `['project', pid, 'trove', ...]`. Lists poll while anything is busy.
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type {
  DatastoreOption,
  DbBackup,
  DbBackupDetail,
  DbBackupsResponse,
  DbConfiguration,
  DbConfigurationDetail,
  DbConfigurationsResponse,
  DbInstance,
  DbInstanceDetail,
  DbInstancesResponse,
  DbLaunchRequest,
  DbOptions,
  DbUser,
  Items,
} from "../../lib/api/types";
import { staleTimes } from "../../lib/queries";

export function troveKey(projectId: string, ...rest: unknown[]) {
  return ["project", projectId, "trove", ...rest] as const;
}

const BASE = "/api/databases";
const POLL_MS = 5000;

export function dbOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "options"),
    queryFn: () => apiFetch<DbOptions>(`${BASE}/options`),
    staleTime: staleTimes.list,
  });
}

export function dbInstancesQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instances"),
    queryFn: () => apiFetch<DbInstancesResponse>(`${BASE}/instances`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((i) => i.is_transitional) ? POLL_MS : false,
  });
}

export function dbInstanceQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId),
    queryFn: () =>
      apiFetch<DbInstanceDetail>(`${BASE}/instances/${instanceId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function dbUpgradeTargetsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "upgrade-targets"),
    queryFn: () =>
      apiFetch<{ current: string | null } & Items<DatastoreOption>>(
        `${BASE}/instances/${instanceId}/upgrade-targets`,
      ),
    staleTime: staleTimes.static,
  });
}

export function dbRootQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "root"),
    queryFn: () =>
      apiFetch<{ id: string; root_enabled: boolean }>(
        `${BASE}/instances/${instanceId}/root`,
      ),
    staleTime: staleTimes.detail,
  });
}

export function dbUsersQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "users"),
    queryFn: () =>
      apiFetch<Items<DbUser>>(`${BASE}/instances/${instanceId}/users`),
    staleTime: staleTimes.detail,
  });
}

export function dbUserAccessQuery(
  projectId: string,
  instanceId: string,
  name: string,
  host: string,
) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "access", name, host),
    queryFn: () =>
      apiFetch<Items<{ name: string | null; granted: boolean }>>(
        `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}/access?host=${encodeURIComponent(host)}`,
      ),
    staleTime: 0,
  });
}

export function dbDatabasesQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "databases"),
    queryFn: () =>
      apiFetch<Items<{ name: string | null }>>(
        `${BASE}/instances/${instanceId}/databases`,
      ),
    staleTime: staleTimes.detail,
  });
}

export function dbInstanceBackupsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "backups"),
    queryFn: () =>
      apiFetch<Items<DbBackup>>(`${BASE}/instances/${instanceId}/backups`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.is_transitional) ? POLL_MS : false,
  });
}

export function dbBackupsQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "backups"),
    queryFn: () => apiFetch<DbBackupsResponse>(`${BASE}/backups`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.is_transitional) ? POLL_MS : false,
  });
}

export function dbBackupQuery(projectId: string, backupId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "backup", backupId),
    queryFn: () => apiFetch<DbBackupDetail>(`${BASE}/backups/${backupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function dbConfigurationsQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "configurations"),
    queryFn: () => apiFetch<DbConfigurationsResponse>(`${BASE}/configurations`),
    staleTime: staleTimes.list,
  });
}

export function dbConfigurationQuery(
  projectId: string,
  configurationId: string,
) {
  return queryOptions({
    queryKey: troveKey(projectId, "configuration", configurationId),
    queryFn: () =>
      apiFetch<DbConfigurationDetail>(
        `${BASE}/configurations/${configurationId}`,
      ),
    staleTime: staleTimes.detail,
  });
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: troveKey(projectId) });
}

function useSimpleMutation<TArgs, TResult>(
  projectId: string,
  fn: (args: TArgs) => Promise<TResult>,
) {
  const invalidate = useInvalidate(projectId);
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export function useLaunchInstance(projectId: string) {
  return useSimpleMutation(projectId, (body: DbLaunchRequest) =>
    apiFetch<DbInstance>(`${BASE}/instances`, { method: "POST", json: body }),
  );
}

export function useUpdateInstance(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      allowed_cidrs?: string[];
    }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}`, {
        method: "PATCH",
        json: body,
      }),
  );
}

export function useDeleteInstance(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/instances/${id}`, { method: "DELETE" }),
  );
}

export function useResizeVolume(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, size }: { id: string; size: number }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/resize-volume`, {
        method: "POST",
        json: { size },
      }),
  );
}

export function useResizeInstance(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, flavor }: { id: string; flavor: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/resize`, {
        method: "POST",
        json: { flavor },
      }),
  );
}

export function useUpgradeInstance(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, versionId }: { id: string; versionId: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/upgrade`, {
        method: "POST",
        json: { version_id: versionId },
      }),
  );
}

export function useRestartInstance(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<unknown>(`${BASE}/instances/${id}/restart`, { method: "POST" }),
  );
}

export function useAttachConfiguration(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, configurationId }: { id: string; configurationId: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/configuration`, {
        method: "POST",
        json: { configuration_id: configurationId },
      }),
  );
}

export function useDetachConfiguration(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<unknown>(`${BASE}/instances/${id}/configuration`, {
      method: "DELETE",
    }),
  );
}

export function useEnableRoot(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<{ id: string; name: string | null; password: string | null }>(
      `${BASE}/instances/${id}/root`,
      { method: "POST" },
    ),
  );
}

export function useCreateUser(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      ...body
    }: {
      instanceId: string;
      name: string;
      password: string;
      host?: string;
      databases?: string[];
    }) =>
      apiFetch<unknown>(`${BASE}/instances/${instanceId}/users`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useDeleteUser(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      name,
      host,
    }: {
      instanceId: string;
      name: string;
      host: string;
    }) =>
      apiFetch<void>(
        `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}?host=${encodeURIComponent(host)}`,
        { method: "DELETE" },
      ),
  );
}

export function useGrantAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      name,
      host,
      databases,
    }: {
      instanceId: string;
      name: string;
      host: string;
      databases: string[];
    }) =>
      apiFetch<unknown>(
        `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}/access?host=${encodeURIComponent(host)}`,
        { method: "PUT", json: { databases } },
      ),
  );
}

export function useRevokeAccess(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      name,
      host,
      database,
    }: {
      instanceId: string;
      name: string;
      host: string;
      database: string;
    }) =>
      apiFetch<void>(
        `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}/access/${encodeURIComponent(database)}?host=${encodeURIComponent(host)}`,
        { method: "DELETE" },
      ),
  );
}

export function useCreateDatabase(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      ...body
    }: {
      instanceId: string;
      name: string;
      character_set?: string;
      collate?: string;
    }) =>
      apiFetch<unknown>(`${BASE}/instances/${instanceId}/databases`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useDeleteDatabase(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ instanceId, name }: { instanceId: string; name: string }) =>
      apiFetch<void>(
        `${BASE}/instances/${instanceId}/databases/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      ),
  );
}

export function useCreateBackup(projectId: string) {
  return useSimpleMutation(
    projectId,
    (body: {
      name: string;
      instance_id: string;
      description?: string;
      parent_id?: string;
    }) => apiFetch<DbBackup>(`${BASE}/backups`, { method: "POST", json: body }),
  );
}

export function useDeleteBackup(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/backups/${id}`, { method: "DELETE" }),
  );
}

export function useCreateConfiguration(projectId: string) {
  return useSimpleMutation(
    projectId,
    (body: {
      name: string;
      description?: string;
      datastore: string;
      version: string;
    }) =>
      apiFetch<DbConfiguration>(`${BASE}/configurations`, {
        method: "POST",
        json: body,
      }),
  );
}

export function useSetConfigurationValues(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({ id, values }: { id: string; values: Record<string, string> }) =>
      apiFetch<{ id: string; values: Record<string, unknown> }>(
        `${BASE}/configurations/${id}/values`,
        { method: "PUT", json: { values } },
      ),
  );
}

export function useDeleteConfiguration(projectId: string) {
  return useSimpleMutation(projectId, (id: string) =>
    apiFetch<void>(`${BASE}/configurations/${id}`, { method: "DELETE" }),
  );
}
