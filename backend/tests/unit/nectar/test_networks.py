from typing import ClassVar

import pytest

from hive.nectar.networks import (
    allowed_address_pairs,
    device_kind,
    NetworkRules,
    port_forwarding_body,
    ports_in_use,
    PURPOSE_ANY,
    PURPOSE_BOOT,
    PURPOSE_ROUTER,
    static_routes,
    subnet_body,
)
from hive.nectar.violation import RuleViolation

# The classic network id the ``rules()`` helper below is configured with.
CLASSIC_ID = "classic"


class TestNetworkRules:
    def test_shared_tags_by_purpose(self):
        r = rules()
        assert r.shared_tags_for(PURPOSE_BOOT) == ["nectar:bootable"]
        assert r.shared_tags_for(PURPOSE_ROUTER) == []
        assert r.shared_tags_for(PURPOSE_ANY) == [
            "nectar:floating",
            "nectar:bootable",
        ]

    def test_unconfigured_behaves_like_upstream(self):
        r = rules(bootable_tag=None, floating_tag=None)
        assert r.shared_tags_for(PURPOSE_BOOT) is None
        assert r.shared_query_params(PURPOSE_BOOT) == {"shared": "true"}
        assert r.floating_query_params() == {"router:external": "true"}

    def test_shared_query_params(self):
        r = rules()
        assert r.shared_query_params(PURPOSE_BOOT) == {
            "shared": "true",
            "tags-any": "nectar:bootable",
        }
        assert r.shared_query_params(PURPOSE_ROUTER) is None
        assert r.floating_query_params() == {
            "router:external": "true",
            "tags-any": "nectar:floating",
        }

    def test_classic_offered_except_for_routers(self):
        r = rules()
        assert r.offers_classic(PURPOSE_BOOT)
        assert not r.offers_classic(PURPOSE_ROUTER)
        assert not rules(classic_network_id=None).offers_classic(PURPOSE_BOOT)

    def test_order_and_launch_candidates(self):
        r = rules()
        classic = {"id": CLASSIC_ID, "name": "classic", "subnets": []}
        shared = {"id": "s1", "name": "zeta", "subnets": [{"id": "x"}]}
        proj = {"id": "p1", "name": "alpha", "subnets": [{"id": "y"}]}
        empty = {"id": "p2", "name": "no-subnets", "subnets": []}
        ordered = r.order([classic], [shared], [proj, empty, shared])
        assert [n["id"] for n in ordered] == [CLASSIC_ID, "s1", "p1", "p2"]
        picked = r.launch_candidates(ordered)
        assert [n["id"] for n in picked] == [CLASSIC_ID, "p1", "s1"]

    def test_attachable_ports(self):
        r = rules()
        ports = [
            {"id": "a", "device_owner": "", "network_id": "n1"},
            {"id": "b", "device_owner": "compute:nova", "network_id": "n1"},
            {"id": "c", "device_owner": "", "network_id": "hidden"},
        ]
        assert [p["id"] for p in r.attachable_ports(ports, {"n1"})] == ["a"]


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
        assert choices[0]["overlaps"] is None

    def test_a_subnet_overlapping_an_attached_one_says_so(self):
        networks = [
            {
                "id": "net-1",
                "name": "private",
                "subnets": [
                    {
                        "id": "s-on",
                        "cidr": "10.0.0.0/24",
                        "gateway_ip": "10.0.0.1",
                    },
                    {
                        "id": "s-wide",
                        "cidr": "10.0.0.0/16",
                        "gateway_ip": "10.0.0.1",
                    },
                    {
                        "id": "s-v6",
                        "cidr": "fd00::/64",
                        "gateway_ip": "fd00::1",
                    },
                ],
            }
        ]
        choices = rules().router_interface_subnets(networks, {"s-on"})
        overlaps = {c["id"]: c["overlaps"] for c in choices}
        assert overlaps == {"s-wide": "10.0.0.0/24", "s-v6": None}


class TestPortsAndDevices:
    def test_ports_in_use_leave_out_the_ones_deleted_with_the_network(self):
        ports = [
            {"network_id": "n-1", "device_owner": "network:dhcp"},
            {"network_id": "n-1", "device_owner": "network:distributed"},
            {"network_id": "n-1", "device_owner": "network:router_interface"},
            {"network_id": "n-1", "device_owner": "compute:nova"},
            {"network_id": "n-2", "device_owner": "network:dhcp"},
            {"network_id": "n-3", "device_owner": ""},
        ]
        assert ports_in_use(ports) == {"n-1": 2, "n-3": 1}

    @pytest.mark.parametrize(
        "owner, kind",
        [
            ("compute:nova", "instance"),
            ("compute:melbourne-qh2", "instance"),
            ("network:router_interface", "router"),
            ("network:router_gateway", "router"),
            ("network:ha_router_replicated_interface", "router"),
            ("network:dhcp", None),
            ("neutron:LOADBALANCERV2", None),
            ("", None),
            (None, None),
        ],
    )
    def test_device_kind(self, owner, kind):
        assert device_kind(owner) == kind

    def test_allowed_address_pairs_are_checked_and_normalised(self):
        assert allowed_address_pairs(
            [
                {"ip_address": " 10.0.0.9 "},
                {
                    "ip_address": "10.0.1.7/24",
                    "mac_address": "FA:16:3E:00:00:01",
                },
                {"ip_address": "fd00::5", "mac_address": ""},
            ]
        ) == [
            {"ip_address": "10.0.0.9"},
            {"ip_address": "10.0.1.0/24", "mac_address": "fa:16:3e:00:00:01"},
            {"ip_address": "fd00::5"},
        ]

    @pytest.mark.parametrize(
        "pair, message",
        [
            ({"ip_address": "10.0.0.300"}, "not an IP address or CIDR"),
            ({"ip_address": "10.0.0.0/40"}, "not an IP address or CIDR"),
            (
                {"ip_address": "10.0.0.9", "mac_address": "fa:16:3e"},
                "not a MAC address",
            ),
        ],
    )
    def test_allowed_address_pair_rejections(self, pair, message):
        with pytest.raises(RuleViolation, match=message):
            allowed_address_pairs([pair])


class TestTrunkCandidates:
    PORTS: ClassVar[list[dict]] = [
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
    TRUNKS: ClassVar[list[dict]] = [
        {"port_id": "p-parent", "sub_ports": [{"port_id": "p-child"}]}
    ]

    def test_parents_and_subports(self):
        parents = NetworkRules.trunk_parent_candidates(self.PORTS, self.TRUNKS)
        assert [p["id"] for p in parents] == ["p-free", "p-vm"]
        subports = NetworkRules.trunk_subport_candidates(
            self.PORTS, self.TRUNKS
        )
        assert [p["id"] for p in subports] == ["p-free"]


class TestSubnetBody:
    DNS: ClassVar[list[str]] = ["1.1.1.1", "1.0.0.1"]

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
        with pytest.raises(RuleViolation, match=message):
            subnet_body(data, self.DNS)

    def test_ipv6_allowed_when_enabled(self):
        body = subnet_body(
            {"cidr": "fd00::/64", "ip_version": 6}, self.DNS, enable_ipv6=True
        )
        assert body["ip_version"] == 6

    def test_no_default_name_servers_sends_none(self):
        body = subnet_body({"cidr": "192.168.0.0/24"}, [])
        assert "dns_nameservers" not in body

    def test_ipv6_modes_go_as_horizons_pairs(self):
        body = subnet_body(
            {
                "cidr": "fd00::/64",
                "ip_version": 6,
                "ipv6_ra_mode": "slaac",
                "ipv6_address_mode": "slaac",
            },
            self.DNS,
            enable_ipv6=True,
        )
        assert body["ipv6_ra_mode"] == "slaac"
        assert body["ipv6_address_mode"] == "slaac"
        external = subnet_body(
            {
                "cidr": "fd00::/64",
                "ip_version": 6,
                "ipv6_address_mode": "slaac",
            },
            self.DNS,
            enable_ipv6=True,
        )
        assert "ipv6_ra_mode" not in external
        assert external["ipv6_address_mode"] == "slaac"

    @pytest.mark.parametrize(
        "data, message",
        [
            (
                {
                    "cidr": "fd00::/64",
                    "ip_version": 6,
                    "ipv6_ra_mode": "slaac",
                    "ipv6_address_mode": "dhcpv6-stateful",
                },
                "not a supported pair",
            ),
            (
                {"cidr": "10.0.0.0/24", "ipv6_address_mode": "slaac"},
                "IPv6 subnets only",
            ),
        ],
    )
    def test_ipv6_mode_rejections(self, data, message):
        with pytest.raises(RuleViolation, match=message):
            subnet_body(data, self.DNS, enable_ipv6=True)

    @pytest.mark.parametrize(
        "data, message",
        [
            (
                {"cidr": "10.0.0.0/24", "gateway_ip": "192.168.5.1"},
                "outside 10.0.0.0/24",
            ),
            (
                {"cidr": "10.0.0.0/24", "gateway_ip": "10.0.0.0"},
                "network or broadcast",
            ),
            (
                {"cidr": "10.0.0.0/24", "gateway_ip": "10.0.0.255"},
                "network or broadcast",
            ),
            (
                {
                    "cidr": "10.0.0.0/24",
                    "allocation_pools": [
                        {"start": "10.0.0.10", "end": "10.0.1.20"}
                    ],
                },
                "outside 10.0.0.0/24",
            ),
            (
                {
                    "cidr": "10.0.0.0/24",
                    "allocation_pools": [
                        {"start": "10.0.0.10", "end": "10.0.0.20"},
                        {"start": "10.0.0.15", "end": "10.0.0.30"},
                    ],
                },
                "overlap",
            ),
            (
                # The default gateway (the first address) inside a pool.
                {
                    "cidr": "10.0.0.0/24",
                    "allocation_pools": [
                        {"start": "10.0.0.1", "end": "10.0.0.20"}
                    ],
                },
                "inside allocation pool",
            ),
            (
                {
                    "cidr": "10.0.0.0/24",
                    "host_routes": [
                        {"destination": "fd00::/64", "nexthop": "10.0.0.1"}
                    ],
                },
                "not IPv4",
            ),
        ],
    )
    def test_range_rejections(self, data, message):
        with pytest.raises(RuleViolation, match=message):
            subnet_body(data, self.DNS)

    def test_a_disabled_gateway_may_sit_anywhere(self):
        body = subnet_body(
            {
                "cidr": "10.0.0.0/24",
                "no_gateway": True,
                "allocation_pools": [{"start": "10.0.0.1", "end": "10.0.0.9"}],
            },
            self.DNS,
        )
        assert body["gateway_ip"] is None

    def test_update_sends_only_given_fields_and_clears_lists(self):
        stored = {
            "ip_version": 4,
            "cidr": "10.0.0.0/24",
            "gateway_ip": "10.0.0.1",
        }
        body = subnet_body(
            {"name": "renamed", "allocation_pools": []},
            self.DNS,
            stored=stored,
        )
        assert body == {"name": "renamed", "allocation_pools": []}
        assert subnet_body({}, self.DNS, stored=stored) == {}

    def test_update_checks_new_pools_against_the_stored_gateway(self):
        stored = {
            "ip_version": 4,
            "cidr": "10.0.0.0/24",
            "gateway_ip": "10.0.0.1",
        }
        with pytest.raises(RuleViolation, match="inside allocation pool"):
            subnet_body(
                {
                    "allocation_pools": [
                        {"start": "10.0.0.1", "end": "10.0.0.5"}
                    ]
                },
                self.DNS,
                stored=stored,
            )

    def test_a_rename_skips_the_range_checks(self):
        # A subnet made outside Hive may break the rules; a rename must
        # still go through.
        stored = {
            "ip_version": 4,
            "cidr": "10.0.0.0/24",
            "gateway_ip": "10.0.0.5",
            "allocation_pools": [{"start": "10.0.0.2", "end": "10.0.0.9"}],
        }
        assert subnet_body({"name": "x"}, self.DNS, stored=stored) == {
            "name": "x"
        }


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
        with pytest.raises(RuleViolation, match=message):
            port_forwarding_body({"internal_port": value})

    @pytest.mark.parametrize(
        "external, internal, ok",
        [
            ("2200", "22", True),
            ("2200:2210", "22", True),
            ("2200:2210", "3300:3310", True),
            ("2200", "22:23", False),
            ("2200:2210", "22:25", False),
        ],
    )
    def test_range_sizes(self, external, internal, ok):
        data = {"external_port": external, "internal_port": internal}
        if ok:
            assert port_forwarding_body(data)
        else:
            with pytest.raises(RuleViolation, match="single port or a range"):
                port_forwarding_body(data)


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
        with pytest.raises(RuleViolation, match=message):
            static_routes([route])
