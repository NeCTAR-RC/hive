"""Contract per upstream service: every field Hive reads from a reply is
one the service sends.

The fixtures under ``tests/fixtures/<service>/`` stand for real replies;
the shaping functions run against them with every read logged, and a
field read but absent from the reply fails here, so a renamed or dropped
upstream field shows up in this test rather than as a blank in the SPA.
The shaped output then goes through its response model, so the model and
the shaping cannot drift apart either.

The fixtures are hand-made until rctest recordings replace them, and the
hand-made ones leave out fields Hive reads with a fallback.
``tests/fixtures/unrecorded.json`` names those gaps exactly: a recording
that carries a field must drop it from the list, and a field the code
starts to read must be recorded or listed, or this test fails.
"""

from dataclasses import dataclass
from datetime import datetime, UTC
import json
from typing import Any

from pydantic import TypeAdapter
import pytest

from hive.config import Settings
from hive.nectar.allocation import summary_fields
from hive.nectar import databases, dns, magnum, orchestration, outages, shares
from hive.nectar.flavors import FlavorRules
from hive.nectar.images import ImageRules
from hive.nectar.members import member_rows
from hive.nectar import reservations
from hive.nectar.volumes import VolumeRules
from hive.schemas.responses.account import Profile
from hive.schemas.responses.compute import Flavor, Image, Instance
from hive.schemas.responses.databases import (
    DbBackup,
    DbConfiguration,
    DbFlavor,
    DbInstanceDetail,
    DbLog,
)
from hive.schemas.responses.dns import RecordSet, Zone
from hive.schemas.responses.home import Outage
from hive.schemas.responses.identity import ApplicationCredential, MemberRow
from hive.schemas.responses.loadbalancer import (
    HealthMonitor,
    L7Policy,
    Listener,
    LoadBalancer,
    Member,
    Pool,
)
from hive.schemas.responses.magnum import Cluster, ClusterTemplate, NodeGroup
from hive.schemas.responses.network import (
    FloatingIp,
    Port,
    Router,
    SubnetDetail,
)
from hive.schemas.responses.orchestration import Stack
from hive.schemas.responses.reservations import (
    ReservationFlavor,
    ReservationLimits,
)
from hive.schemas.responses.shares import (
    SecurityService,
    Share,
    ShareGroup,
    ShareGroupSnapshot,
    ShareSnapshot,
)
from hive.schemas.responses.usage import CurrentAllocation
from hive.schemas.responses.volumes import (
    Volume,
    VolumeBackup,
    VolumeSnapshot,
    VolumeType,
)
from hive.services.account import profile_payload
from hive.services.background import BackgroundWork
from hive.services import compute, credentials, loadbalancer, network, volumes
from hive.services.context import Context
from hive.session.model import ProjectRef, ScopedToken
from tests.fixtures.loader import fixture, ROOT
from tests.unit.contracts.reading import fields_read, present

SETTINGS = Settings(
    _env_file=None,  # pyright: ignore[reportCallIssue]
    secret_key="x" * 32,
)
CTX = Context(
    None,  # type: ignore[arg-type]
    SETTINGS,
    None,  # type: ignore[arg-type]
    ScopedToken(
        token="t",
        expires_at=datetime.now(UTC),
        project=ProjectRef(id="p1", name="p"),
    ),
    BackgroundWork(),
)
FLAVORS = FlavorRules("nectar:rate", "preemptible", [], [])
IMAGES = ImageRules([], "private")
TYPES = VolumeRules("RESKEY:availability_zones")


@dataclass(frozen=True)
class Reply:
    """One upstream reply, the function that shapes it for the SPA and the
    response type the shaped output is sent as."""

    service: str
    name: str
    shape: Any
    model: Any
    items: str | None = None

    def bodies(self) -> list[dict]:
        body = fixture(self.service, self.name)
        if self.items is not None:
            body = body[self.items]
        return body if isinstance(body, list) else [body]


REPLIES = [
    Reply(
        "nova",
        "server",
        lambda s: compute.server_summary(CTX, s),
        Instance,
    ),
    Reply("nova", "flavors", FLAVORS.summary, Flavor),
    Reply(
        "glance",
        "images",
        lambda i: IMAGES.summary(i, "p1"),
        Image,
        items="public",
    ),
    Reply("cinder", "volumes", volumes.volume_summary, Volume),
    Reply("cinder", "snapshots", volumes.snapshot_summary, VolumeSnapshot),
    Reply("cinder", "backups", volumes.backup_summary, VolumeBackup),
    Reply("cinder", "types", TYPES.type_summary, VolumeType),
    Reply("neutron", "subnets", network.subnet_summary, SubnetDetail),
    Reply(
        "neutron", "router", lambda r: network.router_summary(r, {}), Router
    ),
    Reply("neutron", "vm_port", network.port_summary, Port),
    Reply(
        "neutron",
        "fips",
        lambda f: network.floating_ip_summary(f, None, {}, {}),
        FloatingIp,
    ),
    Reply("octavia", "load_balancer", loadbalancer.lb_summary, LoadBalancer),
    Reply("octavia", "listener", loadbalancer.listener_summary, Listener),
    Reply("octavia", "pool", loadbalancer.pool_summary, Pool),
    Reply("octavia", "member", loadbalancer.member_summary, Member),
    Reply("octavia", "monitor", loadbalancer.monitor_summary, HealthMonitor),
    Reply("octavia", "policy", loadbalancer.policy_summary, L7Policy),
    Reply("designate", "zone", dns.zone_summary, Zone),
    Reply(
        "designate",
        "recordsets",
        lambda r: dns.recordset_summary(r, "example.com."),
        RecordSet,
    ),
    Reply("magnum", "template", magnum.template_summary, ClusterTemplate),
    Reply("magnum", "cluster", magnum.cluster_summary, Cluster),
    Reply("magnum", "nodegroups", magnum.nodegroup_summary, NodeGroup),
    Reply("heat", "stack", orchestration.stack_summary, Stack),
    Reply("manila", "share", shares.share_summary, Share),
    Reply(
        "manila",
        "snapshot",
        lambda s: shares.snapshot_summary(s, None),
        ShareSnapshot,
    ),
    Reply(
        "manila",
        "service",
        shares.security_service_summary,
        SecurityService,
    ),
    Reply("manila", "group", shares.group_summary, ShareGroup),
    Reply(
        "manila",
        "group_snapshot",
        lambda s: shares.group_snapshot_summary(s, None),
        ShareGroupSnapshot,
    ),
    Reply("trove", "instance", databases.instance_detail, DbInstanceDetail),
    Reply("trove", "backup", databases.backup_summary, DbBackup),
    Reply("trove", "config", databases.configuration_summary, DbConfiguration),
    Reply("trove", "flavors", databases.flavor_summary, DbFlavor),
    Reply("trove", "log", databases.log_summary, DbLog),
    Reply(
        "langstroth", "outage", lambda o: outages.serialise(o, "/o/"), Outage
    ),
    Reply(
        "keystone",
        "role_assignments",
        lambda a: member_rows([a], "u1"),
        list[MemberRow],
        items="role_assignments",
    ),
    Reply(
        "keystone",
        "application_credential",
        credentials.app_credential_summary,
        ApplicationCredential,
    ),
    Reply("warre", "flavor", reservations.flavor_summary, ReservationFlavor),
    Reply(
        "warre",
        "limits",
        reservations.limits_summary,
        ReservationLimits,
        items="absolute",
    ),
    Reply("allocations", "allocation", summary_fields, CurrentAllocation),
    Reply(
        "manuka",
        "user",
        lambda u: profile_payload(u, SETTINGS),
        Profile,
    ),
]

UNRECORDED: dict[str, list[str]] = json.loads(
    (ROOT / "unrecorded.json").read_text()
)


def absent(reply: Reply) -> set[str]:
    bodies = reply.bodies()
    read = set().union(*(fields_read(reply.shape, b) for b in bodies))
    return {path for path in read if not any(present(b, path) for b in bodies)}


@pytest.mark.parametrize(
    "reply", REPLIES, ids=lambda r: f"{r.service}/{r.name}"
)
def test_hive_reads_only_fields_the_service_sends(reply):
    known_gaps = UNRECORDED.get(f"{reply.service}/{reply.name}", [])
    assert sorted(absent(reply)) == known_gaps


@pytest.mark.parametrize(
    "reply", REPLIES, ids=lambda r: f"{r.service}/{r.name}"
)
def test_shaped_replies_fit_their_response_models(reply):
    """A field the SPA reads that the model lacks, or a model field the
    shaping no longer builds, fails here against the recorded replies."""
    adapter = TypeAdapter(reply.model)
    for body in reply.bodies():
        adapter.validate_python(reply.shape(body))
