"""Security group rule presets and defaults.

Presets mirror ``SECURITY_GROUP_RULES`` in the Nectar Horizon settings
(``nectar-dashboard-helm/templates/_local_settings.tpl``). The remote CIDR
has no ``0.0.0.0/0`` default (Horizon fork commit dcc2b5691): the user
must type one.

``normalise_protocol``, ``ethertype_for``, ``icmp_for`` and ``port_range``
reproduce how Horizon builds the neutron rule
(``openstack_dashboard/api/neutron.py`` ``rule_create`` and
``dashboards/project/security_groups/forms.py`` ``AddRule.clean``).
"""

import ipaddress

PRESETS = [
    {"id": "all_icmp", "name": "All ICMP", "protocol": "icmp"},
    {"id": "ssh", "name": "SSH", "protocol": "tcp", "port": 22},
    {"id": "dns", "name": "DNS", "protocol": "tcp", "port": 53},
    {"id": "http", "name": "HTTP", "protocol": "tcp", "port": 80},
    {"id": "https", "name": "HTTPS", "protocol": "tcp", "port": 443},
    {"id": "ms_sql", "name": "MS SQL", "protocol": "tcp", "port": 1433},
    {"id": "mysql", "name": "MYSQL", "protocol": "tcp", "port": 3306},
    {
        "id": "postgresql",
        "name": "PostgreSQL",
        "protocol": "tcp",
        "port": 5432,
    },
    {"id": "rdp", "name": "RDP", "protocol": "tcp", "port": 3389},
    {"id": "all_tcp", "name": "All TCP", "protocol": "tcp"},
    {"id": "all_udp", "name": "All UDP", "protocol": "udp"},
]

DEFAULT_REMOTE_CIDR = ""
OPEN_CIDRS = {"0.0.0.0/0", "::/0"}


def preset(preset_id: str) -> dict | None:
    return next((p for p in PRESETS if p["id"] == preset_id), None)


def apply_preset(rule: dict) -> dict:
    """Fill protocol and port range from a preset id, if one is given."""
    chosen = preset(rule.get("preset") or "")
    if not chosen:
        return rule
    filled = dict(rule)
    filled["protocol"] = chosen["protocol"]
    if "port" in chosen:
        filled["port_range_min"] = chosen["port"]
        filled["port_range_max"] = chosen["port"]
    else:
        filled["port_range_min"] = None
        filled["port_range_max"] = None
    return filled


def is_open_to_the_world(rule: dict) -> bool:
    return rule.get("remote_ip_prefix") in OPEN_CIDRS


# The protocol names neutron accepts on a security group rule
# (neutron_lib.constants.IP_PROTOCOL_MAP plus "any"); a number 0-255 is
# accepted too. Horizon's custom rule takes the number only
# (``forms.py`` ``ip_protocol`` with ``validate_ip_protocol``).
NEUTRON_PROTOCOLS = frozenset(
    {
        "any",
        "ah",
        "dccp",
        "egp",
        "esp",
        "gre",
        "hopopt",
        "icmp",
        "icmpv6",
        "igmp",
        "ip",
        "ipip",
        "ipv6-encap",
        "ipv6-frag",
        "ipv6-icmp",
        "ipv6-nonxt",
        "ipv6-opts",
        "ipv6-route",
        "ospf",
        "pgm",
        "rsvp",
        "sctp",
        "tcp",
        "udp",
        "udplite",
        "vrrp",
    }
)
PORT_PROTOCOLS = frozenset({"tcp", "udp"})
ICMP_PROTOCOLS = frozenset({"icmp", "icmpv6", "ipv6-icmp"})


def normalise_protocol(value: str | None) -> str | None:
    """Lower-case a protocol name, or raise ``ValueError`` when neutron
    would reject it. Blank means any protocol (``None``)."""
    if value is None or not value.strip():
        return None
    protocol = value.strip().lower()
    if protocol.isdigit():
        if int(protocol) > 255:
            raise ValueError("a protocol number must be between 0 and 255")
        return str(int(protocol))
    if protocol not in NEUTRON_PROTOCOLS:
        raise ValueError(f"'{value}' is not a protocol neutron accepts")
    return protocol


def ethertype_for(remote_ip_prefix: str | None, default: str) -> str:
    """The ethertype a remote CIDR implies (``forms.py:457-460``); without
    a CIDR (a remote group) the requested one stands. Raises
    ``ValueError`` for a CIDR that does not parse."""
    if not remote_ip_prefix:
        return default
    network = ipaddress.ip_network(remote_ip_prefix, strict=False)
    return "IPv6" if network.version == 6 else "IPv4"


def icmp_for(protocol: str | None, ethertype: str) -> str | None:
    """ICMP on an IPv6 rule is ``ipv6-icmp``
    (``forms.py`` ``_adjust_ip_protocol_of_icmp``)."""
    if protocol == "icmp" and ethertype == "IPv6":
        return "ipv6-icmp"
    return protocol


def port_range(
    protocol: str | None, low: int | None, high: int | None
) -> dict:
    """``port_range_min``/``port_range_max`` for neutron.

    Negative values mean unset, as in ``api/neutron.py:539-542``, so an
    ICMP rule with a type and no code (``-1``) sends the type only. A
    single TCP or UDP port fills the top of the range from the bottom;
    ICMP never does, because there ``max`` is the ICMP code.
    """
    if low is not None and low < 0:
        low = None
    if high is not None and high < 0:
        high = None
    if low is None or (
        protocol not in PORT_PROTOCOLS and protocol not in ICMP_PROTOCOLS
    ):
        return {}
    fields = {"port_range_min": low}
    if high is None and protocol in PORT_PROTOCOLS:
        high = low
    if high is not None:
        fields["port_range_max"] = high
    return fields
