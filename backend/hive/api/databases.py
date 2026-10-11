"""Database (Trove) endpoints."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
from hive.schemas.databases import (
    AttachConfiguration,
    BackupCreate,
    ConfigurationCreate,
    ConfigurationValues,
    DatabaseCreate,
    InstanceLaunch,
    InstanceUpdate,
    ResizeInstance,
    ResizeVolume,
    UpgradeInstance,
    UserAccess,
    UserCreate,
)
from hive.services import databases
from hive.services.context import Context

router = APIRouter(prefix="/databases", tags=["databases"])
Ctx = Depends(get_context)


@router.get("/options")
async def options(ctx: Context = Ctx):
    return await databases.options(ctx)


@router.get("/instances")
async def list_instances(ctx: Context = Ctx):
    return await databases.list_instances(ctx)


@router.post("/instances", status_code=202)
async def launch(body: InstanceLaunch, ctx: Context = Ctx):
    return await databases.launch(ctx, body)


@router.get("/instances/{instance_id}")
async def get_instance(instance_id: str, ctx: Context = Ctx):
    return await databases.get_instance(ctx, instance_id)


@router.patch("/instances/{instance_id}")
async def update_instance(instance_id: str, body: InstanceUpdate, ctx: Context = Ctx):
    return await databases.update_instance(ctx, instance_id, body)


@router.delete("/instances/{instance_id}", status_code=204)
async def delete_instance(instance_id: str, ctx: Context = Ctx):
    await databases.delete_instance(ctx, instance_id)
    return Response(status_code=204)


@router.post("/instances/{instance_id}/resize-volume", status_code=202)
async def resize_volume(instance_id: str, body: ResizeVolume, ctx: Context = Ctx):
    return await databases.resize_volume(ctx, instance_id, body)


@router.post("/instances/{instance_id}/resize", status_code=202)
async def resize_instance(instance_id: str, body: ResizeInstance, ctx: Context = Ctx):
    return await databases.resize_instance(ctx, instance_id, body)


@router.get("/instances/{instance_id}/upgrade-targets")
async def upgrade_targets(instance_id: str, ctx: Context = Ctx):
    return await databases.upgrade_targets(ctx, instance_id)


@router.post("/instances/{instance_id}/upgrade", status_code=202)
async def upgrade_instance(instance_id: str, body: UpgradeInstance, ctx: Context = Ctx):
    return await databases.upgrade_instance(ctx, instance_id, body)


@router.post("/instances/{instance_id}/restart", status_code=202)
async def restart_instance(instance_id: str, ctx: Context = Ctx):
    return await databases.restart_instance(ctx, instance_id)


@router.post("/instances/{instance_id}/configuration", status_code=202)
async def attach_configuration(instance_id: str, body: AttachConfiguration, ctx: Context = Ctx):
    return await databases.attach_configuration(ctx, instance_id, body)


@router.delete("/instances/{instance_id}/configuration", status_code=202)
async def detach_configuration(instance_id: str, ctx: Context = Ctx):
    return await databases.detach_configuration(ctx, instance_id)


@router.get("/instances/{instance_id}/root")
async def root_status(instance_id: str, ctx: Context = Ctx):
    return await databases.root_status(ctx, instance_id)


@router.post("/instances/{instance_id}/root")
async def enable_root(instance_id: str, ctx: Context = Ctx):
    return await databases.enable_root(ctx, instance_id)


@router.get("/instances/{instance_id}/backups")
async def instance_backups(instance_id: str, ctx: Context = Ctx):
    return await databases.instance_backups(ctx, instance_id)


@router.get("/instances/{instance_id}/users")
async def list_users(instance_id: str, ctx: Context = Ctx):
    return await databases.list_users(ctx, instance_id)


@router.post("/instances/{instance_id}/users", status_code=202)
async def create_user(instance_id: str, body: UserCreate, ctx: Context = Ctx):
    return await databases.create_user(ctx, instance_id, body)


@router.delete("/instances/{instance_id}/users/{name}", status_code=204)
async def delete_user(instance_id: str, name: str, host: str | None = None, ctx: Context = Ctx):
    await databases.delete_user(ctx, instance_id, name, host)
    return Response(status_code=204)


@router.get("/instances/{instance_id}/users/{name}/access")
async def user_access(instance_id: str, name: str, host: str | None = None, ctx: Context = Ctx):
    return await databases.user_access(ctx, instance_id, name, host)


@router.put("/instances/{instance_id}/users/{name}/access", status_code=202)
async def grant_access(
    instance_id: str, name: str, body: UserAccess, host: str | None = None, ctx: Context = Ctx
):
    return await databases.grant_access(ctx, instance_id, name, host, body)


@router.delete("/instances/{instance_id}/users/{name}/access/{database}", status_code=204)
async def revoke_access(
    instance_id: str, name: str, database: str, host: str | None = None, ctx: Context = Ctx
):
    await databases.revoke_access(ctx, instance_id, name, host, database)
    return Response(status_code=204)


@router.get("/instances/{instance_id}/databases")
async def list_databases(instance_id: str, ctx: Context = Ctx):
    return await databases.list_databases(ctx, instance_id)


@router.post("/instances/{instance_id}/databases", status_code=202)
async def create_database(instance_id: str, body: DatabaseCreate, ctx: Context = Ctx):
    return await databases.create_database(ctx, instance_id, body)


@router.delete("/instances/{instance_id}/databases/{name}", status_code=204)
async def delete_database(instance_id: str, name: str, ctx: Context = Ctx):
    await databases.delete_database(ctx, instance_id, name)
    return Response(status_code=204)


@router.get("/backups")
async def list_backups(ctx: Context = Ctx):
    return await databases.list_backups(ctx)


@router.post("/backups", status_code=202)
async def create_backup(body: BackupCreate, ctx: Context = Ctx):
    return await databases.create_backup(ctx, body)


@router.get("/backups/{backup_id}")
async def get_backup(backup_id: str, ctx: Context = Ctx):
    return await databases.get_backup(ctx, backup_id)


@router.delete("/backups/{backup_id}", status_code=204)
async def delete_backup(backup_id: str, ctx: Context = Ctx):
    await databases.delete_backup(ctx, backup_id)
    return Response(status_code=204)


@router.get("/configurations")
async def list_configurations(ctx: Context = Ctx):
    return await databases.list_configurations(ctx)


@router.post("/configurations", status_code=201)
async def create_configuration(body: ConfigurationCreate, ctx: Context = Ctx):
    return await databases.create_configuration(ctx, body)


@router.get("/configurations/{configuration_id}")
async def get_configuration(configuration_id: str, ctx: Context = Ctx):
    return await databases.get_configuration(ctx, configuration_id)


@router.put("/configurations/{configuration_id}/values")
async def set_configuration_values(configuration_id: str, body: ConfigurationValues, ctx: Context = Ctx):
    return await databases.set_configuration_values(ctx, configuration_id, body)


@router.delete("/configurations/{configuration_id}", status_code=204)
async def delete_configuration(configuration_id: str, ctx: Context = Ctx):
    await databases.delete_configuration(ctx, configuration_id)
    return Response(status_code=204)
