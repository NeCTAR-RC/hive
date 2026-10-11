"""API Access: the service catalog, the user's credentials, and the
openrc and clouds.yaml downloads (Horizon ``project/api_access``)."""

import shlex

from fastapi import APIRouter, Depends, Response

from hive.config import Settings
from hive.deps import get_session, get_settings, SessionContext

router = APIRouter(prefix="/api-access", tags=["api-access"])


def public_endpoints(
    catalog: list[dict], region: str | None, interface: str = "public"
) -> list[dict]:
    """The catalog flattened to one row per public endpoint in the region."""
    items = []
    for service in catalog:
        for endpoint in service.get("endpoints") or []:
            if endpoint.get("interface") != interface:
                continue
            ep_region = endpoint.get("region") or endpoint.get("region_id")
            if region and ep_region and ep_region != region:
                continue
            items.append(
                {
                    "type": service.get("type") or "",
                    "name": service.get("name") or service.get("type") or "",
                    "url": endpoint.get("url") or "",
                    "region": ep_region,
                }
            )
    items.sort(key=lambda item: (item["name"].lower(), item["type"]))
    return items


async def _credentials(ctx: SessionContext, settings: Settings) -> dict:
    scoped = await ctx.scoped()
    return {
        "username": ctx.data.user.name,
        "user_id": ctx.data.user.id,
        "user_domain_id": ctx.data.user.domain_id or "default",
        "project_id": scoped.project.id,
        "project_name": scoped.project.name,
        "project_domain_id": scoped.project.domain_id or "default",
        "auth_url": settings.keystone_public,
        "region": settings.region,
    }


def openrc_text(creds: dict) -> str:
    q = shlex.quote
    return "\n".join(
        [
            "#!/usr/bin/env bash",
            "# To use an OpenStack cloud you need to authenticate against the"
            " Identity",
            "# service named keystone, which returns a **Token** and **Service"
            " Catalog**.",
            "# The catalog contains the endpoints for all services the"
            " user/tenant has",
            "# access to - such as Compute, Image Service, Identity, Object"
            " Storage, Block",
            "# Storage, and Networking (code-named nova, glance, keystone,"
            " swift,",
            "# cinder, and neutron).",
            "#",
            "# *NOTE*: Using the 3 *Identity API* does not necessarily mean"
            " any other",
            "# OpenStack API is version 3. For example, your cloud provider"
            " may implement",
            "# Image API v1.1, Block Storage API v2, and Compute API v2.0."
            " OS_AUTH_URL is",
            "# only for the Identity API served through keystone.",
            f"export OS_AUTH_URL={q(creds['auth_url'])}",
            "# With the addition of Keystone we have standardized on the term"
            " **project**",
            "# as the entity that owns the resources.",
            f"export OS_PROJECT_ID={q(creds['project_id'])}",
            f"export OS_PROJECT_NAME={q(creds['project_name'])}",
            f"export OS_USER_DOMAIN_ID={q(creds['user_domain_id'])}",
            'if [ -z "$OS_USER_DOMAIN_ID" ]; then unset OS_USER_DOMAIN_ID; fi',
            f"export OS_PROJECT_DOMAIN_ID={q(creds['project_domain_id'])}",
            'if [ -z "$OS_PROJECT_DOMAIN_ID" ]; then'
            " unset OS_PROJECT_DOMAIN_ID; fi",
            "# unset v2.0 items in case set",
            "unset OS_TENANT_ID",
            "unset OS_TENANT_NAME",
            "# In addition to the owning entity (tenant), OpenStack stores the"
            " entity",
            "# performing the action as the **user**.",
            f"export OS_USERNAME={q(creds['username'])}",
            "# With Keystone you pass the keystone password.",
            'echo "Please enter your OpenStack Password for project'
            ' $OS_PROJECT_NAME as user $OS_USERNAME: "',
            "read -sr OS_PASSWORD_INPUT",
            "export OS_PASSWORD=$OS_PASSWORD_INPUT",
            "# If your configuration has multiple regions, we set that"
            " information here.",
            "# OS_REGION_NAME is optional and only valid in certain"
            " environments.",
            f"export OS_REGION_NAME={q(creds['region'])}",
            "# Don't leave a blank variable, unset it if it was empty",
            'if [ -z "$OS_REGION_NAME" ]; then unset OS_REGION_NAME; fi',
            "export OS_INTERFACE=public",
            "export OS_IDENTITY_API_VERSION=3",
            "",
        ]
    )


def clouds_yaml_text(creds: dict) -> str:
    def yq(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

    return "\n".join(
        [
            "# This is a clouds.yaml file, which can be used by OpenStack"
            " tools as a source",
            "# of configuration on how to connect to a cloud. If this is your"
            " only cloud,",
            "# just put this file in ~/.config/openstack/clouds.yaml and"
            " tools like",
            "# python-openstackclient will just work with no further config."
            " (You will need",
            "# to add your password to the auth section)",
            "# If you have more than one cloud account, add the cloud entry"
            " to the clouds",
            "# section of your existing file and you can refer to them by"
            " name with",
            "# OS_CLOUD=openstack or --os-cloud=openstack",
            "clouds:",
            "  openstack:",
            "    auth:",
            f"      auth_url: {yq(creds['auth_url'])}",
            f"      username: {yq(creds['username'])}",
            f"      project_id: {creds['project_id']}",
            f"      project_name: {yq(creds['project_name'])}",
            f"      user_domain_id: {yq(creds['user_domain_id'])}",
            f"      project_domain_id: {yq(creds['project_domain_id'])}",
            f"    region_name: {yq(creds['region'])}",
            '    interface: "public"',
            "    identity_api_version: 3",
            "",
        ]
    )


def _filename(project_name: str, suffix: str) -> str:
    safe = "".join(
        c if c.isalnum() or c in "-_." else "_" for c in project_name
    )
    return f"{safe or 'openstack'}{suffix}"


@router.get("/endpoints")
async def endpoints(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    scoped = await ctx.scoped()
    return {
        "items": public_endpoints(
            scoped.catalog, settings.region, settings.endpoint_interface
        )
    }


@router.get("/credentials")
async def credentials(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    return await _credentials(ctx, settings)


@router.get("/openrc")
async def openrc(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    creds = await _credentials(ctx, settings)
    filename = _filename(creds["project_name"], "-openrc.sh")
    return Response(
        openrc_text(creds),
        media_type="text/x-shellscript",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/clouds.yaml")
async def clouds_yaml(
    ctx: SessionContext = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    creds = await _credentials(ctx, settings)
    return Response(
        clouds_yaml_text(creds),
        media_type="application/x-yaml",
        headers={
            "Content-Disposition": 'attachment; filename="clouds.yaml"',
            "Cache-Control": "no-store",
        },
    )
