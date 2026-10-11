"""Identity dashboard panels: Project Members, Application Credentials,
EC2 credentials and the user's Keystone credentials."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
from hive.config import Settings
from hive.deps import get_session, get_settings, SessionContext
from hive.errors import Forbidden
from hive.schemas.identity import (
    ApplicationCredentialCreate,
    CredentialCreate,
    MemberAdd,
)
from hive.services import credentials, members
from hive.services.context import Context

router = APIRouter(prefix="/identity", tags=["identity"])


def current_user_id(ctx: SessionContext = Depends(get_session)) -> str:
    return ctx.data.user.id


async def manager_context(
    ctx: Context = Depends(get_context),
    settings: Settings = Depends(get_settings),
) -> Context:
    """The Members panel is for tenant managers (``panel.py:25``)."""
    if settings.tenantmanager_role_name not in ctx.scoped.roles:
        raise Forbidden("Only a tenant manager can manage project members.")
    return ctx


# --- members -------------------------------------------------------------------


@router.get("/members")
async def list_members(
    ctx: Context = Depends(manager_context),
    user_id: str = Depends(current_user_id),
):
    return await members.list_members(ctx, user_id)


@router.post("/members", status_code=201)
async def add_member(body: MemberAdd, ctx: Context = Depends(manager_context)):
    return await members.add_member(ctx, body.email, body.role_id)


@router.delete("/members/{member_id}/roles/{role_id}", status_code=204)
async def remove_member(
    member_id: str,
    role_id: str,
    ctx: Context = Depends(manager_context),
    user_id: str = Depends(current_user_id),
):
    await members.remove_member(ctx, user_id, member_id, role_id)
    return Response(status_code=204)


# --- application credentials ---------------------------------------------------


@router.get("/application-credentials")
async def list_application_credentials(
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.list_application_credentials(ctx, user_id)


@router.get("/application-credentials/options")
async def application_credential_options(ctx: Context = Depends(get_context)):
    return credentials.application_credential_options(ctx)


@router.post("/application-credentials", status_code=201)
async def create_application_credential(
    body: ApplicationCredentialCreate,
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.create_application_credential(ctx, user_id, body)


@router.get("/application-credentials/{credential_id}")
async def get_application_credential(
    credential_id: str,
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.get_application_credential(
        ctx, user_id, credential_id
    )


@router.delete("/application-credentials/{credential_id}", status_code=204)
async def delete_application_credential(
    credential_id: str,
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    await credentials.delete_application_credential(
        ctx, user_id, credential_id
    )
    return Response(status_code=204)


# --- EC2 credentials -----------------------------------------------------------


@router.get("/ec2-credentials")
async def ec2_credential(
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.ec2_credential(ctx, user_id, create=False)


@router.post("/ec2-credentials")
async def ensure_ec2_credential(
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    """Horizon creates the project's EC2 pair the first time it is viewed
    (``api_access/views.py:42-69``)."""
    return await credentials.ec2_credential(ctx, user_id, create=True)


@router.post("/ec2-credentials/recreate")
async def recreate_ec2_credential(
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.recreate_ec2_credential(ctx, user_id)


@router.delete("/ec2-credentials/{access}", status_code=204)
async def delete_ec2_credential(
    access: str,
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    await credentials.delete_ec2_credential(ctx, user_id, access)
    return Response(status_code=204)


# --- generic credentials -------------------------------------------------------


@router.get("/credentials")
async def list_credentials(
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.list_credentials(ctx, user_id)


@router.post("/credentials", status_code=201)
async def create_credential(
    body: CredentialCreate,
    ctx: Context = Depends(get_context),
    user_id: str = Depends(current_user_id),
):
    return await credentials.create_credential(ctx, user_id, body)


@router.delete("/credentials/{credential_id}", status_code=204)
async def delete_credential(
    credential_id: str, ctx: Context = Depends(get_context)
):
    await credentials.delete_credential(ctx, credential_id)
    return Response(status_code=204)
