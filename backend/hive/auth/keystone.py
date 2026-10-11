"""Keystone v3 token operations over httpx.

Only three calls are needed: token-from-token (unscoped re-issue and
project scoping), the project list, and revocation. Password auth exists for
the live tests and the API password reset flow.
"""

from dataclasses import dataclass, field
from datetime import datetime

import httpx

from hive.errors import (
    Forbidden,
    NotAuthenticated,
    UpstreamError,
    UpstreamTimeout,
    UpstreamUnreachable,
)
from hive.session.model import ProjectRef, UserRef

SUBJECT_TOKEN = "X-Subject-Token"


class InvalidToken(NotAuthenticated):
    code = "invalid_token"


@dataclass
class TokenResult:
    token: str
    expires_at: datetime
    user: UserRef
    project: ProjectRef | None = None
    roles: list[str] = field(default_factory=list)
    catalog: list[dict] = field(default_factory=list)


def parse_expires(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class KeystoneClient:
    service = "keystone"

    def __init__(
        self,
        http: httpx.AsyncClient,
        base_url: str,
        connect_timeout: float = 3.0,
        read_timeout: float = 15.0,
    ):
        self._http = http
        self.base_url = base_url.rstrip("/")
        self._timeout = httpx.Timeout(read_timeout, connect=connect_timeout)

    async def token_from_token(
        self, token: str, project_id: str | None = None
    ) -> TokenResult:
        auth: dict = {
            "identity": {"methods": ["token"], "token": {"id": token}}
        }
        if project_id:
            auth["scope"] = {"project": {"id": project_id}}
        resp = await self._request("POST", "/auth/tokens", json={"auth": auth})
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
        resp = await self._request("POST", "/auth/tokens", json={"auth": auth})
        return self._parse(resp)

    async def list_projects(self, token: str) -> list[ProjectRef]:
        resp = await self._request("GET", "/auth/projects", token=token)
        projects = resp.json().get("projects", [])
        return [
            ProjectRef(
                id=p["id"],
                name=p.get("name", p["id"]),
                domain_id=p.get("domain_id"),
                enabled=bool(p.get("enabled", True)),
            )
            for p in projects
        ]

    async def revoke(self, token: str) -> None:
        try:
            await self._request(
                "DELETE",
                "/auth/tokens",
                token=token,
                headers={SUBJECT_TOKEN: token},
                ok=(204, 404),
            )
        except UpstreamError:
            pass

    async def ping(self, timeout: float = 2.0) -> bool:
        try:
            resp = await self._http.get(
                self.base_url, timeout=httpx.Timeout(timeout)
            )
        except httpx.HTTPError:
            return False
        return resp.status_code < 500

    # --- internals ----------------------------------------------------------

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        token: str | None = None,
        headers: dict | None = None,
        ok: tuple[int, ...] = (200, 201),
    ) -> httpx.Response:
        hdrs = {"Accept": "application/json"}
        if token:
            hdrs["X-Auth-Token"] = token
        if headers:
            hdrs.update(headers)
        try:
            resp = await self._http.request(
                method,
                self.base_url + path,
                json=json,
                headers=hdrs,
                timeout=self._timeout,
            )
        except httpx.TimeoutException as exc:
            raise UpstreamTimeout(
                "keystone timed out", service=self.service
            ) from exc
        except httpx.ConnectError as exc:
            raise UpstreamUnreachable(
                "keystone unreachable", service=self.service
            ) from exc
        except httpx.HTTPError as exc:
            raise UpstreamError(
                f"keystone request failed: {exc}", service=self.service
            ) from exc
        if resp.status_code in ok:
            return resp
        rid = resp.headers.get("x-openstack-request-id")
        message = _message(resp)
        if resp.status_code in (401, 404):
            raise InvalidToken(
                message or "token rejected",
                service=self.service,
                upstream_status=resp.status_code,
                upstream_request_id=rid,
            )
        if resp.status_code == 403:
            raise Forbidden(
                message or "forbidden",
                service=self.service,
                upstream_status=resp.status_code,
                upstream_request_id=rid,
            )
        raise UpstreamError(
            message or f"keystone returned {resp.status_code}",
            service=self.service,
            upstream_status=resp.status_code,
            upstream_request_id=rid,
        )

    @staticmethod
    def _parse(resp: httpx.Response) -> TokenResult:
        body = resp.json().get("token", {})
        user = body.get("user", {})
        project = body.get("project")
        return TokenResult(
            token=resp.headers[SUBJECT_TOKEN],
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


def _message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
    except ValueError:
        return ""
    error = body.get("error") if isinstance(body, dict) else None
    if isinstance(error, dict):
        return str(error.get("message", ""))
    return ""
