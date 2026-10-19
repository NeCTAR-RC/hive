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
  DbConfigDefault,
  DbConfiguration,
  DbConfigurationDetail,
  DbConfigurationsResponse,
  DbInstance,
  DbInstanceDetail,
  DbInstancesResponse,
  DbLaunchRequest,
  DbLog,
  DbLogContents,
  DbOptions,
  DbResizeFlavors,
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
    queryFn: ({ signal }) => apiFetch<DbOptions>(`${BASE}/options`, { signal }),
    staleTime: staleTimes.list,
  });
}

export function dbInstancesQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instances"),
    queryFn: ({ signal }) =>
      apiFetch<DbInstancesResponse>(`${BASE}/instances`, { signal }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((i) => i.is_transitional) ? POLL_MS : false,
  });
}

export function dbInstanceQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId),
    queryFn: ({ signal }) =>
      apiFetch<DbInstanceDetail>(`${BASE}/instances/${instanceId}`, { signal }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function dbUpgradeTargetsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "upgrade-targets"),
    queryFn: ({ signal }) =>
      apiFetch<{ current: string | null } & Items<DatastoreOption>>(
        `${BASE}/instances/${instanceId}/upgrade-targets`,
        { signal },
      ),
    staleTime: staleTimes.static,
  });
}

export function dbResizeFlavorsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "resize-flavors"),
    queryFn: ({ signal }) =>
      apiFetch<DbResizeFlavors>(
        `${BASE}/instances/${instanceId}/resize-flavors`,
        { signal },
      ),
    staleTime: staleTimes.static,
  });
}

export function dbConfigDefaultsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "defaults"),
    queryFn: ({ signal }) =>
      apiFetch<Items<DbConfigDefault>>(
        `${BASE}/instances/${instanceId}/configuration-defaults`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function dbLogsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "logs"),
    queryFn: ({ signal }) =>
      apiFetch<Items<DbLog>>(`${BASE}/instances/${instanceId}/logs`, {
        signal,
      }),
    staleTime: staleTimes.list,
  });
}

export function dbLogContentsQuery(
  projectId: string,
  instanceId: string,
  name: string,
  lines: number,
) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "log", name, lines),
    queryFn: ({ signal }) =>
      apiFetch<DbLogContents>(
        `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/contents?lines=${lines}`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function logDownloadUrl(instanceId: string, name: string): string {
  return `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/download`;
}

export function dbRootQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "root"),
    queryFn: ({ signal }) =>
      apiFetch<{ id: string; root_enabled: boolean }>(
        `${BASE}/instances/${instanceId}/root`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function dbUsersQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "users"),
    queryFn: ({ signal }) =>
      apiFetch<Items<DbUser>>(`${BASE}/instances/${instanceId}/users`, {
        signal,
      }),
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
    queryFn: ({ signal }) =>
      apiFetch<Items<{ name: string | null; granted: boolean }>>(
        `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}/access?host=${encodeURIComponent(host)}`,
        { signal },
      ),
    staleTime: 0,
  });
}

export function dbDatabasesQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "databases"),
    queryFn: ({ signal }) =>
      apiFetch<Items<{ name: string | null }>>(
        `${BASE}/instances/${instanceId}/databases`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

export function dbInstanceBackupsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "instance", instanceId, "backups"),
    queryFn: ({ signal }) =>
      apiFetch<Items<DbBackup>>(`${BASE}/instances/${instanceId}/backups`, {
        signal,
      }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.is_transitional) ? POLL_MS : false,
  });
}

export function dbBackupsQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "backups"),
    queryFn: ({ signal }) =>
      apiFetch<DbBackupsResponse>(`${BASE}/backups`, { signal }),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      query.state.data?.items.some((b) => b.is_transitional) ? POLL_MS : false,
  });
}

export function dbBackupQuery(projectId: string, backupId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "backup", backupId),
    queryFn: ({ signal }) =>
      apiFetch<DbBackupDetail>(`${BASE}/backups/${backupId}`, { signal }),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      query.state.data?.is_transitional ? POLL_MS : false,
  });
}

export function dbConfigurationsQuery(projectId: string) {
  return queryOptions({
    queryKey: troveKey(projectId, "configurations"),
    queryFn: ({ signal }) =>
      apiFetch<DbConfigurationsResponse>(`${BASE}/configurations`, { signal }),
    staleTime: staleTimes.list,
  });
}

export function dbConfigurationQuery(
  projectId: string,
  configurationId: string,
) {
  return queryOptions({
    queryKey: troveKey(projectId, "configuration", configurationId),
    queryFn: ({ signal }) =>
      apiFetch<DbConfigurationDetail>(
        `${BASE}/configurations/${configurationId}`,
        { signal },
      ),
    staleTime: staleTimes.detail,
  });
}

/** Key suffixes under `troveKey(projectId)` that a mutation changes. */
type Scopes = readonly (readonly unknown[])[];

/** The whole trove tree: for changes that reach most lists. */
const EVERYTHING: Scopes = [[]];

function instanceScopes(id: string): Scopes {
  return [["instances"], ["instance", id]];
}

function useInvalidate(projectId: string) {
  const queryClient = useQueryClient();
  // Not awaited: the mutation settles without waiting for the refetches.
  return (scopes: Scopes) => {
    for (const scope of scopes) {
      void queryClient.invalidateQueries({
        queryKey: troveKey(projectId, ...scope),
      });
    }
  };
}

function useSimpleMutation<TArgs, TResult>(
  projectId: string,
  fn: (args: TArgs) => Promise<TResult>,
  scopes: (args: TArgs) => Scopes = () => EVERYTHING,
) {
  const invalidate = useInvalidate(projectId);
  return useMutation({
    mutationFn: fn,
    onSuccess: (_data, args) => invalidate(scopes(args)),
  });
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
    ({ id }) => instanceScopes(id),
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
    ({ id }) => instanceScopes(id),
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
    ({ id }) => instanceScopes(id),
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
    ({ id }) => instanceScopes(id),
  );
}

export type LogAction = "enable" | "disable" | "publish" | "discard";

export function useLogAction(projectId: string) {
  return useSimpleMutation(
    projectId,
    ({
      instanceId,
      name,
      action,
    }: {
      instanceId: string;
      name: string;
      action: LogAction;
    }) =>
      apiFetch<DbLog>(
        `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/actions/${action}`,
        { method: "POST" },
      ),
    ({ instanceId }) => [
      ["instance", instanceId, "logs"],
      ["instance", instanceId, "log"],
    ],
  );
}

export function useRestartInstance(projectId: string) {
  return useSimpleMutation(
    projectId,
    (id: string) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/restart`, { method: "POST" }),
    (id) => instanceScopes(id),
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
    ({ id }) => [...instanceScopes(id), ["configuration"]],
  );
}

export function useDetachConfiguration(projectId: string) {
  return useSimpleMutation(
    projectId,
    (id: string) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/configuration`, {
        method: "DELETE",
      }),
    (id) => [...instanceScopes(id), ["configuration"]],
  );
}

export function useEnableRoot(projectId: string) {
  return useSimpleMutation(
    projectId,
    (id: string) =>
      apiFetch<{ id: string; name: string | null; password: string | null }>(
        `${BASE}/instances/${id}/root`,
        { method: "POST" },
      ),
    (id) => [["instance", id, "root"]],
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
    ({ instanceId }) => [
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instanceId }) => [
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instanceId }) => [
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instanceId }) => [
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instanceId }) => [
      ["instance", instanceId, "databases"],
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instanceId }) => [
      ["instance", instanceId, "databases"],
      ["instance", instanceId, "users"],
      ["instance", instanceId, "access"],
    ],
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
    ({ instance_id }) => [
      ["backups"],
      ["instance", instance_id, "backups"],
      ["options"],
    ],
  );
}

export function useDeleteBackup(projectId: string) {
  return useSimpleMutation(
    projectId,
    (id: string) =>
      apiFetch<void>(`${BASE}/backups/${id}`, { method: "DELETE" }),
    (id) => [["backups"], ["backup", id], ["instance"], ["options"]],
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
    () => [["configurations"], ["options"]],
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
    ({ id }) => [["configuration", id]],
  );
}

export function useDeleteConfiguration(projectId: string) {
  return useSimpleMutation(
    projectId,
    (id: string) =>
      apiFetch<void>(`${BASE}/configurations/${id}`, { method: "DELETE" }),
    (id) => [["configurations"], ["configuration", id], ["options"]],
  );
}
