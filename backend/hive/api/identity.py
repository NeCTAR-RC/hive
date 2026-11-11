"""Identity dashboard panels: Project Members, Application Credentials,
EC2 credentials and the user's Keystone credentials."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response

from hive.deps import ContextDep, SessionDep, SettingsDep
from hive.errors import Forbidden
from hive.schemas.identity import (
    ApplicationCredentialCreate,
    MemberAdd,
)
from hive.schemas.responses import Items
from hive.schemas.responses.identity import (
    ApplicationCredential,
    ApplicationCredentialCreated,
    ApplicationCredentialOptions,
    Credential,
    Ec2Response,
    MemberRow,
    MembersResponse,
)
from hive.services import credentials, members
from hive.services.context import Context

router = APIRouter(prefix="/identity", tags=["identity"])


def current_user_id(ctx: SessionDep) -> str:
    return ctx.data.user.id


UserIdDep = Annotated[str, Depends(current_user_id)]


async def manager_context(ctx: ContextDep, settings: SettingsDep) -> Context:
    """The Members panel is for tenant managers (``panel.py:25``)."""
    if settings.tenantmanager_role_name not in ctx.scoped.roles:
        raise Forbidden("Only a tenant manager can manage project members.")
    return ctx


ManagerDep = Annotated[Context, Depends(manager_context)]


@router.get("/members")
async def list_members(ctx: ManagerDep, user_id: UserIdDep) -> MembersResponse:
    return await members.list_members(ctx, user_id)


@router.post("/members", status_code=201)
async def add_member(
    body: MemberAdd, ctx: ManagerDep, user_id: UserIdDep
) -> MemberRow:
    return await members.add_member(ctx, user_id, body.email, body.role_id)


@router.delete("/members/{member_id}/roles/{role_id}", status_code=204)
async def remove_member(
    member_id: str, role_id: str, ctx: ManagerDep, user_id: UserIdDep
) -> Response:
    await members.remove_member(ctx, user_id, member_id, role_id)
    return Response(status_code=204)


@router.get("/application-credentials")
async def list_application_credentials(
    ctx: ContextDep, user_id: UserIdDep
) -> Items[ApplicationCredential]:
    return Items[ApplicationCredential](
        items=await credentials.list_application_credentials(ctx, user_id)
    )


@router.get("/application-credentials/options")
async def application_credential_options(
    ctx: ContextDep,
) -> ApplicationCredentialOptions:
    return credentials.application_credential_options(ctx)


@router.post("/application-credentials", status_code=201)
async def create_application_credential(
    body: ApplicationCredentialCreate, ctx: ContextDep, user_id: UserIdDep
) -> ApplicationCredentialCreated:
    return await credentials.create_application_credential(ctx, user_id, body)


@router.get("/application-credentials/{credential_id}")
async def get_application_credential(
    credential_id: str, ctx: ContextDep, user_id: UserIdDep
) -> ApplicationCredential:
    return await credentials.get_application_credential(
        ctx, user_id, credential_id
    )


@router.delete("/application-credentials/{credential_id}", status_code=204)
async def delete_application_credential(
    credential_id: str, ctx: ContextDep, user_id: UserIdDep
) -> Response:
    await credentials.delete_application_credential(
        ctx, user_id, credential_id
    )
    return Response(status_code=204)


@router.get("/ec2-credentials")
async def ec2_credential(ctx: ContextDep, user_id: UserIdDep) -> Ec2Response:
    return await credentials.ec2_credential(ctx, user_id, create=False)


@router.post("/ec2-credentials")
async def ensure_ec2_credential(
    ctx: ContextDep, user_id: UserIdDep
) -> Ec2Response:
    """Horizon creates the project's EC2 pair the first time it is viewed
    (``api_access/views.py:42-69``)."""
    return await credentials.ec2_credential(ctx, user_id, create=True)


@router.post("/ec2-credentials/recreate")
async def recreate_ec2_credential(
    ctx: ContextDep, user_id: UserIdDep
) -> Ec2Response:
    return await credentials.recreate_ec2_credential(ctx, user_id)


@router.delete("/ec2-credentials/{access}", status_code=204)
async def delete_ec2_credential(
    access: str, ctx: ContextDep, user_id: UserIdDep
) -> Response:
    await credentials.delete_ec2_credential(ctx, user_id, access)
    return Response(status_code=204)


@router.get("/credentials")
async def list_credentials(
    ctx: ContextDep, user_id: UserIdDep
) -> Items[Credential]:
    return Items[Credential](
        items=await credentials.list_credentials(ctx, user_id)
    )


@router.delete("/credentials/{credential_id}", status_code=204)
async def delete_credential(credential_id: str, ctx: ContextDep) -> Response:
    await credentials.delete_credential(ctx, credential_id)
    return Response(status_code=204)
