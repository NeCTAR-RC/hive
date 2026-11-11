"""Thin clients for the OpenStack services Hive drives directly.

Each wraps the REST API with the pinned microversion from settings and
returns plain dicts; shaping for the SPA happens in ``hive.services``.
Every method is one call to the envelope helpers on ``ServiceClient``.
"""

from collections.abc import AsyncIterable
import json
from typing import Any, override

from hive.clients.base import path, ServiceClient

# Page size for Nova's offset-paged server groups (its default max_limit).
OFFSET_PAGE = 1000
# The nova remote-consoles API pairs each console type with one protocol
# (nova/api/openstack/compute/remote_consoles.py, microversion 2.6+).
CONSOLE_PROTOCOLS = {
    "novnc": "vnc",
    "spice-html5": "spice",
    "serial": "serial",
}


class NovaClient(ServiceClient):
    service_type = "compute"
    service_name = "nova"
    microversion_header = "OpenStack-API-Version"
    microversion_prefix = "compute"

    def __init__(self, http, settings, scoped, **kwargs):
        super().__init__(
            http,
            settings,
            scoped,
            microversion=kwargs.pop(
                "microversion", settings.nova_microversion
            ),
        )

    async def servers(self, **params) -> dict:
        """One page of ``/servers/detail``, whole, for marker paging."""
        return await self.get_json("/servers/detail", params=params) or {}

    async def all_servers(self, **params) -> list[dict]:
        return await self.list_all("/servers/detail", "servers", **params)

    async def servers_brief(self, **params) -> list[dict]:
        """Ids and names only (``GET /servers``), for name lookups."""
        return await self.list_all("/servers", "servers", **params)

    async def server(self, server_id: str) -> dict:
        return await self.get(path("servers", server_id), "server")

    async def create_server(self, server: dict, extra: dict | None = None):
        """The whole reply: ``server``, or ``servers`` for a multi-create."""
        body = {"server": server, **(extra or {})}
        return await self.create("/servers", None, body)

    async def update_server(self, server_id: str, fields: dict) -> dict:
        return await self.update(path("servers", server_id), "server", fields)

    async def set_server_metadata(self, server_id: str, metadata: dict):
        return await self.update(
            path("servers", server_id, "metadata"), "metadata", metadata
        )

    async def delete_server(self, server_id: str) -> None:
        await self.delete(path("servers", server_id))

    async def server_action(
        self, server_id: str, body: dict, timeout: float | None = None
    ) -> dict:
        return await self.action(
            path("servers", server_id, "action"), body, timeout=timeout
        )

    async def console_output(self, server_id: str, length: int | None):
        options = {"length": length} if length else {}
        reply = await self.server_action(
            server_id, {"os-getConsoleOutput": options}
        )
        return reply.get("output", "")

    async def remote_console(self, server_id: str, kind: str = "novnc"):
        """A console URL; ``kind`` is one of ``CONSOLE_PROTOCOLS``."""
        return await self.create(
            path("servers", server_id, "remote-consoles"),
            "remote_console",
            {"protocol": CONSOLE_PROTOCOLS[kind], "type": kind},
        )

    async def server_password(self, server_id: str) -> str:
        reply = await self.get(
            path("servers", server_id, "os-server-password")
        )
        return reply.get("password", "")

    async def interfaces(self, server_id: str) -> list[dict]:
        return await self.list(
            path("servers", server_id, "os-interface"), "interfaceAttachments"
        )

    async def attach_interface(self, server_id: str, attachment: dict):
        return await self.create(
            path("servers", server_id, "os-interface"),
            "interfaceAttachment",
            attachment,
        )

    async def detach_interface(self, server_id: str, port_id: str) -> None:
        await self.delete(path("servers", server_id, "os-interface", port_id))

    async def volume_attachments(self, server_id: str) -> list[dict]:
        return await self.list(
            path("servers", server_id, "os-volume_attachments"),
            "volumeAttachments",
        )

    async def attach_volume(
        self, server_id: str, volume_id: str, device: str | None = None
    ):
        attachment = {"volumeId": volume_id}
        if device:
            attachment["device"] = device
        return await self.create(
            path("servers", server_id, "os-volume_attachments"),
            "volumeAttachment",
            attachment,
        )

    async def detach_volume(self, server_id: str, volume_id: str) -> None:
        await self.delete(
            path("servers", server_id, "os-volume_attachments", volume_id)
        )

    async def instance_actions(self, server_id: str) -> list[dict]:
        return await self.list(
            path("servers", server_id, "os-instance-actions"),
            "instanceActions",
        )

    async def flavors(self) -> list[dict]:
        return await self.list_all("/flavors/detail", "flavors")

    async def flavor(self, flavor_id: str) -> dict:
        return await self.get(path("flavors", flavor_id), "flavor")

    async def keypairs(self) -> list[dict]:
        """Every key pair, unwrapped (Nova nests each in ``keypair``)."""
        rows = await self.list_all("/os-keypairs", "keypairs")
        return [row["keypair"] for row in rows]

    async def keypair(self, name: str) -> dict:
        return await self.get(path("os-keypairs", name), "keypair")

    async def create_keypair(self, keypair: dict) -> dict:
        return await self.create("/os-keypairs", "keypair", keypair)

    async def delete_keypair(self, name: str) -> None:
        await self.delete(path("os-keypairs", name))

    async def server_groups(self) -> list[dict]:
        """Every server group; Nova pages them by ``limit``/``offset``."""
        return await self.list_by_offset(
            lambda offset: self.list(
                "/os-server-groups",
                "server_groups",
                limit=OFFSET_PAGE,
                offset=offset,
            ),
            OFFSET_PAGE,
        )

    async def create_server_group(self, group: dict) -> dict:
        return await self.create("/os-server-groups", "server_group", group)

    async def delete_server_group(self, group_id: str) -> None:
        await self.delete(path("os-server-groups", group_id))

    async def availability_zones(self) -> list[dict]:
        return await self.list("/os-availability-zone", "availabilityZoneInfo")

    async def limits(self) -> dict:
        return (await self.get("/limits", "limits")).get("absolute") or {}


class NeutronClient(ServiceClient):
    service_type = "network"
    service_name = "neutron"

    async def networks(self, **params) -> list[dict]:
        return await self.list("/v2.0/networks", "networks", **params)

    async def network(self, network_id: str) -> dict:
        return await self.get(path("v2.0", "networks", network_id), "network")

    async def create_network(self, fields: dict) -> dict:
        return await self.create("/v2.0/networks", "network", fields)

    async def update_network(self, network_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "networks", network_id), "network", fields
        )

    async def delete_network(self, network_id: str) -> None:
        await self.delete(path("v2.0", "networks", network_id))

    async def subnets(self, **params) -> list[dict]:
        return await self.list("/v2.0/subnets", "subnets", **params)

    async def subnet(self, subnet_id: str) -> dict:
        return await self.get(path("v2.0", "subnets", subnet_id), "subnet")

    async def create_subnet(self, fields: dict) -> dict:
        return await self.create("/v2.0/subnets", "subnet", fields)

    async def update_subnet(self, subnet_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "subnets", subnet_id), "subnet", fields
        )

    async def delete_subnet(self, subnet_id: str) -> None:
        await self.delete(path("v2.0", "subnets", subnet_id))

    async def subnetpools(self, **params) -> list[dict]:
        return await self.list("/v2.0/subnetpools", "subnetpools", **params)

    async def ports(self, **params) -> list[dict]:
        return await self.list("/v2.0/ports", "ports", **params)

    async def port(self, port_id: str) -> dict:
        return await self.get(path("v2.0", "ports", port_id), "port")

    async def create_port(self, fields: dict) -> dict:
        return await self.create("/v2.0/ports", "port", fields)

    async def update_port(self, port_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "ports", port_id), "port", fields
        )

    async def delete_port(self, port_id: str) -> None:
        await self.delete(path("v2.0", "ports", port_id))

    async def routers(self, **params) -> list[dict]:
        return await self.list("/v2.0/routers", "routers", **params)

    async def router(self, router_id: str) -> dict:
        return await self.get(path("v2.0", "routers", router_id), "router")

    async def create_router(self, fields: dict) -> dict:
        return await self.create("/v2.0/routers", "router", fields)

    async def update_router(self, router_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "routers", router_id), "router", fields
        )

    async def delete_router(self, router_id: str) -> None:
        await self.delete(path("v2.0", "routers", router_id))

    async def router_add_interface(self, router_id: str, body: dict) -> dict:
        return await self.update(
            path("v2.0", "routers", router_id, "add_router_interface"),
            None,
            body,
        )

    async def router_remove_interface(self, router_id: str, body: dict):
        await self.update(
            path("v2.0", "routers", router_id, "remove_router_interface"),
            None,
            body,
        )

    async def floatingips(self, **params) -> list[dict]:
        return await self.list("/v2.0/floatingips", "floatingips", **params)

    async def floatingip(self, fip_id: str) -> dict:
        return await self.get(
            path("v2.0", "floatingips", fip_id), "floatingip"
        )

    async def create_floatingip(self, fields: dict) -> dict:
        return await self.create("/v2.0/floatingips", "floatingip", fields)

    async def update_floatingip(self, fip_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "floatingips", fip_id), "floatingip", fields
        )

    async def delete_floatingip(self, fip_id: str) -> None:
        await self.delete(path("v2.0", "floatingips", fip_id))

    async def port_forwardings(self, fip_id: str) -> list[dict]:
        return await self.list(
            path("v2.0", "floatingips", fip_id, "port_forwardings"),
            "port_forwardings",
        )

    async def create_port_forwarding(self, fip_id: str, fields: dict) -> dict:
        return await self.create(
            path("v2.0", "floatingips", fip_id, "port_forwardings"),
            "port_forwarding",
            fields,
        )

    async def update_port_forwarding(
        self, fip_id: str, rule_id: str, fields: dict
    ) -> dict:
        return await self.update(
            path("v2.0", "floatingips", fip_id, "port_forwardings", rule_id),
            "port_forwarding",
            fields,
        )

    async def delete_port_forwarding(self, fip_id: str, rule_id: str) -> None:
        await self.delete(
            path("v2.0", "floatingips", fip_id, "port_forwardings", rule_id)
        )

    async def trunks(self, **params) -> list[dict]:
        return await self.list("/v2.0/trunks", "trunks", **params)

    async def trunk(self, trunk_id: str) -> dict:
        return await self.get(path("v2.0", "trunks", trunk_id), "trunk")

    async def create_trunk(self, fields: dict) -> dict:
        return await self.create("/v2.0/trunks", "trunk", fields)

    async def update_trunk(self, trunk_id: str, fields: dict) -> dict:
        return await self.update(
            path("v2.0", "trunks", trunk_id), "trunk", fields
        )

    async def delete_trunk(self, trunk_id: str) -> None:
        await self.delete(path("v2.0", "trunks", trunk_id))

    async def trunk_add_subports(self, trunk_id: str, subports: list[dict]):
        return await self.update(
            path("v2.0", "trunks", trunk_id, "add_subports"),
            None,
            {"sub_ports": subports},
        )

    async def trunk_remove_subports(self, trunk_id: str, subports: list[dict]):
        return await self.update(
            path("v2.0", "trunks", trunk_id, "remove_subports"),
            None,
            {"sub_ports": subports},
        )

    async def quota_details(self, project_id: str) -> dict:
        return await self.get(
            path("v2.0", "quotas", project_id, "details.json"), "quota"
        )

    async def availability_zones(self, **params) -> list[dict]:
        return await self.list(
            "/v2.0/availability_zones", "availability_zones", **params
        )

    async def extensions(self) -> list[str]:
        rows = await self.list("/v2.0/extensions", "extensions")
        return [row.get("alias") for row in rows]

    async def security_groups(self, **params) -> list[dict]:
        return await self.list(
            "/v2.0/security-groups", "security_groups", **params
        )

    async def security_group(self, group_id: str) -> dict:
        return await self.get(
            path("v2.0", "security-groups", group_id), "security_group"
        )

    async def create_security_group(self, fields: dict) -> dict:
        return await self.create(
            "/v2.0/security-groups", "security_group", fields
        )

    async def update_security_group(self, group_id: str, fields: dict):
        return await self.update(
            path("v2.0", "security-groups", group_id),
            "security_group",
            fields,
        )

    async def delete_security_group(self, group_id: str) -> None:
        await self.delete(path("v2.0", "security-groups", group_id))

    async def create_security_group_rule(self, rule: dict) -> dict:
        return await self.create(
            "/v2.0/security-group-rules", "security_group_rule", rule
        )

    async def delete_security_group_rule(self, rule_id: str) -> None:
        await self.delete(path("v2.0", "security-group-rules", rule_id))


class GlanceClient(ServiceClient):
    service_type = "image"
    service_name = "glance"

    @override
    def next_link(self, body: Any, key: str) -> str | None:
        """Glance names the next page in a top-level ``next``, relative to
        the endpoint root (``/v2/images?marker=...``)."""
        return body.get("next") if isinstance(body, dict) else None

    async def images(self, **params) -> list[dict]:
        params.setdefault("limit", 500)
        return await self.list_all(
            "/v2/images", "images", timeout=40, **params
        )

    async def image(self, image_id: str) -> dict:
        return await self.get(path("v2", "images", image_id))

    async def create_image(self, fields: dict) -> dict:
        return await self.create("/v2/images", None, fields)

    async def patch_image(self, image_id: str, patch: list[dict]) -> dict:
        """A JSON-patch update in Glance's own media type."""
        resp = await self.request(
            "PATCH",
            path("v2", "images", image_id),
            content=json.dumps(patch).encode(),
            headers={
                "Content-Type": "application/openstack-images-v2.1-json-patch"
            },
        )
        return resp.json()

    async def delete_image(self, image_id: str) -> None:
        await self.delete(path("v2", "images", image_id))

    async def import_image(self, image_id: str, uri: str) -> None:
        await self.action(
            path("v2", "images", image_id, "import"),
            {"method": {"name": "web-download", "uri": uri}},
        )

    async def upload_image_file(
        self,
        image_id: str,
        content: AsyncIterable[bytes],
        length: int,
        timeout: float,
    ) -> None:
        """Stream a queued image's data to glance (``PUT .../file``).

        The browser's bytes pass straight through; the explicit
        Content-Length keeps the transfer unchunked for glance.
        """
        await self.request(
            "PUT",
            path("v2", "images", image_id, "file"),
            content=content,
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(length),
            },
            timeout=timeout,
        )


class CinderClient(ServiceClient):
    service_type = "volumev3"
    service_name = "cinder"
    microversion_header = "OpenStack-API-Version"
    microversion_prefix = "volume"

    def __init__(self, http, settings, scoped, **kwargs):
        super().__init__(
            http,
            settings,
            scoped,
            microversion=kwargs.pop(
                "microversion", settings.cinder_microversion
            ),
        )

    async def volumes(self, **params) -> list[dict]:
        return await self.list_all("/volumes/detail", "volumes", **params)

    async def volume(self, volume_id: str) -> dict:
        return await self.get(path("volumes", volume_id), "volume")

    async def create_volume(self, fields: dict) -> dict:
        return await self.create("/volumes", "volume", fields)

    async def update_volume(self, volume_id: str, fields: dict) -> dict:
        return await self.update(path("volumes", volume_id), "volume", fields)

    async def delete_volume(self, volume_id: str) -> None:
        await self.delete(path("volumes", volume_id))

    async def volume_action(self, volume_id: str, body: dict) -> dict:
        return await self.action(path("volumes", volume_id, "action"), body)

    async def set_volume_metadata(self, volume_id: str, metadata: dict):
        """Replace the volume's metadata (keys left out are removed)."""
        return await self.update(
            path("volumes", volume_id, "metadata"), "metadata", metadata
        )

    async def messages(self, **params) -> list[dict]:
        """User messages (microversion 3.3 and later), such as why a
        volume went into error."""
        return await self.list("/messages", "messages", **params)

    async def transfers(self) -> list[dict]:
        """The project's pending volume transfers (``/volume-transfers``,
        microversion 3.55 and later)."""
        return await self.list_all("/volume-transfers/detail", "transfers")

    async def create_transfer(self, fields: dict) -> dict:
        return await self.create("/volume-transfers", "transfer", fields)

    async def accept_transfer(self, transfer_id: str, auth_key: str) -> dict:
        reply = await self.action(
            path("volume-transfers", transfer_id, "accept"),
            {"accept": {"auth_key": auth_key}},
        )
        return reply.get("transfer") or {}

    async def delete_transfer(self, transfer_id: str) -> None:
        await self.delete(path("volume-transfers", transfer_id))

    async def snapshots(self, **params) -> list[dict]:
        return await self.list_all("/snapshots/detail", "snapshots", **params)

    async def snapshot(self, snapshot_id: str) -> dict:
        return await self.get(path("snapshots", snapshot_id), "snapshot")

    async def create_snapshot(self, fields: dict) -> dict:
        return await self.create("/snapshots", "snapshot", fields)

    async def update_snapshot(self, snapshot_id: str, fields: dict) -> dict:
        return await self.update(
            path("snapshots", snapshot_id), "snapshot", fields
        )

    async def set_snapshot_metadata(self, snapshot_id: str, metadata: dict):
        """Replace the snapshot's metadata (keys left out are removed)."""
        return await self.update(
            path("snapshots", snapshot_id, "metadata"), "metadata", metadata
        )

    async def delete_snapshot(self, snapshot_id: str) -> None:
        await self.delete(path("snapshots", snapshot_id))

    async def backups(self, **params) -> list[dict]:
        return await self.list_all("/backups/detail", "backups", **params)

    async def backup(self, backup_id: str) -> dict:
        return await self.get(path("backups", backup_id), "backup")

    async def create_backup(self, fields: dict) -> dict:
        return await self.create("/backups", "backup", fields)

    async def delete_backup(self, backup_id: str, force: bool = False):
        if force:
            await self.action(
                path("backups", backup_id, "action"), {"os-force_delete": {}}
            )
            return
        await self.delete(path("backups", backup_id))

    async def restore_backup(self, backup_id: str, fields: dict) -> dict:
        return await self.create(
            path("backups", backup_id, "restore"), "restore", fields
        )

    async def availability_zones(self) -> list[dict]:
        return await self.list("/os-availability-zone", "availabilityZoneInfo")

    async def volume_types(self) -> list[dict]:
        return await self.list("/types", "volume_types")

    async def limits(self) -> dict:
        return (await self.get("/limits", "limits")).get("absolute") or {}


class KeystoneIdentityClient(ServiceClient):
    """The identity calls Horizon makes with the user's own token: role
    assignments on the project, EC2 and application credentials, generic
    credentials and the password change (``openstack_dashboard/api/
    keystone.py``)."""

    service_type = "identity"
    service_name = "keystone"

    @property
    def endpoint(self) -> str:
        """The catalog's identity URL, with ``/v3`` added when the catalog
        lists the unversioned root."""
        url = super().endpoint
        if not url.endswith("/v3"):
            url += "/v3"
            self._endpoint = url
        return url

    async def catalog(self) -> list[dict]:
        """The service catalog of this token."""
        return await self.list("/auth/catalog", "catalog")

    async def role_assignments(self, project_id: str) -> list[dict]:
        return await self.list(
            "/role_assignments",
            "role_assignments",
            **{"scope.project.id": project_id, "include_names": "true"},
        )

    async def grant_project_role(
        self, project_id: str, user_id: str, role_id: str
    ) -> None:
        await self.request(
            "PUT",
            path("projects", project_id, "users", user_id, "roles", role_id),
        )

    async def revoke_project_role(
        self, project_id: str, user_id: str, role_id: str
    ) -> None:
        await self.delete(
            path("projects", project_id, "users", user_id, "roles", role_id)
        )

    async def change_own_password(
        self, user_id: str, original: str, new: str
    ) -> None:
        await self.action(
            path("users", user_id, "password"),
            {"user": {"password": new, "original_password": original}},
        )

    async def ec2_credentials(self, user_id: str) -> list[dict]:
        return await self.list(
            path("users", user_id, "credentials", "OS-EC2"), "credentials"
        )

    async def create_ec2_credential(
        self, user_id: str, project_id: str
    ) -> dict:
        reply = await self.action(
            path("users", user_id, "credentials", "OS-EC2"),
            {"tenant_id": project_id},
        )
        return reply.get("credential") or {}

    async def delete_ec2_credential(self, user_id: str, access: str) -> None:
        await self.delete(
            path("users", user_id, "credentials", "OS-EC2", access)
        )

    async def application_credentials(self, user_id: str) -> list[dict]:
        return await self.list(
            path("users", user_id, "application_credentials"),
            "application_credentials",
        )

    async def application_credential(
        self, user_id: str, credential_id: str
    ) -> dict:
        return await self.get(
            path("users", user_id, "application_credentials", credential_id),
            "application_credential",
        )

    async def create_application_credential(
        self, user_id: str, fields: dict
    ) -> dict:
        return await self.create(
            path("users", user_id, "application_credentials"),
            "application_credential",
            fields,
        )

    async def delete_application_credential(
        self, user_id: str, credential_id: str
    ) -> None:
        await self.delete(
            path("users", user_id, "application_credentials", credential_id)
        )

    async def credentials(self, user_id: str) -> list[dict]:
        return await self.list("/credentials", "credentials", user_id=user_id)

    async def delete_credential(self, credential_id: str) -> None:
        await self.delete(path("credentials", credential_id))
