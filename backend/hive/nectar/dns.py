"""DNS zone and record set rules, as designate-dashboard presents them
(from the Designate v2 API reference, ``designate/api-ref/source``; the
plugin is not vendored, so the form conventions are the upstream
designate-dashboard ones).

- Zone names are absolute (``example.com.``); a zone is PRIMARY (the
  usual case) or SECONDARY with master servers; it carries a contact
  email and a default TTL. Status is ACTIVE, PENDING or ERROR with the
  pending ``action`` (CREATE, UPDATE, DELETE).
- Record sets: a name under the zone (``www.example.com.``), a type, a
  TTL, a description and one or more records. The SOA and the apex NS
  record sets are managed by Designate and cannot be edited or deleted.
- Record formats the dashboard validates: A is an IPv4 address, AAAA an
  IPv6 address, CNAME, NS and PTR an absolute name, MX ``priority host.``,
  SRV ``priority weight port target.``, TXT and SPF free text, SSHFP
  ``algorithm type fingerprint``, CAA ``flags tag "value"``.
"""

import ipaddress
import re

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
    return item.get("status") in TRANSITIONAL


def validate_fqdn(name: str, what: str = "name") -> str | None:
    if not name or not name.endswith("."):
        return f"The {what} must end with a dot, such as example.com."
    labels = name[:-1].split(".")
    if len(name.encode()) > 255 or any(not LABEL.match(label) for label in labels):
        return f"The {what} is not a valid domain name."
    return None


def validate_zone(name: str, email: str, ttl: int | None, ztype: str, masters: list[str] | None) -> str | None:
    problem = validate_fqdn(name, "zone name")
    if problem:
        return problem
    if not EMAIL.match(email or ""):
        return "Enter a valid contact email address."
    if ttl is not None and ttl < 0:
        return "The TTL cannot be negative."
    if ztype not in ZONE_TYPES:
        return "The zone type must be PRIMARY or SECONDARY."
    if ztype == "SECONDARY" and not masters:
        return "A secondary zone needs at least one master server."
    return None


def zone_body(name: str, email: str, ttl: int | None, description: str | None, ztype: str, masters: list[str] | None) -> dict:
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


def validate_record(rtype: str, record: str) -> str | None:
    value = (record or "").strip()
    if not value:
        return "Records cannot be empty."
    if rtype == "A" and not _is_ipv4(value):
        return f'"{value}" is not an IPv4 address.'
    if rtype == "AAAA" and not _is_ipv6(value):
        return f'"{value}" is not an IPv6 address.'
    if rtype in ("CNAME", "NS", "PTR"):
        return validate_fqdn(value, f"{rtype} target")
    if rtype == "MX":
        parts = value.split()
        if len(parts) != 2 or not parts[0].isdigit():
            return "MX records look like: 10 mail.example.com."
        return validate_fqdn(parts[1], "MX host")
    if rtype == "SRV":
        parts = value.split()
        if len(parts) != 4 or not all(p.isdigit() for p in parts[:3]):
            return "SRV records look like: 10 5 5060 sip.example.com."
        return validate_fqdn(parts[3], "SRV target")
    if rtype == "SSHFP":
        parts = value.split()
        if len(parts) != 3 or not parts[0].isdigit() or not parts[1].isdigit():
            return "SSHFP records look like: 1 1 <fingerprint>."
    if rtype == "CAA":
        parts = value.split(None, 2)
        if len(parts) != 3 or not parts[0].isdigit():
            return 'CAA records look like: 0 issue "letsencrypt.org".'
    return None


def validate_recordset(zone_name: str, name: str, rtype: str, records: list[str], ttl: int | None) -> str | None:
    if rtype not in RECORD_TYPES:
        return f"Record type {rtype} is not supported."
    problem = validate_fqdn(name, "record set name")
    if problem:
        return problem
    if not name.endswith(zone_name):
        return f"The name must end with the zone name {zone_name}"
    if not records:
        return "Add at least one record."
    if rtype == "CNAME" and len(records) > 1:
        return "A CNAME record set holds one record."
    for record in records:
        problem = validate_record(rtype, record)
        if problem:
            return problem
    if ttl is not None and ttl < 0:
        return "The TTL cannot be negative."
    return None


def recordset_name(zone_name: str, name: str) -> str:
    """``www`` or ``www.example.com.`` into the absolute record set name;
    an empty name is the zone apex."""
    clean = (name or "").strip()
    if not clean or clean == "@":
        return zone_name
    if clean.endswith("."):
        return clean
    return f"{clean}.{zone_name}"


def recordset_body(name: str, rtype: str, records: list[str], ttl: int | None, description: str | None) -> dict:
    body: dict = {"name": name, "type": rtype, "records": [r.strip() for r in records if r.strip()]}
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
    rtype = recordset.get("type")
    if rtype in MANAGED_TYPES:
        return False
    if rtype == "NS" and recordset.get("name") == zone_name:
        return False
    return True


def zone_summary(zone: dict) -> dict:
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
        "created_at": zone.get("created_at"),
        "updated_at": zone.get("updated_at"),
        "is_transitional": is_transitional(zone),
    }


def recordset_summary(recordset: dict, zone_name: str) -> dict:
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
        "created_at": recordset.get("created_at"),
        "updated_at": recordset.get("updated_at"),
        "is_transitional": is_transitional(recordset),
        "can_edit": can_edit_recordset(recordset, zone_name),
    }
