"""Request bodies for the Load Balancers panel (Octavia)."""

from typing import Literal

from pydantic import BaseModel, Field

ListenerProtocol = Literal["HTTP", "TCP", "TERMINATED_HTTPS", "HTTPS", "UDP", "SCTP"]
PoolProtocol = Literal["HTTP", "HTTPS", "PROXY", "PROXYV2", "TCP", "UDP", "SCTP"]
Algorithm = Literal["LEAST_CONNECTIONS", "ROUND_ROBIN", "SOURCE_IP"]
Persistence = Literal["SOURCE_IP", "HTTP_COOKIE", "APP_COOKIE"]
MonitorType = Literal["HTTP", "HTTPS", "PING", "TCP", "TLS-HELLO", "UDP-CONNECT", "SCTP"]
HttpMethod = Literal["GET", "HEAD", "POST", "PUT", "DELETE", "TRACE", "OPTIONS", "PATCH", "CONNECT"]
L7Action = Literal["REJECT", "REDIRECT_TO_URL", "REDIRECT_TO_POOL", "REDIRECT_PREFIX"]
L7RuleType = Literal["HOST_NAME", "PATH", "FILE_TYPE", "HEADER", "COOKIE"]
L7Compare = Literal["REGEX", "EQUAL_TO", "STARTS_WITH", "ENDS_WITH", "CONTAINS"]


class SessionPersistence(BaseModel):
    type: Persistence | None = None
    cookie_name: str | None = None


class ListenerSpec(BaseModel):
    name: str | None = None
    description: str | None = None
    protocol: ListenerProtocol
    protocol_port: int = Field(ge=1, le=65535)
    connection_limit: int = Field(default=-1, ge=-1)
    timeout_client_data: int | None = Field(default=50000, ge=0, le=31536000000)
    timeout_member_connect: int | None = Field(default=5000, ge=0, le=31536000000)
    timeout_member_data: int | None = Field(default=50000, ge=0, le=31536000000)
    timeout_tcp_inspect: int | None = Field(default=0, ge=0, le=31536000000)
    allowed_cidrs: list[str] | None = None
    insert_headers: dict[str, bool] | None = None
    default_tls_container_ref: str | None = None
    sni_container_refs: list[str] | None = None
    tls_ciphers: str | None = Field(default=None, pattern=r"^([A-Z0-9_-]+:)*[A-Z0-9_-]+$")
    default_pool_id: str | None = None
    admin_state_up: bool = True


class ListenerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    connection_limit: int | None = Field(default=None, ge=-1)
    timeout_client_data: int | None = None
    timeout_member_connect: int | None = None
    timeout_member_data: int | None = None
    timeout_tcp_inspect: int | None = None
    allowed_cidrs: list[str] | None = None
    insert_headers: dict[str, bool] | None = None
    default_tls_container_ref: str | None = None
    sni_container_refs: list[str] | None = None
    tls_ciphers: str | None = None
    default_pool_id: str | None = None
    admin_state_up: bool | None = None


class PoolSpec(BaseModel):
    name: str | None = None
    description: str | None = None
    protocol: PoolProtocol | None = None
    lb_algorithm: Algorithm
    session_persistence: SessionPersistence | None = None
    tls_enabled: bool = False
    tls_ciphers: str | None = None
    admin_state_up: bool = True


class PoolUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    lb_algorithm: Algorithm | None = None
    session_persistence: SessionPersistence | None = None
    tls_enabled: bool | None = None
    tls_ciphers: str | None = None
    admin_state_up: bool | None = None


class MemberSpec(BaseModel):
    name: str | None = None
    address: str = Field(min_length=1)
    subnet_id: str | None = None
    protocol_port: int = Field(ge=1, le=65535)
    weight: int = Field(default=1, ge=0, le=256)
    monitor_address: str | None = None
    monitor_port: int | None = Field(default=None, ge=1, le=65535)
    backup: bool = False
    admin_state_up: bool = True


class MemberUpdate(BaseModel):
    name: str | None = None
    weight: int | None = Field(default=None, ge=0, le=256)
    monitor_address: str | None = None
    monitor_port: int | None = Field(default=None, ge=1, le=65535)
    backup: bool | None = None
    admin_state_up: bool | None = None


class MonitorSpec(BaseModel):
    name: str | None = None
    type: MonitorType
    delay: int = Field(default=5, ge=0)
    timeout: int = Field(default=5, ge=0)
    max_retries: int = Field(default=3, ge=1, le=10)
    max_retries_down: int = Field(default=3, ge=1, le=10)
    http_method: HttpMethod | None = None
    url_path: str | None = None
    expected_codes: str | None = None
    admin_state_up: bool = True


class MonitorUpdate(BaseModel):
    name: str | None = None
    delay: int | None = Field(default=None, ge=0)
    timeout: int | None = Field(default=None, ge=0)
    max_retries: int | None = Field(default=None, ge=1, le=10)
    max_retries_down: int | None = Field(default=None, ge=1, le=10)
    http_method: HttpMethod | None = None
    url_path: str | None = None
    expected_codes: str | None = None
    admin_state_up: bool | None = None


class LoadBalancerCreate(BaseModel):
    name: str | None = None
    description: str | None = None
    vip_subnet_id: str = Field(min_length=1)
    vip_address: str | None = None
    flavor_id: str | None = None
    availability_zone: str | None = None
    admin_state_up: bool = True
    listener: ListenerSpec | None = None
    pool: PoolSpec | None = None
    members: list[MemberSpec] = Field(default_factory=list)
    monitor: MonitorSpec | None = None


class LoadBalancerUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    admin_state_up: bool | None = None


class ListenerCreate(ListenerSpec):
    loadbalancer_id: str = Field(min_length=1)
    pool: PoolSpec | None = None
    members: list[MemberSpec] = Field(default_factory=list)
    monitor: MonitorSpec | None = None


class PoolCreate(PoolSpec):
    loadbalancer_id: str = Field(min_length=1)
    listener_id: str | None = None
    members: list[MemberSpec] = Field(default_factory=list)
    monitor: MonitorSpec | None = None


class MembersReplace(BaseModel):
    members: list[MemberSpec]


class MonitorCreate(MonitorSpec):
    pool_id: str = Field(min_length=1)


class L7PolicySpec(BaseModel):
    name: str | None = None
    description: str | None = None
    action: L7Action
    redirect_url: str | None = None
    redirect_pool_id: str | None = None
    redirect_prefix: str | None = None
    position: int | None = Field(default=None, ge=1)
    admin_state_up: bool = True


class L7PolicyCreate(L7PolicySpec):
    listener_id: str = Field(min_length=1)


class L7PolicyUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    action: L7Action | None = None
    redirect_url: str | None = None
    redirect_pool_id: str | None = None
    redirect_prefix: str | None = None
    position: int | None = Field(default=None, ge=1)
    admin_state_up: bool | None = None


class L7RuleSpec(BaseModel):
    type: L7RuleType
    compare_type: L7Compare
    key: str | None = None
    value: str = Field(min_length=1)
    invert: bool = False
    admin_state_up: bool = True


class L7RuleUpdate(BaseModel):
    type: L7RuleType | None = None
    compare_type: L7Compare | None = None
    key: str | None = None
    value: str | None = None
    invert: bool | None = None
    admin_state_up: bool | None = None


class FloatingIpAssociate(BaseModel):
    """An existing floating IP id, or a pool (network) id to allocate from."""

    floating_ip_id: str | None = None
    pool_id: str | None = None
