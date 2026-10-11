"""Heat stack rules, as heat-dashboard presents them (from the Heat v1 API
reference, ``heat/api-ref/source/v1``, and the plugin's behaviour; the
plugin is not vendored, so the dashboard conventions here are the
upstream heat-dashboard ones).

- Statuses are ``<ACTION>_<STATE>`` (CREATE, UPDATE, DELETE, SUSPEND,
  RESUME, CHECK, ROLLBACK, ADOPT, SNAPSHOT, RESTORE with IN_PROGRESS,
  COMPLETE or FAILED); ``*_IN_PROGRESS`` is transitional.
- Launch: a template (file, pasted text or URL) and an optional
  environment are validated first; Heat answers with the parameters
  (type, label, description, default, no_echo, constraints) that become
  the form. Creation takes the stack name, timeout in minutes (default
  60), rollback on failure (sent as ``disable_rollback``) and the
  parameters coerced to their types.
- Actions: suspend needs a completed, not suspended stack; resume needs
  SUSPEND_COMPLETE; check needs a completed stack; update needs a
  completed or failed stack; delete anything not already deleting.
"""

import json
import re

STACK_NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.-]*$")
DEFAULT_TIMEOUT = 60
TRANSITIONAL = "_IN_PROGRESS"
PARAMETER_TYPES = ("string", "number", "comma_delimited_list", "json", "boolean")


def is_transitional(status: str | None) -> bool:
    return bool(status) and status.endswith(TRANSITIONAL)


def _completed(status: str | None) -> bool:
    return bool(status) and status.endswith("_COMPLETE")


def stack_actions(status: str | None) -> list[str]:
    actions = []
    if _completed(status) and status != "DELETE_COMPLETE":
        if status == "SUSPEND_COMPLETE":
            actions.append("resume")
        else:
            actions.append("suspend")
            actions.append("check")
    if (_completed(status) or (status or "").endswith("_FAILED")) and status != "DELETE_COMPLETE":
        actions.append("update")
    if status != "DELETE_IN_PROGRESS":
        actions.append("delete")
    return actions


def validate_stack_name(name: str) -> str | None:
    if not STACK_NAME.match(name or ""):
        return (
            "Stack names start with a letter and contain only letters,"
            " numbers, dots, dashes and underscores."
        )
    return None


API_TYPES = {
    "String": "string",
    "Number": "number",
    "CommaDelimitedList": "comma_delimited_list",
    "Json": "json",
    "Boolean": "boolean",
}


def parameter_specs(validated: dict) -> list[dict]:
    """The parameter form from ``POST /validate``: one entry per template
    parameter, grouped parameters first in group order, with the field
    semantics heat-dashboard derives from the CFN-style keys Heat emits
    (``heat/engine/api.py: format_validate_parameter``)."""
    specs = []
    groups = validated.get("ParameterGroups") or []
    order: list[str] = []
    group_of: dict[str, str] = {}
    for group in groups:
        for name in group.get("parameters") or []:
            order.append(name)
            group_of[name] = group.get("label") or ""
    params = validated.get("Parameters") or {}
    names = [n for n in order if n in params] + [n for n in params if n not in order]
    for name in names:
        param = params[name]
        api_type = param.get("Type") or "String"
        specs.append(
            {
                "name": name,
                "type": API_TYPES.get(api_type, api_type.lower()),
                "label": param.get("Label") or name,
                "description": param.get("Description") or "",
                "group": group_of.get(name),
                "default": param.get("Default"),
                "no_echo": str(param.get("NoEcho", "false")).lower() == "true",
                "required": "Default" not in param,
                "allowed_values": param.get("AllowedValues"),
                "allowed_pattern": param.get("AllowedPattern"),
                "min_length": param.get("MinLength"),
                "max_length": param.get("MaxLength"),
                "min_value": param.get("MinValue"),
                "max_value": param.get("MaxValue"),
                "custom_constraint": param.get("CustomConstraint"),
                "constraint_description": param.get("ConstraintDescription"),
            }
        )
    return specs


def coerce_parameters(values: dict, specs: list[dict]) -> dict:
    """Form strings back into the types Heat expects."""
    by_name = {s["name"]: s for s in specs}
    out: dict = {}
    for name, value in values.items():
        spec = by_name.get(name)
        ptype = (spec or {}).get("type", "string")
        if value is None or value == "":
            if spec and spec.get("required"):
                raise ValueError(f"{spec.get('label') or name} is required.")
            continue
        if ptype == "number":
            try:
                out[name] = int(value) if str(value).lstrip("-").isdigit() else float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{name} must be a number.") from exc
        elif ptype == "boolean":
            if isinstance(value, bool):
                out[name] = value
            else:
                out[name] = str(value).strip().lower() in ("true", "1", "yes", "on")
        elif ptype == "comma_delimited_list":
            out[name] = (
                ",".join(value) if isinstance(value, list) else str(value)
            )
        elif ptype == "json":
            if isinstance(value, (dict, list)):
                out[name] = value
            else:
                try:
                    out[name] = json.loads(str(value))
                except ValueError as exc:
                    raise ValueError(f"{name} must be valid JSON.") from exc
        else:
            out[name] = value
    return out


def stack_body(
    *,
    name: str,
    template: str | dict | None,
    template_url: str | None,
    environment: str | dict | None,
    files: dict | None,
    parameters: dict,
    timeout_mins: int,
    rollback: bool,
    tags: list[str] | None = None,
) -> dict:
    body: dict = {
        "stack_name": name,
        "parameters": parameters,
        "timeout_mins": timeout_mins,
        "disable_rollback": not rollback,
    }
    if template is not None and template != "":
        body["template"] = template
    elif template_url:
        body["template_url"] = template_url
    if environment:
        body["environment"] = environment
    if files:
        body["files"] = files
    if tags:
        body["tags"] = ",".join(tags)
    return body


def stack_summary(stack: dict) -> dict:
    status = stack.get("stack_status")
    return {
        "id": stack.get("id"),
        "name": stack.get("stack_name"),
        "description": stack.get("description"),
        "status": status,
        "status_reason": stack.get("stack_status_reason"),
        "creation_time": stack.get("creation_time"),
        "updated_time": stack.get("updated_time"),
        "deletion_time": stack.get("deletion_time"),
        "timeout_mins": stack.get("timeout_mins"),
        "disable_rollback": stack.get("disable_rollback"),
        "tags": stack.get("tags") or [],
        "parent": stack.get("parent"),
        "stack_owner": stack.get("stack_owner"),
        "is_transitional": is_transitional(status),
        "actions": stack_actions(status),
    }


def stack_detail(stack: dict) -> dict:
    summary = stack_summary(stack)
    summary.update(
        {
            "parameters": stack.get("parameters") or {},
            "outputs": [
                {
                    "key": o.get("output_key"),
                    "value": o.get("output_value"),
                    "description": o.get("description"),
                    "error": o.get("output_error"),
                }
                for o in stack.get("outputs") or []
            ],
            "capabilities": stack.get("capabilities") or [],
            "notification_topics": stack.get("notification_topics") or [],
            "template_description": stack.get("template_description"),
        }
    )
    return summary


def resource_summary(resource: dict) -> dict:
    status = resource.get("resource_status")
    return {
        "name": resource.get("resource_name"),
        "logical_id": resource.get("logical_resource_id"),
        "physical_id": resource.get("physical_resource_id"),
        "type": resource.get("resource_type"),
        "status": status,
        "status_reason": resource.get("resource_status_reason"),
        "updated_time": resource.get("updated_time"),
        "creation_time": resource.get("creation_time"),
        "required_by": resource.get("required_by") or [],
        "is_transitional": is_transitional(status),
        "attributes": resource.get("attributes"),
        "description": resource.get("description"),
    }


def event_summary(event: dict) -> dict:
    return {
        "id": event.get("id"),
        "resource_name": event.get("resource_name"),
        "logical_id": event.get("logical_resource_id"),
        "physical_id": event.get("physical_resource_id"),
        "status": event.get("resource_status"),
        "status_reason": event.get("resource_status_reason"),
        "event_time": event.get("event_time"),
    }
