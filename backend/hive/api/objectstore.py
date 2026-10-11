"""Object Store endpoints (Swift containers and objects)."""

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse

from hive.api.compute import get_context
from hive.clients.swift import SwiftClient
from hive.errors import BadRequest
from hive.schemas.objectstore import (
    CompleteUpload,
    ContainerCreate,
    ContainerUpdate,
    CopyRequest,
    DeleteRequest,
    FolderCreate,
    UploadPlanRequest,
)
from hive.services.context import Context
from hive.services import objectstore

router = APIRouter(prefix="/object-store", tags=["object-store"])


@router.get("/info")
async def info(ctx: Context = Depends(get_context)):
    return await objectstore.info(ctx)


@router.get("/containers")
async def list_containers(ctx: Context = Depends(get_context)):
    return await objectstore.list_containers(ctx)


@router.post("/containers", status_code=201)
async def create_container(
    body: ContainerCreate, ctx: Context = Depends(get_context)
):
    return await objectstore.create_container(
        ctx, body.name, body.is_public, body.storage_policy
    )


@router.get("/containers/{container}")
async def get_container(container: str, ctx: Context = Depends(get_context)):
    return await objectstore.get_container(ctx, container)


@router.patch("/containers/{container}")
async def update_container(
    container: str, body: ContainerUpdate, ctx: Context = Depends(get_context)
):
    return await objectstore.update_container(
        ctx, container, body.is_public, body.metadata
    )


@router.delete("/containers/{container}", status_code=204)
async def delete_container(
    container: str, ctx: Context = Depends(get_context)
):
    await objectstore.delete_container(ctx, container)
    return Response(status_code=204)


@router.get("/containers/{container}/objects")
async def list_objects(
    container: str,
    path: str | None = None,
    marker: str | None = None,
    ctx: Context = Depends(get_context),
):
    return await objectstore.list_objects(ctx, container, path, marker)


@router.post("/containers/{container}/folders", status_code=201)
async def create_folder(
    container: str, body: FolderCreate, ctx: Context = Depends(get_context)
):
    return await objectstore.create_folder(ctx, container, body.path)


@router.post("/containers/{container}/upload-plan")
async def upload_plan(
    container: str,
    body: UploadPlanRequest,
    ctx: Context = Depends(get_context),
):
    return await objectstore.upload_plan(ctx, container, body.objects)


@router.post("/containers/{container}/delete")
async def delete_objects(
    container: str, body: DeleteRequest, ctx: Context = Depends(get_context)
):
    return await objectstore.delete_objects(ctx, container, body.names)


@router.get("/containers/{container}/objects/{name:path}/metadata")
async def object_details(
    container: str, name: str, ctx: Context = Depends(get_context)
):
    return await objectstore.object_details(ctx, container, name)


@router.post(
    "/containers/{container}/objects/{name:path}/copy", status_code=201
)
async def copy_object(
    container: str,
    name: str,
    body: CopyRequest,
    ctx: Context = Depends(get_context),
):
    return await objectstore.copy_object(
        ctx, container, name, body.dest_container, body.dest_name
    )


@router.post(
    "/containers/{container}/objects/{name:path}/manifest", status_code=201
)
async def complete_upload(
    container: str,
    name: str,
    body: CompleteUpload,
    ctx: Context = Depends(get_context),
):
    return await objectstore.complete_upload(
        ctx, container, name, body.segments
    )


@router.get("/containers/{container}/objects/{name:path}/download")
async def download(
    container: str, name: str, ctx: Context = Depends(get_context)
):
    """Send the browser to a signed Swift URL, or stream the object when
    the store has no TempURL support."""
    url = await objectstore.download_url(ctx, container, name)
    if url:
        return RedirectResponse(
            url, status_code=302, headers={"Cache-Control": "no-store"}
        )
    swift = SwiftClient(ctx.http, ctx.settings, ctx.scoped)
    upstream = await swift.get_object(container, name)
    if upstream.status_code >= 400:
        await upstream.aclose()
        raise BadRequest(
            f"the object could not be read ({upstream.status_code})"
        )
    filename = (name.rsplit("/", 1)[-1] or name).replace('"', "")
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }
    if upstream.headers.get("content-length"):
        headers["Content-Length"] = upstream.headers["content-length"]
    return StreamingResponse(
        upstream.aiter_bytes(),
        media_type=upstream.headers.get("content-type")
        or "application/octet-stream",
        headers=headers,
        background=None,
    )


@router.put("/containers/{container}/objects/{name:path}", status_code=201)
async def proxy_upload(
    container: str,
    name: str,
    request: Request,
    filename: str | None = None,
    ctx: Context = Depends(get_context),
):
    """Stream a file through the backend into Swift (proxy mode)."""
    length = request.headers.get("content-length")
    size = int(length) if length and length.isdigit() else None
    return await objectstore.proxy_upload(
        ctx,
        container,
        name,
        request.stream(),
        size,
        request.headers.get("content-type"),
        filename,
    )
