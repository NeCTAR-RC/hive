"""Orchestration (Heat): stacks, resources, events, templates, resource
types and template versions."""

import asyncio

import yaml

from hive.clients.heat import HeatClient
from hive.errors import BadRequest, Conflict, NotFound
from hive.nectar import orchestration as rules
from hive.schemas.orchestration import StackCreate, StackUpdate, TemplateSource
from hive.services.context import Context

STATIC_TTL = 3600
STATIC_STALE = 21600
# Documents larger than this are parsed and dumped off the event loop.
THREAD_BYTES = 16 * 1024


def _heat(ctx: Context) -> HeatClient:
    return HeatClient(ctx.http, ctx.settings, ctx.scoped)


def _load(text: str, what: str):
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise BadRequest(
            f"The {what} is not valid YAML or JSON: {exc}"
        ) from exc


async def parse_document(
    text: str | dict | None, what: str
) -> str | dict | None:
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
    if len(text) > THREAD_BYTES:
        parsed = await asyncio.to_thread(_load, text, what)
    else:
        parsed = _load(text, what)
    if not isinstance(parsed, dict):
        raise BadRequest(f"The {what} must be a mapping.")
    return text


async def _dump(document) -> str:
    """YAML for display, off the event loop (templates can be large and
    their size is unknown until dumped)."""
    return await asyncio.to_thread(
        yaml.safe_dump, document, sort_keys=False, default_flow_style=False
    )


async def _template_fields(
    source: TemplateSource, required: bool = True
) -> dict:
    """``template`` or ``template_url``, ``environment`` and ``files`` for
    Heat, each document parsed once."""
    fields: dict = {}
    template = await parse_document(source.template, "template")
    if template is not None:
        fields["template"] = template
    elif source.template_url:
        fields["template_url"] = source.template_url
    elif required:
        raise BadRequest("Provide a template or a template URL.")
    environment = await parse_document(source.environment, "environment")
    if environment:
        fields["environment"] = environment
    if source.files:
        fields["files"] = source.files
    return fields


async def _validate(ctx: Context, fields: dict) -> dict:
    """``POST /validate``: the parameters form for the launch step."""
    validated = await _heat(ctx).validate(fields)
    return {
        "description": validated.get("Description"),
        "parameters": rules.parameter_specs(validated),
    }


async def _resolve(ctx: Context, identity: str) -> tuple[str, str]:
    """The ``(name, id)`` pair Heat wants in paths, from either."""
    stack = await _heat(ctx).find_stack(identity)
    return stack.get("stack_name") or identity, stack.get("id") or identity


async def list_stacks(ctx: Context) -> dict:
    stacks = await _heat(ctx).stacks(sort_key="creation_time", sort_dir="desc")
    return {"items": [rules.stack_summary(s) for s in stacks]}


async def get_stack(ctx: Context, identity: str) -> dict:
    stack = await _heat(ctx).find_stack(identity)
    return rules.stack_detail(stack)


async def stack_resources(ctx: Context, identity: str) -> dict:
    name, stack_id = await _resolve(ctx, identity)
    resources = await _heat(ctx).resources(name, stack_id, nested_depth=0)
    return {"items": [rules.resource_summary(r) for r in resources]}


async def stack_resource(ctx: Context, identity: str, resource: str) -> dict:
    name, stack_id = await _resolve(ctx, identity)
    return rules.resource_summary(
        await _heat(ctx).resource(name, stack_id, resource)
    )


async def stack_events(ctx: Context, identity: str, limit: int = 100) -> dict:
    name, stack_id = await _resolve(ctx, identity)
    events = await _heat(ctx).events(
        name, stack_id, sort_dir="desc", limit=limit
    )
    return {"items": [rules.event_summary(e) for e in events]}


async def stack_template(ctx: Context, identity: str) -> dict:
    name, stack_id = await _resolve(ctx, identity)
    heat = _heat(ctx)
    template, environment = await asyncio.gather(
        heat.template(name, stack_id), heat.environment(name, stack_id)
    )
    return {
        "template": template,
        "template_yaml": await _dump(template),
        "environment": environment,
        "environment_yaml": await _dump(environment),
    }


async def validate_template(ctx: Context, source: TemplateSource) -> dict:
    """``POST /validate``: the parameters form for the launch step."""
    return await _validate(ctx, await _template_fields(source))


async def create_stack(ctx: Context, data: StackCreate) -> dict:
    problem = rules.validate_stack_name(data.name)
    if problem:
        raise BadRequest(problem)
    fields = await _template_fields(data)
    validation = await _validate(ctx, fields)
    try:
        parameters = rules.coerce_parameters(
            data.parameters, validation["parameters"]
        )
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    body = rules.stack_body(
        name=data.name,
        template=fields.get("template"),
        template_url=fields.get("template_url"),
        environment=fields.get("environment"),
        files=fields.get("files"),
        parameters=parameters,
        timeout_mins=data.timeout_mins,
        rollback=data.rollback,
        tags=data.tags,
    )
    created = await _heat(ctx).create_stack(body)
    return {"id": created.get("id"), "name": data.name}


async def update_stack(ctx: Context, identity: str, data: StackUpdate) -> dict:
    name, stack_id = await _resolve(ctx, identity)
    heat = _heat(ctx)
    body = await _template_fields(data, required=not data.existing)
    specs = []
    if "template" in body or "template_url" in body:
        specs = (await _validate(ctx, body))["parameters"]
    try:
        body["parameters"] = (
            rules.coerce_parameters(data.parameters, specs)
            if specs
            else data.parameters
        )
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    if data.timeout_mins is not None:
        body["timeout_mins"] = data.timeout_mins
    if data.rollback is not None:
        body["disable_rollback"] = not data.rollback
    await heat.update_stack(name, stack_id, body, existing=data.existing)
    return {"id": stack_id, "name": name}


async def stack_action(ctx: Context, identity: str, action: str) -> dict:
    refusal = rules.ACTION_REFUSALS.get(action)
    if refusal is None:
        raise NotFound(f"Unknown stack action {action!r}.")
    stack = await _heat(ctx).find_stack(identity)
    status = stack.get("stack_status")
    if action not in rules.stack_actions(status):
        raise Conflict(f"{refusal} while it is {status}.")
    await _heat(ctx).stack_action(
        stack.get("stack_name"), stack.get("id"), action
    )
    return {"id": stack.get("id"), "action": action}


async def delete_stack(ctx: Context, identity: str) -> None:
    name, stack_id = await _resolve(ctx, identity)
    await _heat(ctx).delete_stack(name, stack_id)


async def resource_types(ctx: Context) -> dict:
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

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("heat-resource-types"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="heat-resource-types",
    )
    return {"items": result.value}


async def resource_type(ctx: Context, name: str) -> dict:
    heat = _heat(ctx)
    schema, template = await asyncio.gather(
        heat.resource_type(name), heat.resource_type_template(name)
    )
    return {
        "name": name,
        "attributes": schema.get("attributes") or {},
        "properties": schema.get("properties") or {},
        "support_status": schema.get("support_status"),
        "template": template,
        "template_yaml": await _dump(template),
    }


async def template_versions(ctx: Context) -> dict:
    async def fetch():
        versions = await _heat(ctx).template_versions()
        versions.sort(key=lambda v: v.get("version") or "")
        return versions

    result = await ctx.cache.get_or_fetch(
        ctx.cache.global_key("heat-template-versions"),
        fetch,
        ttl=STATIC_TTL,
        stale_ttl=STATIC_STALE,
        name="heat-template-versions",
    )
    return {"items": result.value}


async def template_functions(ctx: Context, version: str) -> dict:
    functions = await _heat(ctx).template_functions(version)
    functions.sort(key=lambda f: f.get("functions") or "")
    return {"version": version, "items": functions}
