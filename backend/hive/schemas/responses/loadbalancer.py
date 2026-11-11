"""Replies of the Load Balancers (Octavia) panel."""

from pydantic import ConfigDict

from hive.schemas.responses import Items, ResponseModel


class LoadBalancerFloatingIp(ResponseModel):
    """The floating IP on a load balancer's VIP port."""

    id: str
    address: str


class LoadBalancer(ResponseModel):
    """A load balancer row; ``listeners`` and ``pools`` are ids."""

    id: str
    name: str | None
    description: str | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    vip_address: str | None
    vip_port_id: str | None
    vip_subnet_id: str | None
    vip_network_id: str | None
    provider: str | None
    flavor_id: str | None
    availability_zone: str | None
    listeners: list[str]
    pools: list[str]
    floating_ip: LoadBalancerFloatingIp | None
    created_at: str | None
    updated_at: str | None
    can_delete: bool
    is_transitional: bool


class ChainState(ResponseModel):
    """Progress of the wizard's chained creation (listener, pool, members,
    monitor), which Hive runs in the background after the load balancer.
    ``started`` is epoch seconds; ``failed_step`` is set once the chain
    has stopped early."""

    steps: list[str]
    done: list[str]
    error: str | None
    failed_step: str | None = None
    started: float


class LoadBalancerDetail(LoadBalancer):
    """One load balancer with its chain progress, ``None`` when no chain
    ran recently."""

    chain: ChainState | None


class Listener(ResponseModel):
    id: str
    name: str | None
    description: str | None
    protocol: str
    protocol_port: int
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    connection_limit: int | None
    default_pool_id: str | None
    loadbalancer_id: str | None
    timeout_client_data: int | None
    timeout_member_connect: int | None
    timeout_member_data: int | None
    timeout_tcp_inspect: int | None
    allowed_cidrs: list[str]
    insert_headers: dict[str, str]
    default_tls_container_ref: str | None
    sni_container_refs: list[str]
    tls_ciphers: str | None
    l7policies: list[str]
    created_at: str | None
    updated_at: str | None


class Member(ResponseModel):
    """A pool member (a backend address and port)."""

    id: str
    name: str | None
    address: str
    protocol_port: int
    subnet_id: str | None
    weight: int | None
    backup: bool | None
    monitor_address: str | None
    monitor_port: int | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    created_at: str | None
    updated_at: str | None


class MembersReplaced(Items[Member]):
    """A pool's members before a replace, and how many changes (deletes
    and adds) are queued; they run in the load balancer's chain."""

    pending: int


class PoolSessionPersistence(ResponseModel):
    """Passes Octavia's session persistence record through."""

    model_config = ConfigDict(extra="allow")

    type: str
    cookie_name: str | None = None


class Pool(ResponseModel):
    """A pool row; ``listeners`` and ``members`` are ids."""

    id: str
    name: str | None
    description: str | None
    protocol: str | None
    lb_algorithm: str | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    session_persistence: PoolSessionPersistence | None
    tls_enabled: bool | None
    tls_ciphers: str | None
    healthmonitor_id: str | None
    listeners: list[str]
    loadbalancer_id: str | None
    members: list[str]
    created_at: str | None
    updated_at: str | None


class PoolWithMembers(Pool):
    """A pool in the load balancer tree, with its member rows."""

    member_rows: list[Member]


class HealthMonitor(ResponseModel):
    id: str
    name: str | None
    type: str
    delay: int | None
    timeout: int | None
    max_retries: int | None
    max_retries_down: int | None
    http_method: str | None
    url_path: str | None
    expected_codes: str | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    pools: list[str]
    created_at: str | None
    updated_at: str | None


class L7Rule(ResponseModel):
    id: str
    type: str
    compare_type: str
    key: str | None
    value: str
    invert: bool | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None


class L7Policy(ResponseModel):
    """An L7 policy row; ``rules`` are ids."""

    id: str
    name: str | None
    description: str | None
    action: str
    position: int | None
    redirect_url: str | None
    redirect_pool_id: str | None
    redirect_prefix: str | None
    listener_id: str | None
    provisioning_status: str | None
    operating_status: str | None
    admin_state_up: bool | None
    rules: list[str]
    created_at: str | None
    updated_at: str | None


class L7PolicyDetail(L7Policy):
    """One L7 policy with its rule rows (the policy detail page)."""

    rule_rows: list[L7Rule]


class LoadBalancerTree(ResponseModel):
    """Everything under one load balancer, for its detail page in one
    call: monitors and L7 policies are those of its pools and
    listeners."""

    load_balancer: LoadBalancer
    chain: ChainState | None
    listeners: list[Listener]
    pools: list[PoolWithMembers]
    monitors: list[HealthMonitor]
    l7policies: list[L7Policy]


class LoadBalancerFailover(ResponseModel):
    """A failover Octavia accepted for the load balancer ``id``."""

    id: str


class LbSubnet(ResponseModel):
    """A subnet offered for the VIP and for members: one of a network the
    project may boot on."""

    id: str
    name: str | None
    cidr: str | None
    network_id: str | None
    network_name: str | None
    ip_version: int | None


class LbInstanceAddress(ResponseModel):
    address: str
    subnet_id: str


class LbInstance(ResponseModel):
    """A member candidate: a project server with its fixed IPs on the
    offered subnets."""

    id: str
    name: str | None
    status: str | None
    addresses: list[LbInstanceAddress]


class LbFlavor(ResponseModel):
    id: str
    name: str
    description: str | None


class LbAvailabilityZone(ResponseModel):
    name: str
    description: str | None


class LoadBalancerOptions(ResponseModel):
    """The create wizard's pickers, the project's Octavia quota and the
    protocol, algorithm and L7 choices octavia-dashboard offers."""

    subnets: list[LbSubnet]
    flavors: list[LbFlavor]
    availability_zones: list[LbAvailabilityZone]
    quota: dict[str, int | None]
    instances: list[LbInstance]
    # TERMINATED_HTTPS is offered only when Barbican is deployed.
    listener_protocols: list[str]
    barbican_available: bool
    pool_protocols: list[str]
    algorithms: list[str]
    persistence_types: list[str]
    monitor_types: list[str]
    http_methods: list[str]
    l7_actions: list[str]
    l7_rule_types: list[str]
    l7_compare_types: list[str]
