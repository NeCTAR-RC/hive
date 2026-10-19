"""Kubernetes clusters and cluster templates (Magnum)."""

import re

from fastapi import APIRouter, Depends, Response

from hive.deps import get_context
from hive.schemas.magnum import (
    ClusterCreate,
    ClusterUpgrade,
    NodeGroupAutoscaling,
    NodeGroupCreate,
    NodeGroupLabels,
    NodeGroupResize,
    SignRequest,
)
from hive.services.context import Context
from hive.services import magnum

router = APIRouter(prefix="/kubernetes", tags=["kubernetes"])
UNSAFE_FILENAME = re.compile(r"[^A-Za-z0-9_.-]")


def _pem(text: str, filename: str) -> Response:
    filename = UNSAFE_FILENAME.sub("_", filename)
    return Response(
        text,
        media_type="application/x-pem-file",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


@router.get("/clusters")
async def list_clusters(ctx: Context = Depends(get_context)):
    return await magnum.list_clusters(ctx)


@router.post("/clusters", status_code=202)
async def create_cluster(
    body: ClusterCreate, ctx: Context = Depends(get_context)
):
    return await magnum.create_cluster(ctx, body)


@router.get("/clusters/options")
async def create_options(ctx: Context = Depends(get_context)):
    return await magnum.create_options(ctx)


@router.get("/clusters/{cluster_id}")
async def get_cluster(cluster_id: str, ctx: Context = Depends(get_context)):
    return await magnum.get_cluster(ctx, cluster_id)


@router.delete("/clusters/{cluster_id}", status_code=204)
async def delete_cluster(cluster_id: str, ctx: Context = Depends(get_context)):
    await magnum.delete_cluster(ctx, cluster_id)
    return Response(status_code=204)


@router.get("/clusters/{cluster_id}/upgrade-options")
async def upgrade_options(
    cluster_id: str, ctx: Context = Depends(get_context)
):
    return await magnum.upgrade_options(ctx, cluster_id)


@router.post("/clusters/{cluster_id}/upgrade", status_code=202)
async def upgrade_cluster(
    cluster_id: str, body: ClusterUpgrade, ctx: Context = Depends(get_context)
):
    return await magnum.upgrade_cluster(
        ctx, cluster_id, body.cluster_template_id, body.max_batch_size
    )


@router.get("/clusters/{cluster_id}/config")
async def cluster_config(
    cluster_id: str, response: Response, ctx: Context = Depends(get_context)
):
    """Carries a freshly generated private key, so no cache may keep it."""
    config = await magnum.cluster_config(ctx, cluster_id)
    response.headers["Cache-Control"] = "no-store"
    return config


@router.get("/clusters/{cluster_id}/ca.pem")
async def ca_certificate(cluster_id: str, ctx: Context = Depends(get_context)):
    cluster = await magnum.get_cluster(ctx, cluster_id)
    pem = await magnum.ca_certificate(ctx, cluster_id)
    return _pem(pem, f"{cluster.get('name') or cluster_id}_ca.pem")


@router.post("/clusters/{cluster_id}/sign")
async def sign_certificate(
    cluster_id: str, body: SignRequest, ctx: Context = Depends(get_context)
):
    return {"pem": await magnum.sign_certificate(ctx, cluster_id, body.csr)}


# --- node groups ---------------------------------------------------------------


@router.get("/clusters/{cluster_id}/nodegroups")
async def list_nodegroups(
    cluster_id: str, ctx: Context = Depends(get_context)
):
    return await magnum.list_nodegroups(ctx, cluster_id)


@router.post("/clusters/{cluster_id}/nodegroups", status_code=202)
async def create_nodegroup(
    cluster_id: str, body: NodeGroupCreate, ctx: Context = Depends(get_context)
):
    return await magnum.create_nodegroup(ctx, cluster_id, body)


@router.get("/clusters/{cluster_id}/nodegroups/{nodegroup_id}")
async def get_nodegroup(
    cluster_id: str, nodegroup_id: str, ctx: Context = Depends(get_context)
):
    return await magnum.get_nodegroup(ctx, cluster_id, nodegroup_id)


@router.post(
    "/clusters/{cluster_id}/nodegroups/{nodegroup_id}/resize", status_code=202
)
async def resize_nodegroup(
    cluster_id: str,
    nodegroup_id: str,
    body: NodeGroupResize,
    ctx: Context = Depends(get_context),
):
    return await magnum.resize_nodegroup(
        ctx, cluster_id, nodegroup_id, body.node_count
    )


@router.put("/clusters/{cluster_id}/nodegroups/{nodegroup_id}/autoscaling")
async def set_autoscaling(
    cluster_id: str,
    nodegroup_id: str,
    body: NodeGroupAutoscaling,
    ctx: Context = Depends(get_context),
):
    return await magnum.set_autoscaling(
        ctx, cluster_id, nodegroup_id, body.min_node_count, body.max_node_count
    )


@router.put("/clusters/{cluster_id}/nodegroups/{nodegroup_id}/labels")
async def set_labels(
    cluster_id: str,
    nodegroup_id: str,
    body: NodeGroupLabels,
    ctx: Context = Depends(get_context),
):
    return await magnum.set_labels(
        ctx, cluster_id, nodegroup_id, body.node_labels, body.node_taints
    )


@router.delete(
    "/clusters/{cluster_id}/nodegroups/{nodegroup_id}", status_code=204
)
async def delete_nodegroup(
    cluster_id: str, nodegroup_id: str, ctx: Context = Depends(get_context)
):
    await magnum.delete_nodegroup(ctx, cluster_id, nodegroup_id)
    return Response(status_code=204)


# --- templates -----------------------------------------------------------------


@router.get("/cluster-templates")
async def list_templates(ctx: Context = Depends(get_context)):
    return {"items": await magnum.templates(ctx)}


@router.get("/cluster-templates/{template_id}")
async def get_template(template_id: str, ctx: Context = Depends(get_context)):
    return await magnum.get_template(ctx, template_id)
