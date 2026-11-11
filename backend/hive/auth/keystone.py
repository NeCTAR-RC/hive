"""Keystone v3 token operations, through the shared client base (so they
are timed, carry the request id and log like every upstream call).

Only three calls are needed: token-from-token (unscoped re-issue and
project scoping), the project list, and revocation. Password auth exists for
the live tests and the API password reset flow.
"""

import contextlib
from dataclasses import dataclass, field
from datetime import datetime

import httpx
from pydantic import SecretStr

from hive.clients.base import extract_message, ServiceClient, unwrap
from hive.config import Settings
from hive.errors import Forbidden, HiveError, NotAuthenticated, UpstreamError
from hive.session.model import ProjectRef, UserRef

SUBJECT_TOKEN = "X-Subject-Token"  # noqa: S105 - a header name


class InvalidToken(NotAuthenticated):
    code = "invalid_token"


@dataclass
class TokenResult:
    token: SecretStr
    expires_at: datetime
    user: UserRef
    project: ProjectRef | None = None
    roles: list[str] = field(default_factory=list)
    catalog: list[dict] = field(default_factory=list)


def parse_expires(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class KeystoneClient(ServiceClient):
    """Keystone's token API on the configured ``keystone_url``.

    Unlike the other clients it holds no scoped token: each call carries
    the token it acts on. Its error mapping is its own (``map_error``): a
    token Keystone does not know is an invalid login, not a lost resource.
    """

    service_type = "identity"
    service_name = "keystone"

    def __init__(self, http: httpx.AsyncClient, settings: Settings):
        super().__init__(http, settings, None)

    @property
    def endpoint(self) -> str:
        return self.settings.keystone_url.rstrip("/")

    def map_error(self, resp: httpx.Response) -> HiveError:
        status = resp.status_code
        details = {
            "service": self.label,
            "upstream_status": status,
            "upstream_request_id": resp.headers.get("x-openstack-request-id"),
        }
        message = extract_message(resp) if resp.content else ""
        if status in (401, 404):
            return InvalidToken(message or "token rejected", **details)
        if status == 403:
            return Forbidden(message or "forbidden", **details)
        return UpstreamError(
            message or f"keystone returned {status}", **details
        )

    async def token_from_token(
        self, token: SecretStr, project_id: str | None = None
    ) -> TokenResult:
        auth: dict = {
            "identity": {
                "methods": ["token"],
                "token": {"id": token.get_secret_value()},
            }
        }
        if project_id:
            auth["scope"] = {"project": {"id": project_id}}
        resp = await self.request("POST", "/auth/tokens", json={"auth": auth})
        return self._parse(resp)

    async def password_token(
        self,
        username: str,
        password: str,
        user_domain: str = "Default",
        project_id: str | None = None,
        user_domain_id: str | None = None,
    ) -> TokenResult:
        domain = (
            {"id": user_domain_id} if user_domain_id else {"name": user_domain}
        )
        auth: dict = {
            "identity": {
                "methods": ["password"],
                "password": {
                    "user": {
                        "name": username,
                        "password": password,
                        "domain": domain,
                    }
                },
            }
        }
        if project_id:
            auth["scope"] = {"project": {"id": project_id}}
        resp = await self.request("POST", "/auth/tokens", json={"auth": auth})
        return self._parse(resp)

    async def list_projects(self, token: SecretStr) -> list[ProjectRef]:
        body = await self.get_json("/auth/projects", headers=_acting(token))
        return [
            ProjectRef(
                id=p["id"],
                name=p.get("name", p["id"]),
                domain_id=p.get("domain_id"),
                enabled=bool(p.get("enabled", True)),
            )
            for p in unwrap(body, "projects", [])
        ]

    async def revoke(self, token: SecretStr) -> None:
        """Revoke ``token`` with itself; best effort, as Horizon's logout
        (a token that is already gone or a Keystone hiccup is ignored)."""
        with contextlib.suppress(HiveError):
            await self.request(
                "DELETE",
                "/auth/tokens",
                headers={
                    **_acting(token),
                    SUBJECT_TOKEN: token.get_secret_value(),
                },
                ok=(204, 404),
            )

    async def ping(self, timeout: float = 2.0) -> bool:
        try:
            resp = await self._http.get(
                self.endpoint, timeout=httpx.Timeout(timeout)
            )
        except httpx.HTTPError:
            return False
        return resp.status_code < 500

    @staticmethod
    def _parse(resp: httpx.Response) -> TokenResult:
        body = resp.json().get("token", {})
        user = body.get("user", {})
        project = body.get("project")
        return TokenResult(
            token=SecretStr(resp.headers[SUBJECT_TOKEN]),
            expires_at=parse_expires(body["expires_at"]),
            user=UserRef(
                id=user["id"],
                name=user.get("name", user["id"]),
                domain_id=(user.get("domain") or {}).get("id"),
            ),
            project=(
                ProjectRef(
                    id=project["id"],
                    name=project.get("name", project["id"]),
                    domain_id=(project.get("domain") or {}).get("id"),
                )
                if project
                else None
            ),
            roles=[r["name"] for r in body.get("roles", []) if "name" in r],
            catalog=body.get("catalog", []),
        )


def _acting(token: SecretStr) -> dict[str, str]:
    """The header that makes ``token`` the caller."""
    return {"X-Auth-Token": token.get_secret_value()}
