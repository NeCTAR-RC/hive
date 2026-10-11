"""Database (Trove): instances, users, databases, backups and
configuration groups."""

import asyncio
from collections.abc import AsyncIterator

from hive.clients.swift import SwiftClient
from hive.clients.trove import TroveClient
from hive.errors import BadRequest, Conflict, HiveError, NotFound
from hive.nectar import databases as rules
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
from hive.services import compute as compute_service
from hive.services.context import Context
from hive.services import network as network_service

STATIC_TTL = 600
STATIC_STALE = 3600
# The log viewer returns at most this much text; the download streams it all.
LOG_VIEW_MAX_CHARS = 4 * 1024**2


def _trove(ctx: Context) -> TroveClient:
    return TroveClient(ctx.http, ctx.settings, ctx.scoped)


async def _flavors(ctx: Context) -> dict[str, dict]:
    async def fetch():
        return [rules.flavor_summary(f) for f in await _trove(ctx).flavors()]

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("trove-flavors"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="trove-flavors",
    )
    return {f["id"]: f for f in result.value if f.get("id")}


async def _version_flavors(
    ctx: Context, datastore_id: str, version_id: str
) -> list[dict]:
    """The flavours Trove associates with one datastore version, by ids."""

    async def fetch():
        specific = await _trove(ctx).flavors(datastore_id, version_id)
        return [rules.flavor_summary(f) for f in specific]

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key(f"trove-flavors:{datastore_id}:{version_id}"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="trove-version-flavors",
    )
    return result.value


async def _flavors_for_version(
    ctx: Context,
    datastore: str | None,
    version: str | None,
    fallback: list[dict],
) -> list[dict]:
    """Flavours for a datastore version named as an instance reports it;
    the plain Trove flavour list when the version is unknown or the
    association call fails."""
    ids = rules.version_ids(await _datastores(ctx), datastore, version)
    if ids is None:
        return fallback
    try:
        return await _version_flavors(ctx, *ids)
    except HiveError:
        return fallback


async def _datastores(ctx: Context) -> list[dict]:
    async def fetch():
        trove = _trove(ctx)
        datastores = await trove.datastores()
        for datastore in datastores:
            if not datastore.get("versions"):
                datastore["versions"] = await trove.datastore_versions(
                    datastore["id"]
                )
        return datastores

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("trove-datastores"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="trove-datastores",
    )
    return result.value


async def _configurations(ctx: Context) -> list[dict]:
    """rctest answers ``GET /configurations`` with 400 when a stored group
    references a retired datastore version; treat that as no groups."""
    try:
        return await _trove(ctx).configurations()
    except HiveError as exc:
        if exc.status in (400, 404):
            return []
        raise


async def limits(ctx: Context) -> dict:
    rows = await _trove(ctx).limits()
    absolute = next((r for r in rows if r.get("verb") == "ABSOLUTE"), {})
    return {
        "max_instances": absolute.get("max_instances"),
        "max_backups": absolute.get("max_backups"),
        "max_volumes": absolute.get("max_volumes"),
        "max_ram": absolute.get("max_ram"),
    }


async def options(ctx: Context) -> dict:
    """Pickers for launch: datastores and versions, flavours per datastore
    version, nova AZs, bootable networks, configuration groups and
    restorable backups."""
    trove = _trove(ctx)
    (
        datastores,
        flavors,
        zones,
        networks,
        configurations,
        backups,
        quota,
    ) = await asyncio.gather(
        _datastores(ctx),
        _flavors(ctx),
        compute_service.availability_zones(ctx),
        network_service.networks_for_purpose(ctx, "boot"),
        _configurations(ctx),
        trove.backups(),
        limits(ctx),
    )
    versions = rules.datastore_options(datastores)
    specific = await asyncio.gather(
        *(
            _version_flavors(
                ctx, str(option["datastore_id"]), str(option["version_id"])
            )
            for option in versions
        ),
        return_exceptions=True,
    )
    per_version: dict[str, list[dict]] = {}
    for option, result in zip(versions, specific, strict=True):
        key = f"{option['datastore']}/{option['version']}"
        if isinstance(result, HiveError):
            per_version[key] = list(flavors.values())
        elif isinstance(result, BaseException):
            raise result
        else:
            per_version[key] = result
    return {
        "datastores": versions,
        "flavors": list(flavors.values()),
        "flavors_by_version": per_version,
        "availability_zones": [z["name"] for z in zones if z.get("available")],
        "networks": [
            {
                "id": n.get("id"),
                "name": n.get("name"),
                "classic": bool(n.get("is_classic")),
            }
            for n in networks
        ],
        "configurations": [
            rules.configuration_summary(c) for c in configurations
        ],
        "backups": [
            rules.backup_summary(b)
            for b in backups
            if b.get("status") in rules.RESTORABLE
        ],
        "quota": quota,
        "default_cidr": rules.DEFAULT_CIDR,
    }


# --- instances -----------------------------------------------------------------


async def list_instances(ctx: Context) -> dict:
    trove = _trove(ctx)
    instances, flavors, quota = await asyncio.gather(
        trove.instances(), _flavors(ctx), limits(ctx)
    )
    items = [rules.instance_summary(i, flavors) for i in instances]
    items.sort(key=lambda i: (i["name"] or "").lower())
    return {"items": items, "quota": quota}


async def get_instance(ctx: Context, instance_id: str) -> dict:
    trove = _trove(ctx)
    instance, flavors = await asyncio.gather(
        trove.instance(instance_id), _flavors(ctx)
    )
    detail = rules.instance_detail(instance, flavors)
    if instance.get("configuration"):
        try:
            config = await trove.configuration(instance["configuration"]["id"])
            detail["configuration"] = rules.configuration_summary(config)
        except HiveError:
            pass
    return detail


async def launch(ctx: Context, data: InstanceLaunch) -> dict:
    trove = _trove(ctx)
    problem = rules.validate_launch(
        name=data.name,
        volume=data.volume,
        datastore=data.datastore,
        version=data.version,
        flavor=data.flavor,
        network=data.network_id,
    )
    if problem:
        raise BadRequest(problem)
    cidrs, problem = rules.validate_cidrs(data.allowed_cidrs)
    if problem:
        raise BadRequest(problem)
    databases = rules.split_databases(data.databases)
    problem = rules.validate_initial_user(data.user, data.password, databases)
    if problem:
        raise BadRequest(problem)
    if data.backup_id:
        backup = await trove.backup(data.backup_id)
        if backup.get("status") not in rules.RESTORABLE:
            raise BadRequest("Only completed backups can be restored.")
    if data.configuration:
        config = await trove.configuration(data.configuration)
        if (
            config.get("datastore_name"),
            config.get("datastore_version_name"),
        ) != (data.datastore, data.version):
            raise BadRequest(
                "The configuration group is for a different datastore version."
            )
    body = rules.launch_body(
        name=data.name,
        flavor=data.flavor,
        volume=data.volume,
        datastore=data.datastore,
        version=data.version,
        network_id=data.network_id,
        availability_zone=data.availability_zone,
        allowed_cidrs=cidrs,
        databases=databases,
        user=data.user,
        password=data.password,
        host=data.host,
        configuration=data.configuration,
        backup_id=data.backup_id,
    )
    created = await trove.create_instance(body)
    return rules.instance_summary(created)


async def update_instance(
    ctx: Context, instance_id: str, data: InstanceUpdate
) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if instance.get("status") not in rules.ACTIVE_STATES:
        raise Conflict("The instance can only be updated while it is active.")
    fields: dict = {}
    if data.name is not None:
        fields["name"] = data.name
    if data.allowed_cidrs is not None:
        cidrs, problem = rules.validate_cidrs(data.allowed_cidrs)
        if problem:
            raise BadRequest(problem)
        fields["access"] = {"allowed_cidrs": cidrs}
    if fields:
        await trove.update_instance(instance_id, fields)
    return {"id": instance_id}


async def resize_volume(
    ctx: Context, instance_id: str, data: ResizeVolume
) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "resize_volume" not in rules.instance_actions(instance):
        raise Conflict(
            "The volume can only be resized while the instance is active."
        )
    current = int((instance.get("volume") or {}).get("size") or 0)
    problem = rules.validate_resize_volume(current, data.size)
    if problem:
        raise BadRequest(problem)
    await trove.instance_action(
        instance_id, {"resize": {"volume": {"size": data.size}}}
    )
    return {"id": instance_id, "size": data.size}


async def resize_flavors(ctx: Context, instance_id: str) -> dict:
    """The flavours an instance can move to: those of its datastore version
    other than the current one."""
    trove = _trove(ctx)
    instance, flavors = await asyncio.gather(
        trove.instance(instance_id), _flavors(ctx)
    )
    current = (instance.get("flavor") or {}).get("id")
    current_id = str(current) if current is not None else None
    datastore = instance.get("datastore") or {}
    candidates = await _flavors_for_version(
        ctx,
        datastore.get("type"),
        datastore.get("version"),
        list(flavors.values()),
    )
    return {
        "current": current_id,
        "datastore": datastore.get("type"),
        "datastore_version": datastore.get("version"),
        "items": rules.resize_candidates(candidates, current_id),
    }


async def resize_instance(
    ctx: Context, instance_id: str, data: ResizeInstance
) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "resize" not in rules.instance_actions(instance):
        raise Conflict(
            "The instance can only be resized while it is active or shut off."
        )
    current = str((instance.get("flavor") or {}).get("id"))
    if data.flavor == current:
        raise BadRequest("Choose a different flavor.")
    datastore = instance.get("datastore") or {}
    allowed = await _flavors_for_version(
        ctx, datastore.get("type"), datastore.get("version"), []
    )
    if allowed and data.flavor not in {f["id"] for f in allowed}:
        raise BadRequest(
            f"That flavor is not available for {datastore.get('type')} {datastore.get('version')}."
        )
    await trove.instance_action(
        instance_id, {"resize": {"flavorRef": data.flavor}}
    )
    return {"id": instance_id, "flavor": data.flavor}


async def upgrade_instance(
    ctx: Context, instance_id: str, data: UpgradeInstance
) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "upgrade" not in rules.instance_actions(instance):
        raise Conflict(
            "The instance can only be upgraded while it is active or shut off."
        )
    await trove.patch_instance(
        instance_id, {"datastore_version": data.version_id}
    )
    return {"id": instance_id, "version_id": data.version_id}


async def restart_instance(ctx: Context, instance_id: str) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "restart" not in rules.instance_actions(instance):
        raise Conflict("The instance cannot be restarted right now.")
    await trove.instance_action(instance_id, {"restart": {}})
    return {"id": instance_id}


async def attach_configuration(
    ctx: Context, instance_id: str, data: AttachConfiguration
) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "attach_configuration" not in rules.instance_actions(instance):
        raise Conflict(
            "A configuration group is already attached or the instance is busy."
        )
    await trove.update_instance(
        instance_id, {"configuration": data.configuration_id}
    )
    return {"id": instance_id, "configuration_id": data.configuration_id}


async def detach_configuration(ctx: Context, instance_id: str) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "detach_configuration" not in rules.instance_actions(instance):
        raise Conflict(
            "No configuration group is attached or the instance is busy."
        )
    await trove.update_instance(instance_id, {"configuration": None})
    return {"id": instance_id}


async def delete_instance(ctx: Context, instance_id: str) -> None:
    await _trove(ctx).delete_instance(instance_id)


async def root_status(ctx: Context, instance_id: str) -> dict:
    return {
        "id": instance_id,
        "root_enabled": await _trove(ctx).root_status(instance_id),
    }


async def enable_root(ctx: Context, instance_id: str) -> dict:
    """The generated root password is returned once and never logged."""
    trove = _trove(ctx)
    instance = await trove.instance(instance_id)
    if "root" not in rules.instance_actions(instance):
        raise Conflict(
            "Root access can only be managed while the instance is active."
        )
    user = await trove.enable_root(instance_id)
    return {
        "id": instance_id,
        "name": user.get("name"),
        "password": user.get("password"),
    }


async def instance_backups(ctx: Context, instance_id: str) -> dict:
    backups = await _trove(ctx).backups_of(instance_id)
    return {"items": [rules.backup_summary(b) for b in backups]}


async def configuration_defaults(ctx: Context, instance_id: str) -> dict:
    """The Defaults tab: the instance's effective configuration values."""
    values = await _trove(ctx).instance_configuration(instance_id)
    return {"items": rules.configuration_defaults(values)}


# --- guest logs ---------------------------------------------------------------


async def list_logs(ctx: Context, instance_id: str) -> dict:
    logs = await _trove(ctx).logs(instance_id)
    items = [rules.log_summary(log) for log in logs]
    items.sort(key=lambda log: log["name"] or "")
    return {"items": items}


async def log_action(
    ctx: Context, instance_id: str, name: str, action: str
) -> dict:
    try:
        body = rules.log_action_body(name, action)
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    return rules.log_summary(await _trove(ctx).log_action(instance_id, body))


async def _published_parts(
    ctx: Context, instance_id: str, name: str
) -> tuple[dict, SwiftClient, list[dict]]:
    """The log's published parts in its Swift container with their line
    counts (troveclient ``_get_container_info`` then the listing and a
    HEAD per part). The metafile Trove keeps beside the parts is skipped."""
    info = rules.log_summary(
        await _trove(ctx).log_action(instance_id, {"name": name})
    )
    if not info["published"] or not info["container"]:
        raise Conflict(f"Log {name} has not been published yet.")
    swift = SwiftClient(ctx.http, ctx.settings, ctx.scoped)
    objects = await swift.all_objects(info["container"], prefix=info["prefix"])
    parts = [
        o
        for o in objects
        if o.get("name") and o.get("name") != info["metafile"]
    ]
    heads = await asyncio.gather(
        *(swift.object_head(info["container"], p["name"]) for p in parts)
    )
    for part, head in zip(parts, heads, strict=True):
        part["lines"] = int(head.get("x-object-meta-lines") or 0)
    return info, swift, parts


async def _read_part(swift: SwiftClient, container: str, name: str) -> bytes:
    response = await swift.get_object(container, name)
    try:
        if response.status_code == 404:
            raise NotFound(f"Log part {name} is missing from the container.")
        if response.status_code >= 400:
            raise BadRequest(
                f"Log part {name} could not be read ({response.status_code})."
            )
        return await response.aread()
    finally:
        await response.aclose()


async def log_contents(
    ctx: Context, instance_id: str, name: str, lines: int
) -> dict:
    """The last ``lines`` lines of a published log (0 for all of it), capped
    for the viewer."""
    info, swift, parts = await _published_parts(ctx, instance_id, name)
    names, keep = rules.select_log_parts(parts, lines)
    first_lines = next(
        (
            int(p.get("lines") or 0)
            for p in parts
            if p.get("name") == (names[0] if names else None)
        ),
        0,
    )
    chunks: list[str] = []
    total = 0
    truncated = False
    for index, part in enumerate(names):
        text = (await _read_part(swift, info["container"], part)).decode(
            "utf-8", errors="replace"
        )
        if index == 0 and keep:
            text = "\n".join(text.splitlines()[-keep:]) + "\n"
        if total + len(text) > LOG_VIEW_MAX_CHARS:
            chunks.append(text[: LOG_VIEW_MAX_CHARS - total])
            truncated = True
            break
        chunks.append(text)
        total += len(text)
    return {
        "name": name,
        "lines": lines,
        "text": "".join(chunks),
        "partial": len(names) < len(parts)
        or (keep > 0 and first_lines > keep),
        "truncated": truncated,
        "parts": len(parts),
        "published": info["published"],
    }


async def log_download(
    ctx: Context, instance_id: str, name: str
) -> AsyncIterator[bytes]:
    """Every published part of a log in order, for the download."""
    info, swift, parts = await _published_parts(ctx, instance_id, name)
    names, _ = rules.select_log_parts(parts, 0)

    async def stream() -> AsyncIterator[bytes]:
        for part in names:
            yield await _read_part(swift, info["container"], part)

    return stream()


async def upgrade_targets(ctx: Context, instance_id: str) -> dict:
    """Versions of the instance's datastore other than the current one
    (``9683581``)."""
    trove = _trove(ctx)
    instance, datastores = await asyncio.gather(
        trove.instance(instance_id), _datastores(ctx)
    )
    current = instance.get("datastore") or {}
    options = [
        o
        for o in rules.datastore_options(datastores)
        if o["datastore"] == current.get("type")
        and o["version"] != current.get("version")
    ]
    return {"current": current.get("version"), "items": options}


# --- users and databases -------------------------------------------------------


async def list_users(ctx: Context, instance_id: str) -> dict:
    users = await _trove(ctx).users(instance_id)
    return {"items": [rules.user_summary(u) for u in users]}


async def create_user(
    ctx: Context, instance_id: str, data: UserCreate
) -> dict:
    body: dict = {"name": data.name, "password": data.password}
    if data.host:
        body["host"] = data.host
    if data.databases:
        body["databases"] = [{"name": d} for d in data.databases]
    await _trove(ctx).create_users(instance_id, [body])
    return {"name": data.name}


async def delete_user(
    ctx: Context, instance_id: str, name: str, host: str | None
) -> None:
    await _trove(ctx).delete_user(instance_id, rules.user_path(name, host))


async def user_access(
    ctx: Context, instance_id: str, name: str, host: str | None
) -> dict:
    trove = _trove(ctx)
    path = rules.user_path(name, host)
    granted, databases = await asyncio.gather(
        trove.user_access(instance_id, path), trove.databases(instance_id)
    )
    names = {d.get("name") for d in granted}
    return {
        "items": [
            {"name": d.get("name"), "granted": d.get("name") in names}
            for d in databases
        ],
    }


async def grant_access(
    ctx: Context,
    instance_id: str,
    name: str,
    host: str | None,
    data: UserAccess,
) -> dict:
    await _trove(ctx).grant_access(
        instance_id, rules.user_path(name, host), data.databases
    )
    return {"name": name, "databases": data.databases}


async def revoke_access(
    ctx: Context, instance_id: str, name: str, host: str | None, database: str
) -> None:
    await _trove(ctx).revoke_access(
        instance_id, rules.user_path(name, host), database
    )


async def list_databases(ctx: Context, instance_id: str) -> dict:
    databases = await _trove(ctx).databases(instance_id)
    return {"items": [{"name": d.get("name")} for d in databases]}


async def create_database(
    ctx: Context, instance_id: str, data: DatabaseCreate
) -> dict:
    body: dict = {"name": data.name}
    if data.character_set:
        body["character_set"] = data.character_set
    if data.collate:
        body["collate"] = data.collate
    await _trove(ctx).create_databases(instance_id, [body])
    return {"name": data.name}


async def delete_database(ctx: Context, instance_id: str, name: str) -> None:
    await _trove(ctx).delete_database(instance_id, name)


# --- backups -------------------------------------------------------------------


async def list_backups(ctx: Context) -> dict:
    trove = _trove(ctx)
    backups, instances, quota = await asyncio.gather(
        trove.backups(), trove.instances(), limits(ctx)
    )
    names = {i.get("id"): i.get("name") for i in instances}
    items = [rules.backup_summary(b, names) for b in backups]
    items.sort(key=lambda b: b["created"] or "", reverse=True)
    return {
        "items": items,
        "quota": quota,
        "instances": [
            {"id": i.get("id"), "name": i.get("name")}
            for i in instances
            if i.get("status") in rules.ACTIVE_STATES
        ],
    }


async def get_backup(ctx: Context, backup_id: str) -> dict:
    trove = _trove(ctx)
    backup = await trove.backup(backup_id)
    detail = rules.backup_summary(backup)
    if backup.get("instance_id"):
        try:
            instance = await trove.instance(backup["instance_id"])
            detail["instance_name"] = instance.get("name")
            detail["instance_status"] = instance.get("status")
        except HiveError:
            pass
    if backup.get("parent_id"):
        try:
            parent = await trove.backup(backup["parent_id"])
            detail["parent_name"] = parent.get("name")
        except HiveError:
            pass
    return detail


async def create_backup(ctx: Context, data: BackupCreate) -> dict:
    trove = _trove(ctx)
    instance = await trove.instance(data.instance_id)
    if instance.get("status") not in rules.ACTIVE_STATES:
        raise Conflict("Backups can only be taken from an active instance.")
    if data.parent_id:
        parent = await trove.backup(data.parent_id)
        if parent.get("status") != "COMPLETED":
            raise BadRequest("The parent backup must be completed.")
    created = await trove.create_backup(
        rules.backup_body(
            data.name, data.instance_id, data.description, data.parent_id
        )
    )
    return rules.backup_summary(
        created, {instance.get("id"): instance.get("name")}
    )


async def delete_backup(ctx: Context, backup_id: str) -> None:
    await _trove(ctx).delete_backup(backup_id)


# --- configuration groups ------------------------------------------------------


async def list_configurations(ctx: Context) -> dict:
    configurations, datastores = await asyncio.gather(
        _configurations(ctx), _datastores(ctx)
    )
    items = [rules.configuration_summary(c) for c in configurations]
    items.sort(key=lambda c: (c["name"] or "").lower())
    return {"items": items, "datastores": rules.datastore_options(datastores)}


async def get_configuration(ctx: Context, configuration_id: str) -> dict:
    trove = _trove(ctx)
    config = await trove.configuration(configuration_id)
    detail = rules.configuration_summary(config)
    instances = await trove.configuration_instances(configuration_id)
    detail["instances"] = [
        {"id": i.get("id"), "name": i.get("name")} for i in instances
    ]
    try:
        params = await trove.configuration_parameters(
            config.get("datastore_name") or "",
            config.get("datastore_version_id") or "",
        )
    except HiveError:
        params = []
    detail["parameters"] = sorted(
        (
            {
                "name": p.get("name"),
                "type": p.get("type"),
                "min": p.get("min"),
                "max": p.get("max"),
                "restart_required": bool(p.get("restart_required")),
            }
            for p in params
        ),
        key=lambda p: p["name"] or "",
    )
    return detail


async def create_configuration(
    ctx: Context, data: ConfigurationCreate
) -> dict:
    created = await _trove(ctx).create_configuration(
        rules.configuration_body(
            data.name, data.description, data.datastore, data.version
        )
    )
    return rules.configuration_summary(created)


async def set_configuration_values(
    ctx: Context, configuration_id: str, data: ConfigurationValues
) -> dict:
    """Replace the group's values, validating each against the datastore
    parameter spec (``config_param_manager.py:155-186``)."""
    trove = _trove(ctx)
    config = await trove.configuration(configuration_id)
    try:
        params = await trove.configuration_parameters(
            config.get("datastore_name") or "",
            config.get("datastore_version_id") or "",
        )
    except HiveError:
        params = []
    specs = {p.get("name"): p for p in params}
    values: dict = {}
    for name, raw in data.values.items():
        spec = specs.get(name)
        if spec is None:
            raise BadRequest(
                f"{name} is not a parameter of this datastore version."
            )
        try:
            values[name] = rules.coerce_parameter(spec, raw)
        except ValueError as exc:
            raise BadRequest(str(exc)) from exc
    await trove.update_configuration(configuration_id, {"values": values})
    return {"id": configuration_id, "values": values}


async def delete_configuration(ctx: Context, configuration_id: str) -> None:
    await _trove(ctx).delete_configuration(configuration_id)
