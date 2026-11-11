"""Kubernetes clusters (Magnum) with the Nectar workflow."""

import asyncio
from collections.abc import Awaitable

from hive.cache import policy
from hive.clients.magnum import MagnumClient
from hive.errors import BadRequest, Conflict, HiveError, NotFound
from hive.nectar import magnum as rules
from hive.schemas.magnum import ClusterCreate, NodeGroupCreate
from hive.schemas.responses.magnum import (
    Cluster,
    ClusterCertificate,
    ClusterConfig,
    ClusterCreated,
    ClusterOptions,
    ClustersResponse,
    ClusterTemplate,
    ClusterUpgrading,
    NodeGroup,
    NodeGroupResized,
    NodeGroupsResponse,
    UpgradeOptions,
)
from hive.services.concurrency import bounded_gather
from hive.services.context import Context
from hive.services.download import Download

FALLBACK_QUOTA = 20


def _magnum(ctx: Context) -> MagnumClient:
    return MagnumClient(ctx.http, ctx.settings, ctx.scoped)


async def _templates(ctx: Context) -> list[dict]:
    """Every template the user can see, shaped and cached per project
    (Magnum hides hidden templates from non-admins itself)."""

    async def fetch():
        return [
            rules.template_summary(t)
            for t in await _magnum(ctx).cluster_templates()
        ]

    result = await ctx.cached(policy.MAGNUM_TEMPLATES, fetch)
    return result.value


async def templates(ctx: Context) -> list[ClusterTemplate]:
    return [ClusterTemplate.model_validate(t) for t in await _templates(ctx)]


async def _template(ctx: Context, template_id: str) -> dict:
    return rules.template_summary(
        await _magnum(ctx).cluster_template(template_id)
    )


async def get_template(ctx: Context, template_id: str) -> ClusterTemplate:
    return ClusterTemplate.model_validate(await _template(ctx, template_id))


async def _template_map(ctx: Context) -> dict[str, dict]:
    try:
        return {t["id"]: t for t in await _templates(ctx)}
    except HiveError:
        return {}


async def _or_empty(call: Awaitable[dict]) -> dict:
    """The answer, or ``{}`` when Magnum fails: quota figures decorate the
    page and must not break it."""
    try:
        return await call
    except HiveError:
        return {}


async def quota(ctx: Context) -> dict:
    magnum = _magnum(ctx)
    limits, stats = await asyncio.gather(
        _or_empty(magnum.quota(ctx.project_id)),
        _or_empty(magnum.stats(ctx.project_id)),
    )
    try:
        hard_limit = int(limits.get("hard_limit", FALLBACK_QUOTA))
    except (TypeError, ValueError):
        hard_limit = FALLBACK_QUOTA
    return {
        "clusters": stats.get("clusters"),
        "nodes": stats.get("nodes"),
        "hard_limit": hard_limit,
    }


async def list_clusters(ctx: Context) -> ClustersResponse:
    magnum = _magnum(ctx)
    clusters, by_id, usage = await asyncio.gather(
        magnum.clusters(), _template_map(ctx), quota(ctx)
    )
    items = [
        rules.cluster_summary(c, by_id.get(c.get("cluster_template_id") or ""))
        for c in clusters
    ]
    items.sort(key=lambda c: (c["name"] or "").lower())
    if usage.get("clusters") is None:
        usage["clusters"] = len(items)
    return ClustersResponse.model_validate({"items": items, "quota": usage})


async def get_cluster(ctx: Context, cluster_id: str) -> Cluster:
    magnum = _magnum(ctx)
    cluster = await magnum.cluster(cluster_id)
    template = None
    if cluster.get("cluster_template_id"):
        try:
            template = await _template(ctx, cluster["cluster_template_id"])
        except HiveError:
            template = None
    return Cluster.model_validate(rules.cluster_summary(cluster, template))


async def create_options(ctx: Context) -> ClusterOptions:
    """What the create workflow needs: the pickers derived from the
    templates, the template details, and the Nova flavours by name."""
    items, flavors = await asyncio.gather(_templates(ctx), ctx.nova.flavors())
    usable = rules.selectable_templates(items)
    options = {
        **rules.picker_options(items),
        "templates": usable,
        "flavors": sorted(
            (
                {
                    "name": f.get("name"),
                    "vcpus": f.get("vcpus"),
                    "ram_mb": f.get("ram"),
                    "disk_gb": f.get("disk"),
                }
                for f in flavors
            ),
            key=lambda f: (f["vcpus"] or 0, f["ram_mb"] or 0, f["name"] or ""),
        ),
        "control_plane_sizes": list(rules.CONTROL_PLANE_SIZES),
        "quota": await quota(ctx),
    }
    return ClusterOptions.model_validate(options)


async def create_cluster(ctx: Context, data: ClusterCreate) -> ClusterCreated:
    template = await _template(ctx, data.cluster_template_id)
    if not template.get("id"):
        raise NotFound("cluster template not found")
    rules.validate_master_count(
        data.master_count, bool(template.get("master_lb_enabled"))
    )
    if data.autoscaling:
        rules.validate_autoscaling(
            data.node_count, data.min_node_count, data.max_node_count
        )
    body = rules.create_body(
        name=data.name,
        template=template,
        master_count=data.master_count,
        master_flavor=data.master_flavor_id,
        node_count=data.node_count,
        node_flavor=data.flavor_id,
        etcd_volume_size=data.etcd_volume_size,
        etcd_volume_type=data.etcd_volume_type,
        keypair=data.keypair,
        autoscaling=data.autoscaling,
        min_node_count=data.min_node_count,
        max_node_count=data.max_node_count,
    )
    created = await _magnum(ctx).create_cluster(body)
    return ClusterCreated.model_validate(
        {"id": created.get("uuid"), "name": data.name}
    )


async def delete_cluster(ctx: Context, cluster_id: str) -> None:
    await _magnum(ctx).delete_cluster(cluster_id)


async def upgrade_options(ctx: Context, cluster_id: str) -> UpgradeOptions:
    """The templates the current one names as upgrade targets, newest
    first (``rolling-upgrade/upgrade.service.js:70-138``)."""
    cluster = await get_cluster(ctx, cluster_id)
    current = None
    if cluster.cluster_template_id:
        try:
            current = await get_template(ctx, cluster.cluster_template_id)
        except HiveError:
            current = None
    target_ids = cluster.upgrade_targets
    if current and current.upgrade_targets:
        target_ids = current.upgrade_targets

    async def fetch(template_id: str) -> ClusterTemplate | None:
        try:
            return await get_template(ctx, template_id)
        except HiveError:
            return None

    templates = await bounded_gather(
        target_ids, fetch, ctx.settings.upstream_fan_out
    )
    found = [t for t in templates if t]
    found.sort(
        key=lambda t: rules.version_key(t.kubernetes_version or "0"),
        reverse=True,
    )
    return UpgradeOptions.model_validate(
        {
            "cluster_id": cluster_id,
            "can_upgrade": rules.can_upgrade(cluster.status),
            "current_version": cluster.kubernetes_version,
            "targets": [
                {
                    "template_id": t.id,
                    "name": t.name,
                    "kubernetes_version": t.kubernetes_version,
                }
                for t in found
            ],
        }
    )


async def upgrade_cluster(
    ctx: Context, cluster_id: str, template_id: str, batch: int
) -> ClusterUpgrading:
    """Upgrade to one of the targets ``upgrade_options`` offers, nothing
    else."""
    options = await upgrade_options(ctx, cluster_id)
    if not options.can_upgrade:
        raise Conflict(
            "The cluster must be in a completed state before it can be upgraded."
        )
    if template_id not in {t.template_id for t in options.targets}:
        raise BadRequest(
            "The template is not an upgrade target of the cluster's template."
        )
    await _magnum(ctx).upgrade_cluster(
        cluster_id, {"cluster_template": template_id, "max_batch_size": batch}
    )
    return ClusterUpgrading.model_validate(
        {"id": cluster_id, "status": "UPDATE_IN_PROGRESS"}
    )


async def list_nodegroups(ctx: Context, cluster_id: str) -> NodeGroupsResponse:
    magnum = _magnum(ctx)
    cluster, brief = await asyncio.gather(
        magnum.cluster(cluster_id), magnum.nodegroups(cluster_id)
    )

    async def detail(nodegroup: dict) -> dict:
        try:
            return await magnum.nodegroup(cluster_id, nodegroup["uuid"])
        except HiveError:
            return nodegroup

    full = await bounded_gather(
        [n for n in brief if n.get("uuid")],
        detail,
        ctx.settings.upstream_fan_out,
    )
    items = [rules.nodegroup_summary(n) for n in full]
    items.sort(
        key=lambda n: (
            n["role"] != "master",
            not n["is_default"],
            n["name"] or "",
        )
    )
    return NodeGroupsResponse.model_validate(
        {
            "items": items,
            "can_change": rules.can_change_nodegroups(cluster.get("status")),
            "cluster_status": cluster.get("status"),
        }
    )


async def get_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str
) -> NodeGroup:
    return NodeGroup.model_validate(
        rules.nodegroup_summary(
            await _magnum(ctx).nodegroup(cluster_id, nodegroup_id)
        )
    )


async def _require_changeable(ctx: Context, cluster_id: str) -> dict:
    cluster = await _magnum(ctx).cluster(cluster_id)
    if not rules.can_change_nodegroups(cluster.get("status")):
        raise Conflict(
            "Node groups can only be changed while the cluster is in a completed state."
        )
    return cluster


async def create_nodegroup(
    ctx: Context, cluster_id: str, data: NodeGroupCreate
) -> NodeGroup:
    await _require_changeable(ctx, cluster_id)
    if data.autoscaling:
        rules.validate_autoscaling(
            data.node_count, data.min_node_count, data.max_node_count
        )
    body = rules.nodegroup_body(
        name=data.name,
        flavor=data.flavor_id,
        node_count=data.node_count,
        autoscaling=data.autoscaling,
        min_node_count=data.min_node_count,
        max_node_count=data.max_node_count,
        boot_volume_size=data.boot_volume_size,
        boot_volume_type=data.boot_volume_type,
        node_labels=data.node_labels,
        node_taints=data.node_taints,
    )
    created = await _magnum(ctx).create_nodegroup(cluster_id, body)
    return NodeGroup.model_validate(rules.nodegroup_summary(created))


async def resize_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str, node_count: int
) -> NodeGroupResized:
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    rules.validate_resize(nodegroup.get("role"), node_count)
    await magnum.resize_cluster(
        cluster_id,
        {"node_count": node_count, "nodegroup": nodegroup.get("name")},
    )
    return NodeGroupResized.model_validate(
        {"id": nodegroup_id, "node_count": node_count}
    )


async def set_autoscaling(
    ctx: Context,
    cluster_id: str,
    nodegroup_id: str,
    minimum: int,
    maximum: int,
) -> NodeGroup:
    await _require_changeable(ctx, cluster_id)
    if maximum < minimum:
        raise BadRequest(
            "The maximum node count must be at least the minimum."
        )
    patch = [
        {"op": "replace", "path": "/min_node_count", "value": minimum},
        {"op": "replace", "path": "/max_node_count", "value": maximum},
    ]
    updated = await _magnum(ctx).patch_nodegroup(
        cluster_id, nodegroup_id, patch
    )
    return NodeGroup.model_validate(rules.nodegroup_summary(updated))


async def set_labels(
    ctx: Context,
    cluster_id: str,
    nodegroup_id: str,
    node_labels: str | None,
    node_taints: str | None,
) -> NodeGroup:
    """Replace the Kubernetes node labels and taints (a rolling
    replacement of the group's nodes)."""
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    if nodegroup.get("role") == "master":
        raise BadRequest(
            "Control plane node groups cannot carry labels or taints."
        )
    labels = rules.parse_node_labels(node_labels)
    taints = rules.parse_node_taints(node_taints)
    patch = []
    # A spurious change would PATCH the node group and roll every node.
    if not rules.same_node_labels(labels, nodegroup.get("node_labels")):
        patch.append(
            {"op": "replace", "path": "/node_labels", "value": labels}
        )
    if not rules.same_node_taints(taints, nodegroup.get("node_taints")):
        patch.append(
            {"op": "replace", "path": "/node_taints", "value": taints}
        )
    if not patch:
        return NodeGroup.model_validate(rules.nodegroup_summary(nodegroup))
    updated = await magnum.patch_nodegroup(cluster_id, nodegroup_id, patch)
    return NodeGroup.model_validate(rules.nodegroup_summary(updated))


async def delete_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str
) -> None:
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    if nodegroup.get("is_default"):
        raise Conflict("The default node group cannot be deleted.")
    await magnum.delete_nodegroup(cluster_id, nodegroup_id)


async def ca_certificate(ctx: Context, cluster_id: str) -> Download:
    """The cluster's CA certificate as ``<cluster name>_ca.pem``."""
    magnum = _magnum(ctx)
    cluster, ca = await asyncio.gather(
        magnum.cluster(cluster_id), magnum.ca_certificate(cluster_id)
    )
    return Download(
        f"{cluster.get('name') or cluster_id}_ca.pem",
        "application/x-pem-file",
        ca.get("pem") or "",
    )


async def sign_certificate(
    ctx: Context, cluster_id: str, csr: str
) -> ClusterCertificate:
    signed = await _magnum(ctx).sign_certificate(cluster_id, csr)
    return ClusterCertificate.model_validate({"pem": signed.get("pem") or ""})


async def cluster_config(ctx: Context, cluster_id: str) -> ClusterConfig:
    """A kubeconfig with embedded admin credentials, plus the key, CA and
    certificate as separate files (``api/magnum.py:260-283``)."""
    magnum = _magnum(ctx)
    cluster = await magnum.cluster(cluster_id)
    template = {}
    if cluster.get("cluster_template_id"):
        try:
            template = await magnum.cluster_template(
                cluster["cluster_template_id"]
            )
        except HiveError:
            template = {}
    api_address = cluster.get("api_address")
    if not api_address:
        raise Conflict("The cluster has no API address yet.")
    key = ca = cert = None
    if not template.get("tls_disabled"):
        key, csr = await asyncio.to_thread(rules.generate_key_and_csr)
        ca_pem, signed = await asyncio.gather(
            magnum.ca_certificate(cluster_id),
            magnum.sign_certificate(cluster_id, csr),
        )
        ca = ca_pem.get("pem")
        cert = signed.get("pem")
    return ClusterConfig.model_validate(
        {
            "name": cluster.get("name"),
            "api_address": api_address,
            "kubeconfig": rules.kubeconfig(
                cluster.get("name") or "cluster", api_address, ca, cert, key
            ),
            "key": key,
            "ca": ca,
            "cert": cert,
        }
    )
