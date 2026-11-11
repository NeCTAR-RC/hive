"""API Access (Horizon ``project/api_access``): the service catalog, what
an OpenStack client needs to know about the user and project, and the
openrc and clouds.yaml files built from it."""

import shlex

import yaml

from hive.clients.openstack import KeystoneIdentityClient
from hive.schemas.responses.api_access import ApiCredentials, ServiceEndpoint
from hive.services.context import Context
from hive.services.download import Download, safe_filename
from hive.session.model import UserRef

CLOUDS_YAML_HEADER = """\
# This is a clouds.yaml file, which can be used by OpenStack tools as a source
# of configuration on how to connect to a cloud. If this is your only cloud,
# just put this file in ~/.config/openstack/clouds.yaml and tools like
# python-openstackclient will just work with no further config. (You will need
# to add your password to the auth section)
# If you have more than one cloud account, add the cloud entry to the clouds
# section of your existing file and you can refer to them by name with
# OS_CLOUD=openstack or --os-cloud=openstack
"""


def public_endpoints(
    catalog: list[dict], region: str | None, interface: str = "public"
) -> list[dict]:
    """The catalog flattened to one row per endpoint on ``interface`` in
    the region, sorted by service name."""
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


async def endpoints(ctx: Context) -> list[ServiceEndpoint]:
    """The live catalog of the project's token (``GET /v3/auth/catalog``):
    the session keeps only the endpoints Hive calls, not the names and
    regions this table shows."""
    client = KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)
    rows = public_endpoints(
        await client.catalog(),
        ctx.settings.region,
        ctx.settings.endpoint_interface,
    )
    return [ServiceEndpoint.model_validate(row) for row in rows]


def _credentials(ctx: Context, user: UserRef) -> dict:
    """The user and project details as the openrc and clouds.yaml
    templates read them."""
    project = ctx.scoped.project
    return {
        "username": user.name,
        "user_id": user.id,
        "user_domain_id": user.domain_id or "default",
        "project_id": project.id,
        "project_name": project.name,
        "project_domain_id": project.domain_id or "default",
        "auth_url": ctx.settings.keystone_public,
        "region": ctx.settings.region,
    }


def credentials(ctx: Context, user: UserRef) -> ApiCredentials:
    return ApiCredentials.model_validate(_credentials(ctx, user))


def openrc_text(creds: dict) -> str:
    """The openrc Horizon offers (``api_access/templates/api_access/
    openrc.sh.template``), every value shell-quoted."""
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
    """The clouds.yaml Horizon offers (``api_access/templates/api_access/
    clouds.yaml.template``), serialised by YAML so any name is safe."""
    cloud = {
        "auth": {
            "auth_url": creds["auth_url"],
            "username": creds["username"],
            "project_id": creds["project_id"],
            "project_name": creds["project_name"],
            "user_domain_id": creds["user_domain_id"],
            "project_domain_id": creds["project_domain_id"],
        },
        "region_name": creds["region"],
        "interface": "public",
        "identity_api_version": 3,
    }
    body = yaml.safe_dump(
        {"clouds": {"openstack": cloud}},
        sort_keys=False,
        default_flow_style=False,
        allow_unicode=False,
    )
    return CLOUDS_YAML_HEADER + body


def openrc(ctx: Context, user: UserRef) -> Download:
    creds = _credentials(ctx, user)
    return Download(
        safe_filename(creds["project_name"], "openstack") + "-openrc.sh",
        "text/x-shellscript",
        openrc_text(creds),
    )


def clouds_yaml(ctx: Context, user: UserRef) -> Download:
    return Download(
        "clouds.yaml",
        "application/x-yaml",
        clouds_yaml_text(_credentials(ctx, user)),
    )
