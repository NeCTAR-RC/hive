"""Redis-backed session store.

Key schema::

    hive:sess:<sha256(sid)>   HASH {data: <SessionData JSON>, last_seen: <ts>}
    hive:sess:user:<user_id>  SET of session keys (operations: count, revoke)

The browser holds ``<sid>.<hmac>``; the HMAC lets junk cookies be rejected
without a Redis round trip, and hashing the sid for the key means a Redis
dump cannot be replayed as cookies. The TTL is ``min(session_timeout,
remaining token life)``, exactly as Horizon's ``openstack_auth`` computes
it, and slides on activity without ever outliving the token.
"""

import base64
import hashlib
import hmac
import secrets
import time

from redis.asyncio import Redis

from hive.session.model import SessionData

# Sliding expiry is only rewritten when the last touch is older than this,
# so hot sessions do not cost a Redis write per request.
TOUCH_INTERVAL = 60


class SessionStore:
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

    # --- cookie value <-> session id ---------------------------------------

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

    # --- keys ---------------------------------------------------------------

    def key(self, sid: str) -> str:
        digest = hashlib.sha256(sid.encode()).hexdigest()
        return f"{self._prefix}:{digest}"

    def user_key(self, user_id: str) -> str:
        return f"{self._prefix}:user:{user_id}"

    def ttl_for(self, data: SessionData, now: float | None = None) -> int:
        now = time.time() if now is None else now
        remaining = int(data.unscoped.expires_at.timestamp() - now)
        return max(0, min(self.timeout, remaining))

    # --- lifecycle ----------------------------------------------------------

    async def create(self, data: SessionData) -> tuple[str, str]:
        """Store a new session; returns ``(sid, cookie_value)``."""
        sid = secrets.token_urlsafe(32)
        await self.save(sid, data)
        user_key = self.user_key(data.user.id)
        await self._redis.sadd(user_key, self.key(sid))
        await self._redis.expire(user_key, self.timeout)
        return sid, self.sign(sid)

    async def save(
        self, sid: str, data: SessionData, now: float | None = None
    ) -> int:
        now = time.time() if now is None else now
        ttl = self.ttl_for(data, now)
        key = self.key(sid)
        if ttl <= 0:
            await self._redis.delete(key)
            return 0
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(
                key,
                mapping={"data": data.model_dump_json(), "last_seen": now},
            )
            pipe.expire(key, ttl)
            await pipe.execute()
        return ttl

    async def load(self, sid: str) -> tuple[SessionData, float] | None:
        raw = await self._redis.hgetall(self.key(sid))
        if not raw or "data" not in raw:
            return None
        data = SessionData.model_validate_json(raw["data"])
        return data, float(raw.get("last_seen") or 0)

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
        key = self.key(sid)
        if ttl <= 0:
            await self._redis.delete(key)
            return
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hset(key, "last_seen", now)
            pipe.expire(key, ttl)
            await pipe.execute()

    async def destroy(self, sid: str, user_id: str | None = None) -> None:
        key = self.key(sid)
        await self._redis.delete(key)
        if user_id:
            await self._redis.srem(self.user_key(user_id), key)

    async def count_for_user(self, user_id: str) -> int:
        """Live sessions for ``user_id``, pruning members whose session key
        expired by TTL (only ``destroy`` removes them otherwise)."""
        user_key = self.user_key(user_id)
        dead = [
            member
            for member in await self._redis.smembers(user_key)
            if not await self._redis.exists(member)
        ]
        if dead:
            await self._redis.srem(user_key, *dead)
        return await self._redis.scard(user_key)
