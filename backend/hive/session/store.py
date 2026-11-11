"""Redis-backed session store.

Key schema::

    hive:sess:<sha256(sid)>   HASH
        core            SessionCore JSON (user, csrf, version), written once
        unscoped        TokenInfo JSON
        projects        JSON list of ProjectRef
        current         the current project id
        scoped:<pid>    ScopedToken JSON, one field per project
        last_seen       timestamp of the last sliding-expiry touch
    hive:sess:user:<user_id>  SET of session keys (operations: count, revoke)

Every writer sets only its own fields, so a project switch and a rescope
running side by side cannot undo each other, and a request reads only
the current project's token, not every project's. Field writes go
through ``WRITE_FIELDS``, which never recreates a session that has
expired or logged out in the meantime.

The browser holds ``<sid>.<hmac>``; the HMAC lets junk cookies be rejected
without a Redis round trip, and hashing the sid for the key means a Redis
dump cannot be replayed as cookies. The TTL is ``min(session_timeout,
remaining token life)``, exactly as Horizon's ``openstack_auth`` computes
it, and slides on activity without ever outliving the token.
"""

import base64
import hashlib
import hmac
import json
import secrets
import time

from pydantic import ValidationError
from redis.asyncio import Redis
from redis.typing import EncodableT, FieldT

from hive.session.model import (
    ProjectRef,
    ScopedToken,
    SESSION_VERSION,
    SessionCore,
    SessionData,
    TokenInfo,
)

# Sliding expiry is only rewritten when the last touch is older than this,
# so hot sessions do not cost a Redis write per request.
TOUCH_INTERVAL = 60

SCOPED = "scoped:"
FIXED_FIELDS = ("core", "unscoped", "projects", "current", "last_seen")
CORE_FIELDS = set(SessionCore.model_fields)

# One round trip per request: the fixed fields and the current project's
# token, never the other projects' tokens.
LOAD = """
local f = redis.call('HMGET', KEYS[1],
    'core', 'unscoped', 'projects', 'current', 'last_seen')
if not f[1] then return false end
local scoped = false
if f[4] then scoped = redis.call('HGET', KEYS[1], 'scoped:' .. f[4]) end
return {f[1], f[2], f[3], f[4], f[5], scoped}
"""

# ARGV: ttl (0 keeps the current expiry), then field, value pairs. A
# session that has gone is left gone.
WRITE_FIELDS = """
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
for i = 2, #ARGV, 2 do
    redis.call('HSET', KEYS[1], ARGV[i], ARGV[i + 1])
end
local ttl = tonumber(ARGV[1])
if ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
return 1
"""


def _projects_json(projects: list[ProjectRef]) -> str:
    return json.dumps([p.model_dump(mode="json") for p in projects])


class SessionStore:
    """Sessions in Redis, keyed by a hash of the cookie's session id."""

    def __init__(
        self,
        redis: Redis,
        secret: str,
        timeout: int,
        prefix: str = "hive:sess",
    ):
        self._redis = redis
        self._secret = secret.encode()
        self.timeout = timeout
        self._prefix = prefix
        self._load = redis.register_script(LOAD)
        self._write = redis.register_script(WRITE_FIELDS)

    def sign(self, sid: str) -> str:
        mac = hmac.new(self._secret, sid.encode(), hashlib.sha256).digest()
        sig = base64.urlsafe_b64encode(mac).rstrip(b"=").decode()
        return f"{sid}.{sig}"

    def unsign(self, value: str | None) -> str | None:
        if not value or "." not in value:
            return None
        sid, _, _ = value.rpartition(".")
        if not sid:
            return None
        if hmac.compare_digest(self.sign(sid), value):
            return sid
        return None

    def key(self, sid: str) -> str:
        digest = hashlib.sha256(sid.encode()).hexdigest()
        return f"{self._prefix}:{digest}"

    def user_key(self, user_id: str) -> str:
        return f"{self._prefix}:user:{user_id}"

    def ttl_for(self, data: SessionData, now: float | None = None) -> int:
        now = time.time() if now is None else now
        remaining = int(data.unscoped.expires_at.timestamp() - now)
        return max(0, min(self.timeout, remaining))

    async def create(self, data: SessionData) -> tuple[str, str]:
        """Store a new session; returns ``(sid, cookie_value)``. A session
        whose token has already expired is not stored at all."""
        sid = secrets.token_urlsafe(32)
        ttl = self.ttl_for(data)
        if ttl > 0:
            fields: dict[FieldT, EncodableT] = {
                "core": data.model_dump_json(include=CORE_FIELDS),
                "unscoped": data.unscoped.model_dump_json(),
                "projects": _projects_json(data.projects),
                "last_seen": time.time(),
                **{
                    SCOPED + pid: token.model_dump_json()
                    for pid, token in data.scoped.items()
                },
            }
            if data.current_project_id:
                fields["current"] = data.current_project_id
            key = self.key(sid)
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.hset(key, mapping=fields)
                pipe.expire(key, ttl)
                await pipe.execute()
        user_key = self.user_key(data.user.id)
        await self._prune(user_key)
        await self._redis.sadd(user_key, self.key(sid))
        await self._redis.expire(user_key, self.timeout)
        return sid, self.sign(sid)

    async def load(self, sid: str) -> tuple[SessionData, float] | None:
        """The session and its last touch, or ``None`` when there is none
        or it was stored by another version of Hive (read as logged out)."""
        found = await self._load(keys=[self.key(sid)])
        if not found:
            return None
        core, unscoped, projects, current, last_seen, scoped = found
        try:
            head = SessionCore.model_validate_json(core)
            if head.v != SESSION_VERSION or unscoped is None:
                return None
            data = SessionData(
                **head.model_dump(),
                unscoped=TokenInfo.model_validate_json(unscoped),
                projects=json.loads(projects or "[]"),
                current_project_id=current,
            )
            if current and scoped:
                data.scoped[current] = ScopedToken.model_validate_json(scoped)
        except (ValidationError, ValueError):
            return None
        return data, float(last_seen or 0)

    async def scoped(self, sid: str, project_id: str) -> ScopedToken | None:
        raw = await self._redis.hget(self.key(sid), SCOPED + project_id)
        return ScopedToken.model_validate_json(raw) if raw else None

    async def put_scoped(
        self, sid: str, scoped: ScopedToken, *, make_current: bool = False
    ) -> None:
        """Keep one project's token (and, with ``make_current``, switch to
        that project in the same write), then evict the least recently
        used tokens beyond ``SessionData.MAX_SCOPED``."""
        pid = scoped.project.id
        fields = [SCOPED + pid, scoped.model_dump_json()]
        if make_current:
            fields += ["current", pid]
        await self._write(keys=[self.key(sid)], args=[0, *fields])
        await self._evict(sid)

    async def put_projects(self, sid: str, projects: list[ProjectRef]):
        await self._write(
            keys=[self.key(sid)],
            args=[0, "projects", _projects_json(projects)],
        )

    async def put_unscoped(self, sid: str, data: SessionData) -> None:
        """Replace the unscoped token (after a password change) and drop
        every scoped token derived from the old one; the expiry follows
        the new token."""
        key = self.key(sid)
        await self._write(
            keys=[key],
            args=[
                self.ttl_for(data),
                "unscoped",
                data.unscoped.model_dump_json(),
            ],
        )
        stale = [field async for field, _ in self._scoped_fields(key)]
        if stale:
            await self._redis.hdel(key, *stale)

    async def all_scoped(self, sid: str) -> list[ScopedToken]:
        """Every project token the session holds (for revocation)."""
        return [
            ScopedToken.model_validate_json(raw)
            async for _, raw in self._scoped_fields(self.key(sid))
        ]

    async def touch(
        self,
        sid: str,
        data: SessionData,
        last_seen: float,
        now: float | None = None,
    ) -> None:
        """Slide the expiry forward if the last touch is old enough."""
        now = time.time() if now is None else now
        if now - last_seen < TOUCH_INTERVAL:
            return
        ttl = self.ttl_for(data, now)
        if ttl <= 0:
            await self._redis.delete(self.key(sid))
            return
        await self._write(keys=[self.key(sid)], args=[ttl, "last_seen", now])

    async def destroy(self, sid: str, user_id: str | None = None) -> None:
        key = self.key(sid)
        await self._redis.delete(key)
        if user_id:
            await self._redis.srem(self.user_key(user_id), key)

    async def count_for_user(self, user_id: str) -> int:
        return await self._prune(self.user_key(user_id))

    async def _scoped_fields(self, key: str):
        async for field, raw in self._redis.hscan_iter(
            key, match=SCOPED + "*"
        ):
            yield field, raw

    async def _evict(self, sid: str) -> None:
        """Drop the least recently used project tokens beyond the bound;
        the current project's token always stays."""
        key = self.key(sid)
        limit = len(FIXED_FIELDS) + SessionData.MAX_SCOPED
        if await self._redis.hlen(key) <= limit:
            return
        current = f"{SCOPED}{await self._redis.hget(key, 'current')}"
        tokens = {
            field: ScopedToken.model_validate_json(raw).last_used
            async for field, raw in self._scoped_fields(key)
        }
        excess = len(tokens) - SessionData.MAX_SCOPED
        oldest = sorted(
            (field for field in tokens if field != current),
            key=tokens.__getitem__,
        )[:excess]
        if oldest:
            await self._redis.hdel(key, *oldest)

    async def _prune(self, user_key: str) -> int:
        """Drop index entries whose session has expired; return how many
        live ones remain. Session keys expire on their own, the index
        entries pointing at them do not."""
        members = list(await self._redis.smembers(user_key))
        if not members:
            return 0
        async with self._redis.pipeline(transaction=False) as pipe:
            for member in members:
                pipe.exists(member)
            alive = await pipe.execute()
        gone = [m for m, live in zip(members, alive, strict=True) if not live]
        if gone:
            await self._redis.srem(user_key, *gone)
        return len(members) - len(gone)
