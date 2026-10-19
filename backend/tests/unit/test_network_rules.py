import pytest

from hive.errors import BadRequest
from hive.nectar import secgroups
from hive.nectar.networks import (
    NetworkRules,
    PURPOSE_ANY,
    PURPOSE_BOOT,
    PURPOSE_ROUTER,
    port_forwarding_body,
    static_routes,
    subnet_body,
)

ROUTER_PORT = {
    "id": "rp-1",
    "device_owner": "network:router_interface",
    "device_id": "r-1",
    "fixed_ips": [{"subnet_id": "sub-priv", "ip_address": "192.168.1.1"}],
}
VM_PORT = {
    "id": "vp-1",
    "name": "",
    "device_owner": "compute:nova",
    "device_id": "srv-1",
    "admin_state_up": True,
    "fixed_ips": [
        {"subnet_id": "sub-priv", "ip_address": "192.168.1.20"},
        {"subnet_id": "sub-priv6", "ip_address": "fd00::20"},
    ],
}
ISLAND_PORT = {
    "id": "vp-2",
    "name": "lonely",
    "device_owner": "compute:nova",
    "device_id": "srv-2",
    "admin_state_up": True,
    "fixed_ips": [{"subnet_id": "sub-island", "ip_address": "10.9.0.5"}],
}
SHARED_PORT = {
    "id": "vp-3",
    "name": "",
    "device_owner": "compute:nova",
    "device_id": "srv-3",
    "admin_state_up": True,
    "fixed_ips": [{"subnet_id": "sub-shared", "ip_address": "10.0.0.7"}],
}
DHCP_PORT = {
    "id": "dp-1",
    "device_owner": "network:dhcp",
    "device_id": "dhcp",
    "fixed_ips": [{"subnet_id": "sub-priv", "ip_address": "192.168.1.2"}],
}
PORTS = [ROUTER_PORT, VM_PORT, ISLAND_PORT, SHARED_PORT, DHCP_PORT]
ROUTERS = [
    {"id": "r-1", "external_gateway_info": {"network_id": "net-float"}},
    {"id": "r-2", "external_gateway_info": {"network_id": "net-other"}},
]


def rules(**overrides) -> NetworkRules:
    args = {
        "classic_network_id": "classic",
        "bootable_tag": "nectar:bootable",
        "floating_tag": "nectar:floating",
    }
    args.update(overrides)
    return NetworkRules(**args)


CLASSIC = {"id": "classic", "name": "Classic Provider", "subnets": []}
ALPHA = {"id": "a", "name": "alpha", "subnets": [{"id": "s-a"}]}
BRAVO = {"id": "b", "name": "Bravo", "subnets": [{"id": "s-b"}]}
EMPTY = {"id": "empty", "name": "no subnets", "subnets": []}


class TestClassification:
    """The network sets of Horizon changes 71397 to 71399."""

    def test_shared_tags_depend_on_purpose(self):
        r = rules()
        assert r.shared_tags_for(PURPOSE_BOOT) == ["nectar:bootable"]
        assert r.shared_tags_for(PURPOSE_ROUTER) == []
        assert r.shared_tags_for(PURPOSE_ANY) == [
            "nectar:floating",
            "nectar:bootable",
        ]

    def test_shared_query_asks_neutron_for_the_tags(self):
        r = rules()
        assert r.shared_query_params(PURPOSE_BOOT) == {
            "shared": "true",
            "tags-any": "nectar:bootable",
        }
        # Routers never get a shared network.
        assert r.shared_query_params(PURPOSE_ROUTER) is None
        assert r.floating_query_params() == {
            "router:external": "true",
            "tags-any": "nectar:floating",
        }

    def test_no_bootable_tag_offers_no_shared_network_for_boot(self):
        r = rules(bootable_tag=None)
        assert r.configured
        assert r.shared_query_params(PURPOSE_BOOT) is None
        assert r.shared_query_params(PURPOSE_ANY) == {
            "shared": "true",
            "tags-any": "nectar:floating",
        }

    def test_without_tags_every_listing_is_upstream(self):
        r = rules(bootable_tag=None, floating_tag=None)
        assert not r.configured
        for purpose in (PURPOSE_BOOT, PURPOSE_ROUTER, PURPOSE_ANY):
            assert r.shared_tags_for(purpose) is None
            assert r.shared_query_params(purpose) == {"shared": "true"}
        assert r.floating_query_params() == {"router:external": "true"}

    def test_classic_leads_except_for_routers(self):
        r = rules()
        assert r.offers_classic(PURPOSE_BOOT)
        assert r.offers_classic(PURPOSE_ANY)
        assert not r.offers_classic(PURPOSE_ROUTER)
        assert r.is_classic("classic")
        assert not r.is_classic("a")
        unset = rules(classic_network_id="")
        assert not unset.offers_classic(PURPOSE_BOOT)
        assert not unset.is_classic("classic")

    def test_order_is_classic_shared_project_external_once_each(self):
        ordered = rules().order(
            [CLASSIC], [BRAVO, CLASSIC], [ALPHA, BRAVO], [EMPTY]
        )
        assert [n["id"] for n in ordered] == ["classic", "b", "a", "empty"]

    def test_launch_candidates_keep_only_the_classic_subnetless_network(
        self,
    ):
        candidates = rules().launch_candidates([BRAVO, CLASSIC, ALPHA, EMPTY])
        assert [n["id"] for n in candidates] == ["classic", "a", "b"]
        # Without a classic network every subnet-less network is dropped.
        plain = rules(classic_network_id="").launch_candidates(
            [BRAVO, CLASSIC, ALPHA, EMPTY]
        )
        assert [n["id"] for n in plain] == ["a", "b"]

    def test_attachable_ports_are_free_and_on_bootable_networks(self):
        ports = [
            {"id": "free", "device_owner": "", "network_id": "a"},
            {"id": "bound", "device_owner": "compute:nova", "network_id": "a"},
            {"id": "elsewhere", "device_owner": "", "network_id": "float"},
        ]
        usable = rules().attachable_ports(ports, {"a", "classic"})
        assert [p["id"] for p in usable] == ["free"]


class TestFloatingTargets:
    def test_reachable_subnets_follow_floating_gateways(self):
        reachable = rules().reachable_subnets(
            PORTS, ROUTERS, {"net-float"}, {"sub-shared"}
        )
        assert reachable == {"sub-priv", "sub-shared"}

    def test_shared_subnets_only_count_when_bootable(self):
        no_bootable = rules(bootable_tag=None)
        assert not no_bootable.shared_subnets_reachable()
        assert no_bootable.reachable_subnets(
            PORTS, ROUTERS, {"net-float"}, {"sub-shared"}
        ) == {"sub-priv"}
        # Upstream (no tags) counts shared subnets as reachable.
        upstream = rules(bootable_tag=None, floating_tag=None)
        assert upstream.shared_subnets_reachable()

    def test_topology_check_off_takes_every_subnet(self):
        reachable = rules().reachable_subnets(
            PORTS, ROUTERS, set(), set(), topology_check=False
        )
        assert reachable == {"sub-priv", "sub-island", "sub-shared"}

    def test_targets_skip_network_ports_ipv6_and_unreachable(self):
        targets = NetworkRules.floating_targets(
            PORTS, {"srv-1": "web"}, {"sub-priv", "sub-shared"}
        )
        assert [t["id"] for t in targets] == [
            "vp-3_10.0.0.7",
            "vp-1_192.168.1.20",
        ]
        assert targets[1] == {
            "id": "vp-1_192.168.1.20",
            "port_id": "vp-1",
            "ip_address": "192.168.1.20",
            "instance_id": "srv-1",
            "instance_name": "web",
            "name": "web 192.168.1.20",
        }
        # Without a server name the port stands in.
        assert targets[0]["name"] == "vp-3 10.0.0.7"

    def test_targets_for_one_instance(self):
        targets = NetworkRules.floating_targets(
            PORTS, {}, {"sub-priv", "sub-shared"}, instance_id="srv-3"
        )
        assert [t["port_id"] for t in targets] == ["vp-3"]

    def test_device_type(self):
        assert NetworkRules.device_type("compute:nova") == "compute"
        assert NetworkRules.device_type("neutron:LOADBALANCERV2") == (
            "loadbalancer"
        )
        assert NetworkRules.device_type("network:dhcp") == "network:dhcp"
        assert NetworkRules.device_type("") is None


class TestRouterInterfaces:
    def test_subnets_need_a_gateway_and_no_interface_yet(self):
        networks = [
            {
                "id": "net-1",
                "name": "private",
                "subnets": [
                    {
                        "id": "s-1",
                        "cidr": "10.0.0.0/24",
                        "gateway_ip": "10.0.0.1",
                    },
                    {"id": "s-2", "cidr": "10.0.1.0/24", "gateway_ip": None},
                    {
                        "id": "s-3",
                        "cidr": "10.0.2.0/24",
                        "gateway_ip": "10.0.2.1",
                    },
                ],
            }
        ]
        choices = rules().router_interface_subnets(networks, {"s-3"})
        assert [c["id"] for c in choices] == ["s-1"]
        assert choices[0]["network_name"] == "private"


class TestTrunkCandidates:
    PORTS = [
        {"id": "p-free", "admin_state_up": True, "device_owner": ""},
        {"id": "p-vm", "admin_state_up": True, "device_owner": "compute:nova"},
        {"id": "p-down", "admin_state_up": False, "device_owner": ""},
        {
            "id": "p-dhcp",
            "admin_state_up": True,
            "device_owner": "network:dhcp",
        },
        {"id": "p-parent", "admin_state_up": True, "device_owner": ""},
        {"id": "p-child", "admin_state_up": True, "device_owner": ""},
    ]
    TRUNKS = [{"port_id": "p-parent", "sub_ports": [{"port_id": "p-child"}]}]

    def test_parents_and_subports(self):
        parents = NetworkRules.trunk_parent_candidates(self.PORTS, self.TRUNKS)
        assert [p["id"] for p in parents] == ["p-free", "p-vm"]
        subports = NetworkRules.trunk_subport_candidates(
            self.PORTS, self.TRUNKS
        )
        assert [p["id"] for p in subports] == ["p-free"]


class TestSubnetBody:
    DNS = ["1.1.1.1", "1.0.0.1"]

    def test_defaults_apply_on_create(self):
        body = subnet_body(
            {"name": "s", "cidr": "192.168.0.0/24", "enable_dhcp": True},
            self.DNS,
        )
        assert body == {
            "name": "s",
            "cidr": "192.168.0.0/24",
            "ip_version": 4,
            "enable_dhcp": True,
            "dns_nameservers": ["1.1.1.1", "1.0.0.1"],
        }

    def test_full_create(self):
        body = subnet_body(
            {
                "cidr": "10.1.0.0/16",
                "gateway_ip": "10.1.0.254",
                "allocation_pools": [{"start": "10.1.1.1", "end": "10.1.1.9"}],
                "dns_nameservers": ["8.8.8.8"],
                "host_routes": [
                    {"destination": "10.2.0.0/16", "nexthop": "10.1.0.1"}
                ],
            },
            self.DNS,
        )
        assert body["gateway_ip"] == "10.1.0.254"
        assert body["allocation_pools"] == [
            {"start": "10.1.1.1", "end": "10.1.1.9"}
        ]
        assert body["dns_nameservers"] == ["8.8.8.8"]
        assert body["host_routes"] == [
            {"destination": "10.2.0.0/16", "nexthop": "10.1.0.1"}
        ]

    def test_no_gateway_wins(self):
        body = subnet_body(
            {
                "cidr": "10.0.0.0/24",
                "gateway_ip": "10.0.0.1",
                "no_gateway": True,
            },
            self.DNS,
        )
        assert body["gateway_ip"] is None

    @pytest.mark.parametrize(
        "data, message",
        [
            ({"cidr": "nope"}, "not a network address"),
            ({"cidr": "10.0.0.1/32"}, "too small"),
            ({"cidr": "fd00::/64"}, "inconsistent"),
            ({"cidr": "fd00::/64", "ip_version": 6}, "IPv6"),
            ({}, "network address or an address pool"),
            ({"cidr": "10.0.0.0/24", "gateway_ip": "fd00::1"}, "gateway IP"),
            (
                {
                    "cidr": "10.0.0.0/24",
                    "allocation_pools": [
                        {"start": "10.0.0.9", "end": "10.0.0.2"}
                    ],
                },
                "after its end",
            ),
            (
                {"cidr": "10.0.0.0/24", "dns_nameservers": ["x"]},
                "DNS name server",
            ),
            (
                {
                    "cidr": "10.0.0.0/24",
                    "host_routes": [
                        {"destination": "bad", "nexthop": "10.0.0.1"}
                    ],
                },
                "host route destination",
            ),
        ],
    )
    def test_rejections(self, data, message):
        with pytest.raises(BadRequest, match=message):
            subnet_body(data, self.DNS)

    def test_ipv6_allowed_when_enabled(self):
        body = subnet_body(
            {"cidr": "fd00::/64", "ip_version": 6}, self.DNS, enable_ipv6=True
        )
        assert body["ip_version"] == 6

    def test_update_sends_only_given_fields_and_clears_lists(self):
        body = subnet_body(
            {"name": "renamed", "allocation_pools": []},
            self.DNS,
            is_create=False,
        )
        assert body == {"name": "renamed", "allocation_pools": []}
        assert subnet_body({}, self.DNS, is_create=False) == {}

    def test_subnetpool_instead_of_cidr(self):
        body = subnet_body(
            {"subnetpool_id": "pool-1", "prefixlen": 26}, self.DNS
        )
        assert body["subnetpool_id"] == "pool-1"
        assert body["prefixlen"] == 26
        assert body["ip_version"] == 4
        assert "cidr" not in body

    def test_invalid_gateway(self):
        with pytest.raises(BadRequest, match="not an IP address"):
            subnet_body(
                {"cidr": "10.0.0.0/24", "gateway_ip": "10.0.0.x"}, self.DNS
            )

    def test_invalid_ip_version(self):
        with pytest.raises(BadRequest, match="inconsistent"):
            subnet_body(
                {"cidr": "10.0.0.0/24", "ip_version": 6},
                self.DNS,
                enable_ipv6=True,
            )
        with pytest.raises(BadRequest, match="IPv6 subnets"):
            subnet_body({"cidr": "10.0.0.0/24", "ip_version": 5}, self.DNS)

    def test_update_gateway_follows_the_subnet_version(self):
        update = {"gateway_ip": "2001:db8::1", "ip_version": 6}
        assert subnet_body(update, self.DNS, is_create=False) == {
            "gateway_ip": "2001:db8::1"
        }
        # Without the subnet's version the gateway's own one stands.
        assert subnet_body(
            {"gateway_ip": "2001:db8::1"}, self.DNS, is_create=False
        ) == {"gateway_ip": "2001:db8::1"}
        with pytest.raises(BadRequest, match="gateway IP"):
            subnet_body(
                {"gateway_ip": "10.0.0.1", "ip_version": 6},
                self.DNS,
                is_create=False,
            )


class TestSecurityGroupRules:
    @pytest.mark.parametrize(
        "value, expected",
        [
            (None, None),
            ("  ", None),
            ("TCP", "tcp"),
            ("ipv6-icmp", "ipv6-icmp"),
            ("any", "any"),
            ("017", "17"),
        ],
    )
    def test_normalise_protocol(self, value, expected):
        assert secgroups.normalise_protocol(value) == expected

    @pytest.mark.parametrize("value", ["bogus", "256", "-1"])
    def test_normalise_protocol_rejects(self, value):
        with pytest.raises(ValueError):
            secgroups.normalise_protocol(value)

    def test_ethertype_follows_the_cidr(self):
        assert secgroups.ethertype_for("::/0", "IPv4") == "IPv6"
        assert secgroups.ethertype_for("10.0.0.1/8", "IPv6") == "IPv4"
        assert secgroups.ethertype_for(None, "IPv6") == "IPv6"
        with pytest.raises(ValueError):
            secgroups.ethertype_for("nope", "IPv4")

    def test_icmp_for_ipv6(self):
        assert secgroups.icmp_for("icmp", "IPv6") == "ipv6-icmp"
        assert secgroups.icmp_for("icmp", "IPv4") == "icmp"
        assert secgroups.icmp_for("tcp", "IPv6") == "tcp"

    @pytest.mark.parametrize(
        "protocol, low, high, expected",
        [
            ("icmp", 8, -1, {"port_range_min": 8}),
            ("icmp", 8, None, {"port_range_min": 8}),
            ("icmp", 3, 1, {"port_range_min": 3, "port_range_max": 1}),
            ("icmp", -1, 0, {}),
            ("tcp", 22, None, {"port_range_min": 22, "port_range_max": 22}),
            ("udp", 53, -1, {"port_range_min": 53, "port_range_max": 53}),
            ("tcp", 80, 90, {"port_range_min": 80, "port_range_max": 90}),
            ("tcp", None, None, {}),
            ("gre", 1, 2, {}),
            (None, 1, 2, {}),
        ],
    )
    def test_port_range(self, protocol, low, high, expected):
        assert secgroups.port_range(protocol, low, high) == expected


class TestPortForwardingBody:
    def test_single_ports_and_ranges(self):
        body = port_forwarding_body(
            {
                "protocol": "TCP",
                "internal_port": "22",
                "external_port": "2200:2210",
                "internal_ip_address": "10.0.0.5",
                "internal_port_id": "p-1",
                "description": "ssh",
            }
        )
        assert body == {
            "protocol": "tcp",
            "internal_port": 22,
            "external_port_range": "2200:2210",
            "internal_ip_address": "10.0.0.5",
            "internal_port_id": "p-1",
            "description": "ssh",
        }

    @pytest.mark.parametrize(
        "value, message",
        [("0", "outside"), ("abc", "not a port"), ("90:80", "reversed")],
    )
    def test_rejections(self, value, message):
        with pytest.raises(BadRequest, match=message):
            port_forwarding_body({"internal_port": value})


class TestStaticRoutes:
    def test_normalises(self):
        assert static_routes(
            [{"destination": "10.5.0.1/16", "nexthop": "192.168.1.5"}]
        ) == [{"destination": "10.5.0.0/16", "nexthop": "192.168.1.5"}]

    @pytest.mark.parametrize(
        "route, message",
        [
            ({"destination": "x", "nexthop": "10.0.0.1"}, "not a CIDR"),
            ({"destination": "10.0.0.0/8", "nexthop": "y"}, "next hop"),
            (
                {"destination": "10.0.0.0/8", "nexthop": "fd00::1"},
                "IP version",
            ),
        ],
    )
    def test_rejections(self, route, message):
        with pytest.raises(BadRequest, match=message):
            static_routes([route])
