"""Security group rule presets and defaults.

Presets mirror ``SECURITY_GROUP_RULES`` in the Nectar Horizon settings
(``nectar-dashboard-helm/templates/_local_settings.tpl``). The remote CIDR
has no ``0.0.0.0/0`` default (Horizon fork commit dcc2b5691): the user
must type one.
"""

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
