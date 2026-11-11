"""Replies of the API Access panel."""

from hive.schemas.responses import ResponseModel


class ServiceEndpoint(ResponseModel):
    """One endpoint of the token's service catalog in this region."""

    type: str
    name: str
    url: str
    region: str | None


class ApiCredentials(ResponseModel):
    """What an openrc or clouds.yaml needs about the user and project."""

    username: str
    user_id: str
    user_domain_id: str
    project_id: str
    project_name: str
    project_domain_id: str
    auth_url: str
    region: str
