"""Orchestration (Heat) endpoints."""

from fastapi import APIRouter, Depends, Response

from hive.api.compute import get_context
from hive.schemas.orchestration import StackCreate, StackUpdate, TemplateSource
from hive.services import orchestration
from hive.services.context import Context

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


@router.get("/stacks")
async def list_stacks(ctx: Context = Depends(get_context)):
    return await orchestration.list_stacks(ctx)


@router.post("/stacks", status_code=202)
async def create_stack(body: StackCreate, ctx: Context = Depends(get_context)):
    return await orchestration.create_stack(ctx, body)


@router.post("/validate")
async def validate_template(body: TemplateSource, ctx: Context = Depends(get_context)):
    return await orchestration.validate_template(ctx, body)


@router.get("/resource-types")
async def resource_types(ctx: Context = Depends(get_context)):
    return await orchestration.resource_types(ctx)


@router.get("/resource-types/{name:path}")
async def resource_type(name: str, ctx: Context = Depends(get_context)):
    return await orchestration.resource_type(ctx, name)


@router.get("/template-versions")
async def template_versions(ctx: Context = Depends(get_context)):
    return await orchestration.template_versions(ctx)


@router.get("/template-versions/{version}/functions")
async def template_functions(version: str, ctx: Context = Depends(get_context)):
    return await orchestration.template_functions(ctx, version)


@router.get("/stacks/{identity}")
async def get_stack(identity: str, ctx: Context = Depends(get_context)):
    return await orchestration.get_stack(ctx, identity)


@router.patch("/stacks/{identity}", status_code=202)
async def update_stack(identity: str, body: StackUpdate, ctx: Context = Depends(get_context)):
    return await orchestration.update_stack(ctx, identity, body)


@router.delete("/stacks/{identity}", status_code=204)
async def delete_stack(identity: str, ctx: Context = Depends(get_context)):
    await orchestration.delete_stack(ctx, identity)
    return Response(status_code=204)


@router.post("/stacks/{identity}/actions/{action}", status_code=202)
async def stack_action(identity: str, action: str, ctx: Context = Depends(get_context)):
    if action not in ("suspend", "resume", "check", "cancel_update"):
        return Response(status_code=404)
    return await orchestration.stack_action(ctx, identity, action)


@router.get("/stacks/{identity}/resources")
async def stack_resources(identity: str, ctx: Context = Depends(get_context)):
    return await orchestration.stack_resources(ctx, identity)


@router.get("/stacks/{identity}/resources/{resource}")
async def stack_resource(identity: str, resource: str, ctx: Context = Depends(get_context)):
    return await orchestration.stack_resource(ctx, identity, resource)


@router.get("/stacks/{identity}/events")
async def stack_events(identity: str, limit: int = 100, ctx: Context = Depends(get_context)):
    return await orchestration.stack_events(ctx, identity, limit)


@router.get("/stacks/{identity}/template")
async def stack_template(identity: str, ctx: Context = Depends(get_context)):
    return await orchestration.stack_template(ctx, identity)
