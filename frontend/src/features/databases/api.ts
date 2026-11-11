// Queries and mutations for the Database panels (Trove), keyed by
// `queryKeys.databases`. Lists poll while anything is busy, and each write
// refreshes only what it can change (`databaseWrites`).
import { queryOptions, useMutation } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api/client";
import type { Items } from "../../lib/api/types/common";
import type {
  DbBackup,
  DbBackupDetail,
  DbBackupsResponse,
  DbConfigDefault,
  DbConfiguration,
  DbConfigurationDetail,
  DbConfigurationsResponse,
  DbConfigurationValues,
  DbInstance,
  DbInstanceDetail,
  DbInstancesResponse,
  DbLaunchRequest,
  DbLog,
  DbLogActionRequest,
  DbLogContents,
  DbOptions,
  DbResizeFlavors,
  DbRootEnabled,
  DbRootStatus,
  DbUpgradeTargets,
  DbUser,
  DbUserUpdated,
} from "../../lib/api/types/databases";
import { useInvalidate } from "../../lib/hooks/useInvalidate";
import { getJson, pollWhile, staleTimes } from "../../lib/queries";
import { queryKeys, type ProjectKeyOf } from "../../lib/queryKeys";

const keys = queryKeys.databases;

const BASE = "/api/databases";

/** A sub-resource of one instance (its users, databases, logs, root). */
function instancePart(instanceId: string, part: string): ProjectKeyOf {
  return (projectId) => [...keys.instances.detail(projectId, instanceId), part];
}

/** One instance: the instance list and the instance's own records. */
function instanceWrites(instanceId: string): ProjectKeyOf[] {
  return [
    keys.instances.list,
    (projectId) => keys.instances.detail(projectId, instanceId),
  ];
}

/**
 * What each kind of Trove write marks stale, so a change refreshes the
 * data it can affect and nothing else. An instance's sub-resources (users
 * and their access, databases, logs, root, backups) are keyed under its
 * detail, so refreshing the instance refreshes them too.
 */
export const databaseWrites = {
  /** Launching or deleting instances: lists, quotas and choices all move. */
  everything: [keys.service.all],
  /** A change to one instance (resize, upgrade, rename, restart). */
  instance: instanceWrites,
  /** Attaching or detaching groups: instances and the groups' instances. */
  configurationLinks: [keys.instances.all, keys.configurations.all],
  /** The values of one configuration group. */
  configurationValues: (configurationId: string): ProjectKeyOf[] => [
    (projectId) => keys.configurations.detail(projectId, configurationId),
  ],
  /** Creating or deleting groups: the group list and the launch choices. */
  configurations: [keys.configurations.all, keys.options.all],
  /** An instance's users and each user's access. */
  users: (instanceId: string): ProjectKeyOf[] => [
    instancePart(instanceId, "users"),
  ],
  /** An instance's databases, which its users' access lists name. */
  databases: (instanceId: string): ProjectKeyOf[] => [
    instancePart(instanceId, "databases"),
    instancePart(instanceId, "users"),
  ],
  /** An instance's guest logs and their contents. */
  logs: (instanceId: string): ProjectKeyOf[] => [
    instancePart(instanceId, "logs"),
  ],
  /** Root access of one instance. */
  root: (instanceId: string): ProjectKeyOf[] => [
    instancePart(instanceId, "root"),
  ],
  /**
   * A new backup of one instance: the backup lists, the instance (its
   * status turns to backing up) and the launch choices (restore sources).
   */
  backup: (instanceId: string): ProjectKeyOf[] => [
    keys.backups.all,
    ...instanceWrites(instanceId),
    keys.options.all,
  ],
  /**
   * Deleted backups: the backup lists, every instance's backups tab and
   * the launch choices.
   */
  backups: [keys.backups.all, keys.instances.all, keys.options.all],
} as const;

export function dbOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.options.all(projectId),
    queryFn: getJson<DbOptions>(`${BASE}/options`),
    staleTime: staleTimes.list,
  });
}

export function dbInstancesQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.instances.list(projectId),
    queryFn: getJson<DbInstancesResponse>(`${BASE}/instances`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((i) => i.is_transitional),
      ),
  });
}

export function dbInstanceQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: keys.instances.detail(projectId, instanceId),
    queryFn: getJson<DbInstanceDetail>(`${BASE}/instances/${instanceId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function dbUpgradeTargetsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "upgrade-targets",
    ],
    queryFn: getJson<DbUpgradeTargets>(
      `${BASE}/instances/${instanceId}/upgrade-targets`,
    ),
    staleTime: staleTimes.static,
  });
}

export function dbResizeFlavorsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "resize-flavors",
    ],
    queryFn: getJson<DbResizeFlavors>(
      `${BASE}/instances/${instanceId}/resize-flavors`,
    ),
    staleTime: staleTimes.static,
  });
}

export function dbConfigDefaultsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "configuration-defaults",
    ],
    queryFn: getJson<Items<DbConfigDefault>>(
      `${BASE}/instances/${instanceId}/configuration-defaults`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function dbLogsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "logs"],
    queryFn: getJson<Items<DbLog>>(`${BASE}/instances/${instanceId}/logs`),
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
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "logs",
      name,
      lines,
    ],
    queryFn: getJson<DbLogContents>(
      `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/contents`,
      { lines },
    ),
    staleTime: staleTimes.detail,
  });
}

export function logDownloadUrl(instanceId: string, name: string): string {
  return `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/download`;
}

export function dbRootQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "root"],
    queryFn: getJson<DbRootStatus>(`${BASE}/instances/${instanceId}/root`),
    staleTime: staleTimes.detail,
  });
}

export function dbUsersQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "users"],
    queryFn: getJson<Items<DbUser>>(`${BASE}/instances/${instanceId}/users`),
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
    queryKey: [
      ...keys.instances.detail(projectId, instanceId),
      "users",
      name,
      host,
      "access",
    ],
    queryFn: getJson<Items<{ name: string | null; granted: boolean }>>(
      `${BASE}/instances/${instanceId}/users/${encodeURIComponent(name)}/access`,
      { host },
    ),
    staleTime: staleTimes.none,
  });
}

export function dbDatabasesQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "databases"],
    queryFn: getJson<Items<{ name: string | null }>>(
      `${BASE}/instances/${instanceId}/databases`,
    ),
    staleTime: staleTimes.detail,
  });
}

export function dbInstanceBackupsQuery(projectId: string, instanceId: string) {
  return queryOptions({
    queryKey: [...keys.instances.detail(projectId, instanceId), "backups"],
    queryFn: getJson<Items<DbBackup>>(
      `${BASE}/instances/${instanceId}/backups`,
    ),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((b) => b.is_transitional),
      ),
  });
}

export function dbBackupsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.backups.list(projectId),
    queryFn: getJson<DbBackupsResponse>(`${BASE}/backups`),
    staleTime: staleTimes.list,
    refetchInterval: (query) =>
      pollWhile(
        query,
        query.state.data?.items.some((b) => b.is_transitional),
      ),
  });
}

export function dbBackupQuery(projectId: string, backupId: string) {
  return queryOptions({
    queryKey: keys.backups.detail(projectId, backupId),
    queryFn: getJson<DbBackupDetail>(`${BASE}/backups/${backupId}`),
    staleTime: staleTimes.detail,
    refetchInterval: (query) =>
      pollWhile(query, query.state.data?.is_transitional),
  });
}

export function dbConfigurationsQuery(projectId: string) {
  return queryOptions({
    queryKey: keys.configurations.list(projectId),
    queryFn: getJson<DbConfigurationsResponse>(`${BASE}/configurations`),
    staleTime: staleTimes.list,
  });
}

export function dbConfigurationQuery(
  projectId: string,
  configurationId: string,
) {
  return queryOptions({
    queryKey: keys.configurations.detail(projectId, configurationId),
    queryFn: getJson<DbConfigurationDetail>(
      `${BASE}/configurations/${configurationId}`,
    ),
    staleTime: staleTimes.detail,
  });
}

/**
 * A mutation that, once it settles (a failed write may still have reached
 * Trove), refreshes what `writes` names for its arguments. The refetch is
 * not awaited, so a dialog closes as soon as Trove has answered.
 */
function useSimpleMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  writes: (args: TArgs) => readonly ProjectKeyOf[],
) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: fn,
    onSettled: (_data, _error, args) => void invalidate(...writes(args)),
  });
}

export function useLaunchInstance() {
  return useSimpleMutation(
    (body: DbLaunchRequest) =>
      apiFetch<DbInstance>(`${BASE}/instances`, { method: "POST", json: body }),
    () => databaseWrites.everything,
  );
}

export function useUpdateInstance() {
  return useSimpleMutation(
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
    ({ id }) => databaseWrites.instance(id),
  );
}

/** Deletes one database instance; a batch sends it per instance. */
export function deleteDbInstance(instanceId: string) {
  return apiFetch<void>(`${BASE}/instances/${instanceId}`, {
    method: "DELETE",
  });
}

export function useResizeVolume() {
  return useSimpleMutation(
    ({ id, size }: { id: string; size: number }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/resize-volume`, {
        method: "POST",
        json: { size },
      }),
    ({ id }) => databaseWrites.instance(id),
  );
}

export function useResizeInstance() {
  return useSimpleMutation(
    ({ id, flavor }: { id: string; flavor: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/resize`, {
        method: "POST",
        json: { flavor },
      }),
    ({ id }) => databaseWrites.instance(id),
  );
}

export function useUpgradeInstance() {
  return useSimpleMutation(
    ({ id, versionId }: { id: string; versionId: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/upgrade`, {
        method: "POST",
        json: { version_id: versionId },
      }),
    ({ id }) => databaseWrites.instance(id),
  );
}

export type LogAction = DbLogActionRequest["action"];

export function useLogAction() {
  return useSimpleMutation(
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
        `${BASE}/instances/${instanceId}/logs/${encodeURIComponent(name)}/actions`,
        { method: "POST", json: { action } satisfies DbLogActionRequest },
      ),
    ({ instanceId }) => databaseWrites.logs(instanceId),
  );
}

/** Restarts one database instance; a batch sends it per instance. */
export function restartDbInstance(instanceId: string) {
  return apiFetch<unknown>(`${BASE}/instances/${instanceId}/restart`, {
    method: "POST",
  });
}

export function useAttachConfiguration() {
  return useSimpleMutation(
    ({ id, configurationId }: { id: string; configurationId: string }) =>
      apiFetch<unknown>(`${BASE}/instances/${id}/configuration`, {
        method: "POST",
        json: { configuration_id: configurationId },
      }),
    () => databaseWrites.configurationLinks,
  );
}

/** Detaches the configuration group from one database instance. */
export function detachConfiguration(instanceId: string) {
  return apiFetch<unknown>(`${BASE}/instances/${instanceId}/configuration`, {
    method: "DELETE",
  });
}

export function useEnableRoot() {
  return useSimpleMutation(
    (id: string) =>
      apiFetch<DbRootEnabled>(`${BASE}/instances/${id}/root`, {
        method: "POST",
      }),
    (id) => databaseWrites.root(id),
  );
}

export function useCreateUser() {
  return useSimpleMutation(
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
    ({ instanceId }) => databaseWrites.users(instanceId),
  );
}

/** The path of one user of an instance: a user is its name at a host. */
function userPath(instanceId: string, user: DbUser) {
  return `${BASE}/instances/${instanceId}/users/${encodeURIComponent(user.name ?? "")}`;
}

/**
 * Changes a user's name, password or host (trove-dashboard Edit User);
 * only the attributes given are sent.
 */
export function useUpdateUser() {
  return useSimpleMutation(
    ({
      instanceId,
      user,
      ...body
    }: {
      instanceId: string;
      user: DbUser;
      name?: string;
      password?: string;
      host?: string;
    }) =>
      apiFetch<DbUserUpdated>(
        `${userPath(instanceId, user)}?host=${encodeURIComponent(user.host)}`,
        { method: "PATCH", json: body },
      ),
    ({ instanceId }) => databaseWrites.users(instanceId),
  );
}

/** Deletes one user of an instance; a batch sends it per user. */
export function deleteDbUser(instanceId: string, user: DbUser) {
  return apiFetch<void>(
    `${userPath(instanceId, user)}?host=${encodeURIComponent(user.host)}`,
    { method: "DELETE" },
  );
}

/** Gives a user access to one database of the instance. */
export function grantDbAccess(
  instanceId: string,
  user: DbUser,
  database: string,
) {
  return apiFetch<unknown>(
    `${userPath(instanceId, user)}/access?host=${encodeURIComponent(user.host)}`,
    { method: "PUT", json: { databases: [database] } },
  );
}

/** Takes a user's access to one database of the instance away. */
export function revokeDbAccess(
  instanceId: string,
  user: DbUser,
  database: string,
) {
  return apiFetch<void>(
    `${userPath(instanceId, user)}/access/${encodeURIComponent(database)}?host=${encodeURIComponent(user.host)}`,
    { method: "DELETE" },
  );
}

export function useCreateDatabase() {
  return useSimpleMutation(
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
    ({ instanceId }) => databaseWrites.databases(instanceId),
  );
}

/** Deletes one database of an instance; a batch sends it per database. */
export function deleteDatabase(instanceId: string, name: string) {
  return apiFetch<void>(
    `${BASE}/instances/${instanceId}/databases/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export function useCreateBackup() {
  return useSimpleMutation(
    (body: {
      name: string;
      instance_id: string;
      description?: string;
      parent_id?: string;
    }) => apiFetch<DbBackup>(`${BASE}/backups`, { method: "POST", json: body }),
    ({ instance_id }) => databaseWrites.backup(instance_id),
  );
}

/** Deletes one database backup; a batch sends it per backup. */
export function deleteDbBackup(backupId: string) {
  return apiFetch<void>(`${BASE}/backups/${backupId}`, { method: "DELETE" });
}

export function useCreateConfiguration() {
  return useSimpleMutation(
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
    () => databaseWrites.configurations,
  );
}

/** Replaces every value of a configuration group with `values`. */
export function setConfigurationValues(
  configurationId: string,
  values: Record<string, string>,
) {
  return apiFetch<DbConfigurationValues>(
    `${BASE}/configurations/${configurationId}/values`,
    { method: "PUT", json: { values } },
  );
}

export function useSetConfigurationValues() {
  return useSimpleMutation(
    ({ id, values }: { id: string; values: Record<string, string> }) =>
      setConfigurationValues(id, values),
    ({ id }) => databaseWrites.configurationValues(id),
  );
}

/** Deletes one configuration group; a batch sends it per group. */
export function deleteConfiguration(configurationId: string) {
  return apiFetch<void>(`${BASE}/configurations/${configurationId}`, {
    method: "DELETE",
  });
}
