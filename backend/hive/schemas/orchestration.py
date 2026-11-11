"""Request bodies for the Orchestration (Heat) panels."""

from typing import Annotated, Any, Literal

from pydantic import Field, field_validator

from hive.nectar import orchestration as rules
from hive.schemas import StrictModel

# Heat's own cap on a template (``max_template_size``, 512 KiB by default);
# the same bound applies to an environment and to each extra file.
MAX_DOCUMENT_CHARS = 512 * 1024
Document = Annotated[str, Field(max_length=MAX_DOCUMENT_CHARS)]

# The stack actions Heat's ``POST /stacks/{name}/{id}/actions`` takes.
StackActionName = Literal["suspend", "resume", "check", "cancel_update"]


class TemplateSource(StrictModel):
    """A template as pasted text, a URL, or an already parsed document, plus
    an optional environment and extra files."""

    template: Document | dict | None = None
    template_url: str | None = Field(default=None, max_length=2048)
    environment: Document | dict | None = None
    files: dict[str, Document] | None = None


class StackCreate(TemplateSource):
    name: str = Field(min_length=1, max_length=255)
    parameters: dict[str, Any] = Field(default_factory=dict)
    timeout_mins: int = Field(default=60, ge=1, le=10080)
    rollback: bool = False
    tags: list[str] | None = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        rules.validate_stack_name(value)
        return value


class StackUpdate(TemplateSource):
    parameters: dict[str, Any] = Field(default_factory=dict)
    timeout_mins: int | None = Field(default=None, ge=1, le=10080)
    rollback: bool | None = None
    existing: bool = False


class StackAction(StrictModel):
    """A stack action to run; whether the stack's status allows it is
    checked against Heat."""

    action: StackActionName
