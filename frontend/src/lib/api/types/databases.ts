/**
 * Databases (Trove): instances, backups, configuration groups, users and
 * logs.
 *
 * Aliases of the generated contract (`../generated/openapi`); the backend's
 * models are the source of truth.
 */
import type { components } from "../generated/openapi";

type Schemas = components["schemas"];

export type DbFlavor = Schemas["DbFlavor"];
export type DatastoreOption = Schemas["DatastoreOption"];
export type DbQuota = Schemas["DbQuota"];
export type DbInstance = Schemas["DbInstance"];
export type DbInstanceDetail = Schemas["DbInstanceDetail"];
export type DbInstancesResponse = Schemas["DbInstancesResponse"];
export type DbOptions = Schemas["DbOptions"];

/** The launch body (the backend's databases `InstanceLaunch`). */
export type DbLaunchRequest = Schemas["InstanceLaunch"];

export type DbUser = Schemas["DbUser"];
export type DbUserUpdated = Schemas["DbUserUpdated"];
export type DbBackup = Schemas["DbBackup"];
export type DbBackupDetail = Schemas["DbBackupDetail"];
export type DbBackupsResponse = Schemas["DbBackupsResponse"];
export type DbConfiguration = Schemas["DbConfiguration"];
export type DbParameterSpec = Schemas["DbParameterSpec"];
export type DbConfigurationDetail = Schemas["DbConfigurationDetail"];
export type DbConfigurationsResponse = Schemas["DbConfigurationsResponse"];
export type DbResizeFlavors = Schemas["DbResizeFlavors"];
export type DbConfigDefault = Schemas["DbConfigDefault"];
export type DbConfigurationValues = Schemas["DbConfigurationValues"];
export type DbUpgradeTargets = Schemas["DbUpgradeTargets"];
export type DbRootStatus = Schemas["DbRootStatus"];

/** The enabled root user, with its password shown this once only. */
export type DbRootEnabled = Schemas["DbRootEnabled"];
export type DbLog = Schemas["DbLog"];
export type DbLogContents = Schemas["DbLogContents"];

/** The body of `POST .../logs/{name}/actions` (the backend's `DatabaseLogAction`). */
export type DbLogActionRequest = Schemas["DatabaseLogAction"];
