"""Database (Trove) rules, as the Nectar fork of trove-dashboard presents
them: upstream ``stable/2025.1`` plus the 16 patches on the
``nectar/2023.2`` branch of ``NeCTAR-RC/trove-dashboard`` and the two
overrides in ``nectar-dashboard`` (``enabled/_9000_disable_trove_clusters.py``,
``overrides.py:36-46`` which hides the volume type). Citations are to
``trove_dashboard/content/`` on 2025.1 unless a commit is named.

- Instance statuses (``databases/tables.py:697-734``): ACTIVE, HEALTHY,
  BLOCKED are stable; FAILED, SHUTDOWN, ERROR are errors; BUILD, REBOOT,
  RESIZE, BACKUP, RESTART_REQUIRED and UPGRADE (``9683581``) are
  transitional. ``ACTIVE_STATES = ("ACTIVE", "HEALTHY")``.
- Row actions (``tables.py:767-779``): backup, update, resize volume,
  attach/detach configuration, manage root need ACTIVE_STATES; resize
  instance and upgrade (``9683581``) also allow SHUTOFF; restart allows
  SHUTDOWN and RESTART_REQUIRED; delete always.
- Launch (``workflows/create_instance.py``): AZ from nova without "Any"
  (``45cd6af``), name <= 80, volume >= 1 GB, no volume type
  (``overrides.py``), datastore + version, flavour from Trove
  (``ab33b45``), one network sent as ``{"net-id": id}`` (``d096353``),
  ``allowed_cidrs`` required (``4d5dd91``) with the 0.0.0.0/0 warning
  (``a61ce1a``), ``is_public`` hidden (``b274b9c``), initial databases and
  user, configuration group, restore from a COMPLETED or RESTORED backup,
  no replicas or locality (``4e93143``).
- Resize volume (``forms.py:54-92``): the new size must be greater than
  the current size. Resize instance (``forms.py:95-130``): any other
  flavour. Update (``forms.py:286-322``): name and allowed CIDRs.
- Flavours: trove-dashboard offers every Nova flavour on the launch form
  (``api/trove.py:315-317`` ``datastore_flavors`` returns ``flavor_list``)
  and on resize (``views.py:434-437``). Hive asks Trove instead for the
  flavours associated with the datastore version
  (``GET /datastores/{id}/versions/{id}/flavors``) and offers only those
  for launch and resize, with the current flavour left out of a resize
  (``forms.py:108-117``). The call must use ids: by names rctest's Trove
  answers with every Nova flavour (checked 12 Oct 2026).
- Defaults tab (``tabs.py:126-146``): the instance's effective
  configuration from ``GET /instances/{id}/configuration``, sorted by
  name.
- Logs tab (``logs/tables.py``, ``logs/views.py``): guest logs from
  ``GET /instances/{id}/log``; publish, enable, discard are always
  offered, disable only for non-SYS logs, view only once bytes are
  published. Contents come from the Swift container Trove publishes to,
  reading the newest parts first until their ``x-object-meta-lines``
  counts cover the requested tail (troveclient ``instances.log_generator``).
- Backups (``database_backups/tables.py:28-52``): COMPLETED, RESTORED are
  OK; DELETE_FAILED, FAILED errors; BUILDING, NEW, SAVING transitional;
  restore only from COMPLETED or RESTORED; no Swift container
  (``4e93143``).
- Configuration groups (``database_configurations/``): name, optional
  description, datastore ``type,version``; parameter values validated by
  type and min/max (``config_param_manager.py:155-186``).
"""

import ipaddress

ACTIVE_STATES = ("ACTIVE", "HEALTHY")
INSTANCE_OK = ("ACTIVE", "HEALTHY", "BLOCKED")
INSTANCE_ERROR = ("FAILED", "SHUTDOWN", "ERROR")
INSTANCE_TRANSITIONAL = (
    "BUILD",
    "REBOOT",
    "RESIZE",
    "BACKUP",
    "RESTART_REQUIRED",
    "UPGRADE",
)
BACKUP_OK = ("COMPLETED", "RESTORED")
BACKUP_ERROR = ("DELETE_FAILED", "FAILED")
BACKUP_TRANSITIONAL = ("BUILDING", "NEW", "SAVING")
RESTORABLE = BACKUP_OK
DEFAULT_CIDR = "0.0.0.0/0"
PORTS = {"mysql": 3306, "mariadb": 3306, "percona": 3306, "postgresql": 5432}
LOG_ACTIONS = ("enable", "disable", "publish", "discard")
# trove/guestagent/guest_log.py LogStatus names
LOG_OK = ("Enabled", "Ready", "Published", "Partial", "Restart_Completed")
LOG_ERROR = ("Unavailable", "Failed")
LOG_WARNING = ("Restart_Required",)


def instance_status_kind(status: str | None) -> str:
    if status in INSTANCE_TRANSITIONAL:
        return "transitional"
    if status in INSTANCE_ERROR:
        return "error"
    if status in INSTANCE_OK:
        return "ok"
    return "unknown"


def instance_actions(instance: dict) -> list[str]:
    status = instance.get("status")
    actions = []
    active = status in ACTIVE_STATES
    if active:
        actions.extend(["backup", "update", "resize_volume", "root"])
        if instance.get("configuration"):
            actions.append("detach_configuration")
        else:
            actions.append("attach_configuration")
    if active or status == "SHUTOFF":
        actions.extend(["resize", "upgrade"])
    if active or status in ("SHUTDOWN", "RESTART_REQUIRED"):
        actions.append("restart")
    actions.append("delete")
    return actions


def backup_status_kind(status: str | None) -> str:
    if status in BACKUP_TRANSITIONAL:
        return "transitional"
    if status in BACKUP_ERROR:
        return "error"
    if status in BACKUP_OK:
        return "ok"
    return "unknown"


def validate_cidrs(cidrs: list[str]) -> tuple[list[str], str | None]:
    """``allowed_cidrs`` is required at Nectar (``4d5dd91``); each entry
    must be an IPv4 or IPv6 network."""
    clean = [c.strip() for c in cidrs if c and c.strip()]
    if not clean:
        return [], "Enter at least one allowed CIDR, such as 0.0.0.0/0."
    for cidr in clean:
        try:
            ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            return [], f'"{cidr}" is not a valid CIDR.'
    return clean, None


def cidr_warning(cidrs: list[str]) -> str | None:
    if any(c in ("0.0.0.0/0", "::/0") for c in cidrs):
        return (
            "Allowing 0.0.0.0/0 may expose the database instance to the"
            " whole Internet. Restrict access to the networks that need it."
        )
    return None


def validate_launch(
    *,
    name: str,
    volume: int,
    datastore: str | None,
    version: str | None,
    flavor: str | None,
    network: str | None,
) -> str | None:
    if not name or len(name) > 80:
        return "Enter a name of up to 80 characters."
    if volume < 1:
        return "The volume size must be at least 1 GB."
    if not datastore or not version:
        return "You must select a datastore type and version."
    if not flavor:
        return "You must select a flavor."
    if not network:
        return "At least one network must be specified."
    return None


def launch_body(
    *,
    name: str,
    flavor: str,
    volume: int,
    datastore: str,
    version: str,
    network_id: str,
    availability_zone: str | None,
    allowed_cidrs: list[str],
    databases: list[str],
    user: str | None,
    password: str | None,
    host: str | None,
    configuration: str | None,
    backup_id: str | None,
) -> dict:
    """``POST /instances`` as ``api/trove.py:149-185`` builds it: falsy keys
    omitted, NICs as ``net-id`` (``d096353``), no volume type, no replicas."""
    body: dict = {
        "name": name,
        "flavorRef": flavor,
        "volume": {"size": volume},
        "datastore": {"type": datastore, "version": version},
        "nics": [{"net-id": network_id}],
        "access": {"allowed_cidrs": allowed_cidrs},
    }
    if availability_zone:
        body["availability_zone"] = availability_zone
    if databases:
        body["databases"] = [{"name": d} for d in databases]
    if user:
        user_body: dict = {"name": user, "password": password}
        if databases:
            user_body["databases"] = [{"name": d} for d in databases]
        if host:
            user_body["host"] = host
        body["users"] = [user_body]
    if configuration:
        body["configuration"] = configuration
    if backup_id:
        body["restorePoint"] = {"backupRef": backup_id}
    return body


def split_databases(text: str | None) -> list[str]:
    """Comma-separated initial database names (``create_instance.py:354-396``)."""
    return [d.strip() for d in (text or "").split(",") if d.strip()]


def validate_initial_user(
    user: str | None, password: str | None, databases: list[str]
) -> str | None:
    if user:
        if not password:
            return "A password is required for the initial user."
        if not databases:
            return "At least one database is required when creating an initial user."
    return None


def validate_resize_volume(current: int, new_size: int) -> str | None:
    if new_size <= current:
        return f"The new volume size must be greater than the current size ({current} GB)."
    return None


def resize_candidates(
    flavors: list[dict], current_id: str | None
) -> list[dict]:
    """Every flavour of the datastore version except the current one
    (``forms.py:108-117``)."""
    return [f for f in flavors if f.get("id") and f.get("id") != current_id]


def version_ids(
    datastores: list[dict], datastore: str | None, version: str | None
) -> tuple[str, str] | None:
    """``(datastore id, version id)`` for a datastore and version named as
    an instance reports them, or None when Trove no longer lists them."""
    for item in datastores:
        if item.get("name") != datastore:
            continue
        for candidate in item.get("versions") or []:
            if (
                candidate.get("name") == version
                and candidate.get("id")
                and item.get("id")
            ):
                return str(item["id"]), str(candidate["id"])
    return None


def configuration_defaults(values: dict) -> list[dict]:
    """The Defaults tab rows (``tabs.py:134-146``), sorted by name."""
    return [
        {"name": str(k), "value": v}
        for k, v in sorted(values.items(), key=lambda kv: str(kv[0]))
    ]


# --- guest logs ---------------------------------------------------------------


def log_status_kind(status: str | None) -> str:
    if status in LOG_OK:
        return "ok"
    if status in LOG_ERROR:
        return "error"
    if status in LOG_WARNING:
        return "warning"
    return "unknown"


def log_actions(log: dict) -> list[str]:
    """``logs/tables.py``: ViewLog needs published bytes, DisableLog is
    hidden for SYS logs, the rest are always offered."""
    actions = []
    if int(log.get("published") or 0) > 0:
        actions.append("view")
    actions.extend(["publish", "enable"])
    if log.get("type") != "SYS":
        actions.append("disable")
    actions.append("discard")
    return actions


def _none(value) -> str | None:
    """Trove sends the string ``"None"`` for an unpublished log's container
    and prefix."""
    if value in (None, "", "None"):
        return None
    return str(value)


def log_summary(log: dict) -> dict:
    status = log.get("status")
    return {
        "name": log.get("name"),
        "type": log.get("type"),
        "status": status,
        "status_kind": log_status_kind(status),
        "published": int(log.get("published") or 0),
        "pending": int(log.get("pending") or 0),
        "container": _none(log.get("container")),
        "prefix": _none(log.get("prefix")),
        "metafile": _none(log.get("metafile")),
        "actions": log_actions(log),
    }


def log_action_body(name: str, action: str) -> dict:
    """``POST /instances/{id}/log`` as troveclient ``instances.log_action``
    builds it: the log name plus the action flag set to 1."""
    if action not in LOG_ACTIONS:
        raise ValueError(f"Unknown log action {action!r}.")
    return {"name": name, action: 1}


def select_log_parts(parts: list[dict], lines: int) -> tuple[list[str], int]:
    """Which published parts to read for the last ``lines`` lines and how
    many lines to keep from the oldest of them, as troveclient
    ``instances.log_generator`` walks them: newest first until their line
    counts cover the request. ``lines`` 0 reads everything whole."""
    ordered = sorted(parts, key=lambda p: str(p.get("last_modified") or ""))
    if lines <= 0:
        return [str(p["name"]) for p in ordered], 0
    chosen: list[str] = []
    remaining = lines
    covered = False
    for part in reversed(ordered):
        chosen.insert(0, str(part["name"]))
        count = int(part.get("lines") or 0)
        if count >= remaining:
            covered = True
            break
        remaining -= count
    return chosen, (remaining if covered else lines)


def datastore_options(datastores: list[dict]) -> list[dict]:
    """Active versions of each datastore (``create_instance.py:239-274``)."""
    options = []
    for datastore in datastores:
        for version in datastore.get("versions") or []:
            if version.get("active", True) is False:
                continue
            options.append(
                {
                    "datastore": datastore.get("name"),
                    "datastore_id": datastore.get("id"),
                    "version": version.get("name"),
                    "version_id": version.get("id"),
                    "label": f"{datastore.get('name')} - {version.get('name')}",
                }
            )
    return options


def flavor_summary(flavor: dict) -> dict:
    """Trove flavours on rctest carry ``id: null`` and a ``str_id``."""
    fid = flavor.get("str_id") or flavor.get("id")
    return {
        "id": str(fid) if fid is not None else None,
        "name": flavor.get("name"),
        "ram": flavor.get("ram"),
        "vcpus": flavor.get("vcpus"),
        "disk": flavor.get("disk"),
        "ephemeral": flavor.get("ephemeral"),
    }


def instance_summary(
    instance: dict, flavors: dict[str, dict] | None = None
) -> dict:
    status = instance.get("status")
    flavor = instance.get("flavor") or {}
    flavor_id = str(flavor.get("id")) if flavor.get("id") is not None else None
    known = (flavors or {}).get(flavor_id or "", {})
    addresses = instance.get("addresses") or []
    ips = [a.get("address") for a in addresses if a.get("address")]
    return {
        "id": instance.get("id"),
        "name": instance.get("name"),
        "status": status,
        "status_kind": instance_status_kind(status),
        "operating_status": instance.get("operating_status"),
        "datastore": (instance.get("datastore") or {}).get("type"),
        "datastore_version": (instance.get("datastore") or {}).get("version"),
        "flavor_id": flavor_id,
        "flavor_name": known.get("name") or flavor_id,
        "ram": known.get("ram"),
        "hostname": instance.get("hostname"),
        "addresses": ips,
        "volume_size": (instance.get("volume") or {}).get("size"),
        "volume_used": (instance.get("volume") or {}).get("used"),
        "region": instance.get("region"),
        "created": instance.get("created"),
        "updated": instance.get("updated"),
        "configuration": instance.get("configuration"),
        "replica_of": instance.get("replica_of"),
        "replicas": instance.get("replicas") or [],
        "is_transitional": status in INSTANCE_TRANSITIONAL,
        "actions": instance_actions(instance),
    }


def instance_detail(
    instance: dict, flavors: dict[str, dict] | None = None
) -> dict:
    summary = instance_summary(instance, flavors)
    access = instance.get("access") or {}
    cidrs = access.get("allowed_cidrs") or []
    dtype = (summary.get("datastore") or "").lower()
    summary.update(
        {
            "allowed_cidrs": cidrs or [DEFAULT_CIDR],
            "is_public": bool(access.get("is_public")),
            "addresses_detail": instance.get("addresses") or [],
            "availability_zone": instance.get("availability_zone"),
            "fault": instance.get("fault"),
            "service_status_updated": instance.get("service_status_updated"),
            "port": PORTS.get(dtype),
            "cidr_warning": cidr_warning(cidrs),
        }
    )
    return summary


def backup_summary(
    backup: dict, instance_names: dict[str, str] | None = None
) -> dict:
    status = backup.get("status")
    instance_id = backup.get("instance_id")
    return {
        "id": backup.get("id"),
        "name": backup.get("name"),
        "description": backup.get("description"),
        "status": status,
        "status_kind": backup_status_kind(status),
        "datastore": (backup.get("datastore") or {}).get("type"),
        "datastore_version": (backup.get("datastore") or {}).get("version"),
        "instance_id": instance_id,
        "instance_name": (instance_names or {}).get(instance_id or "", None),
        "parent_id": backup.get("parent_id"),
        "incremental": bool(backup.get("parent_id")),
        "size": backup.get("size"),
        "location": backup.get("locationRef"),
        "created": backup.get("created"),
        "updated": backup.get("updated"),
        "is_transitional": status in BACKUP_TRANSITIONAL,
        "can_restore": status in RESTORABLE,
    }


def backup_body(
    name: str, instance_id: str, description: str | None, parent_id: str | None
) -> dict:
    body: dict = {
        "name": name,
        "instance": instance_id,
        "incremental": 1 if parent_id else 0,
    }
    if description:
        body["description"] = description
    if parent_id:
        body["parent_id"] = parent_id
    return body


def configuration_summary(configuration: dict) -> dict:
    return {
        "id": configuration.get("id"),
        "name": configuration.get("name"),
        "description": configuration.get("description"),
        "datastore": configuration.get("datastore_name"),
        "datastore_version": configuration.get("datastore_version_name"),
        "datastore_version_id": configuration.get("datastore_version_id"),
        "values": configuration.get("values") or {},
        "created": configuration.get("created"),
        "updated": configuration.get("updated"),
    }


def configuration_body(
    name: str, description: str | None, datastore: str, version: str
) -> dict:
    body: dict = {
        "name": name,
        "values": {},
        "datastore": {"type": datastore, "version": version},
    }
    if description:
        body["description"] = description
    return body


def coerce_parameter(spec: dict, value: str):
    """``config_param_manager.py:155-186``: booleans are true/false; integer,
    long and float must be numeric and within min and max."""
    ptype = (spec.get("type") or "string").lower()
    raw = str(value).strip()
    if ptype == "boolean":
        if raw.lower() not in ("true", "false"):
            raise ValueError(f"{spec.get('name')} must be true or false.")
        return raw.lower() == "true"
    if ptype in ("integer", "long", "float"):
        try:
            number = float(raw) if ptype == "float" else int(raw)
        except ValueError as exc:
            raise ValueError(f"{spec.get('name')} must be a number.") from exc
        low = spec.get("min")
        high = spec.get("max")
        if low is not None and number < low:
            raise ValueError(f"{spec.get('name')} must be at least {low}.")
        if high is not None and number > high:
            raise ValueError(f"{spec.get('name')} must be at most {high}.")
        return number
    return raw


def user_summary(user: dict) -> dict:
    return {
        "name": user.get("name"),
        "host": user.get("host") or "%",
        "databases": [d.get("name") for d in user.get("databases") or []],
    }


def user_path(name: str, host: str | None) -> str:
    """``user@host`` with dots encoded, as troveclient quotes it."""
    ident = f"{name}@{host}" if host and host != "%" else name
    return ident.replace(".", "%2e")
