"""DNS zone and record set rules, as designate-dashboard presents them
(from the Designate v2 API reference, ``designate/api-ref/source``; the
plugin is not vendored, so the form conventions are the upstream
designate-dashboard ones).

- Zone names are absolute (``example.com.``); a zone is PRIMARY (the
  usual case) or SECONDARY with master servers; it carries a contact
  email and a default TTL. Status is ACTIVE, PENDING or ERROR with the
  pending ``action`` (CREATE, UPDATE, DELETE).
- Record sets: a name under the zone (``www.example.com.``), a type, a
  TTL (``null`` uses the zone's default), a description and one or more
  records. The SOA and the apex NS
  record sets are managed by Designate and cannot be edited or deleted.
- Record formats the dashboard validates: A is an IPv4 address, AAAA an
  IPv6 address, CNAME, NS and PTR an absolute name, MX ``priority host.``,
  SRV ``priority weight port target.``, TXT and SPF free text, SSHFP
  ``algorithm type fingerprint``, CAA ``flags tag "value"``.
"""

from collections.abc import Callable
import ipaddress
import re

from hive.nectar.violation import RuleViolation
from hive.times import to_utc_iso

RECORD_TYPES = (
    "A",
    "AAAA",
    "CNAME",
    "MX",
    "NS",
    "PTR",
    "SPF",
    "SRV",
    "SSHFP",
    "TXT",
    "CAA",
)
MANAGED_TYPES = ("SOA",)
ZONE_TYPES = ("PRIMARY", "SECONDARY")
TRANSITIONAL = ("PENDING",)
DEFAULT_TTL = 3600
LABEL = re.compile(r"^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_transitional(item: dict) -> bool:
    """A zone or record set still PENDING (designate-dashboard)."""
    return item.get("status") in TRANSITIONAL


def validate_fqdn(name: str, what: str = "name") -> None:
    """An absolute domain name (Designate v2 API reference)."""
    if not name or not name.endswith("."):
        raise RuleViolation(
            f"The {what} must end with a dot, such as example.com."
        )
    labels = name[:-1].split(".")
    if len(name.encode()) > 255 or any(
        not LABEL.match(label) for label in labels
    ):
        raise RuleViolation(f"The {what} is not a valid domain name.")


def validate_zone(
    name: str,
    email: str,
    ttl: int | None,
    ztype: str,
    masters: list[str] | None,
) -> None:
    """The zone form checks (designate-dashboard create zone)."""
    validate_fqdn(name, "zone name")
    if not EMAIL.match(email or ""):
        raise RuleViolation("Enter a valid contact email address.")
    if ttl is not None and ttl < 0:
        raise RuleViolation("The TTL cannot be negative.")
    if ztype not in ZONE_TYPES:
        raise RuleViolation("The zone type must be PRIMARY or SECONDARY.")
    if ztype == "SECONDARY" and not masters:
        raise RuleViolation(
            "A secondary zone needs at least one master server."
        )


def zone_body(
    name: str,
    email: str,
    ttl: int | None,
    description: str | None,
    ztype: str,
    masters: list[str] | None,
) -> dict:
    """The create-zone body (Designate v2 ``POST /v2/zones``)."""
    body: dict = {"name": name, "email": email, "type": ztype}
    if ttl is not None:
        body["ttl"] = ttl
    if description:
        body["description"] = description
    if ztype == "SECONDARY":
        body["masters"] = masters or []
    return body


def _is_ipv4(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).version == 4
    except ValueError:
        return False


def _is_ipv6(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).version == 6
    except ValueError:
        return False


def _check_a(value: str) -> str | None:
    return None if _is_ipv4(value) else f'"{value}" is not an IPv4 address.'


def _check_aaaa(value: str) -> str | None:
    return None if _is_ipv6(value) else f'"{value}" is not an IPv6 address.'


def _check_target(rtype: str) -> Callable[[str], str | None]:
    def check(value: str) -> str | None:
        return validate_fqdn(value, f"{rtype} target")

    return check


def _check_mx(value: str) -> str | None:
    parts = value.split()
    if len(parts) != 2 or not parts[0].isdigit():
        return "MX records look like: 10 mail.example.com."
    return validate_fqdn(parts[1], "MX host")


def _check_srv(value: str) -> str | None:
    parts = value.split()
    if len(parts) != 4 or not all(p.isdigit() for p in parts[:3]):
        return "SRV records look like: 10 5 5060 sip.example.com."
    return validate_fqdn(parts[3], "SRV target")


def _check_sshfp(value: str) -> str | None:
    parts = value.split()
    if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
        return "SSHFP records look like: 1 1 <fingerprint>."
    return None


def _check_caa(value: str) -> str | None:
    parts = value.split(None, 2)
    if len(parts) != 3 or not parts[0].isdigit():
        return 'CAA records look like: 0 issue "letsencrypt.org".'
    return None


# One check per record type; types without one (TXT, SPF) take any text.
RECORD_CHECKS: dict[str, Callable[[str], str | None]] = {
    "A": _check_a,
    "AAAA": _check_aaaa,
    "CNAME": _check_target("CNAME"),
    "NS": _check_target("NS"),
    "PTR": _check_target("PTR"),
    "MX": _check_mx,
    "SRV": _check_srv,
    "SSHFP": _check_sshfp,
    "CAA": _check_caa,
}


def validate_record(rtype: str, record: str) -> None:
    """One record in its type's format (designate-dashboard)."""
    value = (record or "").strip()
    if not value:
        raise RuleViolation("Records cannot be empty.")
    check = RECORD_CHECKS.get(rtype)
    problem = check(value) if check else None
    if problem:
        raise RuleViolation(problem)


def in_zone(name: str, zone_name: str) -> bool:
    """The apex or a name under it; ``notexample.com.`` is not in
    ``example.com.``."""
    return name == zone_name or name.endswith("." + zone_name)


def validate_recordset(
    zone_name: str, name: str, rtype: str, records: list[str], ttl: int | None
) -> None:
    """The record set form checks (designate-dashboard)."""
    if rtype not in RECORD_TYPES:
        raise RuleViolation(f"Record type {rtype} is not supported.")
    validate_fqdn(name, "record set name")
    if not in_zone(name, zone_name):
        raise RuleViolation(
            f"The name must end with the zone name {zone_name}"
        )
    if not records:
        raise RuleViolation("Add at least one record.")
    if rtype == "CNAME" and len(records) > 1:
        raise RuleViolation("A CNAME record set holds one record.")
    for record in records:
        validate_record(rtype, record)
    if ttl is not None and ttl < 0:
        raise RuleViolation("The TTL cannot be negative.")


def recordset_name(zone_name: str, name: str) -> str:
    """``www`` or ``www.example.com.`` into the absolute record set name;
    an empty name is the zone apex."""
    clean = (name or "").strip()
    if not clean or clean == "@":
        return zone_name
    if clean.endswith("."):
        return clean
    return f"{clean}.{zone_name}"


def recordset_body(
    name: str,
    rtype: str,
    records: list[str],
    ttl: int | None,
    description: str | None,
) -> dict:
    """The record set body (Designate v2 ``recordsets``)."""
    body: dict = {
        "name": name,
        "type": rtype,
        "records": [r.strip() for r in records if r.strip()],
    }
    if ttl is not None:
        body["ttl"] = ttl
    if description is not None:
        body["description"] = description
    return body


def quote_txt(records: list[str]) -> list[str]:
    """TXT and SPF records must be quoted; add quotes when the user did
    not."""
    out = []
    for record in records:
        value = record.strip()
        if value and not (value.startswith('"') and value.endswith('"')):
            value = '"' + value.replace('"', '\\"') + '"'
        out.append(value)
    return out


def can_edit_recordset(recordset: dict, zone_name: str) -> bool:
    """SOA and apex NS sets are Designate's own (dashboard)."""
    rtype = recordset.get("type")
    if rtype in MANAGED_TYPES:
        return False
    return not (rtype == "NS" and recordset.get("name") == zone_name)


def zone_summary(zone: dict) -> dict:
    """A zone row (designate-dashboard zones table)."""
    return {
        "id": zone.get("id"),
        "name": zone.get("name"),
        "type": zone.get("type"),
        "email": zone.get("email"),
        "ttl": zone.get("ttl"),
        "serial": zone.get("serial"),
        "description": zone.get("description"),
        "status": zone.get("status"),
        "action": zone.get("action"),
        "masters": zone.get("masters") or [],
        "shared": bool(zone.get("shared")),
        "created_at": to_utc_iso(zone.get("created_at")),
        "updated_at": to_utc_iso(zone.get("updated_at")),
        "is_transitional": is_transitional(zone),
    }


def recordset_summary(recordset: dict, zone_name: str) -> dict:
    """A record set row (designate-dashboard record sets)."""
    return {
        "id": recordset.get("id"),
        "zone_id": recordset.get("zone_id"),
        "name": recordset.get("name"),
        "type": recordset.get("type"),
        "ttl": recordset.get("ttl"),
        "description": recordset.get("description"),
        "records": recordset.get("records") or [],
        "status": recordset.get("status"),
        "action": recordset.get("action"),
        "created_at": to_utc_iso(recordset.get("created_at")),
        "updated_at": to_utc_iso(recordset.get("updated_at")),
        "is_transitional": is_transitional(recordset),
        "can_edit": can_edit_recordset(recordset, zone_name),
    }
