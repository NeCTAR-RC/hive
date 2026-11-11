"""Object Store endpoints (Swift containers and objects)."""

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from hive.api.replies import attachment
from hive.deps import ContextDep
from hive.schemas.objectstore import (
    CompleteUpload,
    ContainerCreate,
    ContainerUpdate,
    CopyRequest,
    DeleteRequest,
    FolderCreate,
    UploadPlanRequest,
)
from hive.schemas.responses.objectstore import (
    ContainerDetail,
    ContainerList,
    DeleteObjectsResult,
    FolderCreated,
    ObjectCopied,
    ObjectDetail,
    ObjectListing,
    ObjectUploaded,
    StoreInfo,
    UploadCompleted,
    UploadPlan,
)
from hive.services import objectstore

router = APIRouter(prefix="/object-store", tags=["object-store"])


@router.get("/info")
async def info(ctx: ContextDep) -> StoreInfo:
    return await objectstore.info(ctx)


@router.get("/containers")
async def list_containers(ctx: ContextDep) -> ContainerList:
    return await objectstore.list_containers(ctx)


@router.post("/containers", status_code=201)
async def create_container(
    body: ContainerCreate, ctx: ContextDep
) -> ContainerDetail:
    return await objectstore.create_container(
        ctx, body.name, body.is_public, body.storage_policy
    )


@router.get("/containers/{container}")
async def get_container(container: str, ctx: ContextDep) -> ContainerDetail:
    return await objectstore.get_container(ctx, container)


@router.patch("/containers/{container}")
async def update_container(
    container: str, body: ContainerUpdate, ctx: ContextDep
) -> ContainerDetail:
    return await objectstore.update_container(
        ctx, container, body.is_public, body.metadata
    )


@router.delete("/containers/{container}", status_code=204)
async def delete_container(
    container: str, ctx: ContextDep, with_objects: bool = False
) -> Response:
    """Delete a container; ``with_objects`` empties it first."""
    await objectstore.delete_container(ctx, container, with_objects)
    return Response(status_code=204)


@router.get("/containers/{container}/objects")
async def list_objects(
    container: str,
    ctx: ContextDep,
    path: str | None = None,
    marker: str | None = None,
) -> ObjectListing:
    return await objectstore.list_objects(ctx, container, path, marker)


@router.post("/containers/{container}/folders", status_code=201)
async def create_folder(
    container: str, body: FolderCreate, ctx: ContextDep
) -> FolderCreated:
    return await objectstore.create_folder(ctx, container, body.path)


@router.post("/containers/{container}/upload-plan")
async def upload_plan(
    container: str, body: UploadPlanRequest, ctx: ContextDep
) -> UploadPlan:
    return await objectstore.upload_plan(ctx, container, body.objects)


@router.post("/containers/{container}/delete")
async def delete_objects(
    container: str, body: DeleteRequest, ctx: ContextDep
) -> DeleteObjectsResult:
    return await objectstore.delete_objects(ctx, container, body.names)


@router.get("/containers/{container}/objects/{name:path}/metadata")
async def object_details(
    container: str, name: str, ctx: ContextDep
) -> ObjectDetail:
    return await objectstore.object_details(ctx, container, name)


@router.post(
    "/containers/{container}/objects/{name:path}/copy", status_code=201
)
async def copy_object(
    container: str, name: str, body: CopyRequest, ctx: ContextDep
) -> ObjectCopied:
    return await objectstore.copy_object(
        ctx, container, name, body.dest_container, body.dest_name
    )


@router.post(
    "/containers/{container}/objects/{name:path}/manifest", status_code=201
)
async def complete_upload(
    container: str, name: str, body: CompleteUpload, ctx: ContextDep
) -> UploadCompleted:
    return await objectstore.complete_upload(
        ctx, container, name, body.segments
    )


@router.get("/containers/{container}/objects/{name:path}/download")
async def download(container: str, name: str, ctx: ContextDep) -> Response:
    """Send the browser to a signed Swift URL, or stream the object when
    the store has no TempURL support."""
    found = await objectstore.download(ctx, container, name)
    if isinstance(found, str):
        return RedirectResponse(found, status_code=302)
    return attachment(found)


@router.put("/containers/{container}/objects/{name:path}", status_code=201)
async def proxy_upload(
    container: str,
    name: str,
    request: Request,
    ctx: ContextDep,
    filename: str | None = None,
) -> ObjectUploaded:
    """Stream a file through the backend into Swift (proxy mode)."""
    return await objectstore.proxy_upload(
        ctx,
        container,
        name,
        request.stream(),
        request.headers.get("content-length"),
        request.headers.get("content-type"),
        filename,
    )
