"""API Access: the service catalog, the user's credentials, and the
openrc and clouds.yaml downloads (Horizon ``project/api_access``)."""

from fastapi import APIRouter, Response

from hive.api.replies import attachment
from hive.deps import ContextDep, SessionDep
from hive.schemas.responses import Items
from hive.schemas.responses.api_access import ApiCredentials, ServiceEndpoint
from hive.services import api_access

router = APIRouter(prefix="/api-access", tags=["api-access"])


@router.get("/endpoints")
async def endpoints(ctx: ContextDep) -> Items[ServiceEndpoint]:
    return Items[ServiceEndpoint](items=await api_access.endpoints(ctx))


@router.get("/credentials")
async def credentials(ctx: ContextDep, session: SessionDep) -> ApiCredentials:
    return api_access.credentials(ctx, session.data.user)


@router.get("/openrc")
async def openrc(ctx: ContextDep, session: SessionDep) -> Response:
    return attachment(api_access.openrc(ctx, session.data.user))


@router.get("/clouds.yaml")
async def clouds_yaml(ctx: ContextDep, session: SessionDep) -> Response:
    return attachment(api_access.clouds_yaml(ctx, session.data.user))
