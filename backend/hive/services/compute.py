"""Instances, flavours, images, key pairs and the launch wizard data,
shaped for the SPA with the Nectar rules applied."""

import asyncio
import base64

from hive.errors import BadRequest, HiveError, NotFound
from hive.nectar.flavors import PREEMPTIBLE_NOTICE
from hive.nectar.networks import PURPOSE_BOOT
from hive.services.context import Context
from hive.services import network as network_service
from hive.services import volumes as volume_service

FLAVORS_TTL = 600
FLAVORS_STALE = 3600
AZ_TTL = 600
AZ_STALE = 3600
PUBLIC_IMAGES_TTL = 300
PUBLIC_IMAGES_STALE = 1800
COMMUNITY_IMAGES_TTL = 3600
COMMUNITY_IMAGES_STALE = 21600
PROJECT_IMAGES_TTL = 60
PROJECT_IMAGES_STALE = 600

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

# Nova server filters the SPA may pass straight through (microversion
# 2.83+ accepts the extra attributes; the fork pinned 2.83-2.90 so these
# work, commit d911bda0e).
SERVER_FILTERS = {
    "name",
    "status",
    "image",
    "flavor",
    "ip",
    "ip6",
    "availability_zone",
    "key_name",
    "power_state",
    "task_state",
    "vm_state",
    "locked",
    "changes-since",
    "host",
    "uuid",
}
SERVER_SORT_KEYS = {
    "display_name",
    "created_at",
    "updated_at",
    "status",
    "vm_state",
    "power_state",
    "availability_zone",
    "key_name",
    "locked",
}

ACTIONS = {
    "start": lambda b: {"os-start": None},
    "stop": lambda b: {"os-stop": None},
    "pause": lambda b: {"pause": None},
    "unpause": lambda b: {"unpause": None},
    "suspend": lambda b: {"suspend": None},
    "resume": lambda b: {"resume": None},
    "shelve": lambda b: {"shelve": None},
    "unshelve": lambda b: {"unshelve": None},
    "lock": lambda b: {"lock": None},
    "unlock": lambda b: {"unlock": None},
    "unrescue": lambda b: {"unrescue": None},
    "confirm-resize": lambda b: {"confirmResize": None},
    "revert-resize": lambda b: {"revertResize": None},
    "reboot": lambda b: {"reboot": {"type": b.get("type") or "SOFT"}},
}


# --- helpers -----------------------------------------------------------------


def _addresses(server: dict) -> list[dict]:
    result = []
    for network, entries in (server.get("addresses") or {}).items():
        for entry in entries:
            result.append(
                {
                    "network": network,
                    "addr": entry.get("addr"),
                    "version": entry.get("version"),
                    "type": entry.get("OS-EXT-IPS:type"),
                    "mac": entry.get("OS-EXT-IPS-MAC:mac_addr"),
                }
            )
    return result


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
        "created": server.get("created"),
        "updated": server.get("updated"),
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
                "created": fault.get("created"),
            }
            if fault
            else None
        ),
        "server_group_ids": server.get("server_groups") or [],
    }


# --- cached reference data ---------------------------------------------------


def flavors_key(ctx: Context) -> str:
    """Per project: nova lists the private flavours a project has access
    to, so one project's list is not another's."""
    return ctx.cache.project_key(ctx.project_id, "flavors")


async def flavors(ctx: Context) -> list[dict]:
    result = await ctx.cache.get_or_fetch(
        flavors_key(ctx),
        ctx.nova.flavors,
        ttl=FLAVORS_TTL,
        stale_ttl=FLAVORS_STALE,
        name="flavors",
    )
    return [ctx.flavor_rules.summary(f) for f in result.value]


async def availability_zones(ctx: Context) -> list[dict]:
    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("nova-azs"),
        ctx.nova.availability_zones,
        ttl=AZ_TTL,
        stale_ttl=AZ_STALE,
        name="azs",
    )
    return [
        {
            "name": z.get("zoneName"),
            "available": bool((z.get("zoneState") or {}).get("available")),
        }
        for z in result.value
    ]


async def _images_by_visibility(ctx: Context, visibility: str) -> list[dict]:
    if visibility in ("public", "community"):
        key = ctx.cache.global_key("images", visibility)
        ttl, stale = (
            (PUBLIC_IMAGES_TTL, PUBLIC_IMAGES_STALE)
            if visibility == "public"
            else (COMMUNITY_IMAGES_TTL, COMMUNITY_IMAGES_STALE)
        )
    else:
        key = ctx.cache.project_key(ctx.project_id, "images", visibility)
        ttl, stale = PROJECT_IMAGES_TTL, PROJECT_IMAGES_STALE

    async def fetch():
        params = {"visibility": visibility, "status": "active"}
        if visibility == "private":
            params["owner"] = ctx.project_id
        return await ctx.glance.images(**params)

    result = await ctx.cache.get_or_fetch(
        key, fetch, ttl=ttl, stale_ttl=stale, name=f"images-{visibility}"
    )
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
    """Drop the project's image listings, and the global public or
    community listing too when an image enters or leaves one of them."""
    keys = [
        ctx.cache.project_key(ctx.project_id, "images", "private"),
        ctx.cache.project_key(ctx.project_id, "images", "shared"),
    ]
    for visibility in sorted({v for v in visibilities if v}):
        if visibility in ("public", "community"):
            keys.append(ctx.cache.global_key("images", visibility))
    await ctx.cache.invalidate(*keys)


# --- instances ----------------------------------------------------------------


async def list_instances(ctx: Context, query: dict) -> dict:
    """``query`` carries the typed ``limit``, ``marker``, ``sort_key`` and
    ``sort_dir`` from the router plus any ``SERVER_FILTERS``."""
    params: dict = {"limit": min(int(query.get("limit") or 50), 1000)}
    if query.get("marker"):
        params["marker"] = query["marker"]
    sort_key = query.get("sort_key")
    if sort_key in SERVER_SORT_KEYS:
        params["sort_key"] = sort_key
        params["sort_dir"] = (
            "asc" if query.get("sort_dir") == "asc" else "desc"
        )
    for key in SERVER_FILTERS:
        if query.get(key) not in (None, ""):
            params[key] = query[key]
    body, names = await asyncio.gather(
        ctx.nova.servers(**params), image_names(ctx)
    )
    servers = body.get("servers", [])
    items = [server_summary(ctx, s, names) for s in servers]
    next_marker = (
        servers[-1]["id"] if len(servers) >= params["limit"] else None
    )
    return {
        "items": items,
        "next_marker": next_marker,
        "has_more": bool(next_marker),
    }


async def get_instance(ctx: Context, server_id: str) -> dict:
    server, names = await asyncio.gather(
        ctx.nova.server(server_id), image_names(ctx)
    )
    if not server:
        raise NotFound("instance not found", service="nova")
    summary = server_summary(ctx, server, names)
    # Nova returns it base64-encoded, only from microversion 2.3 on.
    summary["user_data"] = server.get("OS-EXT-SRV-ATTR:user_data")
    summary["os_ext_srv_attr"] = {
        "instance_name": server.get("OS-EXT-SRV-ATTR:instance_name"),
        "hostname": server.get("OS-EXT-SRV-ATTR:hostname"),
    }
    return summary


async def instance_volumes(ctx: Context, server_id: str) -> list[dict]:
    attachments = await ctx.nova.volume_attachments(server_id)

    async def one(attachment):
        try:
            volume = await ctx.cinder.volume(attachment["volumeId"])
        except HiveError:
            volume = {}
        return {
            "id": attachment.get("volumeId"),
            "device": attachment.get("device"),
            "name": volume.get("name") or attachment.get("volumeId"),
            "size_gb": volume.get("size"),
            "status": volume.get("status"),
            "bootable": volume.get("bootable") == "true",
            "volume_type": volume.get("volume_type"),
        }

    return list(await asyncio.gather(*(one(a) for a in attachments)))


async def instance_ports(ctx: Context, server_id: str) -> list[dict]:
    ports, fips = await asyncio.gather(
        ctx.neutron.ports(device_id=server_id),
        ctx.neutron.floatingips(project_id=ctx.project_id),
    )
    by_port: dict[str, list[dict]] = {}
    for fip in fips:
        if fip.get("port_id"):
            by_port.setdefault(fip["port_id"], []).append(fip)
    return [
        {
            "id": p.get("id"),
            "network_id": p.get("network_id"),
            "mac_address": p.get("mac_address"),
            "status": p.get("status"),
            "fixed_ips": [
                {"ip": ip.get("ip_address"), "subnet_id": ip.get("subnet_id")}
                for ip in p.get("fixed_ips") or []
            ],
            "security_groups": p.get("security_groups") or [],
            "port_security_enabled": p.get("port_security_enabled"),
            "floating_ips": [
                {"id": f.get("id"), "address": f.get("floating_ip_address")}
                for f in by_port.get(p.get("id"), [])
            ],
        }
        for p in ports
    ]


async def instance_action_log(ctx: Context, server_id: str) -> list[dict]:
    actions = await ctx.nova.instance_actions(server_id)
    return [
        {
            "action": a.get("action"),
            "request_id": a.get("request_id"),
            "user_id": a.get("user_id"),
            "start_time": a.get("start_time"),
            "message": a.get("message"),
        }
        for a in actions
    ]


async def resize_flavors(ctx: Context, server_id: str) -> list[dict]:
    server, all_flavors = await asyncio.gather(
        ctx.nova.server(server_id), flavors(ctx)
    )
    current = (server.get("flavor") or {}).get("id")
    if not current:
        # 2.47+ servers embed the flavour by name; match it up.
        name = (server.get("flavor") or {}).get("original_name")
        current = next(
            (f["id"] for f in all_flavors if f["name"] == name), None
        )
    return ctx.flavor_rules.resize_candidates(current, all_flavors)


async def perform_action(
    ctx: Context, server_id: str, action: str, body: dict
):
    """Run a server action; returns a small status payload."""
    if action in ACTIONS:
        await ctx.nova.action(server_id, ACTIONS[action](body))
    elif action == "resize":
        if not body.get("flavor_id"):
            raise BadRequest("flavor_id is required")
        await ctx.nova.action(
            server_id, {"resize": {"flavorRef": body["flavor_id"]}}
        )
    elif action == "rebuild":
        if not body.get("image_id"):
            raise BadRequest("image_id is required")
        rebuild: dict = {"imageRef": body["image_id"]}
        if body.get("name"):
            rebuild["name"] = body["name"]
        if body.get("password"):
            rebuild["adminPass"] = body["password"]
        await ctx.nova.action(server_id, {"rebuild": rebuild})
    elif action == "rescue":
        rescue: dict = {}
        if body.get("rescue_image_id"):
            rescue["rescue_image_ref"] = body["rescue_image_id"]
        await ctx.nova.action(server_id, {"rescue": rescue or None})
    elif action == "snapshot":
        if not body.get("name"):
            raise BadRequest("name is required")
        resp = await ctx.nova.action(
            server_id,
            {"createImage": {"name": body["name"], "metadata": {}}},
            timeout=60,
        )
        await invalidate_project_images(ctx)
        image_id = None
        try:
            image_id = resp.json().get("image_id")
        except ValueError:
            pass
        return {"status": "accepted", "image_id": image_id}
    elif action in ("add-security-group", "remove-security-group"):
        if not body.get("security_group"):
            raise BadRequest("security_group is required")
        key = (
            "addSecurityGroup"
            if action.startswith("add")
            else "removeSecurityGroup"
        )
        await ctx.nova.action(
            server_id, {key: {"name": body["security_group"]}}
        )
    elif action == "attach-volume":
        if not body.get("volume_id"):
            raise BadRequest("volume_id is required")
        await ctx.nova.attach_volume(server_id, body["volume_id"])
    elif action == "detach-volume":
        if not body.get("volume_id"):
            raise BadRequest("volume_id is required")
        await ctx.nova.detach_volume(server_id, body["volume_id"])
    elif action == "attach-interface":
        attachment: dict = {}
        if body.get("port_id"):
            attachment["port_id"] = body["port_id"]
        elif body.get("network_id"):
            attachment["net_id"] = body["network_id"]
        else:
            raise BadRequest("network_id or port_id is required")
        await ctx.nova.attach_interface(server_id, attachment)
    elif action == "detach-interface":
        if not body.get("port_id"):
            raise BadRequest("port_id is required")
        await ctx.nova.detach_interface(server_id, body["port_id"])
    elif action == "associate-fip":
        if not body.get("floating_ip_id"):
            raise BadRequest("floating_ip_id is required")
        fields: dict = {"port_id": body.get("port_id")}
        if not fields["port_id"]:
            # The same IPv4, reachable-subnet targets the association
            # dialog offers (``FloatingIpManager.list_targets``).
            targets = await network_service.floating_ip_targets(ctx, server_id)
            if not targets:
                raise BadRequest("the instance has no port to associate with")
            fields = {
                "port_id": targets[0]["port_id"],
                "fixed_ip_address": targets[0]["ip_address"],
            }
        await ctx.neutron.update_floatingip(body["floating_ip_id"], fields)
    elif action == "disassociate-fip":
        if not body.get("floating_ip_id"):
            raise BadRequest("floating_ip_id is required")
        await ctx.neutron.update_floatingip(
            body["floating_ip_id"], {"port_id": None}
        )
    elif action == "update-metadata":
        metadata = body.get("metadata")
        if metadata is None:
            raise BadRequest("metadata is required")
        await ctx.nova.set_server_metadata(server_id, metadata)
    else:
        raise NotFound(f"unknown action '{action}'")
    return {"status": "accepted"}


# --- launch ------------------------------------------------------------------


async def launch_options(ctx: Context) -> dict:
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

    async def keypairs_section():
        return [
            {
                "name": k.get("name"),
                "type": k.get("type"),
                "fingerprint": k.get("fingerprint"),
            }
            for k in await ctx.nova.keypairs()
        ]

    async def server_groups_section():
        return [
            {
                "id": g.get("id"),
                "name": g.get("name"),
                "policy": g.get("policy"),
            }
            for g in await ctx.nova.server_groups()
        ]

    results = await asyncio.gather(
        guarded("flavors", flavors(ctx)),
        guarded("images", images_section()),
        guarded("volumes", volumes_section()),
        guarded(
            "networks", network_service.networks_for_purpose(ctx, PURPOSE_BOOT)
        ),
        guarded("key_pairs", keypairs_section()),
        guarded("security_groups", network_service.list_security_groups(ctx)),
        guarded("availability_zones", availability_zones(ctx)),
        guarded("server_groups", server_groups_section()),
        guarded("limits", ctx.nova.limits()),
        guarded("volume_types", volume_service.volume_types(ctx)),
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
    # The new-volume type picker filters by zone the way the create volume
    # form does (nectar/volumes.py).
    payload["has_zoned_types"] = any(
        t.get("zones") for t in payload.get("volume_types") or []
    )
    flavors_loaded = payload.get("flavors")
    payload["flavor_classes"] = (
        ctx.flavor_rules.flavor_classes(flavors_loaded)
        if flavors_loaded is not None
        else None
    )
    payload["defaults"] = {
        "create_volume": False,
        "config_drive": False,
        "network_ports": False,
        "classic_network_id": ctx.settings.classic_network_id,
        "preemptible_notice": PREEMPTIBLE_NOTICE,
    }
    return payload


def launch_body(ctx: Context, req) -> tuple[dict, dict]:
    """Translate a LaunchRequest into nova's create-server body."""
    server: dict = {
        "name": req.name,
        "flavorRef": req.flavor_id,
        "availability_zone": req.availability_zone,
        "min_count": req.count,
        "max_count": req.count,
    }
    if req.source.type in ("image", "snapshot") and not req.create_volume:
        server["imageRef"] = req.source.id
    elif req.source.type in ("image", "snapshot"):
        # Horizon's "Create New Volume": the image (an instance snapshot
        # is a glance image too) becomes a new bootable volume of the
        # chosen size (launch-instance-model.service.js
        # setFinalSpecBootImageToVolume). Horizon sends no volume type;
        # Hive offers the zone's types (nova 2.67+).
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
        server["imageRef"] = ""
        server["block_device_mapping_v2"] = [mapping]
    else:
        server["imageRef"] = ""
        server["block_device_mapping_v2"] = [
            {
                "boot_index": 0,
                "uuid": req.source.id,
                "source_type": (
                    "volume" if req.source.type == "volume" else "snapshot"
                ),
                "destination_type": "volume",
                "delete_on_termination": req.delete_volume_on_termination,
            }
        ]
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
    extra: dict = {}
    if req.server_group_id:
        extra["os:scheduler_hints"] = {"group": req.server_group_id}
    return server, extra


async def launch(ctx: Context, req) -> dict:
    server, extra = launch_body(ctx, req)
    created = await ctx.nova.create_server(server, extra)
    if "server" in created:
        ids = [created["server"].get("id")]
    else:
        ids = [s.get("id") for s in created.get("servers", [])]
    return {"ids": [i for i in ids if i], "status": "accepted"}
