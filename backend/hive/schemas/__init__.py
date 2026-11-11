"""Request bodies and query strings the API accepts.

Every request model derives from ``StrictModel``: an unknown field is a
422, never silently dropped, so a misspelt field in the SPA (``flavorId``
for ``flavor_id``) fails loudly instead of falling back to a default.

A Nectar rule that needs nothing but the request (a name pattern, a CIDR)
runs here, in a validator, so it shows in the OpenAPI schema and fails as
a 422 on its field; rules that need upstream data run in the services.
"""

from typing import Self

from pydantic import BaseModel, ConfigDict, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class UpdateModel(StrictModel):
    """An edit form: a field left out (or ``null``) keeps its value, and
    a body that changes nothing is refused."""

    @model_validator(mode="after")
    def _changes_something(self) -> Self:
        if not self.changes():
            raise ValueError("nothing to update")
        return self

    def changes(self) -> dict:
        """The fields to send upstream."""
        return self.model_dump(exclude_none=True)
