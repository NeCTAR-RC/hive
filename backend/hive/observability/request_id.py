"""Request ids: the one Hive logs and echoes, and the one it hands on to
OpenStack so a request can be followed into Nova or Neutron logs.

The inbound ``X-Request-ID`` (set by the ingress) is kept only when it is
short and plain; anything else is replaced, so a client cannot inject log
content. OpenStack accepts a caller's id as its *global request id* only
in the ``req-<uuid>`` form (oslo.context), so when the inbound id has
another shape a separate ``req-<uuid>`` is generated for upstream calls.
"""

from contextvars import ContextVar, Token
import re
import uuid

INBOUND_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")
OPENSTACK_ID = re.compile(
    r"req-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)

_global_request_id: ContextVar[str | None] = ContextVar(
    "global_request_id", default=None
)


def new_request_id() -> str:
    return f"req-{uuid.uuid4()}"


def request_ids(inbound: str | None) -> tuple[str, str]:
    """``(request_id, global_request_id)`` for one inbound request."""
    request_id = (
        inbound
        if inbound and INBOUND_ID.fullmatch(inbound)
        else new_request_id()
    )
    if OPENSTACK_ID.fullmatch(request_id):
        return request_id, request_id
    return request_id, new_request_id()


def bind_global_request_id(value: str) -> Token:
    return _global_request_id.set(value)


def reset_global_request_id(token: Token) -> None:
    _global_request_id.reset(token)


def upstream_request_id() -> str:
    """The id to send as ``X-OpenStack-Request-ID``: the current request's,
    or a fresh one outside a request."""
    return _global_request_id.get() or new_request_id()
