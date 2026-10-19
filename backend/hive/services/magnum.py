"""Kubernetes clusters (Magnum) with the Nectar workflow."""

import asyncio

from hive.clients.magnum import MagnumClient
from hive.errors import BadRequest, Conflict, HiveError, NotFound
from hive.nectar import magnum as rules
from hive.schemas.magnum import ClusterCreate, NodeGroupCreate
from hive.services.context import Context

TEMPLATES_TTL = 300
TEMPLATES_STALE = 3600
FAN_OUT = 8
FALLBACK_QUOTA = 20


def _magnum(ctx: Context) -> MagnumClient:
    return MagnumClient(ctx.http, ctx.settings, ctx.scoped)


async def templates(ctx: Context) -> list[dict]:
    """Every template the user can see, cached per project (Magnum hides
    hidden templates from non-admins itself)."""

    async def fetch():
        return [
            rules.template_summary(t)
            for t in await _magnum(ctx).cluster_templates()
        ]

    result = await ctx.cache.get_or_fetch(
        ctx.cache.project_key(ctx.project_id, "magnum-templates"),
        fetch,
        ttl=TEMPLATES_TTL,
        stale_ttl=TEMPLATES_STALE,
        name="magnum-templates",
    )
    return result.value


async def get_template(ctx: Context, template_id: str) -> dict:
    return rules.template_summary(
        await _magnum(ctx).cluster_template(template_id)
    )


async def _template_map(ctx: Context) -> dict[str, dict]:
    try:
        return {t["id"]: t for t in await templates(ctx)}
    except HiveError:
        return {}


async def quota(ctx: Context) -> dict:
    magnum = _magnum(ctx)
    hard_limit = FALLBACK_QUOTA
    try:
        hard_limit = int(
            (await magnum.quota(ctx.project_id)).get("hard_limit", hard_limit)
        )
    except HiveError:
        pass
    stats = {}
    try:
        stats = await magnum.stats(ctx.project_id)
    except HiveError:
        pass
    return {
        "clusters": stats.get("clusters"),
        "nodes": stats.get("nodes"),
        "hard_limit": hard_limit,
    }


async def list_clusters(ctx: Context) -> dict:
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
    return {"items": items, "quota": usage}


async def get_cluster(ctx: Context, cluster_id: str) -> dict:
    magnum = _magnum(ctx)
    cluster = await magnum.cluster(cluster_id)
    template = None
    if cluster.get("cluster_template_id"):
        try:
            template = await get_template(ctx, cluster["cluster_template_id"])
        except HiveError:
            template = None
    return rules.cluster_summary(cluster, template)


async def create_options(ctx: Context) -> dict:
    """What the create workflow needs: the pickers derived from the
    templates, the template details, and the Nova flavours by name."""
    items, flavors = await asyncio.gather(templates(ctx), ctx.nova.flavors())
    usable = rules.selectable_templates(items)
    return {
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


async def create_cluster(ctx: Context, data: ClusterCreate) -> dict:
    problem = rules.validate_cluster_name(data.name)
    if problem:
        raise BadRequest(problem)
    template = await get_template(ctx, data.cluster_template_id)
    if not template.get("id"):
        raise NotFound("cluster template not found")
    problem = rules.validate_master_count(
        data.master_count, bool(template.get("master_lb_enabled"))
    )
    if problem:
        raise BadRequest(problem)
    body = rules.create_body(
        name=data.name,
        template=template,
        master_count=data.master_count,
        master_flavor=data.master_flavor_id,
        node_count=data.node_count,
        node_flavor=data.flavor_id,
        etcd_volume_size=data.etcd_volume_size,
        etcd_volume_type=data.etcd_volume_type,
    )
    created = await _magnum(ctx).create_cluster(body)
    return {"id": created.get("uuid"), "name": data.name}


async def delete_cluster(ctx: Context, cluster_id: str) -> None:
    await _magnum(ctx).delete_cluster(cluster_id)


async def upgrade_options(ctx: Context, cluster_id: str) -> dict:
    """The templates the current one names as upgrade targets, newest
    first (``rolling-upgrade/upgrade.service.js:70-138``)."""
    cluster = await get_cluster(ctx, cluster_id)
    current = None
    if cluster.get("cluster_template_id"):
        try:
            current = await get_template(ctx, cluster["cluster_template_id"])
        except HiveError:
            current = None
    target_ids = (
        (current or {}).get("upgrade_targets")
        or cluster.get("upgrade_targets")
        or []
    )
    semaphore = asyncio.Semaphore(FAN_OUT)

    async def fetch(template_id: str):
        async with semaphore:
            try:
                return await get_template(ctx, template_id)
            except HiveError:
                return None

    found = [
        t for t in await asyncio.gather(*(fetch(t) for t in target_ids)) if t
    ]
    found.sort(
        key=lambda t: rules.version_key(t.get("kubernetes_version") or "0"),
        reverse=True,
    )
    return {
        "cluster_id": cluster_id,
        "can_upgrade": rules.can_upgrade(cluster.get("status")),
        "current_version": cluster.get("kubernetes_version"),
        "targets": [
            {
                "template_id": t["id"],
                "name": t["name"],
                "kubernetes_version": t.get("kubernetes_version"),
            }
            for t in found
        ],
    }


async def upgrade_cluster(
    ctx: Context, cluster_id: str, template_id: str, batch: int
) -> dict:
    options = await upgrade_options(ctx, cluster_id)
    if not options["can_upgrade"]:
        raise Conflict(
            "The cluster must be in a completed state before it can be upgraded."
        )
    if template_id not in {t["template_id"] for t in options["targets"]}:
        raise BadRequest(
            "The template is not an upgrade target of the cluster's template."
        )
    await _magnum(ctx).upgrade_cluster(
        cluster_id, {"cluster_template": template_id, "max_batch_size": batch}
    )
    return {"id": cluster_id, "status": "UPDATE_IN_PROGRESS"}


# --- node groups ---------------------------------------------------------------


async def list_nodegroups(ctx: Context, cluster_id: str) -> dict:
    magnum = _magnum(ctx)
    cluster, brief = await asyncio.gather(
        magnum.cluster(cluster_id), magnum.nodegroups(cluster_id)
    )
    semaphore = asyncio.Semaphore(FAN_OUT)

    async def detail(nodegroup: dict) -> dict:
        async with semaphore:
            try:
                return await magnum.nodegroup(cluster_id, nodegroup["uuid"])
            except HiveError:
                return nodegroup

    full = await asyncio.gather(*(detail(n) for n in brief if n.get("uuid")))
    items = [rules.nodegroup_summary(n) for n in full]
    items.sort(
        key=lambda n: (
            n["role"] != "master",
            not n["is_default"],
            n["name"] or "",
        )
    )
    return {
        "items": items,
        "can_change": rules.can_change_nodegroups(cluster.get("status")),
        "cluster_status": cluster.get("status"),
    }


async def get_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str
) -> dict:
    return rules.nodegroup_summary(
        await _magnum(ctx).nodegroup(cluster_id, nodegroup_id)
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
) -> dict:
    await _require_changeable(ctx, cluster_id)
    if (
        data.autoscaling
        and data.min_node_count is not None
        and data.max_node_count is not None
    ):
        if data.max_node_count < data.min_node_count:
            raise BadRequest(
                "The maximum node count must be at least the minimum."
            )
        if not data.min_node_count <= data.node_count <= data.max_node_count:
            raise BadRequest(
                "The node count must be between the minimum and the maximum."
            )
    try:
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
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    created = await _magnum(ctx).create_nodegroup(cluster_id, body)
    return rules.nodegroup_summary(created)


async def resize_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str, node_count: int
) -> dict:
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    problem = rules.validate_resize(nodegroup.get("role"), node_count)
    if problem:
        raise BadRequest(problem)
    await magnum.resize_cluster(
        cluster_id,
        {"node_count": node_count, "nodegroup": nodegroup.get("name")},
    )
    return {"id": nodegroup_id, "node_count": node_count}


async def set_autoscaling(
    ctx: Context,
    cluster_id: str,
    nodegroup_id: str,
    minimum: int,
    maximum: int,
) -> dict:
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
    return rules.nodegroup_summary(updated)


async def set_labels(
    ctx: Context,
    cluster_id: str,
    nodegroup_id: str,
    node_labels: str | None,
    node_taints: str | None,
) -> dict:
    """Replace the Kubernetes node labels and taints (a rolling
    replacement of the group's nodes)."""
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    if nodegroup.get("role") == "master":
        raise BadRequest(
            "Control plane node groups cannot carry labels or taints."
        )
    try:
        labels = rules.parse_node_labels(node_labels)
        taints = rules.parse_node_taints(node_taints)
    except ValueError as exc:
        raise BadRequest(str(exc)) from exc
    patch = []
    if not rules.same_node_labels(labels, nodegroup.get("node_labels")):
        patch.append(
            {"op": "replace", "path": "/node_labels", "value": labels}
        )
    if not rules.same_node_taints(taints, nodegroup.get("node_taints")):
        patch.append(
            {"op": "replace", "path": "/node_taints", "value": taints}
        )
    if not patch:
        return rules.nodegroup_summary(nodegroup)
    updated = await magnum.patch_nodegroup(cluster_id, nodegroup_id, patch)
    return rules.nodegroup_summary(updated)


async def delete_nodegroup(
    ctx: Context, cluster_id: str, nodegroup_id: str
) -> None:
    await _require_changeable(ctx, cluster_id)
    magnum = _magnum(ctx)
    nodegroup = await magnum.nodegroup(cluster_id, nodegroup_id)
    if nodegroup.get("is_default"):
        raise Conflict("The default node group cannot be deleted.")
    await magnum.delete_nodegroup(cluster_id, nodegroup_id)


# --- certificates and config ---------------------------------------------------


async def ca_certificate(ctx: Context, cluster_id: str) -> str:
    return (await _magnum(ctx).ca_certificate(cluster_id)).get("pem") or ""


async def sign_certificate(ctx: Context, cluster_id: str, csr: str) -> str:
    return (await _magnum(ctx).sign_certificate(cluster_id, csr)).get(
        "pem"
    ) or ""


async def cluster_config(ctx: Context, cluster_id: str) -> dict:
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
    return {
        "name": cluster.get("name"),
        "api_address": api_address,
        "kubeconfig": rules.kubeconfig(
            cluster.get("name") or "cluster", api_address, ca, cert, key
        ),
        "key": key,
        "ca": ca,
        "cert": cert,
    }
