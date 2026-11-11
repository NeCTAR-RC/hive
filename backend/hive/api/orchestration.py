"""Orchestration (Heat) endpoints."""

from fastapi import APIRouter, Response

from hive.deps import ContextDep
from hive.schemas.orchestration import (
    StackAction,
    StackCreate,
    StackUpdate,
    TemplateSource,
)
from hive.schemas.responses import Items
from hive.schemas.responses.orchestration import (
    ResourceTypeDetail,
    ResourceTypeSummary,
    Stack,
    StackAccepted,
    StackActionAccepted,
    StackDetail,
    StackEvent,
    StackResource,
    StackTemplate,
    TemplateFunctionList,
    TemplateValidation,
    TemplateVersion,
)
from hive.services import orchestration

router = APIRouter(prefix="/orchestration", tags=["orchestration"])


@router.get("/stacks")
async def list_stacks(ctx: ContextDep) -> Items[Stack]:
    return Items[Stack](items=await orchestration.list_stacks(ctx))


@router.post("/stacks", status_code=202)
async def create_stack(body: StackCreate, ctx: ContextDep) -> StackAccepted:
    return await orchestration.create_stack(ctx, body)


@router.post("/validate")
async def validate_template(
    body: TemplateSource, ctx: ContextDep
) -> TemplateValidation:
    return await orchestration.validate_template(ctx, body)


@router.get("/resource-types")
async def resource_types(ctx: ContextDep) -> Items[ResourceTypeSummary]:
    return Items[ResourceTypeSummary](
        items=await orchestration.resource_types(ctx)
    )


@router.get("/resource-types/{name:path}")
async def resource_type(name: str, ctx: ContextDep) -> ResourceTypeDetail:
    return await orchestration.resource_type(ctx, name)


@router.get("/template-versions")
async def template_versions(ctx: ContextDep) -> Items[TemplateVersion]:
    return Items[TemplateVersion](
        items=await orchestration.template_versions(ctx)
    )


@router.get("/template-versions/{version}/functions")
async def template_functions(
    version: str, ctx: ContextDep
) -> TemplateFunctionList:
    return await orchestration.template_functions(ctx, version)


@router.get("/stacks/{identity}")
async def get_stack(identity: str, ctx: ContextDep) -> StackDetail:
    return await orchestration.get_stack(ctx, identity)


@router.patch("/stacks/{identity}", status_code=202)
async def update_stack(
    identity: str, body: StackUpdate, ctx: ContextDep
) -> StackAccepted:
    return await orchestration.update_stack(ctx, identity, body)


@router.delete("/stacks/{identity}", status_code=204)
async def delete_stack(identity: str, ctx: ContextDep) -> Response:
    await orchestration.delete_stack(ctx, identity)
    return Response(status_code=204)


@router.post("/stacks/{identity}/actions", status_code=202)
async def stack_action(
    identity: str, body: StackAction, ctx: ContextDep
) -> StackActionAccepted:
    return await orchestration.stack_action(ctx, identity, body.action)


@router.get("/stacks/{identity}/resources")
async def stack_resources(
    identity: str, ctx: ContextDep
) -> Items[StackResource]:
    return Items[StackResource](
        items=await orchestration.stack_resources(ctx, identity)
    )


@router.get("/stacks/{identity}/resources/{resource}")
async def stack_resource(
    identity: str, resource: str, ctx: ContextDep
) -> StackResource:
    return await orchestration.stack_resource(ctx, identity, resource)


@router.get("/stacks/{identity}/events")
async def stack_events(
    identity: str, ctx: ContextDep, limit: int = 100
) -> Items[StackEvent]:
    return Items[StackEvent](
        items=await orchestration.stack_events(ctx, identity, limit)
    )


@router.get("/stacks/{identity}/template")
async def stack_template(identity: str, ctx: ContextDep) -> StackTemplate:
    return await orchestration.stack_template(ctx, identity)
