"""Request bodies for the Orchestration (Heat) panels."""

from typing import Any

from pydantic import BaseModel, Field


class TemplateSource(BaseModel):
    """A template as pasted text, a URL, or an already parsed document, plus
    an optional environment and extra files."""

    template: str | dict | None = None
    template_url: str | None = Field(default=None, max_length=2048)
    environment: str | dict | None = None
    files: dict[str, str] | None = None


class StackCreate(TemplateSource):
    name: str = Field(min_length=1, max_length=255)
    parameters: dict[str, Any] = Field(default_factory=dict)
    timeout_mins: int = Field(default=60, ge=1, le=10080)
    rollback: bool = False
    tags: list[str] | None = None


class StackUpdate(TemplateSource):
    parameters: dict[str, Any] = Field(default_factory=dict)
    timeout_mins: int | None = Field(default=None, ge=1, le=10080)
    rollback: bool | None = None
    existing: bool = False
