"""Replies of the Object Store panel: Swift containers, objects and the
upload plans that let the browser put files straight into Swift."""

from typing import Annotated, Literal

from pydantic import Field

from hive.schemas.responses import Items, Paginated, ResponseModel


class StorePolicy(ResponseModel):
    name: str
    default: bool


class StoreAccount(ResponseModel):
    """The Swift account's usage. The quotas are the account metadata
    headers as Swift sends them, strings or ``None`` when unset."""

    container_count: int
    object_count: int
    bytes: int
    quota_containers: str | None
    quota_bytes: str | None


class StoreInfo(ResponseModel):
    """The store's capabilities and usage. ``upload_mode`` is ``proxy``
    when the store has no TempURL support, whatever the setting says."""

    upload_mode: Literal["tempurl", "proxy"]
    max_file_size: int | None
    segment_bytes: int
    proxy_max_bytes: int
    slo: bool
    bulk_delete: int | None
    policies: list[StorePolicy]
    account: StoreAccount
    public_url: str


class Container(ResponseModel):
    name: str
    object_count: int
    bytes: int
    public_url: str


class ContainerList(Items[Container]):
    """The account's containers; ``truncated`` when the listing stopped at
    the page cap with more to come."""

    truncated: bool


class ContainerDetail(Container):
    """A container from its ``HEAD``; ``metadata`` is the user metadata
    without the CORS origin, which has its own field."""

    is_public: bool
    read_acl: str | None
    storage_policy: str | None
    cors_origin: str | None
    metadata: dict[str, str]
    timestamp: str | None


class StoreObject(ResponseModel):
    """An object or pseudo folder row; ``basename`` is the name below the
    listed folder."""

    name: str
    basename: str
    is_folder: bool
    bytes: int
    content_type: str | None
    hash: str | None
    last_modified: str | None


class ObjectListing(Paginated[StoreObject]):
    """One page of a folder's objects and subfolders."""

    container: str
    prefix: str


class ObjectDetail(ResponseModel):
    """An object from its ``HEAD``; ``metadata`` is its user metadata."""

    name: str
    container: str
    orig_filename: str | None
    bytes: int
    content_type: str | None
    hash: str | None
    last_modified: str | None
    timestamp: str | None
    is_slo: bool
    manifest: str | None
    metadata: dict[str, str]


class FolderCreated(ResponseModel):
    """The new folder's marker object, its name ending in ``/``."""

    name: str
    is_folder: bool


class ObjectCopied(ResponseModel):
    """Where the copy landed."""

    container: str
    name: str


class DeleteObjectsResult(ResponseModel):
    """How many objects went, and the paths Swift failed to delete."""

    deleted: int
    failed: list[str]


class UploadSegment(ResponseModel):
    """One segment of a large object: the byte range of the file and the
    signed URL it is put to; ``path`` goes into the manifest."""

    offset: int
    length: int
    path: str
    url: str


class UploadPlanObject(ResponseModel):
    """How to upload one file: a single signed PUT (``url``), or segments
    followed by a manifest (``manifest`` true, ``url`` ``None``)."""

    name: str
    size: int
    url: str | None
    manifest: bool
    segments: list[UploadSegment] | None


class TempUrlUploadPlan(ResponseModel):
    """The browser puts every file straight into Swift through signed
    URLs that expire after ``expires_in`` seconds."""

    mode: Literal["tempurl"]
    expires_in: int
    objects: list[UploadPlanObject]


class ProxyUploadPlan(ResponseModel):
    """The store has no TempURL support: the browser streams each file
    through Hive, up to ``max_bytes``. ``objects`` is always empty."""

    mode: Literal["proxy"]
    max_bytes: int
    objects: list[UploadPlanObject]


UploadPlan = Annotated[
    TempUrlUploadPlan | ProxyUploadPlan, Field(discriminator="mode")
]


class UploadCompleted(ResponseModel):
    """The large object once its manifest is written."""

    name: str
    bytes: int
    is_slo: bool


class ObjectUploaded(ResponseModel):
    """A file streamed through Hive into Swift (the proxy upload mode)."""

    name: str
    etag: str | None
