"""Kubernetes cluster rules, as the Nectar magnum-ui fork builds them.

- Templates are chosen by Kubernetes version, availability zone and
  network driver parsed from the template name
  ``kubernetes-v<version>-<zone>-<driver>-v<n>``; the newest template
  version wins (``utils.service.js:40-49``,
  ``clusters/workflow/workflow.service.js:417-538``).
- Control planes are 1, 3, 5 or 7 nodes; a template without a master load
  balancer forces one (``workflow.service.js:91-141``,
  ``cluster-template.controller.js:72-110``).
- The create request carries only the etcd volume labels, merged onto the
  template's (``api/magnum.py:213-227``); keypair, autoscaling,
  autorepair, addons and free labels were removed by the Nectar commits.
- Upgrade targets are the template ids in the current template's
  ``upgrade_targets`` label (``rolling-upgrade/upgrade.service.js``);
  upgrades and node group changes need a ``*_COMPLETE`` status
  (``clusters.utils.js``, ``nodegroups.controller.js:56-63``).
- Node labels are ``key=value`` pairs and taints ``key[=value]:effect``
  (``labels-taints.service.js:37-40``); the default node group cannot be
  deleted and master groups keep the 1/3/5/7 rule on resize.
- The cluster config is a kubeconfig plus a client key and certificate
  signed by the cluster CA from a CSR for ``admin`` in ``system:masters``
  (``api/magnum.py:260-283``, magnumclient ``common/utils.py``). Hive
  embeds the credentials in the kubeconfig as well as offering the files.
"""

import base64
import re

TEMPLATE_NAME = re.compile(r"^kubernetes-v([^-]+)-(.+)-([^-]+)-v(.+)$")
CLUSTER_NAME = re.compile(r"^[a-zA-Z][a-zA-Z0-9_\-.]*$")
CONTROL_PLANE_SIZES = (1, 3, 5, 7)
COMPLETE_STATUSES = {
    "CREATE_COMPLETE",
    "UPDATE_COMPLETE",
    "ROLLBACK_COMPLETE",
    "SNAPSHOT_COMPLETE",
    "CHECK_COMPLETE",
    "ADOPT_COMPLETE",
}
UPGRADE_STATUSES = COMPLETE_STATUSES | {"DELETE_COMPLETE"}
TRANSITIONAL_SUFFIX = "_IN_PROGRESS"
TAINT_EFFECTS = ("NoSchedule", "PreferNoSchedule", "NoExecute")
LABEL_PAIR = re.compile(r"^[^,=:\s]+=[^,=:\s]*$")
CREATE_TIMEOUT = 60


def parse_template_name(name: str) -> dict | None:
    match = TEMPLATE_NAME.match(name or "")
    if not match:
        return None
    version, zone, driver, template_version = match.groups()
    return {
        "kubernetes_version": version,
        "availability_zone": zone,
        "network_driver": driver,
        "template_version": template_version,
    }


def version_key(version: str) -> tuple:
    parts = []
    for piece in re.split(r"[.-]", version):
        parts.append((0, int(piece)) if piece.isdigit() else (1, piece))
    return tuple(parts)


def template_summary(template: dict) -> dict:
    parsed = parse_template_name(template.get("name") or "")
    labels = template.get("labels") or {}
    return {
        "id": template.get("uuid"),
        "name": template.get("name"),
        "coe": template.get("coe"),
        "image_id": template.get("image_id"),
        "flavor_id": template.get("flavor_id"),
        "master_flavor_id": template.get("master_flavor_id"),
        "keypair_id": template.get("keypair_id"),
        "network_driver": template.get("network_driver")
        or (parsed or {}).get("network_driver"),
        "external_network_id": template.get("external_network_id"),
        "fixed_network": template.get("fixed_network"),
        "fixed_subnet": template.get("fixed_subnet"),
        "dns_nameserver": template.get("dns_nameserver"),
        "master_lb_enabled": template.get("master_lb_enabled"),
        "floating_ip_enabled": template.get("floating_ip_enabled"),
        "tls_disabled": template.get("tls_disabled"),
        "public": template.get("public"),
        "hidden": template.get("hidden"),
        "server_type": template.get("server_type"),
        "cluster_distro": template.get("cluster_distro"),
        "volume_driver": template.get("volume_driver"),
        "docker_storage_driver": template.get("docker_storage_driver"),
        "docker_volume_size": template.get("docker_volume_size"),
        "registry_enabled": template.get("registry_enabled"),
        "labels": labels,
        "kubernetes_version": (parsed or {}).get("kubernetes_version"),
        "availability_zone": (parsed or {}).get("availability_zone")
        or labels.get("availability_zone"),
        "template_version": (parsed or {}).get("template_version"),
        "upgrade_targets": [
            t for t in (labels.get("upgrade_targets") or "").split(",") if t
        ],
        "created_at": template.get("created_at"),
        "updated_at": template.get("updated_at"),
    }


def selectable_templates(templates: list[dict]) -> list[dict]:
    """Templates the version/zone/driver pickers can offer: those whose
    name parses, newest template version first."""
    usable = [t for t in templates if t.get("kubernetes_version")]
    usable.sort(
        key=lambda t: (
            version_key(t["kubernetes_version"]),
            version_key(t.get("template_version") or "0"),
        ),
        reverse=True,
    )
    return usable


def picker_options(templates: list[dict]) -> dict:
    """Distinct versions (newest first), zones and drivers, plus the
    (version, zone, driver) -> template id map resolving to the highest
    template version."""
    usable = selectable_templates(templates)
    versions = sorted(
        {t["kubernetes_version"] for t in usable}, key=version_key, reverse=True
    )
    zones = sorted({t["availability_zone"] for t in usable if t["availability_zone"]})
    drivers = sorted({t["network_driver"] for t in usable if t["network_driver"]})
    combos: dict[str, str] = {}
    for template in usable:
        key = f"{template['kubernetes_version']}|{template['availability_zone']}|{template['network_driver']}"
        combos.setdefault(key, template["id"])  # usable is newest-first
    return {
        "versions": versions,
        "availability_zones": zones,
        "network_drivers": drivers,
        "combinations": [
            {
                "kubernetes_version": t["kubernetes_version"],
                "availability_zone": t["availability_zone"],
                "network_driver": t["network_driver"],
                "template_id": t["id"],
            }
            for t in usable
            if combos.get(
                f"{t['kubernetes_version']}|{t['availability_zone']}|{t['network_driver']}"
            )
            == t["id"]
        ],
    }


def validate_cluster_name(name: str) -> str | None:
    if not CLUSTER_NAME.match(name or ""):
        return (
            "Cluster names start with a letter and contain only letters,"
            " numbers, dots, dashes and underscores."
        )
    return None


def validate_master_count(count: int, master_lb_enabled: bool) -> str | None:
    if not master_lb_enabled and count != 1:
        return "This template runs a single control plane node."
    if count not in CONTROL_PLANE_SIZES:
        return "Supported control plane sizes are 1, 3, 5 or 7."
    return None


def create_body(
    *,
    name: str,
    template: dict,
    master_count: int,
    master_flavor: str,
    node_count: int,
    node_flavor: str,
    etcd_volume_size: int | None,
    etcd_volume_type: str | None,
) -> dict:
    body: dict = {
        "name": name,
        "cluster_template_id": template["id"],
        "create_timeout": CREATE_TIMEOUT,
        "master_lb_enabled": bool(template.get("master_lb_enabled")),
        "master_count": master_count,
        "master_flavor_id": master_flavor,
        "node_count": node_count,
        "flavor_id": node_flavor,
    }
    labels: dict[str, str] = {}
    if etcd_volume_size:
        labels["etcd_volume_size"] = str(etcd_volume_size)
        if etcd_volume_type:
            labels["etcd_blockdevice_volume_type"] = etcd_volume_type
    if labels:
        body["labels"] = labels
        body["merge_labels"] = True
    return body


def is_transitional(status: str | None) -> bool:
    return bool(status) and status.endswith(TRANSITIONAL_SUFFIX)


def can_upgrade(status: str | None) -> bool:
    return status in UPGRADE_STATUSES


def can_change_nodegroups(status: str | None) -> bool:
    return status in COMPLETE_STATUSES


def cluster_summary(cluster: dict, template: dict | None = None) -> dict:
    labels = cluster.get("labels") or {}
    parsed = parse_template_name((template or {}).get("name") or "")
    status = cluster.get("status")
    return {
        "id": cluster.get("uuid"),
        "name": cluster.get("name"),
        "status": status,
        "status_reason": cluster.get("status_reason"),
        "health_status": cluster.get("health_status"),
        "health_status_reason": cluster.get("health_status_reason"),
        "master_count": cluster.get("master_count"),
        "node_count": cluster.get("node_count"),
        "coe_version": cluster.get("coe_version"),
        "cluster_template_id": cluster.get("cluster_template_id"),
        "template_name": (template or {}).get("name"),
        "keypair": cluster.get("keypair"),
        "api_address": cluster.get("api_address"),
        "master_addresses": cluster.get("master_addresses") or [],
        "node_addresses": cluster.get("node_addresses") or [],
        "master_flavor_id": cluster.get("master_flavor_id"),
        "flavor_id": cluster.get("flavor_id"),
        "create_timeout": cluster.get("create_timeout"),
        "labels": labels,
        "availability_zone": labels.get("availability_zone")
        or (parsed or {}).get("availability_zone"),
        "network_driver": (template or {}).get("network_driver")
        or (parsed or {}).get("network_driver"),
        "kubernetes_version": cluster.get("coe_version")
        or (parsed or {}).get("kubernetes_version"),
        "upgrade_targets": [
            t for t in (labels.get("upgrade_targets") or "").split(",") if t
        ],
        "stack_id": cluster.get("stack_id"),
        "created_at": cluster.get("created_at"),
        "updated_at": cluster.get("updated_at"),
        "actions": cluster_actions(status),
    }


def cluster_actions(status: str | None) -> list[str]:
    actions = ["config", "certificate", "sign"]
    if can_upgrade(status):
        actions.append("upgrade")
    if can_change_nodegroups(status):
        actions.append("nodegroups")
    if not is_transitional(status):
        actions.append("delete")
    return actions


def parse_node_labels(text: str | None) -> dict[str, str]:
    labels: dict[str, str] = {}
    for pair in (text or "").replace(";", ",").split(","):
        pair = pair.strip()
        if not pair:
            continue
        if not LABEL_PAIR.match(pair):
            raise ValueError(f'Label "{pair}" must look like key=value.')
        key, _, value = pair.partition("=")
        labels[key] = value
    return labels


def parse_node_taints(text: str | None) -> list[dict]:
    taints = []
    for item in (text or "").replace(";", ",").split(","):
        item = item.strip()
        if not item:
            continue
        spec, sep, effect = item.rpartition(":")
        if not sep or effect not in TAINT_EFFECTS:
            raise ValueError(
                f'Taint "{item}" must look like key=value:NoSchedule,'
                " key:PreferNoSchedule or key:NoExecute."
            )
        key, _, value = spec.partition("=")
        if not key:
            raise ValueError(f'Taint "{item}" needs a key.')
        taints.append({"key": key, "value": value, "effect": effect})
    return taints


def format_node_labels(labels: dict | None) -> str:
    return ",".join(f"{k}={v}" for k, v in (labels or {}).items())


def format_node_taints(taints: list | None) -> str:
    out = []
    for taint in taints or []:
        key = taint.get("key", "")
        value = taint.get("value")
        effect = taint.get("effect", "")
        out.append(f"{key}={value}:{effect}" if value else f"{key}:{effect}")
    return ",".join(out)


def nodegroup_summary(nodegroup: dict) -> dict:
    labels = nodegroup.get("labels") or {}
    return {
        "id": nodegroup.get("uuid"),
        "name": nodegroup.get("name"),
        "role": nodegroup.get("role"),
        "is_default": bool(nodegroup.get("is_default")),
        "status": nodegroup.get("status"),
        "status_reason": nodegroup.get("status_reason"),
        "flavor_id": nodegroup.get("flavor_id"),
        "image_id": nodegroup.get("image_id"),
        "node_count": nodegroup.get("node_count"),
        "min_node_count": nodegroup.get("min_node_count"),
        "max_node_count": nodegroup.get("max_node_count"),
        "node_addresses": nodegroup.get("node_addresses") or [],
        "labels": labels,
        "auto_scaling": str(labels.get("auto_scaling_enabled", "")).lower() == "true",
        "node_labels": nodegroup.get("node_labels") or {},
        "node_taints": nodegroup.get("node_taints") or [],
        "created_at": nodegroup.get("created_at"),
        "updated_at": nodegroup.get("updated_at"),
    }


def nodegroup_body(
    *,
    name: str,
    flavor: str,
    node_count: int,
    autoscaling: bool,
    min_node_count: int | None,
    max_node_count: int | None,
    boot_volume_size: int | None,
    boot_volume_type: str | None,
    node_labels: str | None,
    node_taints: str | None,
) -> dict:
    body: dict = {
        "name": name,
        "flavor_id": flavor,
        "node_count": node_count,
        "role": "worker",
    }
    labels: dict[str, str] = {}
    if autoscaling:
        body["min_node_count"] = min_node_count if min_node_count is not None else 1
        body["max_node_count"] = max_node_count if max_node_count is not None else node_count
        labels["auto_scaling_enabled"] = "true"
    if boot_volume_size:
        labels["boot_volume_size"] = str(boot_volume_size)
        if boot_volume_type:
            labels["boot_volume_type"] = boot_volume_type
    if labels:
        body["labels"] = labels
        body["merge_labels"] = True
    parsed_labels = parse_node_labels(node_labels)
    if parsed_labels:
        body["node_labels"] = parsed_labels
    parsed_taints = parse_node_taints(node_taints)
    if parsed_taints:
        body["node_taints"] = parsed_taints
    return body


def validate_resize(role: str | None, node_count: int) -> str | None:
    if role == "master":
        if node_count not in CONTROL_PLANE_SIZES:
            return "Supported control plane sizes are 1, 3, 5 or 7."
        return None
    if node_count < 0:
        return "Node count cannot be negative."
    return None


# --- cluster config -------------------------------------------------------


def generate_key_and_csr() -> tuple[str, str]:
    """An RSA key and a CSR for ``admin`` in ``system:masters``, as
    magnumclient's ``generate_csr_and_key`` does."""
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(
            x509.Name(
                [
                    x509.NameAttribute(NameOID.COMMON_NAME, "admin"),
                    x509.NameAttribute(NameOID.ORGANIZATION_NAME, "system:masters"),
                ]
            )
        )
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ).decode()
    return key_pem, csr.public_bytes(serialization.Encoding.PEM).decode()


def _b64(text: str) -> str:
    return base64.b64encode(text.encode()).decode()


def kubeconfig(
    name: str, api_address: str, ca: str | None, cert: str | None, key: str | None
) -> str:
    if ca and cert and key:
        return "\n".join(
            [
                "apiVersion: v1",
                "clusters:",
                "- cluster:",
                f"    certificate-authority-data: {_b64(ca)}",
                f"    server: {api_address}",
                f"  name: {name}",
                "contexts:",
                "- context:",
                f"    cluster: {name}",
                "    user: admin",
                "  name: default",
                "current-context: default",
                "kind: Config",
                "preferences: {}",
                "users:",
                "- name: admin",
                "  user:",
                f"    client-certificate-data: {_b64(cert)}",
                f"    client-key-data: {_b64(key)}",
                "",
            ]
        )
    return "\n".join(
        [
            "apiVersion: v1",
            "clusters:",
            "- cluster:",
            f"    server: {api_address}",
            f"  name: {name}",
            "contexts:",
            "- context:",
            f"    cluster: {name}",
            f"    user: {name}",
            f"  name: {name}",
            f"current-context: {name}",
            "kind: Config",
            "preferences: {}",
            "users:",
            f"- name: {name}",
            "",
        ]
    )
