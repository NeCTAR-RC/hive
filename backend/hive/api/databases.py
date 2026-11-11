"""Database (Trove) endpoints."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Response

from hive.api.replies import attachment
from hive.deps import ContextDep
from hive.schemas.databases import (
    AttachConfiguration,
    ConfigurationCreate,
    ConfigurationValues,
    DatabaseBackupCreate,
    DatabaseCreate,
    DatabaseLogAction,
    DatabaseResizeInstance,
    InstanceLaunch,
    InstanceUpdate,
    ResizeVolume,
    UpgradeInstance,
    UserAccess,
    UserCreate,
    UserUpdate,
)
from hive.schemas.responses import Items
from hive.schemas.responses.databases import (
    DbAccessGranted,
    DbBackup,
    DbBackupDetail,
    DbBackupsResponse,
    DbConfigDefault,
    DbConfiguration,
    DbConfigurationAttached,
    DbConfigurationDetail,
    DbConfigurationsResponse,
    DbConfigurationValues,
    DbCreated,
    DbDatabase,
    DbDatabaseAccess,
    DbInstance,
    DbInstanceDetail,
    DbInstanceRef,
    DbInstanceResized,
    DbInstancesResponse,
    DbInstanceUpgraded,
    DbLog,
    DbLogContents,
    DbOptions,
    DbResizeFlavors,
    DbRootEnabled,
    DbRootStatus,
    DbUpgradeTargets,
    DbUser,
    DbUserUpdated,
    DbVolumeResized,
)
from hive.services import databases

# A Trove guest log name (general, slow_query, error, ...); it also lands
# in a Content-Disposition header, so nothing else is accepted.
LogName = Annotated[str, Path(pattern=r"^[A-Za-z0-9_.-]+$", max_length=255)]

router = APIRouter(prefix="/databases", tags=["databases"])


@router.get("/options")
async def options(ctx: ContextDep) -> DbOptions:
    return await databases.options(ctx)


@router.get("/instances")
async def list_instances(ctx: ContextDep) -> DbInstancesResponse:
    return await databases.list_instances(ctx)


@router.post("/instances", status_code=202)
async def launch(body: InstanceLaunch, ctx: ContextDep) -> DbInstance:
    return await databases.launch(ctx, body)


@router.get("/instances/{instance_id}")
async def get_instance(instance_id: str, ctx: ContextDep) -> DbInstanceDetail:
    return await databases.get_instance(ctx, instance_id)


@router.patch("/instances/{instance_id}")
async def update_instance(
    instance_id: str, body: InstanceUpdate, ctx: ContextDep
) -> DbInstanceRef:
    return await databases.update_instance(ctx, instance_id, body)


@router.delete("/instances/{instance_id}", status_code=204)
async def delete_instance(instance_id: str, ctx: ContextDep) -> Response:
    await databases.delete_instance(ctx, instance_id)
    return Response(status_code=204)


@router.post("/instances/{instance_id}/resize-volume", status_code=202)
async def resize_volume(
    instance_id: str, body: ResizeVolume, ctx: ContextDep
) -> DbVolumeResized:
    return await databases.resize_volume(ctx, instance_id, body)


@router.get("/instances/{instance_id}/resize-flavors")
async def resize_flavors(instance_id: str, ctx: ContextDep) -> DbResizeFlavors:
    return await databases.resize_flavors(ctx, instance_id)


@router.post("/instances/{instance_id}/resize", status_code=202)
async def resize_instance(
    instance_id: str, body: DatabaseResizeInstance, ctx: ContextDep
) -> DbInstanceResized:
    return await databases.resize_instance(ctx, instance_id, body)


@router.get("/instances/{instance_id}/configuration-defaults")
async def configuration_defaults(
    instance_id: str, ctx: ContextDep
) -> Items[DbConfigDefault]:
    return Items[DbConfigDefault](
        items=await databases.configuration_defaults(ctx, instance_id)
    )


@router.get("/instances/{instance_id}/logs")
async def list_logs(instance_id: str, ctx: ContextDep) -> Items[DbLog]:
    return Items[DbLog](items=await databases.list_logs(ctx, instance_id))


@router.post("/instances/{instance_id}/logs/{name}/actions")
async def log_action(
    instance_id: str, name: LogName, body: DatabaseLogAction, ctx: ContextDep
) -> DbLog:
    return await databases.log_action(ctx, instance_id, name, body)


@router.get("/instances/{instance_id}/logs/{name}/contents")
async def log_contents(
    instance_id: str,
    name: LogName,
    ctx: ContextDep,
    lines: Annotated[int, Query(ge=0, le=100000)] = 50,
) -> DbLogContents:
    return await databases.log_contents(ctx, instance_id, name, lines)


@router.get("/instances/{instance_id}/logs/{name}/download")
async def log_download(
    instance_id: str, name: LogName, ctx: ContextDep
) -> Response:
    return attachment(await databases.log_download(ctx, instance_id, name))


@router.get("/instances/{instance_id}/upgrade-targets")
async def upgrade_targets(
    instance_id: str, ctx: ContextDep
) -> DbUpgradeTargets:
    return await databases.upgrade_targets(ctx, instance_id)


@router.post("/instances/{instance_id}/upgrade", status_code=202)
async def upgrade_instance(
    instance_id: str, body: UpgradeInstance, ctx: ContextDep
) -> DbInstanceUpgraded:
    return await databases.upgrade_instance(ctx, instance_id, body)


@router.post("/instances/{instance_id}/restart", status_code=202)
async def restart_instance(instance_id: str, ctx: ContextDep) -> DbInstanceRef:
    return await databases.restart_instance(ctx, instance_id)


@router.post("/instances/{instance_id}/configuration", status_code=202)
async def attach_configuration(
    instance_id: str, body: AttachConfiguration, ctx: ContextDep
) -> DbConfigurationAttached:
    return await databases.attach_configuration(ctx, instance_id, body)


@router.delete("/instances/{instance_id}/configuration", status_code=202)
async def detach_configuration(
    instance_id: str, ctx: ContextDep
) -> DbInstanceRef:
    return await databases.detach_configuration(ctx, instance_id)


@router.get("/instances/{instance_id}/root")
async def root_status(instance_id: str, ctx: ContextDep) -> DbRootStatus:
    return await databases.root_status(ctx, instance_id)


@router.post("/instances/{instance_id}/root")
async def enable_root(instance_id: str, ctx: ContextDep) -> DbRootEnabled:
    return await databases.enable_root(ctx, instance_id)


@router.get("/instances/{instance_id}/backups")
async def instance_backups(
    instance_id: str, ctx: ContextDep
) -> Items[DbBackup]:
    return Items[DbBackup](
        items=await databases.instance_backups(ctx, instance_id)
    )


@router.get("/instances/{instance_id}/users")
async def list_users(instance_id: str, ctx: ContextDep) -> Items[DbUser]:
    return Items[DbUser](items=await databases.list_users(ctx, instance_id))


@router.post("/instances/{instance_id}/users", status_code=202)
async def create_user(
    instance_id: str, body: UserCreate, ctx: ContextDep
) -> DbCreated:
    return await databases.create_user(ctx, instance_id, body)


@router.patch("/instances/{instance_id}/users/{name}", status_code=202)
async def update_user(
    instance_id: str,
    name: str,
    body: UserUpdate,
    ctx: ContextDep,
    host: str | None = None,
) -> DbUserUpdated:
    return await databases.update_user(ctx, instance_id, name, host, body)


@router.delete("/instances/{instance_id}/users/{name}", status_code=204)
async def delete_user(
    instance_id: str, name: str, ctx: ContextDep, host: str | None = None
) -> Response:
    await databases.delete_user(ctx, instance_id, name, host)
    return Response(status_code=204)


@router.get("/instances/{instance_id}/users/{name}/access")
async def user_access(
    instance_id: str, name: str, ctx: ContextDep, host: str | None = None
) -> Items[DbDatabaseAccess]:
    return Items[DbDatabaseAccess](
        items=await databases.user_access(ctx, instance_id, name, host)
    )


@router.put("/instances/{instance_id}/users/{name}/access", status_code=202)
async def grant_access(
    instance_id: str,
    name: str,
    body: UserAccess,
    ctx: ContextDep,
    host: str | None = None,
) -> DbAccessGranted:
    return await databases.grant_access(ctx, instance_id, name, host, body)


@router.delete(
    "/instances/{instance_id}/users/{name}/access/{database}", status_code=204
)
async def revoke_access(
    instance_id: str,
    name: str,
    database: str,
    ctx: ContextDep,
    host: str | None = None,
) -> Response:
    await databases.revoke_access(ctx, instance_id, name, host, database)
    return Response(status_code=204)


@router.get("/instances/{instance_id}/databases")
async def list_databases(
    instance_id: str, ctx: ContextDep
) -> Items[DbDatabase]:
    return Items[DbDatabase](
        items=await databases.list_databases(ctx, instance_id)
    )


@router.post("/instances/{instance_id}/databases", status_code=202)
async def create_database(
    instance_id: str, body: DatabaseCreate, ctx: ContextDep
) -> DbCreated:
    return await databases.create_database(ctx, instance_id, body)


@router.delete("/instances/{instance_id}/databases/{name}", status_code=204)
async def delete_database(
    instance_id: str, name: str, ctx: ContextDep
) -> Response:
    await databases.delete_database(ctx, instance_id, name)
    return Response(status_code=204)


@router.get("/backups")
async def list_backups(ctx: ContextDep) -> DbBackupsResponse:
    return await databases.list_backups(ctx)


@router.post("/backups", status_code=202)
async def create_backup(
    body: DatabaseBackupCreate, ctx: ContextDep
) -> DbBackup:
    return await databases.create_backup(ctx, body)


@router.get("/backups/{backup_id}")
async def get_backup(backup_id: str, ctx: ContextDep) -> DbBackupDetail:
    return await databases.get_backup(ctx, backup_id)


@router.delete("/backups/{backup_id}", status_code=204)
async def delete_backup(backup_id: str, ctx: ContextDep) -> Response:
    await databases.delete_backup(ctx, backup_id)
    return Response(status_code=204)


@router.get("/configurations")
async def list_configurations(ctx: ContextDep) -> DbConfigurationsResponse:
    return await databases.list_configurations(ctx)


@router.post("/configurations", status_code=201)
async def create_configuration(
    body: ConfigurationCreate, ctx: ContextDep
) -> DbConfiguration:
    return await databases.create_configuration(ctx, body)


@router.get("/configurations/{configuration_id}")
async def get_configuration(
    configuration_id: str, ctx: ContextDep
) -> DbConfigurationDetail:
    return await databases.get_configuration(ctx, configuration_id)


@router.put("/configurations/{configuration_id}/values")
async def set_configuration_values(
    configuration_id: str, body: ConfigurationValues, ctx: ContextDep
) -> DbConfigurationValues:
    return await databases.set_configuration_values(
        ctx, configuration_id, body
    )


@router.delete("/configurations/{configuration_id}", status_code=204)
async def delete_configuration(
    configuration_id: str, ctx: ContextDep
) -> Response:
    await databases.delete_configuration(ctx, configuration_id)
    return Response(status_code=204)
