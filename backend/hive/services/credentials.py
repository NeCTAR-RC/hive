"""Application credentials, EC2 credentials and the user's generic
Keystone credentials (Horizon ``identity/application_credentials``,
``project/api_access`` and ``identity/credentials``)."""

from datetime import datetime, UTC

from hive.clients.openstack import KeystoneIdentityClient
from hive.errors import BadRequest, Conflict
from hive.nectar import credentials as rules
from hive.schemas.identity import ApplicationCredentialCreate, CredentialCreate
from hive.services.context import Context


def _keystone(ctx: Context) -> KeystoneIdentityClient:
    return KeystoneIdentityClient(ctx.http, ctx.settings, ctx.scoped)


def app_credential_summary(credential: dict) -> dict:
    return {
        "id": credential.get("id"),
        "name": credential.get("name"),
        "description": credential.get("description"),
        "project_id": credential.get("project_id"),
        "expires_at": credential.get("expires_at"),
        "unrestricted": bool(credential.get("unrestricted")),
        "roles": [
            {
                "id": r.get("id"),
                "name": r.get("name"),
                "domain_id": r.get("domain_id"),
            }
            for r in (credential.get("roles") or [])
        ],
        "access_rules": credential.get("access_rules") or [],
    }


async def list_application_credentials(ctx: Context, user_id: str) -> dict:
    items = await _keystone(ctx).application_credentials(user_id)
    rows = [app_credential_summary(c) for c in items]
    rows.sort(key=lambda row: (row["name"] or "").lower())
    return {"items": rows}


async def get_application_credential(
    ctx: Context, user_id: str, credential_id: str
) -> dict:
    credential = await _keystone(ctx).application_credential(
        user_id, credential_id
    )
    return app_credential_summary(credential)


def application_credential_options(ctx: Context) -> dict:
    """What the create form needs: the token's roles (``forms.py:78-81``),
    the prefilled expiry and the openrc details."""
    return {
        "roles": sorted(ctx.scoped.roles),
        "default_expiration_date": rules.default_expiry(
            datetime.now(UTC), ctx.settings.app_credential_expiry_months
        ),
        "auth_url": ctx.settings.keystone_public,
        "region": ctx.settings.region,
    }


async def create_application_credential(
    ctx: Context, user_id: str, data: ApplicationCredentialCreate
) -> dict:
    try:
        body = rules.application_credential_body(
            name=data.name,
            description=data.description,
            secret=data.secret,
            expiration_date=data.expiration_date,
            expiration_time=data.expiration_time,
            roles=data.roles,
            access_rules=data.access_rules,
            unrestricted=data.unrestricted,
        )
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    try:
        created = await _keystone(ctx).create_application_credential(
            user_id, body
        )
    except Conflict as exc:
        raise Conflict(
            f'Application credential name "{data.name}" is already used.',
            service=exc.service,
        ) from exc
    summary = app_credential_summary(created)
    summary["secret"] = created.get("secret")
    return summary


async def delete_application_credential(
    ctx: Context, user_id: str, credential_id: str
) -> None:
    await _keystone(ctx).delete_application_credential(user_id, credential_id)


# --- EC2 credentials (project/api_access/views.py:42-69, forms.py:25-68) --


def ec2_summary(credential: dict | None) -> dict | None:
    if not credential:
        return None
    return {
        "access": credential.get("access"),
        "secret": credential.get("secret"),
        "project_id": credential.get("tenant_id"),
    }


async def ec2_credential(ctx: Context, user_id: str, create: bool) -> dict:
    keystone = _keystone(ctx)
    existing = rules.ec2_for_project(
        await keystone.ec2_credentials(user_id), ctx.project_id
    )
    created = False
    if existing is None and create:
        existing = await keystone.create_ec2_credential(
            user_id, ctx.project_id
        )
        created = True
    return {"credential": ec2_summary(existing), "created": created}


async def recreate_ec2_credential(ctx: Context, user_id: str) -> dict:
    keystone = _keystone(ctx)
    existing = rules.ec2_for_project(
        await keystone.ec2_credentials(user_id), ctx.project_id
    )
    if existing and existing.get("access"):
        await keystone.delete_ec2_credential(user_id, existing["access"])
    created = await keystone.create_ec2_credential(user_id, ctx.project_id)
    return {"credential": ec2_summary(created), "created": True}


async def delete_ec2_credential(
    ctx: Context, user_id: str, access: str
) -> None:
    await _keystone(ctx).delete_ec2_credential(user_id, access)


# --- generic credentials (identity/credentials) ---------------------------


def credential_summary(credential: dict) -> dict:
    return {
        "id": credential.get("id"),
        "type": credential.get("type"),
        "project_id": credential.get("project_id"),
        "blob": credential.get("blob"),
    }


async def list_credentials(ctx: Context, user_id: str) -> dict:
    items = await _keystone(ctx).credentials(user_id)
    return {"items": [credential_summary(c) for c in items]}


async def create_credential(
    ctx: Context, user_id: str, data: CredentialCreate
) -> dict:
    fields: dict = {"user_id": user_id, "type": data.type, "blob": data.blob}
    if data.project_id:
        fields["project_id"] = data.project_id
    created = await _keystone(ctx).create_credential(fields)
    return credential_summary(created)


async def delete_credential(ctx: Context, credential_id: str) -> None:
    await _keystone(ctx).delete_credential(credential_id)
