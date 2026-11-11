"""Replies of the Orchestration (Heat) panels."""

from typing import Any

from pydantic import ConfigDict

from hive.schemas.orchestration import StackActionName
from hive.schemas.responses import Items, ResponseModel


class Stack(ResponseModel):
    """A stack row; ``actions`` are the row actions its status allows."""

    id: str
    name: str
    description: str | None
    status: str | None
    status_reason: str | None
    creation_time: str | None
    updated_time: str | None
    deletion_time: str | None
    timeout_mins: int | None
    disable_rollback: bool | None
    tags: list[str]
    parent: str | None
    stack_owner: str | None
    is_transitional: bool
    actions: list[str]


class StackOutput(ResponseModel):
    key: str | None
    value: Any
    description: str | None
    error: str | None


class StackDetail(Stack):
    """The stack overview; ``parameters`` are Heat's, passed through."""

    parameters: dict[str, Any]
    outputs: list[StackOutput]
    capabilities: list[str]
    notification_topics: list[str]
    template_description: str | None


class StackAccepted(ResponseModel):
    """A stack create or update Heat accepted and carries out later."""

    id: str
    name: str


class StackActionAccepted(ResponseModel):
    """A suspend, resume, check or cancel-update Heat accepted."""

    id: str
    action: StackActionName


class StackResource(ResponseModel):
    """A resource row. ``attributes`` (Heat's, passed through) come only
    with a single resource; a list row has ``None``."""

    name: str | None
    logical_id: str | None
    physical_id: str | None
    type: str | None
    status: str | None
    status_reason: str | None
    updated_time: str | None
    creation_time: str | None
    required_by: list[str]
    is_transitional: bool
    attributes: dict[str, Any] | None
    description: str | None


class StackEvent(ResponseModel):
    id: str | None
    resource_name: str | None
    logical_id: str | None
    physical_id: str | None
    status: str | None
    status_reason: str | None
    event_time: str | None


class StackTemplate(ResponseModel):
    """A stack's template and environment as Heat holds them, each also
    dumped to YAML for display, and the environment as a change of
    template starts from (``editable_environment_yaml``): without its
    parameters, which the change carries itself, and empty when nothing
    else is left."""

    template: dict[str, Any]
    template_yaml: str
    environment: dict[str, Any]
    environment_yaml: str
    editable_environment_yaml: str


class ParameterSpec(ResponseModel):
    """One field of the launch form, from Heat's ``POST /validate``.
    ``allowed_values`` and ``default`` keep the template's own types (a
    number parameter allows numbers)."""

    name: str
    type: str
    label: str
    description: str
    group: str | None
    default: Any
    no_echo: bool
    required: bool
    allowed_values: list[Any] | None
    allowed_pattern: str | None
    min_length: int | None
    max_length: int | None
    min_value: float | None
    max_value: float | None
    custom_constraint: str | None
    constraint_description: str | None


class TemplateValidation(ResponseModel):
    description: str | None
    parameters: list[ParameterSpec]


class ResourceTypeSummary(ResponseModel):
    name: str | None
    description: str | None


class ResourceTypeAttribute(ResponseModel):
    """Passes Heat's attribute schema through."""

    model_config = ConfigDict(extra="allow")

    description: str | None = None
    type: str | None = None


class ResourceTypeDetail(ResponseModel):
    """A resource type's schema (Heat's, passed through) and its example
    template."""

    name: str
    attributes: dict[str, ResourceTypeAttribute]
    properties: dict[str, dict[str, Any]]
    support_status: dict[str, Any] | None
    template: dict[str, Any]
    template_yaml: str


class TemplateVersion(ResponseModel):
    """Passes Heat's template version record through."""

    model_config = ConfigDict(extra="allow")

    version: str
    type: str
    aliases: list[str] | None = None


class TemplateFunction(ResponseModel):
    """Passes Heat's template function record through."""

    model_config = ConfigDict(extra="allow")

    functions: str
    description: str


class TemplateFunctionList(Items[TemplateFunction]):
    """The functions of one template version."""

    version: str
