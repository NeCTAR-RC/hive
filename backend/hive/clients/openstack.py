"""Thin clients for the OpenStack services Hive drives directly.

Each wraps the REST API with the pinned microversion from settings and
returns plain dicts; shaping for the SPA happens in ``hive.services``.
"""

from collections.abc import AsyncIterable

from hive.clients.base import ServiceClient

MAX_PAGES = 20


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

    # --- servers ------------------------------------------------------------

    async def servers(self, **params) -> dict:
        return await self.get_json("/servers/detail", params=params) or {}

    async def servers_brief(self, **params) -> list[dict]:
        """Ids and names only (``GET /servers``), for name lookups."""
        body = await self.get_json("/servers", params=params) or {}
        return body.get("servers", [])

    async def server(self, server_id: str) -> dict:
        body = await self.get_json(f"/servers/{server_id}")
        return (body or {}).get("server", {})

    async def create_server(self, server: dict, extra: dict | None = None):
        body = {"server": server, **(extra or {})}
        resp = await self.request("POST", "/servers", json=body)
        return resp.json()

    async def update_server(self, server_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/servers/{server_id}", json={"server": fields}
        )
        return resp.json().get("server", {})

    async def delete_server(self, server_id: str) -> None:
        await self.request("DELETE", f"/servers/{server_id}")

    async def action(self, server_id: str, body: dict, timeout=None):
        return await self.request(
            "POST", f"/servers/{server_id}/action", json=body, timeout=timeout
        )

    async def console_output(self, server_id: str, length: int | None):
        payload = {"os-getConsoleOutput": {}}
        if length:
            payload["os-getConsoleOutput"]["length"] = length
        resp = await self.action(server_id, payload)
        return resp.json().get("output", "")

    async def remote_console(self, server_id: str, kind: str = "novnc"):
        resp = await self.request(
            "POST",
            f"/servers/{server_id}/remote-consoles",
            json={"remote_console": {"protocol": "vnc", "type": kind}},
        )
        return resp.json().get("remote_console", {})

    async def server_password(self, server_id: str) -> str:
        body = await self.get_json(f"/servers/{server_id}/os-server-password")
        return (body or {}).get("password", "")

    async def interfaces(self, server_id: str) -> list[dict]:
        body = await self.get_json(f"/servers/{server_id}/os-interface")
        return (body or {}).get("interfaceAttachments", [])

    async def attach_interface(self, server_id: str, attachment: dict):
        resp = await self.request(
            "POST",
            f"/servers/{server_id}/os-interface",
            json={"interfaceAttachment": attachment},
        )
        return resp.json().get("interfaceAttachment", {})

    async def detach_interface(self, server_id: str, port_id: str) -> None:
        await self.request(
            "DELETE", f"/servers/{server_id}/os-interface/{port_id}"
        )

    async def volume_attachments(self, server_id: str) -> list[dict]:
        body = await self.get_json(
            f"/servers/{server_id}/os-volume_attachments"
        )
        return (body or {}).get("volumeAttachments", [])

    async def attach_volume(
        self, server_id: str, volume_id: str, device: str | None = None
    ):
        attachment: dict = {"volumeId": volume_id}
        if device:
            attachment["device"] = device
        resp = await self.request(
            "POST",
            f"/servers/{server_id}/os-volume_attachments",
            json={"volumeAttachment": attachment},
        )
        return resp.json().get("volumeAttachment", {})

    async def detach_volume(self, server_id: str, volume_id: str) -> None:
        await self.request(
            "DELETE", f"/servers/{server_id}/os-volume_attachments/{volume_id}"
        )

    async def instance_actions(self, server_id: str) -> list[dict]:
        body = await self.get_json(f"/servers/{server_id}/os-instance-actions")
        return (body or {}).get("instanceActions", [])

    # --- flavours, key pairs, server groups, zones, limits ------------------

    async def flavors(self) -> list[dict]:
        body = await self.get_json("/flavors/detail", params={"limit": 1000})
        return (body or {}).get("flavors", [])

    async def flavor(self, flavor_id: str) -> dict:
        body = await self.get_json(f"/flavors/{flavor_id}")
        return (body or {}).get("flavor", {})

    async def keypairs(self) -> list[dict]:
        body = await self.get_json("/os-keypairs")
        return [k["keypair"] for k in (body or {}).get("keypairs", [])]

    async def keypair(self, name: str) -> dict:
        body = await self.get_json(f"/os-keypairs/{name}")
        return (body or {}).get("keypair", {})

    async def create_keypair(self, keypair: dict) -> dict:
        resp = await self.request(
            "POST", "/os-keypairs", json={"keypair": keypair}
        )
        return resp.json().get("keypair", {})

    async def delete_keypair(self, name: str) -> None:
        await self.request("DELETE", f"/os-keypairs/{name}")

    async def server_groups(self) -> list[dict]:
        body = await self.get_json("/os-server-groups", params={"limit": 1000})
        return (body or {}).get("server_groups", [])

    async def create_server_group(self, group: dict) -> dict:
        resp = await self.request(
            "POST", "/os-server-groups", json={"server_group": group}
        )
        return resp.json().get("server_group", {})

    async def delete_server_group(self, group_id: str) -> None:
        await self.request("DELETE", f"/os-server-groups/{group_id}")

    async def availability_zones(self) -> list[dict]:
        body = await self.get_json("/os-availability-zone")
        return (body or {}).get("availabilityZoneInfo", [])

    async def limits(self) -> dict:
        body = await self.get_json("/limits")
        return ((body or {}).get("limits") or {}).get("absolute", {})


class NeutronClient(ServiceClient):
    service_type = "network"
    service_name = "neutron"

    async def networks(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/networks", params=params)
        return (body or {}).get("networks", [])

    async def network(self, network_id: str) -> dict:
        body = await self.get_json(f"/v2.0/networks/{network_id}")
        return (body or {}).get("network", {})

    async def subnets(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/subnets", params=params)
        return (body or {}).get("subnets", [])

    async def ports(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/ports", params=params)
        return (body or {}).get("ports", [])

    async def create_network(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/networks", json={"network": fields}
        )
        return resp.json().get("network", {})

    async def update_network(self, network_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/networks/{network_id}", json={"network": fields}
        )
        return resp.json().get("network", {})

    async def delete_network(self, network_id: str) -> None:
        await self.request("DELETE", f"/v2.0/networks/{network_id}")

    async def subnet(self, subnet_id: str) -> dict:
        body = await self.get_json(f"/v2.0/subnets/{subnet_id}")
        return (body or {}).get("subnet", {})

    async def create_subnet(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/subnets", json={"subnet": fields}
        )
        return resp.json().get("subnet", {})

    async def update_subnet(self, subnet_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/subnets/{subnet_id}", json={"subnet": fields}
        )
        return resp.json().get("subnet", {})

    async def delete_subnet(self, subnet_id: str) -> None:
        await self.request("DELETE", f"/v2.0/subnets/{subnet_id}")

    async def subnetpools(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/subnetpools", params=params)
        return (body or {}).get("subnetpools", [])

    async def port(self, port_id: str) -> dict:
        body = await self.get_json(f"/v2.0/ports/{port_id}")
        return (body or {}).get("port", {})

    async def create_port(self, fields: dict) -> dict:
        resp = await self.request("POST", "/v2.0/ports", json={"port": fields})
        return resp.json().get("port", {})

    async def update_port(self, port_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/ports/{port_id}", json={"port": fields}
        )
        return resp.json().get("port", {})

    async def delete_port(self, port_id: str) -> None:
        await self.request("DELETE", f"/v2.0/ports/{port_id}")

    async def routers(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/routers", params=params)
        return (body or {}).get("routers", [])

    async def router(self, router_id: str) -> dict:
        body = await self.get_json(f"/v2.0/routers/{router_id}")
        return (body or {}).get("router", {})

    async def create_router(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/routers", json={"router": fields}
        )
        return resp.json().get("router", {})

    async def update_router(self, router_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/routers/{router_id}", json={"router": fields}
        )
        return resp.json().get("router", {})

    async def delete_router(self, router_id: str) -> None:
        await self.request("DELETE", f"/v2.0/routers/{router_id}")

    async def router_add_interface(self, router_id: str, body: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/routers/{router_id}/add_router_interface", json=body
        )
        return resp.json()

    async def router_remove_interface(self, router_id: str, body: dict):
        await self.request(
            "PUT",
            f"/v2.0/routers/{router_id}/remove_router_interface",
            json=body,
        )

    async def floatingips(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/floatingips", params=params)
        return (body or {}).get("floatingips", [])

    async def floatingip(self, fip_id: str) -> dict:
        body = await self.get_json(f"/v2.0/floatingips/{fip_id}")
        return (body or {}).get("floatingip", {})

    async def create_floatingip(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/floatingips", json={"floatingip": fields}
        )
        return resp.json().get("floatingip", {})

    async def update_floatingip(self, fip_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/floatingips/{fip_id}", json={"floatingip": fields}
        )
        return resp.json().get("floatingip", {})

    async def delete_floatingip(self, fip_id: str) -> None:
        await self.request("DELETE", f"/v2.0/floatingips/{fip_id}")

    async def port_forwardings(self, fip_id: str) -> list[dict]:
        body = await self.get_json(
            f"/v2.0/floatingips/{fip_id}/port_forwardings"
        )
        return (body or {}).get("port_forwardings", [])

    async def create_port_forwarding(self, fip_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST",
            f"/v2.0/floatingips/{fip_id}/port_forwardings",
            json={"port_forwarding": fields},
        )
        return resp.json().get("port_forwarding", {})

    async def update_port_forwarding(
        self, fip_id: str, rule_id: str, fields: dict
    ) -> dict:
        resp = await self.request(
            "PUT",
            f"/v2.0/floatingips/{fip_id}/port_forwardings/{rule_id}",
            json={"port_forwarding": fields},
        )
        return resp.json().get("port_forwarding", {})

    async def delete_port_forwarding(self, fip_id: str, rule_id: str) -> None:
        await self.request(
            "DELETE", f"/v2.0/floatingips/{fip_id}/port_forwardings/{rule_id}"
        )

    async def trunks(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/trunks", params=params)
        return (body or {}).get("trunks", [])

    async def trunk(self, trunk_id: str) -> dict:
        body = await self.get_json(f"/v2.0/trunks/{trunk_id}")
        return (body or {}).get("trunk", {})

    async def create_trunk(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/trunks", json={"trunk": fields}
        )
        return resp.json().get("trunk", {})

    async def update_trunk(self, trunk_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/v2.0/trunks/{trunk_id}", json={"trunk": fields}
        )
        return resp.json().get("trunk", {})

    async def delete_trunk(self, trunk_id: str) -> None:
        await self.request("DELETE", f"/v2.0/trunks/{trunk_id}")

    async def trunk_add_subports(self, trunk_id: str, subports: list[dict]):
        resp = await self.request(
            "PUT",
            f"/v2.0/trunks/{trunk_id}/add_subports",
            json={"sub_ports": subports},
        )
        return resp.json()

    async def trunk_remove_subports(self, trunk_id: str, subports: list[dict]):
        resp = await self.request(
            "PUT",
            f"/v2.0/trunks/{trunk_id}/remove_subports",
            json={"sub_ports": subports},
        )
        return resp.json()

    async def quota_details(self, project_id: str) -> dict:
        body = await self.get_json(f"/v2.0/quotas/{project_id}/details.json")
        return (body or {}).get("quota", {})

    async def availability_zones(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/availability_zones", params=params)
        return (body or {}).get("availability_zones", [])

    async def extensions(self) -> list[str]:
        body = await self.get_json("/v2.0/extensions")
        return [e.get("alias") for e in (body or {}).get("extensions", [])]

    async def security_groups(self, **params) -> list[dict]:
        body = await self.get_json("/v2.0/security-groups", params=params)
        return (body or {}).get("security_groups", [])

    async def security_group(self, group_id: str) -> dict:
        body = await self.get_json(f"/v2.0/security-groups/{group_id}")
        return (body or {}).get("security_group", {})

    async def create_security_group(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/v2.0/security-groups", json={"security_group": fields}
        )
        return resp.json().get("security_group", {})

    async def update_security_group(self, group_id: str, fields: dict):
        resp = await self.request(
            "PUT",
            f"/v2.0/security-groups/{group_id}",
            json={"security_group": fields},
        )
        return resp.json().get("security_group", {})

    async def delete_security_group(self, group_id: str) -> None:
        await self.request("DELETE", f"/v2.0/security-groups/{group_id}")

    async def create_security_group_rule(self, rule: dict) -> dict:
        resp = await self.request(
            "POST",
            "/v2.0/security-group-rules",
            json={"security_group_rule": rule},
        )
        return resp.json().get("security_group_rule", {})

    async def delete_security_group_rule(self, rule_id: str) -> None:
        await self.request("DELETE", f"/v2.0/security-group-rules/{rule_id}")


class GlanceClient(ServiceClient):
    service_type = "image"
    service_name = "glance"

    async def images(self, **params) -> list[dict]:
        """Follow glance's ``next`` links until exhausted."""
        items: list[dict] = []
        params.setdefault("limit", 500)
        path = "/v2/images"
        query: dict | None = params
        for _ in range(MAX_PAGES):
            body = await self.get_json(path, params=query, timeout=40) or {}
            items.extend(body.get("images", []))
            nxt = body.get("next")
            if not nxt:
                break
            # ``next`` is relative to the endpoint root ("/v2/images?...").
            path, query = nxt, None
        return items

    async def image(self, image_id: str) -> dict:
        return await self.get_json(f"/v2/images/{image_id}") or {}

    async def create_image(self, fields: dict) -> dict:
        resp = await self.request("POST", "/v2/images", json=fields)
        return resp.json()

    async def patch_image(self, image_id: str, patch: list[dict]) -> dict:
        resp = await self.request(
            "PATCH",
            f"/v2/images/{image_id}",
            content=__import__("json").dumps(patch).encode(),
            headers={
                "Content-Type": (
                    "application/openstack-images-v2.1-json-patch"
                )
            },
        )
        return resp.json()

    async def delete_image(self, image_id: str) -> None:
        await self.request("DELETE", f"/v2/images/{image_id}")

    async def import_image(self, image_id: str, uri: str) -> None:
        await self.request(
            "POST",
            f"/v2/images/{image_id}/import",
            json={"method": {"name": "web-download", "uri": uri}},
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
            f"/v2/images/{image_id}/file",
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
        body = await self.get_json("/volumes/detail", params=params)
        return (body or {}).get("volumes", [])

    async def volume(self, volume_id: str) -> dict:
        body = await self.get_json(f"/volumes/{volume_id}")
        return (body or {}).get("volume", {})

    async def snapshots(self, **params) -> list[dict]:
        body = await self.get_json("/snapshots/detail", params=params)
        return (body or {}).get("snapshots", [])

    async def availability_zones(self) -> list[dict]:
        body = await self.get_json("/os-availability-zone")
        return (body or {}).get("availabilityZoneInfo", [])

    async def volume_types(self) -> list[dict]:
        body = await self.get_json("/types")
        return (body or {}).get("volume_types", [])

    async def create_volume(self, fields: dict) -> dict:
        resp = await self.request("POST", "/volumes", json={"volume": fields})
        return resp.json().get("volume", {})

    async def update_volume(self, volume_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/volumes/{volume_id}", json={"volume": fields}
        )
        return resp.json().get("volume", {})

    async def delete_volume(self, volume_id: str) -> None:
        await self.request("DELETE", f"/volumes/{volume_id}")

    async def volume_action(self, volume_id: str, body: dict):
        return await self.request(
            "POST", f"/volumes/{volume_id}/action", json=body
        )

    async def snapshot(self, snapshot_id: str) -> dict:
        body = await self.get_json(f"/snapshots/{snapshot_id}")
        return (body or {}).get("snapshot", {})

    async def create_snapshot(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/snapshots", json={"snapshot": fields}
        )
        return resp.json().get("snapshot", {})

    async def update_snapshot(self, snapshot_id: str, fields: dict) -> dict:
        resp = await self.request(
            "PUT", f"/snapshots/{snapshot_id}", json={"snapshot": fields}
        )
        return resp.json().get("snapshot", {})

    async def delete_snapshot(self, snapshot_id: str) -> None:
        await self.request("DELETE", f"/snapshots/{snapshot_id}")

    async def backups(self, **params) -> list[dict]:
        body = await self.get_json("/backups/detail", params=params)
        return (body or {}).get("backups", [])

    async def backup(self, backup_id: str) -> dict:
        body = await self.get_json(f"/backups/{backup_id}")
        return (body or {}).get("backup", {})

    async def create_backup(self, fields: dict) -> dict:
        resp = await self.request("POST", "/backups", json={"backup": fields})
        return resp.json().get("backup", {})

    async def delete_backup(self, backup_id: str, force: bool = False):
        if force:
            await self.request(
                "POST",
                f"/backups/{backup_id}/action",
                json={"os-force_delete": {}},
            )
            return
        await self.request("DELETE", f"/backups/{backup_id}")

    async def restore_backup(self, backup_id: str, fields: dict) -> dict:
        resp = await self.request(
            "POST", f"/backups/{backup_id}/restore", json={"restore": fields}
        )
        return resp.json().get("restore", {})

    async def limits(self) -> dict:
        body = await self.get_json("/limits")
        return ((body or {}).get("limits") or {}).get("absolute") or {}


class KeystoneIdentityClient(ServiceClient):
    """The identity calls Horizon makes with the user's own token: role
    assignments on the project, EC2 and application credentials, generic
    credentials and the password change (``openstack_dashboard/api/
    keystone.py``)."""

    service_type = "identity"
    service_name = "keystone"

    @property
    def endpoint(self) -> str:
        if self._endpoint is None:
            url = ServiceClient.endpoint.fget(self)  # type: ignore[union-attr]
            if not url.rstrip("/").endswith("/v3"):
                url = url.rstrip("/") + "/v3"
            self._endpoint = url
        return self._endpoint

    async def role_assignments(self, project_id: str) -> list[dict]:
        body = await self.get_json(
            "/role_assignments",
            params={"scope.project.id": project_id, "include_names": "true"},
        )
        return (body or {}).get("role_assignments", [])

    async def grant_project_role(
        self, project_id: str, user_id: str, role_id: str
    ) -> None:
        await self.request(
            "PUT", f"/projects/{project_id}/users/{user_id}/roles/{role_id}"
        )

    async def revoke_project_role(
        self, project_id: str, user_id: str, role_id: str
    ) -> None:
        await self.request(
            "DELETE",
            f"/projects/{project_id}/users/{user_id}/roles/{role_id}",
        )

    async def change_own_password(
        self, user_id: str, original: str, new: str
    ) -> None:
        await self.request(
            "POST",
            f"/users/{user_id}/password",
            json={"user": {"password": new, "original_password": original}},
        )

    async def ec2_credentials(self, user_id: str) -> list[dict]:
        body = await self.get_json(f"/users/{user_id}/credentials/OS-EC2")
        return (body or {}).get("credentials", [])

    async def create_ec2_credential(
        self, user_id: str, project_id: str
    ) -> dict:
        resp = await self.request(
            "POST",
            f"/users/{user_id}/credentials/OS-EC2",
            json={"tenant_id": project_id},
        )
        return resp.json().get("credential", {})

    async def delete_ec2_credential(self, user_id: str, access: str) -> None:
        await self.request(
            "DELETE", f"/users/{user_id}/credentials/OS-EC2/{access}"
        )

    async def application_credentials(self, user_id: str) -> list[dict]:
        body = await self.get_json(f"/users/{user_id}/application_credentials")
        return (body or {}).get("application_credentials", [])

    async def application_credential(
        self, user_id: str, credential_id: str
    ) -> dict:
        body = await self.get_json(
            f"/users/{user_id}/application_credentials/{credential_id}"
        )
        return (body or {}).get("application_credential", {})

    async def create_application_credential(
        self, user_id: str, fields: dict
    ) -> dict:
        resp = await self.request(
            "POST",
            f"/users/{user_id}/application_credentials",
            json={"application_credential": fields},
        )
        return resp.json().get("application_credential", {})

    async def delete_application_credential(
        self, user_id: str, credential_id: str
    ) -> None:
        await self.request(
            "DELETE",
            f"/users/{user_id}/application_credentials/{credential_id}",
        )

    async def credentials(self, user_id: str) -> list[dict]:
        body = await self.get_json("/credentials", params={"user_id": user_id})
        return (body or {}).get("credentials", [])

    async def create_credential(self, fields: dict) -> dict:
        resp = await self.request(
            "POST", "/credentials", json={"credential": fields}
        )
        return resp.json().get("credential", {})

    async def delete_credential(self, credential_id: str) -> None:
        await self.request("DELETE", f"/credentials/{credential_id}")
