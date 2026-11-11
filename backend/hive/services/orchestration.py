"""Orchestration (Heat): stacks, resources, events, templates, resource
types and template versions."""

import asyncio

import yaml

from hive.cache import policy
from hive.clients.heat import HeatClient
from hive.errors import BadRequest, Conflict
from hive.nectar import orchestration as rules
from hive.schemas.orchestration import (
    StackActionName,
    StackCreate,
    StackUpdate,
    TemplateSource,
)
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
from hive.services.context import Context


def _heat(ctx: Context) -> HeatClient:
    return HeatClient(ctx.http, ctx.settings, ctx.scoped)


def parse_document(text: str | dict | None, what: str) -> str | dict | None:
    """A YAML or JSON template or environment. Pasted text is checked to be
    a mapping and passed to Heat verbatim (Heat accepts a string and parses
    it itself; re-serialising would turn ``2021-04-16`` into a date).
    ``None`` when empty."""
    if text is None:
        return None
    if isinstance(text, dict):
        return text
    if not text.strip():
        return None
    try:
        parsed = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise BadRequest(
            f"The {what} is not valid YAML or JSON: {exc}"
        ) from exc
    if not isinstance(parsed, dict):
        raise BadRequest(f"The {what} must be a mapping.")
    return text


async def parse_document_async(
    text: str | dict | None, what: str
) -> str | dict | None:
    """``parse_document`` off the event loop: a large template can take a
    while to parse, and the single worker must keep serving meanwhile."""
    return await asyncio.to_thread(parse_document, text, what)


async def _resolve(ctx: Context, identity: str) -> tuple[str, str]:
    """The ``(name, id)`` pair Heat wants in paths, from either."""
    stack = await _heat(ctx).find_stack(identity)
    return stack.get("stack_name") or identity, stack.get("id") or identity


async def list_stacks(ctx: Context) -> list[Stack]:
    stacks = await _heat(ctx).stacks(sort_key="creation_time", sort_dir="desc")
    return [Stack.model_validate(rules.stack_summary(s)) for s in stacks]


async def get_stack(ctx: Context, identity: str) -> StackDetail:
    stack = await _heat(ctx).find_stack(identity)
    return StackDetail.model_validate(rules.stack_detail(stack))


async def stack_resources(ctx: Context, identity: str) -> list[StackResource]:
    name, stack_id = await _resolve(ctx, identity)
    resources = await _heat(ctx).resources(name, stack_id, nested_depth=0)
    return [
        StackResource.model_validate(rules.resource_summary(r))
        for r in resources
    ]


async def stack_resource(
    ctx: Context, identity: str, resource: str
) -> StackResource:
    name, stack_id = await _resolve(ctx, identity)
    return StackResource.model_validate(
        rules.resource_summary(
            await _heat(ctx).resource(name, stack_id, resource)
        )
    )


async def stack_events(
    ctx: Context, identity: str, limit: int = 100
) -> list[StackEvent]:
    name, stack_id = await _resolve(ctx, identity)
    events = await _heat(ctx).events(
        name, stack_id, sort_dir="desc", limit=limit
    )
    return [StackEvent.model_validate(rules.event_summary(e)) for e in events]


async def stack_template(ctx: Context, identity: str) -> StackTemplate:
    name, stack_id = await _resolve(ctx, identity)
    heat = _heat(ctx)
    template, environment = await asyncio.gather(
        heat.template(name, stack_id), heat.environment(name, stack_id)
    )
    editable = editable_environment(environment)
    return StackTemplate(
        template=template,
        template_yaml=yaml.safe_dump(
            template, sort_keys=False, default_flow_style=False
        ),
        environment=environment,
        environment_yaml=yaml.safe_dump(
            environment, sort_keys=False, default_flow_style=False
        ),
        editable_environment_yaml=yaml.safe_dump(
            editable, sort_keys=False, default_flow_style=False
        )
        if editable
        else "",
    )


def editable_environment(environment: dict) -> dict:
    """The environment a change of template is pre-filled with: Heat's
    stored environment without ``parameters`` and
    ``encrypted_param_names``, which the change's parameters step carries
    from the stack's current values (Heat masks hidden values in what it
    returns, so sending them back would overwrite them), and without the
    sections Heat fills in empty (an empty ``resource_registry`` holds an
    empty ``resources``)."""
    kept: dict = {}
    for section, value in environment.items():
        if section in ("parameters", "encrypted_param_names"):
            continue
        if section == "resource_registry" and isinstance(value, dict):
            value = {
                key: entry
                for key, entry in value.items()
                if not (key == "resources" and not entry)
            }
        if value:
            kept[section] = value
    return kept


async def template_source(
    source: TemplateSource, *, required: bool = True
) -> dict:
    """The template (or its URL), environment and files of a request, as
    Heat takes them. Each document is parsed once, here, to check it."""
    body: dict = {}
    template = await parse_document_async(source.template, "template")
    if template is not None:
        body["template"] = template
    elif source.template_url:
        body["template_url"] = source.template_url
    elif required:
        raise BadRequest("Provide a template or a template URL.")
    environment = await parse_document_async(source.environment, "environment")
    if environment:
        body["environment"] = environment
    if source.files:
        body["files"] = source.files
    return body


async def _validated(ctx: Context, source: dict) -> dict:
    validated = await _heat(ctx).validate(source)
    return {
        "description": validated.get("Description"),
        "parameters": rules.parameter_specs(validated),
    }


async def validate_template(
    ctx: Context, source: TemplateSource
) -> TemplateValidation:
    """``POST /validate``: the parameters form for the launch step."""
    return TemplateValidation.model_validate(
        await _validated(ctx, await template_source(source))
    )


async def create_stack(ctx: Context, data: StackCreate) -> StackAccepted:
    source = await template_source(data)
    specs = (await _validated(ctx, source))["parameters"]
    body = rules.stack_body(
        name=data.name,
        source=source,
        parameters=rules.coerce_parameters(data.parameters, specs),
        timeout_mins=data.timeout_mins,
        rollback=data.rollback,
        tags=data.tags,
    )
    created = await _heat(ctx).create_stack(body)
    return StackAccepted.model_validate(
        {"id": created.get("id"), "name": data.name}
    )


async def update_stack(
    ctx: Context, identity: str, data: StackUpdate
) -> StackAccepted:
    """``existing`` (PATCH) may leave the template out and keep the
    stack's own; otherwise the new template is validated first."""
    name, stack_id = await _resolve(ctx, identity)
    body = await template_source(data, required=not data.existing)
    specs = []
    if "template" in body or "template_url" in body:
        specs = (await _validated(ctx, body))["parameters"]
    body["parameters"] = (
        rules.coerce_parameters(data.parameters, specs)
        if specs
        else data.parameters
    )
    if data.timeout_mins is not None:
        body["timeout_mins"] = data.timeout_mins
    if data.rollback is not None:
        body["disable_rollback"] = not data.rollback
    await _heat(ctx).update_stack(name, stack_id, body, existing=data.existing)
    return StackAccepted(id=stack_id, name=name)


async def stack_action(
    ctx: Context, identity: str, action: StackActionName
) -> StackActionAccepted:
    stack = await _heat(ctx).find_stack(identity)
    status = stack.get("stack_status")
    if action not in rules.stack_actions(status):
        raise Conflict(
            f"{rules.ACTION_REFUSALS[action]} while it is {status}."
        )
    await _heat(ctx).stack_action(
        stack.get("stack_name") or identity,
        stack.get("id") or identity,
        action,
    )
    return StackActionAccepted.model_validate(
        {"id": stack.get("id"), "action": action}
    )


async def delete_stack(ctx: Context, identity: str) -> None:
    name, stack_id = await _resolve(ctx, identity)
    await _heat(ctx).delete_stack(name, stack_id)


async def resource_types(ctx: Context) -> list[ResourceTypeSummary]:
    async def fetch():
        types = await _heat(ctx).resource_types(with_description=True)
        items = []
        for entry in types:
            if isinstance(entry, dict):
                items.append(
                    {
                        "name": entry.get("resource_type"),
                        "description": entry.get("description"),
                    }
                )
            else:
                items.append({"name": entry, "description": None})
        items.sort(key=lambda t: t["name"] or "")
        return items

    result = await ctx.cached(policy.HEAT_RESOURCE_TYPES, fetch)
    return [ResourceTypeSummary.model_validate(t) for t in result.value]


async def resource_type(ctx: Context, name: str) -> ResourceTypeDetail:
    heat = _heat(ctx)
    schema, template = await asyncio.gather(
        heat.resource_type(name), heat.resource_type_template(name)
    )
    return ResourceTypeDetail(
        name=name,
        attributes=schema.get("attributes") or {},
        properties=schema.get("properties") or {},
        support_status=schema.get("support_status"),
        template=template,
        template_yaml=yaml.safe_dump(
            template, sort_keys=False, default_flow_style=False
        ),
    )


async def template_versions(ctx: Context) -> list[TemplateVersion]:
    async def fetch():
        versions = await _heat(ctx).template_versions()
        versions.sort(key=lambda v: v.get("version") or "")
        return versions

    result = await ctx.cached(policy.HEAT_TEMPLATE_VERSIONS, fetch)
    return [TemplateVersion.model_validate(v) for v in result.value]


async def template_functions(
    ctx: Context, version: str
) -> TemplateFunctionList:
    functions = await _heat(ctx).template_functions(version)
    functions.sort(key=lambda f: f.get("functions") or "")
    return TemplateFunctionList.model_validate(
        {"version": version, "items": functions}
    )
