from hive.nectar.flavors import FlavorRules
from hive.nectar.images import ImageRules
from hive.nectar.networks import (
    NetworkRules,
    PURPOSE_ANY,
    PURPOSE_BOOT,
    PURPOSE_ROUTER,
)
from hive.nectar import secgroups

CLASSIC = "00000000-0000-0000-0000-000000000000"


def rules(**overrides):
    args = dict(
        classic_network_id=CLASSIC,
        bootable_tag="nectar:bootable",
        floating_tag="nectar:floating",
    )
    args.update(overrides)
    return NetworkRules(**args)


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
        classic = {"id": CLASSIC, "name": "classic", "subnets": []}
        shared = {"id": "s1", "name": "zeta", "subnets": [{"id": "x"}]}
        proj = {"id": "p1", "name": "alpha", "subnets": [{"id": "y"}]}
        empty = {"id": "p2", "name": "no-subnets", "subnets": []}
        ordered = r.order([classic], [shared], [proj, empty, shared])
        assert [n["id"] for n in ordered] == [CLASSIC, "s1", "p1", "p2"]
        picked = r.launch_candidates(ordered)
        assert [n["id"] for n in picked] == [CLASSIC, "p1", "s1"]

    def test_attachable_ports(self):
        r = rules()
        ports = [
            {"id": "a", "device_owner": "", "network_id": "n1"},
            {"id": "b", "device_owner": "compute:nova", "network_id": "n1"},
            {"id": "c", "device_owner": "", "network_id": "hidden"},
        ]
        assert [p["id"] for p in r.attachable_ports(ports, {"n1"})] == ["a"]


class TestFlavorRules:
    def test_su_rate_and_preemptible(self):
        r = FlavorRules()
        flavor = {
            "id": "f1",
            "name": "m3.small",
            "vcpus": 2,
            "ram": 4096,
            "disk": 30,
            "extra_specs": {"nectar:rate": "0.5", "flavor_class:name": "m3"},
        }
        summary = r.summary(flavor)
        assert summary["su_rate"] == 0.5
        assert summary["is_preemptible"] is False
        assert summary["ram_mb"] == 4096
        pre = {
            "id": "f2",
            "name": "p3.small",
            "extra_specs": {"flavor_class:name": "preemptible"},
        }
        assert r.is_preemptible(pre)
        assert r.su_rate({"extra_specs": {"nectar:rate": "junk"}}) is None
        assert r.su_rate({}) is None

    def test_resize_candidates_hide_by_prefix_or_class(self):
        flavors = [
            {"id": "a", "name": "m3.small", "extra_specs": {}},
            {"id": "b", "name": "p1.small", "extra_specs": {}},
            {"id": "c", "name": "p3.large", "extra_specs": {}},
            {
                "id": "d",
                "name": "r3.huge",
                "extra_specs": {"flavor_class:name": "r3"},
            },
        ]
        by_prefix = FlavorRules(hidden_resize_prefixes=["p1.", "p3."])
        assert [
            f["id"] for f in by_prefix.resize_candidates("a", flavors)
        ] == ["d"]
        by_class = FlavorRules(hidden_resize_classes=["r3"])
        assert [
            f["id"] for f in by_class.resize_candidates(None, flavors)
        ] == [
            "a",
            "b",
            "c",
        ]

    def test_summary_from_embedded_server_flavor(self):
        r = FlavorRules()
        embedded = {
            "original_name": "m3.medium",
            "vcpus": 4,
            "ram": 8192,
            "disk": 30,
            "ephemeral": 0,
            "extra_specs": {"nectar:rate": "1"},
        }
        assert r.summary(embedded)["name"] == "m3.medium"
        assert r.summary(embedded)["su_rate"] == 1.0


class TestImageRules:
    def test_community_hidden_until_search(self):
        r = ImageRules(["os_hash_algo", "os_hash_value", "os_hidden"])
        mine = {"visibility": "community", "owner": "p1"}
        theirs = {"visibility": "community", "owner": "p2"}
        public = {"visibility": "public", "owner": "p9"}
        assert r.visible_in_picker(mine, "p1", False)
        assert not r.visible_in_picker(theirs, "p1", False)
        assert r.visible_in_picker(theirs, "p1", True)
        assert r.visible_in_picker(public, "p1", False)

    def test_properties_strip_reserved_and_base(self):
        r = ImageRules(["os_hash_algo", "os_hash_value", "os_hidden"])
        image = {
            "id": "i",
            "name": "n",
            "os_hash_algo": "sha512",
            "os_distro": "ubuntu",
            "custom": "x",
        }
        assert r.properties(image) == {"os_distro": "ubuntu", "custom": "x"}
        summary = r.summary(image, "p1")
        assert summary["is_owner"] is False
        assert summary["properties"] == {"os_distro": "ubuntu", "custom": "x"}

    def test_name_map_prefers_earlier_groups(self):
        r = ImageRules([])
        names = r.name_map(
            [{"id": "a", "name": "mine"}],
            [{"id": "a", "name": "community copy"}, {"id": "b", "name": "b"}],
        )
        assert names == {"a": "mine", "b": "b"}

    def test_custom_property_excludes_base_and_reserved(self):
        r = ImageRules(["os_hidden"])
        assert r.is_custom_property("os_distro")
        for key in ("id", "owner", "locations", "os_hidden"):
            assert not r.is_custom_property(key)


class TestSecurityGroupPresets:
    def test_apply_preset(self):
        rule = secgroups.apply_preset(
            {"preset": "ssh", "direction": "ingress"}
        )
        assert rule["protocol"] == "tcp"
        assert rule["port_range_min"] == rule["port_range_max"] == 22
        icmp = secgroups.apply_preset({"preset": "all_icmp"})
        assert icmp["protocol"] == "icmp"
        assert icmp["port_range_min"] is None
        assert secgroups.apply_preset({"protocol": "udp"}) == {
            "protocol": "udp"
        }

    def test_open_to_the_world(self):
        assert secgroups.is_open_to_the_world(
            {"remote_ip_prefix": "0.0.0.0/0"}
        )
        assert not secgroups.is_open_to_the_world(
            {"remote_ip_prefix": "10.0.0.0/8"}
        )
        assert secgroups.DEFAULT_REMOTE_CIDR == ""
