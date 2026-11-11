import pytest

from hive.nectar import secgroups


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


class TestSecurityGroupRules:
    @pytest.mark.parametrize(
        ("value", "expected"),
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
        ("protocol", "low", "high", "expected"),
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
