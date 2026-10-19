"""Shared file system rules, as manila-ui 13.0 (the version Nectar pins)
presents them. Citations are to the installed plugin under
``nectar-dashboard/.tox/py312/lib/python3.12/site-packages/manila_ui``.

- Nectar removes the share networks panel
  (``nectar_dashboard/enabled/_9900_disable_share_networks.py``) and sets
  ``OPENSTACK_MANILA_FEATURES = {'enabled_share_protocols': ['NFS', 'CIFS',
  'CephFS']}`` (helm ``_local_settings.tpl:758-760``); every other feature
  flag keeps its default of True.
- Share statuses (``dashboards/project/shares/tables.py:205-219``):
  available is OK; creating, deleting, reverting, migrating, migrating_to
  are transitional; the rest are errors.
- Row actions (``shares/tables.py:435-443``): edit and metadata need
  available or in-use; resize and revert need available (revert also
  ``revert_to_snapshot_support``); snapshot needs available or in-use and
  ``snapshot_support``; delete needs AVAILABLE, ERROR or MANAGE_ERROR and
  no snapshots.
- Create (``shares/forms.py:32-251``): name, protocol from the enabled
  list, size >= 1 (and >= the snapshot size when restoring), share type by
  name, optional AZ, optional group, metadata ``key=value`` lines, public
  flag. Resize (``forms.py:402-476``): a different positive size, growth
  within the gigabyte quota; extend or shrink accordingly.
- Access rules (``forms.py:325-365``): type ip, user, cert or cephx; level
  rw or ro; ``access_to`` up to 255 characters; ip must parse as a network.
- Snapshots, security services, share groups and share group snapshots
  follow ``share_snapshots/``, ``security_services/``, ``share_groups/``
  and ``share_group_snapshots/`` tables and forms.
"""

import ipaddress

SHARE_TRANSITIONAL = (
    "creating",
    "deleting",
    "reverting",
    "migrating",
    "migrating_to",
)
SHARE_EDITABLE = ("available", "in-use")
SHARE_DELETABLE = ("AVAILABLE", "ERROR", "MANAGE_ERROR")
SNAPSHOT_TRANSITIONAL = ("creating",)
GROUP_TRANSITIONAL = ("creating", "deleting")
ACCESS_TYPES = ("ip", "user", "cert", "cephx")
ACCESS_LEVELS = ("rw", "ro")
SECURITY_SERVICE_TYPES = ("active_directory", "ldap", "kerberos")
SECURITY_SERVICE_LABELS = {
    "active_directory": "Active Directory",
    "ldap": "LDAP",
    "kerberos": "Kerberos",
}


def is_transitional(
    status: str | None, transitional=SHARE_TRANSITIONAL
) -> bool:
    return (status or "").lower() in transitional


def share_actions(share: dict, has_snapshot: bool) -> list[str]:
    status = (share.get("status") or "").lower()
    actions = []
    if status in SHARE_EDITABLE:
        actions.append("edit")
        actions.append("metadata")
        if share.get("snapshot_support", True):
            actions.append("snapshot")
    if status == "available":
        actions.append("resize")
        if share.get("revert_to_snapshot_support"):
            actions.append("revert")
    actions.append("rules")
    if status.upper() in SHARE_DELETABLE and not has_snapshot:
        actions.append("delete")
    return actions


def snapshot_actions(snapshot: dict, share: dict | None) -> list[str]:
    status = (snapshot.get("status") or "").lower()
    actions = ["edit"]
    if status == "available":
        actions.append("create_share")
    if share and share.get("mount_snapshot_support"):
        actions.append("rules")
    if status in ("available", "error"):
        actions.append("delete")
    return actions


def group_actions(group: dict) -> list[str]:
    status = (group.get("status") or "").lower()
    actions = []
    if status == "available":
        actions.append("snapshot")
    if status in ("available", "error"):
        actions.extend(["edit", "delete"])
    return actions


def group_snapshot_actions(snapshot: dict) -> list[str]:
    status = (snapshot.get("status") or "").lower()
    actions = []
    if status == "available":
        actions.append("create_group")
    if status in ("available", "error"):
        actions.extend(["edit", "delete"])
    return actions


def parse_metadata(text: str | None) -> dict[str, str]:
    """``key=value`` lines (``utils.py:36-75``): keys and values 1 to 255
    characters, no spaces in keys, no duplicates."""
    metadata: dict[str, str] = {}
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        if "=" not in line:
            raise ValueError("Expected only pairs of key=value.")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if not key or not value or len(key) > 255 or len(value) > 255:
            raise ValueError(
                "Metadata keys and values must be 1 to 255 characters."
            )
        if " " in key:
            raise ValueError("Metadata keys cannot contain spaces.")
        if key in metadata:
            raise ValueError(f"Metadata key {key} is repeated.")
        metadata[key] = value
    return metadata


def can_create(limits: dict) -> tuple[bool, str | None]:
    """The create button is disabled with "(Quota exceeded)" unless both
    the share count and gigabyte quotas have room (``tables.py:89-108``)."""
    max_shares = limits.get("maxTotalShares", -1)
    used_shares = limits.get("totalSharesUsed", 0)
    max_gb = limits.get("maxTotalShareGigabytes", -1)
    used_gb = limits.get("totalShareGigabytesUsed", 0)
    if max_shares not in (-1, None) and used_shares >= max_shares:
        return False, "The project has used all of its shares quota."
    if max_gb not in (-1, None) and used_gb >= max_gb:
        return False, "The project has used all of its share storage quota."
    return True, None


def can_snapshot(limits: dict) -> tuple[bool, str | None]:
    max_snaps = limits.get("maxTotalShareSnapshots", -1)
    used_snaps = limits.get("totalShareSnapshotsUsed", 0)
    max_gb = limits.get("maxTotalSnapshotGigabytes", -1)
    used_gb = limits.get("totalSnapshotGigabytesUsed", 0)
    if max_snaps not in (-1, None) and used_snaps >= max_snaps:
        return False, "The project has used all of its share snapshots quota."
    if max_gb not in (-1, None) and used_gb >= max_gb:
        return False, "The project has used all of its snapshot storage quota."
    return True, None


def validate_create(
    *,
    protocol: str,
    protocols: tuple[str, ...] | list[str],
    size: int,
    share_type: str | None,
    snapshot: dict | None,
) -> str | None:
    if protocol not in protocols:
        return f"The protocol must be one of {', '.join(protocols)}."
    if size < 1:
        return "The size must be at least 1 GiB."
    if not share_type:
        return "Select a share type."
    if snapshot and size < int(snapshot.get("size") or 0):
        return f"The share size cannot be less than the snapshot size ({snapshot.get('size')}GiB)"
    return None


def create_body(
    *,
    name: str,
    description: str | None,
    protocol: str,
    size: int,
    share_type: str,
    availability_zone: str | None,
    snapshot_id: str | None,
    share_group_id: str | None,
    metadata: dict,
    is_public: bool,
) -> dict:
    body: dict = {
        "name": name,
        "description": description or "",
        "share_proto": protocol,
        "size": size,
        "share_type": share_type,
        "is_public": is_public,
        "metadata": metadata,
        "scheduler_hints": {},
    }
    if availability_zone:
        body["availability_zone"] = availability_zone
    if snapshot_id:
        body["snapshot_id"] = snapshot_id
    if share_group_id:
        body["share_group_id"] = share_group_id
    return body


def validate_resize(current: int, new_size: int, limits: dict) -> str | None:
    if new_size == current:
        return "The new size must differ from the current size."
    if new_size <= 0:
        return "The new size must be greater than zero."
    max_gb = limits.get("maxTotalShareGigabytes", -1)
    used_gb = limits.get("totalShareGigabytesUsed", 0)
    if new_size > current and max_gb not in (-1, None):
        if new_size - current > max_gb - used_gb:
            return (
                "The share cannot grow by more than the remaining"
                f" {max(max_gb - used_gb, 0)} GiB of quota."
            )
    return None


def validate_access(
    access_type: str, access_to: str, access_level: str
) -> str | None:
    if access_type not in ACCESS_TYPES:
        return "The access type must be ip, user, cert or cephx."
    if access_level not in ACCESS_LEVELS:
        return "The access level must be rw or ro."
    value = (access_to or "").strip()
    if not value or len(value) > 255:
        return "Enter who to grant access to (up to 255 characters)."
    if access_type == "ip":
        try:
            ipaddress.ip_network(value, strict=False)
        except ValueError:
            return f'"{value}" is not an IP address or network.'
    return None


def newest_snapshot(snapshots: list[dict]) -> dict | None:
    """Revert offers only the newest snapshot (``forms.py:479-521``)."""
    if not snapshots:
        return None
    return max(snapshots, key=lambda s: s.get("created_at") or "")


def newest_snapshot_ids(snapshots: list[dict]) -> dict[str, str]:
    """The one snapshot per share that revert accepts, keyed by share id,
    so the revert form never has to guess from list order (Manila lists
    newest first; ``forms.py:479-521`` offers only the newest)."""
    by_share: dict[str, list[dict]] = {}
    for snapshot in snapshots:
        if snapshot.get("share_id"):
            by_share.setdefault(snapshot["share_id"], []).append(snapshot)
    return {
        share_id: newest["id"]
        for share_id, group in by_share.items()
        if (newest := newest_snapshot(group)) and newest.get("id")
    }


def share_summary(share: dict, has_snapshot: bool = False) -> dict:
    status = share.get("status")
    return {
        "id": share.get("id"),
        "name": share.get("name"),
        "description": share.get("description"),
        "size": share.get("size"),
        "status": status,
        "protocol": share.get("share_proto"),
        "is_public": bool(share.get("is_public")),
        "share_type": share.get("share_type_name") or share.get("share_type"),
        "share_type_id": share.get("share_type"),
        "availability_zone": share.get("availability_zone"),
        "share_group_id": share.get("share_group_id"),
        "snapshot_id": share.get("snapshot_id"),
        "metadata": share.get("metadata") or {},
        "created_at": share.get("created_at"),
        "snapshot_support": bool(share.get("snapshot_support", True)),
        "revert_to_snapshot_support": bool(
            share.get("revert_to_snapshot_support")
        ),
        "mount_snapshot_support": bool(share.get("mount_snapshot_support")),
        "has_snapshot": has_snapshot,
        "is_transitional": is_transitional(status),
        "actions": share_actions(share, has_snapshot),
    }


def share_detail(
    share: dict,
    rules: list[dict],
    locations: list[dict],
    snapshots: list[dict],
) -> dict:
    """``newest_snapshot_id`` is the only snapshot revert accepts."""
    summary = share_summary(share, bool(snapshots))
    newest = newest_snapshot(snapshots)
    summary.update(
        {
            "newest_snapshot_id": (newest or {}).get("id"),
            "host": share.get("host"),
            "task_state": share.get("task_state"),
            "export_locations": [
                {
                    "path": loc.get("path"),
                    "preferred": bool(loc.get("preferred")),
                    "id": loc.get("id"),
                }
                for loc in locations
            ],
            "access_rules": [access_summary(r) for r in rules],
        }
    )
    return summary


def access_summary(rule: dict) -> dict:
    return {
        "id": rule.get("id"),
        "access_type": rule.get("access_type"),
        "access_to": rule.get("access_to"),
        "access_level": rule.get("access_level"),
        "state": rule.get("state"),
        "access_key": rule.get("access_key"),
        "metadata": rule.get("metadata") or {},
        "created_at": rule.get("created_at"),
        "updated_at": rule.get("updated_at"),
    }


def snapshot_summary(snapshot: dict, share: dict | None) -> dict:
    status = snapshot.get("status")
    return {
        "id": snapshot.get("id"),
        "name": snapshot.get("name"),
        "description": snapshot.get("description"),
        "size": snapshot.get("size"),
        "status": status,
        "share_id": snapshot.get("share_id"),
        "share_name": (share or {}).get("name"),
        "share_proto": snapshot.get("share_proto"),
        "share_size": snapshot.get("share_size"),
        "created_at": snapshot.get("created_at"),
        "is_transitional": is_transitional(status, SNAPSHOT_TRANSITIONAL),
        "actions": snapshot_actions(snapshot, share),
    }


def security_service_summary(service: dict) -> dict:
    stype = service.get("type")
    return {
        "id": service.get("id"),
        "name": service.get("name"),
        "description": service.get("description"),
        "type": stype,
        "type_label": SECURITY_SERVICE_LABELS.get(stype or "", stype),
        "dns_ip": service.get("dns_ip"),
        "ou": service.get("ou"),
        "server": service.get("server"),
        "domain": service.get("domain"),
        "user": service.get("user"),
        "status": service.get("status"),
        "created_at": service.get("created_at"),
    }


def security_service_body(fields: dict) -> dict:
    """Only non-empty fields are sent (``security_services.py:95-117``)."""
    return {k: v for k, v in fields.items() if v not in (None, "")}


def group_summary(group: dict) -> dict:
    status = group.get("status")
    return {
        "id": group.get("id"),
        "name": group.get("name"),
        "description": group.get("description"),
        "status": status,
        "availability_zone": group.get("availability_zone"),
        "share_group_type_id": group.get("share_group_type_id"),
        "share_types": group.get("share_types") or [],
        "source_share_group_snapshot_id": group.get(
            "source_share_group_snapshot_id"
        ),
        "consistent_snapshot_support": group.get(
            "consistent_snapshot_support"
        ),
        "created_at": group.get("created_at"),
        "is_transitional": is_transitional(status, GROUP_TRANSITIONAL),
        "actions": group_actions(group),
    }


def group_snapshot_summary(snapshot: dict, group: dict | None) -> dict:
    status = snapshot.get("status")
    return {
        "id": snapshot.get("id"),
        "name": snapshot.get("name"),
        "description": snapshot.get("description"),
        "status": status,
        "share_group_id": snapshot.get("share_group_id"),
        "share_group_name": (group or {}).get("name"),
        "created_at": snapshot.get("created_at"),
        "members": snapshot.get("members") or [],
        "is_transitional": is_transitional(status, SNAPSHOT_TRANSITIONAL),
        "actions": group_snapshot_actions(snapshot),
    }


def group_body(
    *,
    name: str,
    description: str | None,
    share_group_type_id: str | None,
    share_types: list[str] | None,
    availability_zone: str | None,
    snapshot_id: str | None,
) -> dict:
    """``POST /share-groups`` (``manilaclient/v2/share_groups.py:83-102``):
    a snapshot source replaces the group type and share types."""
    body: dict = {"name": name}
    if description:
        body["description"] = description
    if snapshot_id:
        body["source_share_group_snapshot_id"] = snapshot_id
    else:
        if share_group_type_id:
            body["share_group_type_id"] = share_group_type_id
        if share_types:
            body["share_types"] = share_types
    if availability_zone:
        body["availability_zone"] = availability_zone
    return body


def share_type_summary(share_type: dict) -> dict:
    specs = share_type.get("extra_specs") or {}
    dhss = str(specs.get("driver_handles_share_servers", "")).lower() in (
        "true",
        "1",
    )
    return {
        "id": share_type.get("id"),
        "name": share_type.get("name"),
        "description": share_type.get("description"),
        "is_public": share_type.get("share_type_access:is_public", True),
        "driver_handles_share_servers": dhss,
        "snapshot_support": str(specs.get("snapshot_support", "true")).lower()
        == "true",
        "extra_specs": specs,
    }
