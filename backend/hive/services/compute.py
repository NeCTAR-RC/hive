"""Instances, flavours, images, key pairs and the launch wizard data,
shaped for the SPA with the Nectar rules applied."""

import asyncio
import base64
from collections.abc import AsyncIterable

from hive.cache import policy
from hive.errors import BadRequest, HiveError, NotFound, PayloadTooLarge
from hive.nectar.flavors import PREEMPTIBLE_NOTICE
from hive.nectar.images import ImageRules
from hive.nectar.networks import PURPOSE_BOOT
from hive.schemas.compute import (
    ImageCreate,
    ImageUpdate,
    KeypairCreate,
    LaunchRequest,
    ServerGroupCreate,
    ServerListQuery,
    ServerUpdate,
)
from hive.schemas.responses import AvailabilityZone, Paginated
from hive.schemas.responses.compute import (
    ComputeLimits,
    ConsoleOutput,
    Flavor,
    Image,
    Instance,
    InstanceAction,
    InstanceDetail,
    InstancePort,
    InstanceVolume,
    KeyPair,
    KeyPairCreated,
    KeyPairDetail,
    LaunchOptions,
    LaunchResult,
    RemoteConsole,
    ServerGroup,
    ServerPassword,
)
from hive.services.context import Context
from hive.services import network as network_service
from hive.services import volume_types as volume_type_service
from hive.times import to_utc_iso


# Horizon ``dashboards/project/instances/tables.py:58-69``.
POWER_STATES = {
    0: "NO STATE",
    1: "RUNNING",
    2: "BLOCKED",
    3: "PAUSED",
    4: "SHUTDOWN",
    5: "SHUTOFF",
    6: "CRASHED",
    7: "SUSPENDED",
    8: "FAILED",
    9: "BUILDING",
}


def _addresses(server: dict) -> list[dict]:
    return [
        {
            "network": network,
            "addr": entry.get("addr"),
            "version": entry.get("version"),
            "type": entry.get("OS-EXT-IPS:type"),
            "mac": entry.get("OS-EXT-IPS-MAC:mac_addr"),
        }
        for network, entries in (server.get("addresses") or {}).items()
        for entry in entries
    ]


def server_summary(
    ctx: Context, server: dict, image_names: dict[str, str] | None = None
) -> dict:
    flavor = server.get("flavor") or {}
    image = server.get("image")
    image_id = image.get("id") if isinstance(image, dict) else None
    fault = server.get("fault")
    power = server.get("OS-EXT-STS:power_state")
    return {
        "id": server.get("id"),
        "name": server.get("name"),
        "description": server.get("description"),
        "status": (server.get("status") or "").upper(),
        "power_state": POWER_STATES.get(
            power if isinstance(power, int) else -1, "UNKNOWN"
        ),
        "task_state": server.get("OS-EXT-STS:task_state"),
        "vm_state": server.get("OS-EXT-STS:vm_state"),
        "availability_zone": server.get("OS-EXT-AZ:availability_zone"),
        "created": to_utc_iso(server.get("created")),
        "updated": to_utc_iso(server.get("updated")),
        "locked": server.get("locked", False),
        "host_id": server.get("hostId"),
        "key_name": server.get("key_name"),
        "progress": server.get("progress"),
        "user_id": server.get("user_id"),
        "project_id": server.get("tenant_id"),
        "flavor": ctx.flavor_rules.summary(flavor) if flavor else None,
        "image": (
            {
                "id": image_id,
                "name": (image_names or {}).get(image_id),
            }
            if image_id
            else None
        ),
        "boot_from_volume": not image_id,
        "addresses": _addresses(server),
        "security_groups": [
            g.get("name") for g in server.get("security_groups") or []
        ],
        "volumes_attached": [
            v.get("id")
            for v in server.get("os-extended-volumes:volumes_attached") or []
        ],
        "metadata": server.get("metadata") or {},
        "fault": (
            {
                "code": fault.get("code"),
                "message": fault.get("message"),
                "created": to_utc_iso(fault.get("created")),
            }
            if fault
            else None
        ),
        "server_group_ids": server.get("server_groups") or [],
    }


async def _flavor_summaries(ctx: Context) -> list[dict]:
    result = await ctx.cached(policy.FLAVORS, ctx.nova.flavors)
    return [ctx.flavor_rules.summary(f) for f in result.value]


async def flavors(ctx: Context) -> list[Flavor]:
    return [Flavor.model_validate(f) for f in await _flavor_summaries(ctx)]


async def availability_zones(ctx: Context) -> list[AvailabilityZone]:
    result = await ctx.cached(policy.NOVA_AZS, ctx.nova.availability_zones)
    return [
        AvailabilityZone(
            name=z.get("zoneName"),
            available=bool((z.get("zoneState") or {}).get("available")),
        )
        for z in result.value
    ]


IMAGE_POLICIES = {
    "public": policy.IMAGES_PUBLIC,
    "community": policy.IMAGES_COMMUNITY,
}


async def _images_by_visibility(ctx: Context, visibility: str) -> list[dict]:
    """One Glance visibility's active images. Public and community images
    are the same for everyone; private and shared ones are the project's
    own (``IMAGES_PROJECT``, keyed by visibility)."""

    async def fetch():
        params = {"visibility": visibility, "status": "active"}
        if visibility == "private":
            params["owner"] = ctx.project_id
        return await ctx.glance.images(**params)

    shared_policy = IMAGE_POLICIES.get(visibility)
    if shared_policy:
        result = await ctx.cached(shared_policy, fetch)
    else:
        result = await ctx.cached(policy.IMAGES_PROJECT, fetch, visibility)
    return result.value


async def all_images(ctx: Context) -> dict[str, list[dict]]:
    private, shared, public, community = await asyncio.gather(
        _images_by_visibility(ctx, "private"),
        _images_by_visibility(ctx, "shared"),
        _images_by_visibility(ctx, "public"),
        _images_by_visibility(ctx, "community"),
    )
    return {
        "private": private,
        "shared": shared,
        "public": public,
        "community": community,
    }


async def image_names(ctx: Context) -> dict[str, str]:
    groups = await all_images(ctx)
    return ctx.image_rules.name_map(
        groups["private"],
        groups["shared"],
        groups["public"],
        groups["community"],
    )


async def invalidate_project_images(
    ctx: Context, *visibilities: str | None
) -> None:
    """Drop the project's image listings, and the shared public or
    community listing too when an image enters or leaves one of them."""
    shared = {IMAGE_POLICIES[v] for v in visibilities if v in IMAGE_POLICIES}
    await asyncio.gather(
        ctx.forget(policy.IMAGES_PROJECT, "private"),
        ctx.forget(policy.IMAGES_PROJECT, "shared"),
        *(ctx.forget(p) for p in shared),
    )


def json_pointer(key: str) -> str:
    """A JSON Patch path for one top-level image property (RFC 6901): a
    ``/`` or ``~`` in a property name must not address something else."""
    return "/" + key.replace("~", "~0").replace("/", "~1")


def image_patch(data: ImageUpdate, rules: ImageRules) -> list[dict]:
    """The Glance JSON patch for an image edit: set fields replace, a
    property set to ``None`` is removed, and a key that is not a custom
    property (reserved, or a glance base attribute) is refused."""
    patch = []
    for key in ("name", "visibility", "min_disk", "min_ram", "protected"):
        value = getattr(data, key)
        if value is not None:
            patch.append({"op": "replace", "path": f"/{key}", "value": value})
    for key, value in (data.properties or {}).items():
        if not rules.is_custom_property(key):
            raise BadRequest(f"'{key}' is a reserved property")
        pointer = json_pointer(key)
        if value is None:
            patch.append({"op": "remove", "path": pointer})
        else:
            patch.append({"op": "add", "path": pointer, "value": value})
    if not patch:
        raise BadRequest("nothing to update")
    return patch


async def list_images(
    ctx: Context, visibility: str | None, q: str | None, snapshots: bool
) -> list[Image]:
    """Images (or instance snapshots) for the picker and the Images panel,
    filtered by visibility and a name search, sorted by name."""
    groups = await all_images(ctx)
    rules = ctx.image_rules
    needle = (q or "").strip().lower()
    items = [
        rules.summary(image, ctx.project_id)
        for key in ([visibility] if visibility else list(groups))
        for image in groups.get(key, [])
        if rules.is_snapshot(image) == snapshots
        and needle in (image.get("name") or "").lower()
        and rules.visible_in_picker(image, ctx.project_id, bool(needle))
    ]
    items.sort(key=lambda i: (i["name"] or "").lower())
    return [Image.model_validate(i) for i in items]


async def get_image(ctx: Context, image_id: str) -> Image:
    image = await ctx.glance.image(image_id)
    return Image.model_validate(ctx.image_rules.summary(image, ctx.project_id))


async def create_image(ctx: Context, data: ImageCreate) -> Image:
    """Create the image record, and start a web-download import when the
    source is a URL (a file source is uploaded with ``upload_image_file``)."""
    rules = ctx.image_rules
    fields: dict = {
        **rules.create_defaults(),
        "name": data.name,
        "disk_format": data.disk_format,
        "container_format": data.container_format,
        "min_disk": data.min_disk,
        "min_ram": data.min_ram,
        "protected": data.protected,
    }
    if data.visibility:
        fields["visibility"] = data.visibility
    for key, value in data.properties.items():
        if not rules.is_custom_property(key):
            raise BadRequest(f"'{key}' is a reserved property")
        fields[key] = value
    image = await ctx.glance.create_image(fields)
    if data.source_url:
        await ctx.glance.import_image(image["id"], data.source_url)
    await invalidate_project_images(ctx, image.get("visibility"))
    return Image.model_validate(rules.summary(image, ctx.project_id))


async def upload_image_file(
    ctx: Context,
    image_id: str,
    content: AsyncIterable[bytes],
    content_length: str | None,
) -> Image:
    """Stream an image file from the browser to glance.

    The SPA creates the image record first (``create_image`` without a
    source URL) and then sends the bytes; glance makes the image active
    once they land. Horizon's "File" source does the same through its own
    web server (``HORIZON_IMAGES_UPLOAD_MODE=legacy``).
    """
    if not content_length or not content_length.isdigit():
        raise BadRequest("Content-Length is required")
    size = int(content_length)
    limit = ctx.settings.image_upload_max_bytes
    if size > limit:
        raise PayloadTooLarge(
            f"image files are limited to {limit // 1024**3} GB",
            extra={"limit": limit},
        )
    if size == 0:
        raise BadRequest("the file is empty")
    await ctx.glance.upload_image_file(
        image_id, content, size, ctx.settings.image_upload_timeout
    )
    await invalidate_project_images(ctx)
    return await get_image(ctx, image_id)


async def update_image(
    ctx: Context, image_id: str, data: ImageUpdate
) -> Image:
    patch = image_patch(data, ctx.image_rules)
    image = await ctx.glance.patch_image(image_id, patch)
    # A visibility change moves the image between listings: drop the
    # shared public and community ones it may have left or joined too.
    left_or_joined = ("public", "community") if data.visibility else ()
    await invalidate_project_images(ctx, *left_or_joined)
    return Image.model_validate(ctx.image_rules.summary(image, ctx.project_id))


async def delete_image(ctx: Context, image_id: str) -> None:
    await ctx.glance.delete_image(image_id)
    await invalidate_project_images(ctx)


def keypair_summary(keypair: dict) -> dict:
    return {
        "name": keypair.get("name"),
        "type": keypair.get("type"),
        "fingerprint": keypair.get("fingerprint"),
        "public_key": keypair.get("public_key"),
    }


async def list_keypairs(ctx: Context) -> list[KeyPair]:
    return [
        KeyPair.model_validate(keypair_summary(k))
        for k in await ctx.nova.keypairs()
    ]


async def get_keypair(ctx: Context, name: str) -> KeyPairDetail:
    keypair = await ctx.nova.keypair(name)
    return KeyPairDetail.model_validate(
        {
            **keypair_summary(keypair),
            "created_at": to_utc_iso(keypair.get("created_at")),
        }
    )


async def create_keypair(ctx: Context, data: KeypairCreate) -> KeyPairCreated:
    """Import a public key, or have Nova generate a pair; the private key
    of a generated pair is in this reply only, once."""
    fields: dict = {"name": data.name, "type": data.type}
    if data.public_key:
        fields["public_key"] = data.public_key
    keypair = await ctx.nova.create_keypair(fields)
    return KeyPairCreated.model_validate(
        {
            **keypair_summary(keypair),
            "private_key": keypair.get("private_key"),
        }
    )


async def delete_keypair(ctx: Context, name: str) -> None:
    await ctx.nova.delete_keypair(name)


def server_group_summary(group: dict) -> dict:
    return {
        "id": group.get("id"),
        "name": group.get("name"),
        "policy": group.get("policy"),
        "members": group.get("members") or [],
    }


async def list_server_groups(ctx: Context) -> list[ServerGroup]:
    return [
        ServerGroup.model_validate(server_group_summary(g))
        for g in await ctx.nova.server_groups()
    ]


async def create_server_group(
    ctx: Context, data: ServerGroupCreate
) -> ServerGroup:
    group = await ctx.nova.create_server_group(
        {"name": data.name, "policy": data.policy}
    )
    return ServerGroup.model_validate(server_group_summary(group))


async def delete_server_group(ctx: Context, group_id: str) -> None:
    await ctx.nova.delete_server_group(group_id)


async def list_instances(
    ctx: Context, query: ServerListQuery
) -> Paginated[Instance]:
    params = query.nova_params()
    body, names = await asyncio.gather(
        ctx.nova.servers(**params), image_names(ctx)
    )
    servers = body.get("servers", [])
    next_marker = (
        servers[-1]["id"] if len(servers) >= params["limit"] else None
    )
    return Paginated[Instance](
        items=[
            Instance.model_validate(server_summary(ctx, s, names))
            for s in servers
        ],
        next_marker=next_marker,
        has_more=bool(next_marker),
    )


async def get_instance(ctx: Context, server_id: str) -> InstanceDetail:
    server, names = await asyncio.gather(
        ctx.nova.server(server_id), image_names(ctx)
    )
    if not server:
        raise NotFound("instance not found", service="nova")
    return InstanceDetail.model_validate(
        {
            **server_summary(ctx, server, names),
            # Nova returns it base64-encoded, from microversion 2.3 on.
            "user_data": server.get("OS-EXT-SRV-ATTR:user_data"),
            "os_ext_srv_attr": {
                "instance_name": server.get("OS-EXT-SRV-ATTR:instance_name"),
                "hostname": server.get("OS-EXT-SRV-ATTR:hostname"),
            },
        }
    )


async def update_instance(
    ctx: Context, server_id: str, data: ServerUpdate
) -> Instance:
    server = await ctx.nova.update_server(server_id, data.changes())
    return Instance.model_validate(server_summary(ctx, server))


async def delete_instance(ctx: Context, server_id: str) -> None:
    await ctx.nova.delete_server(server_id)


async def console_output(
    ctx: Context, server_id: str, length: int | None
) -> ConsoleOutput:
    output = await ctx.nova.console_output(server_id, length)
    return ConsoleOutput(output=output)


async def remote_console(
    ctx: Context, server_id: str, kind: str
) -> RemoteConsole:
    console = await ctx.nova.remote_console(server_id, kind)
    return RemoteConsole(url=console.get("url"), type=console.get("type"))


async def server_password(ctx: Context, server_id: str) -> ServerPassword:
    """The encrypted admin password; decryption with the key pair's
    private key happens in the browser, as in Horizon."""
    password = await ctx.nova.server_password(server_id)
    return ServerPassword(encrypted_password=password)


async def limits(ctx: Context) -> ComputeLimits:
    return ComputeLimits.model_validate(await ctx.nova.limits())


async def instance_volumes(
    ctx: Context, server_id: str
) -> list[InstanceVolume]:
    attachments = await ctx.nova.volume_attachments(server_id)

    async def one(attachment):
        try:
            volume = await ctx.cinder.volume(attachment["volumeId"])
        except HiveError:
            volume = {}
        return InstanceVolume.model_validate(
            {
                "id": attachment.get("volumeId"),
                "device": attachment.get("device"),
                "name": volume.get("name") or attachment.get("volumeId"),
                "size_gb": volume.get("size"),
                "status": volume.get("status"),
                "bootable": volume.get("bootable") == "true",
                "volume_type": volume.get("volume_type"),
            }
        )

    return list(await asyncio.gather(*(one(a) for a in attachments)))


async def instance_ports(ctx: Context, server_id: str) -> list[InstancePort]:
    ports, fips = await asyncio.gather(
        ctx.neutron.ports(device_id=server_id),
        ctx.neutron.floatingips(project_id=ctx.project_id),
    )
    by_port: dict[str, list[dict]] = {}
    for fip in fips:
        if fip.get("port_id"):
            by_port.setdefault(fip["port_id"], []).append(fip)
    return [
        InstancePort.model_validate(
            {
                "id": p.get("id"),
                "network_id": p.get("network_id"),
                "mac_address": p.get("mac_address"),
                "status": p.get("status"),
                "fixed_ips": [
                    {
                        "ip": ip.get("ip_address"),
                        "subnet_id": ip.get("subnet_id"),
                    }
                    for ip in p.get("fixed_ips") or []
                ],
                "security_groups": p.get("security_groups") or [],
                "port_security_enabled": p.get("port_security_enabled"),
                "floating_ips": [
                    {
                        "id": f.get("id"),
                        "address": f.get("floating_ip_address"),
                    }
                    for f in by_port.get(p.get("id") or "", [])
                ],
            }
        )
        for p in ports
    ]


async def instance_action_log(
    ctx: Context, server_id: str
) -> list[InstanceAction]:
    actions = await ctx.nova.instance_actions(server_id)
    return [
        InstanceAction.model_validate(
            {
                "action": a.get("action"),
                "request_id": a.get("request_id"),
                "user_id": a.get("user_id"),
                "start_time": to_utc_iso(a.get("start_time")),
                "message": a.get("message"),
            }
        )
        for a in actions
    ]


async def resize_flavors(ctx: Context, server_id: str) -> list[Flavor]:
    server, all_flavors = await asyncio.gather(
        ctx.nova.server(server_id), _flavor_summaries(ctx)
    )
    current = (server.get("flavor") or {}).get("id")
    if not current:
        # 2.47+ servers embed the flavour by name; match it up.
        name = (server.get("flavor") or {}).get("original_name")
        current = next(
            (f["id"] for f in all_flavors if f["name"] == name), None
        )
    candidates = ctx.flavor_rules.resize_candidates(current, all_flavors)
    return [Flavor.model_validate(f) for f in candidates]


async def launch_options(ctx: Context) -> LaunchOptions:
    """Everything the launch wizard needs, gathered in parallel; a failed
    section carries ``error`` instead of failing the whole payload."""

    async def guarded(name, coro):
        try:
            return name, await coro, None
        except HiveError as exc:
            return name, None, {"error": exc.code, "message": exc.message}

    async def images_section():
        groups = await all_images(ctx)
        rules = ctx.image_rules
        everything = [
            *groups["private"],
            *groups["shared"],
            *groups["public"],
            *groups["community"],
        ]
        images = [
            rules.summary(i, ctx.project_id)
            for i in everything
            if not rules.is_snapshot(i)
        ]
        snapshots = [
            rules.summary(i, ctx.project_id)
            for i in everything
            if rules.is_snapshot(i)
        ]
        for item in images:
            item["hidden_until_search"] = (
                item["visibility"] == "community" and not item["is_owner"]
            )
        return {"images": images, "snapshots": snapshots}

    async def volumes_section():
        volumes, snapshots = await asyncio.gather(
            ctx.cinder.volumes(),
            ctx.cinder.snapshots(),
        )
        return {
            "volumes": [
                {
                    "id": v["id"],
                    "name": v.get("name") or v["id"],
                    "size_gb": v.get("size"),
                    "availability_zone": v.get("availability_zone"),
                    "status": v.get("status"),
                    "bootable": v.get("bootable") == "true",
                }
                for v in volumes
                if v.get("status") == "available"
                and v.get("bootable") == "true"
            ],
            "volume_snapshots": [
                {
                    "id": s["id"],
                    "name": s.get("name") or s["id"],
                    "size_gb": s.get("size"),
                    "status": s.get("status"),
                    "volume_id": s.get("volume_id"),
                }
                for s in snapshots
                if s.get("status") == "available"
            ],
        }

    results = await asyncio.gather(
        guarded("flavors", flavors(ctx)),
        guarded("images", images_section()),
        guarded("volumes", volumes_section()),
        guarded(
            "networks", network_service.networks_for_purpose(ctx, PURPOSE_BOOT)
        ),
        guarded("key_pairs", list_keypairs(ctx)),
        guarded("security_groups", network_service.list_security_groups(ctx)),
        guarded("availability_zones", availability_zones(ctx)),
        guarded("server_groups", list_server_groups(ctx)),
        guarded("limits", ctx.nova.limits()),
        guarded("volume_types", volume_type_service.volume_types(ctx)),
    )
    payload: dict = {"errors": {}}
    for name, value, error in results:
        if error:
            payload["errors"][name] = error
            payload[name] = None
        elif name == "images":
            payload["images"] = (value or {}).get("images", [])
            payload["snapshots"] = (value or {}).get("snapshots", [])
        elif name == "volumes":
            payload["volumes"] = (value or {}).get("volumes", [])
            payload["volume_snapshots"] = (value or {}).get(
                "volume_snapshots", []
            )
        else:
            payload[name] = value
    payload["has_zoned_types"] = volume_type_service.has_zoned_types(
        payload["volume_types"]
    )
    loaded = payload["flavors"]
    payload["flavor_classes"] = (
        ctx.flavor_rules.flavor_classes([f.model_dump() for f in loaded])
        if loaded is not None
        else None
    )
    payload["defaults"] = {
        "create_volume": False,
        "config_drive": False,
        "network_ports": False,
        "classic_network_id": ctx.settings.classic_network_id,
        "preemptible_notice": PREEMPTIBLE_NOTICE,
    }
    return LaunchOptions.model_validate(payload)


def _boot_source(req: LaunchRequest) -> dict:
    """``imageRef`` and, for an instance that boots from a volume, its
    ``block_device_mapping_v2``: an image boots directly, or onto a new
    volume (from the image with its size, setFinalSpecBootImageToVolume;
    the volume type is a Hive addition, nova 2.67+); a volume or volume
    snapshot boots from the volume (setFinalSpecBootFromVolumeDevice)."""
    if req.create_volume:
        mapping: dict = {
            "boot_index": 0,
            "uuid": req.source.id,
            "source_type": "image",
            "destination_type": "volume",
            "volume_size": req.volume_size_gb,
            "delete_on_termination": req.delete_volume_on_termination,
        }
        if req.volume_type:
            mapping["volume_type"] = req.volume_type
        return {"imageRef": "", "block_device_mapping_v2": [mapping]}
    if req.source.type in ("image", "snapshot"):
        return {"imageRef": req.source.id}
    return {
        "imageRef": "",
        "block_device_mapping_v2": [
            {
                "boot_index": 0,
                "uuid": req.source.id,
                "source_type": (
                    "volume" if req.source.type == "volume" else "snapshot"
                ),
                "destination_type": "volume",
                "delete_on_termination": req.delete_volume_on_termination,
            }
        ],
    }


def launch_body(req: LaunchRequest, zone: str | None) -> tuple[dict, dict]:
    """Translate a LaunchRequest into nova's create-server body, as
    Horizon's ``launch-instance-model.service.js`` builds it
    (``_boot_source``). ``zone`` is the zone to send
    (``FlavorRules.launch_zone``); without one Nova's scheduler picks."""
    server: dict = {
        "name": req.name,
        "flavorRef": req.flavor_id,
        "min_count": req.count,
        "max_count": req.count,
        **_boot_source(req),
    }
    if zone:
        server["availability_zone"] = zone
    nics = [{"uuid": n} for n in req.networks] + [
        {"port": p} for p in req.ports
    ]
    if not nics:
        raise BadRequest("at least one network is required")
    server["networks"] = nics
    if req.security_groups:
        server["security_groups"] = [{"name": g} for g in req.security_groups]
    if req.key_name:
        server["key_name"] = req.key_name
    if req.user_data:
        server["user_data"] = base64.b64encode(req.user_data.encode()).decode()
    if req.metadata:
        server["metadata"] = req.metadata
    if req.description:
        server["description"] = req.description
    if req.config_drive:
        server["config_drive"] = True
    extra: dict = {}
    if req.server_group_id:
        extra["os:scheduler_hints"] = {"group": req.server_group_id}
    return server, extra


async def launch(ctx: Context, req: LaunchRequest) -> LaunchResult:
    if req.create_volume and req.volume_size_gb is not None:
        image = await ctx.glance.image(req.source.id)
        ctx.volume_rules.check_boot_volume(
            req.availability_zone, req.volume_size_gb, image
        )
    # Only a chosen zone needs the flavour, to drop it for a reservation
    # flavour; read it from nova, since a new reservation's flavour may not
    # be in the cached list yet.
    flavor = (
        await ctx.nova.flavor(req.flavor_id) if req.availability_zone else None
    )
    zone = ctx.flavor_rules.launch_zone(flavor, req.availability_zone)
    server, extra = launch_body(req, zone)
    created = await ctx.nova.create_server(server, extra)
    if "server" in created:
        ids = [created["server"].get("id")]
    else:
        ids = [s.get("id") for s in created.get("servers", [])]
    return LaunchResult(status="accepted", ids=[i for i in ids if i])
