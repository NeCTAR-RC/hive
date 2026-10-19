"""Object Store: containers, folders, objects, upload plans and downloads."""

import base64
import hashlib
import hmac
import json
from urllib.parse import parse_qs, unquote, urlsplit

import httpx

from tests.conftest import csrf_headers, SWIFT

INFO = {
    "swift": {
        "max_file_size": 5368709120,
        "container_listing_limit": 10000,
        "policies": [{"default": True, "name": "default-placement"}],
        "strict_cors_mode": True,
    },
    "tempurl": {"methods": ["GET", "HEAD", "PUT", "POST", "DELETE"]},
    "slo": {"max_manifest_segments": 1000},
    "bulk_delete": {"max_deletes_per_request": 1000},
}

ACCOUNT_HEADERS = {
    "X-Account-Container-Count": "2",
    "X-Account-Object-Count": "5",
    "X-Account-Bytes-Used": "1024",
    "X-Account-Meta-Quota-Containers": "1000",
}


def mock_store(upstream, *, temp_key=None, cors=None):
    upstream.get("https://swift.test/swift/info").mock(
        return_value=httpx.Response(200, json=INFO)
    )
    headers = dict(ACCOUNT_HEADERS)
    if temp_key:
        headers["X-Account-Meta-Temp-URL-Key"] = temp_key
    upstream.head(SWIFT).mock(
        return_value=httpx.Response(204, headers=headers)
    )
    upstream.post(SWIFT).mock(return_value=httpx.Response(204))
    container_headers = {
        "X-Container-Object-Count": "3",
        "X-Container-Bytes-Used": "99",
        "X-Container-Read": ".r:*,.rlistings",
        "X-Storage-Policy": "default-placement",
    }
    if cors:
        container_headers["X-Container-Meta-Access-Control-Allow-Origin"] = (
            cors
        )
    upstream.head(f"{SWIFT}/docs").mock(
        return_value=httpx.Response(204, headers=container_headers)
    )
    upstream.post(f"{SWIFT}/docs").mock(return_value=httpx.Response(204))


async def test_info_and_containers(logged_in, upstream):
    mock_store(upstream)
    upstream.get(SWIFT).mock(
        return_value=httpx.Response(
            200,
            json=[
                {"name": "docs", "count": 3, "bytes": 99},
                {"name": "backups", "count": 0, "bytes": 0},
            ],
        )
    )
    info = (await logged_in.get("/api/object-store/info")).json()
    assert info["upload_mode"] == "tempurl"
    assert info["account"]["container_count"] == 2
    assert info["policies"][0]["name"] == "default-placement"
    body = (await logged_in.get("/api/object-store/containers")).json()
    assert [c["name"] for c in body["items"]] == ["backups", "docs"]
    assert body["items"][1]["public_url"] == f"{SWIFT}/docs"
    detail = (await logged_in.get("/api/object-store/containers/docs")).json()
    assert detail["is_public"] is True and detail["object_count"] == 3


async def test_create_update_and_delete_container(logged_in, upstream):
    mock_store(upstream)
    upstream.head(f"{SWIFT}/fresh").mock(
        side_effect=[
            httpx.Response(404),
            httpx.Response(
                204, headers={"X-Container-Read": ".r:*,.rlistings"}
            ),
        ]
    )
    created = upstream.put(f"{SWIFT}/fresh").mock(
        return_value=httpx.Response(201)
    )
    response = await logged_in.post(
        "/api/object-store/containers",
        json={"name": "fresh", "is_public": True},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert (
        created.calls.last.request.headers["x-container-read"]
        == ".r:*,.rlistings"
    )
    # Once it exists the HEAD answers and the create is refused.
    upstream.head(f"{SWIFT}/fresh").mock(
        return_value=httpx.Response(204, headers={"X-Container-Read": ""})
    )
    response = await logged_in.post(
        "/api/object-store/containers",
        json={"name": "fresh"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    response = await logged_in.post(
        "/api/object-store/containers",
        json={"name": "a/b"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    updated = upstream.post(f"{SWIFT}/fresh").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.patch(
        "/api/object-store/containers/fresh",
        json={"is_public": False, "metadata": {"owner": "me", "old": ""}},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200
    sent = updated.calls.last.request.headers
    assert sent["x-container-read"] == ""
    assert sent["x-container-meta-owner"] == "me"
    assert sent["x-remove-container-meta-old"] == "1"

    upstream.get(f"{SWIFT}/fresh").mock(
        return_value=httpx.Response(200, json=[])
    )
    deleted = upstream.delete(f"{SWIFT}/fresh").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/object-store/containers/fresh", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204 and deleted.called
    upstream.get(f"{SWIFT}/docs").mock(
        return_value=httpx.Response(200, json=[{"name": "a.txt"}])
    )
    response = await logged_in.delete(
        "/api/object-store/containers/docs", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 409


async def test_list_objects_and_folders(logged_in, upstream):
    mock_store(upstream)
    listing = upstream.get(f"{SWIFT}/docs").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "name": "notes/",
                    "bytes": 0,
                    "content_type": "application/directory",
                },
                {
                    "name": "notes/b.txt",
                    "bytes": 10,
                    "content_type": "text/plain",
                    "hash": "h1",
                },
                {"subdir": "notes/sub/"},
                {
                    "name": "notes/a.txt",
                    "bytes": 20,
                    "content_type": "text/plain",
                    "hash": "h2",
                },
            ],
        )
    )
    body = (
        await logged_in.get(
            "/api/object-store/containers/docs/objects",
            params={"path": "notes"},
        )
    ).json()
    assert body["prefix"] == "notes/"
    assert [o["basename"] for o in body["items"]] == ["sub", "a.txt", "b.txt"]
    assert body["items"][0]["is_folder"] is True
    assert body["has_more"] is False
    params = listing.calls.last.request.url.params
    assert params["prefix"] == "notes/" and params["delimiter"] == "/"

    upstream.head(f"{SWIFT}/docs/notes/new/").mock(
        return_value=httpx.Response(404)
    )
    created = upstream.put(f"{SWIFT}/docs/notes/new/").mock(
        return_value=httpx.Response(201)
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/folders",
        json={"path": "notes/new"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert (
        created.calls.last.request.headers["content-type"]
        == "application/directory"
    )
    upstream.head(f"{SWIFT}/docs/notes/new/").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/folders",
        json={"path": "notes/new"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409


async def test_upload_plan_sets_key_and_cors(logged_in, upstream, app):
    app.state.settings.swift_segment_bytes = 100
    mock_store(upstream)
    account_post = upstream.post(SWIFT)
    container_post = upstream.post(f"{SWIFT}/docs")
    upstream.head(f"{SWIFT}/docs_segments").mock(
        side_effect=[httpx.Response(404), httpx.Response(204)]
    )
    segments_put = upstream.put(f"{SWIFT}/docs_segments").mock(
        return_value=httpx.Response(201)
    )
    upstream.post(f"{SWIFT}/docs_segments").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/upload-plan",
        json={
            "objects": [
                {
                    "name": "notes/small.txt",
                    "size": 10,
                    "content_type": "text/plain",
                },
                {"name": "big.bin", "size": 250},
            ]
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "tempurl"
    key_set = account_post.calls.last.request.headers[
        "x-account-meta-temp-url-key"
    ]
    assert len(key_set) == 64
    cors = container_post.calls.last.request.headers
    assert (
        cors["x-container-meta-access-control-allow-origin"]
        == "http://testserver"
    )
    assert segments_put.called
    small, big = body["objects"]
    parts = urlsplit(small["url"])
    assert parts.path == "/swift/v1/docs/notes/small.txt"
    query = parse_qs(parts.query)
    # sha256 by default, in the prefixed base64 form Swift parses
    assert query["temp_url_sig"][0].startswith("sha256:")
    assert len(query["temp_url_sig"][0]) == 7 + 44
    assert small["segments"] is None
    assert len(big["segments"]) == 3
    assert big["segments"][2]["length"] == 50
    assert big["segments"][0]["path"].startswith("/docs_segments/big.bin/")
    assert big["manifest"] is True and small["manifest"] is False

    manifest = upstream.put(f"{SWIFT}/docs/big.bin").mock(
        return_value=httpx.Response(201)
    )
    upstream.head(f"{SWIFT}/docs/big.bin").mock(
        return_value=httpx.Response(
            200,
            headers={"Content-Length": "250", "X-Static-Large-Object": "True"},
        )
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/objects/big.bin/manifest",
        json={
            "segments": [
                {"path": s["path"], "size_bytes": s["length"]}
                for s in big["segments"]
            ]
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert response.json() == {"name": "big.bin", "bytes": 250, "is_slo": True}
    sent = manifest.calls.last.request
    assert sent.url.params["multipart-manifest"] == "put"
    assert json.loads(sent.content)[2]["size_bytes"] == 50


async def test_upload_plan_keeps_existing_key_and_cors(logged_in, upstream):
    mock_store(
        upstream, temp_key="k" * 64, cors="http://testserver https://other"
    )
    account_post = upstream.post(SWIFT)
    container_post = upstream.post(f"{SWIFT}/docs")
    response = await logged_in.post(
        "/api/object-store/containers/docs/upload-plan",
        json={"objects": [{"name": "a.txt", "size": 1}]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200
    assert not account_post.called and not container_post.called


async def test_download_redirects_to_a_signed_url(logged_in, upstream):
    mock_store(upstream, temp_key="k" * 64)
    response = await logged_in.get(
        "/api/object-store/containers/docs/objects/notes/a.txt/download"
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith(f"{SWIFT}/docs/notes/a.txt?")
    assert "filename=a.txt" in location


async def test_object_details_copy_and_delete(logged_in, upstream):
    mock_store(upstream)
    upstream.head(f"{SWIFT}/docs/notes/a.txt").mock(
        return_value=httpx.Response(
            200,
            headers={
                "Content-Length": "20",
                "Content-Type": "text/plain",
                "Etag": "h2",
                "Last-Modified": "Fri, 09 Oct 2026 01:00:00 GMT",
                "X-Object-Meta-Orig-Filename": "a.txt",
            },
        )
    )
    body = (
        await logged_in.get(
            "/api/object-store/containers/docs/objects/notes/a.txt/metadata"
        )
    ).json()
    assert (
        body["bytes"] == 20
        and body["hash"] == "h2"
        and body["is_slo"] is False
    )

    upstream.head(f"{SWIFT}/backups/a.txt").mock(
        return_value=httpx.Response(404)
    )
    copied = upstream.put(f"{SWIFT}/backups/a.txt").mock(
        return_value=httpx.Response(201)
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/objects/notes/a.txt/copy",
        json={"dest_container": "backups", "dest_name": "a.txt"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 201, response.text
    assert (
        copied.calls.last.request.headers["x-copy-from"] == "/docs/notes/a.txt"
    )

    upstream.get(f"{SWIFT}/docs").mock(
        return_value=httpx.Response(200, json=[{"name": "notes/old/big.bin"}])
    )
    upstream.head(f"{SWIFT}/docs/notes/old/big.bin").mock(
        return_value=httpx.Response(
            200, headers={"X-Static-Large-Object": "True"}
        )
    )
    upstream.head(f"{SWIFT}/docs/notes/old/").mock(
        return_value=httpx.Response(200)
    )
    slo_delete = upstream.delete(f"{SWIFT}/docs/notes/old/big.bin").mock(
        return_value=httpx.Response(200)
    )
    bulk = upstream.post(SWIFT).mock(
        return_value=httpx.Response(
            200,
            json={"Number Deleted": 2, "Number Not Found": 0, "Errors": []},
        )
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/delete",
        json={"names": ["notes/a.txt", "notes/old/"]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 3, "failed": []}
    assert (
        slo_delete.calls.last.request.url.params["multipart-manifest"]
        == "delete"
    )
    sent = bulk.calls.last.request
    assert sent.url.params["bulk-delete"] == "true"
    assert sent.content.decode().split("\n") == [
        "/docs/notes/a.txt",
        "/docs/notes/old/",
    ]


async def test_proxy_upload_streams_to_swift(logged_in, upstream, app):
    app.state.settings.swift_upload_mode = "proxy"
    mock_store(upstream)
    put = upstream.put(f"{SWIFT}/docs/notes/up.txt").mock(
        return_value=httpx.Response(201, headers={"Etag": "abc"})
    )
    meta = upstream.post(f"{SWIFT}/docs/notes/up.txt").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.put(
        "/api/object-store/containers/docs/objects/notes/up.txt",
        params={"filename": "r\u00e9sum\u00e9 1.txt"},
        content=b"hello",
        headers={**csrf_headers(logged_in), "Content-Type": "text/plain"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["etag"] == "abc"
    sent = put.calls.last.request
    assert sent.content == b"hello"
    assert sent.headers["content-type"] == "text/plain"
    # The original name rides on the PUT itself, percent-encoded.
    assert (
        sent.headers["x-object-meta-orig-filename"] == "r%C3%A9sum%C3%A9 1.txt"
    )
    assert not meta.called
    plan = await logged_in.post(
        "/api/object-store/containers/docs/upload-plan",
        json={"objects": [{"name": "x", "size": 1}]},
        headers=csrf_headers(logged_in),
    )
    assert plan.json()["mode"] == "proxy"
    assert json.dumps(plan.json()["objects"]) == "[]"


async def test_proxy_upload_needs_a_known_size(logged_in, upstream, app):
    app.state.settings.swift_upload_mode = "proxy"
    app.state.settings.swift_proxy_max_bytes = 4
    mock_store(upstream)
    put = upstream.put(f"{SWIFT}/docs/up.txt").mock(
        return_value=httpx.Response(201)
    )

    async def chunked():
        yield b"he"
        yield b"llo"

    response = await logged_in.put(
        "/api/object-store/containers/docs/objects/up.txt",
        content=chunked(),
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 411
    assert response.json()["error"] == "length_required"
    response = await logged_in.put(
        "/api/object-store/containers/docs/objects/up.txt",
        content=b"hello",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 413
    assert not put.called


class TrackedStream(httpx.AsyncByteStream):
    def __init__(self, chunks):
        self.chunks = chunks
        self.closed = False

    async def __aiter__(self):
        for chunk in self.chunks:
            yield chunk

    async def aclose(self):
        self.closed = True


async def test_proxy_download_streams_and_closes(logged_in, upstream, app):
    app.state.settings.swift_upload_mode = "proxy"
    mock_store(upstream)
    stream = TrackedStream([b"he", b"llo"])
    upstream.get(f"{SWIFT}/docs/notes/report").mock(
        return_value=httpx.Response(
            200,
            headers={
                "Content-Type": "application/pdf",
                "Content-Length": "5",
                "X-Object-Meta-Orig-Filename": "r%C3%A9sum%C3%A9.pdf",
            },
            stream=stream,
        )
    )
    response = await logged_in.get(
        "/api/object-store/containers/docs/objects/notes/report/download"
    )
    assert response.status_code == 200, response.text
    assert response.content == b"hello"
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["cache-control"] == "no-store"
    # The extension comes back from the original file name.
    assert response.headers["content-disposition"] == (
        "attachment; filename=\"report.pdf\"; filename*=UTF-8''report.pdf"
    )
    assert stream.closed

    upstream.get(f"{SWIFT}/docs/\u8ad6\u6587.txt").mock(
        return_value=httpx.Response(200, content=b"x")
    )
    response = await logged_in.get(
        "/api/object-store/containers/docs/objects/\u8ad6\u6587.txt/download"
    )
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        "attachment; filename=\"__.txt\";"
        " filename*=UTF-8''%E8%AB%96%E6%96%87.txt"
    )

    for status, code in (
        (403, "forbidden"),
        (404, "not_found"),
        # Last: a 401 ends the session.
        (401, "session_expired"),
    ):
        gone = TrackedStream([b"{}"])
        upstream.get(f"{SWIFT}/docs/missing.txt").mock(
            return_value=httpx.Response(status, stream=gone)
        )
        response = await logged_in.get(
            "/api/object-store/containers/docs/objects/missing.txt/download"
        )
        assert response.status_code == status
        assert response.json()["error"] == code
        assert gone.closed


def signed_for(url: str, key: str, method: str) -> bool:
    parts = urlsplit(url)
    query = parse_qs(parts.query)
    body = (
        f"{method}\n{query['temp_url_expires'][0]}\n{unquote(parts.path)}"
    ).encode()
    digest = hmac.new(key.encode(), body, hashlib.sha256).digest()
    return query["temp_url_sig"][0] == (
        "sha256:" + base64.urlsafe_b64encode(digest).decode()
    )


async def test_names_that_need_encoding(logged_in, upstream):
    """A space and a non-ASCII character through every object route."""
    key = "k" * 64
    mock_store(upstream, temp_key=key, cors="http://testserver")
    names = ["My Thesis.pdf", "notes/r\u00e9sum\u00e9.pdf"]
    response = await logged_in.post(
        "/api/object-store/containers/docs/upload-plan",
        json={"objects": [{"name": n, "size": 3} for n in names]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    urls = [o["url"] for o in response.json()["objects"]]
    assert urlsplit(urls[0]).path == "/swift/v1/docs/My%20Thesis.pdf"
    assert (
        urlsplit(urls[1]).path == "/swift/v1/docs/notes/r%C3%A9sum%C3%A9.pdf"
    )
    assert all(signed_for(url, key, "PUT") for url in urls)

    response = await logged_in.get(
        "/api/object-store/containers/docs/objects/notes/"
        "r%C3%A9sum%C3%A9.pdf/download"
    )
    assert response.status_code == 302
    location = response.headers["location"]
    assert signed_for(location, key, "GET")
    assert parse_qs(urlsplit(location).query)["filename"] == [
        "r\u00e9sum\u00e9.pdf"
    ]

    head = upstream.head(f"{SWIFT}/docs/My%20Thesis.pdf").mock(
        return_value=httpx.Response(
            200,
            headers={
                "Content-Length": "3",
                "X-Object-Meta-Orig-Filename": "My%20Thesis.pdf",
            },
        )
    )
    body = (
        await logged_in.get(
            "/api/object-store/containers/docs/objects/My%20Thesis.pdf/metadata"
        )
    ).json()
    assert body["name"] == "My Thesis.pdf" and body["bytes"] == 3
    assert body["orig_filename"] == "My Thesis.pdf"
    assert head.calls.last.request.url.raw_path == (
        b"/swift/v1/docs/My%20Thesis.pdf"
    )

    upstream.head(f"{SWIFT}/docs/notes/r\u00e9sum\u00e9.pdf").mock(
        return_value=httpx.Response(200)
    )
    bulk = upstream.post(SWIFT).mock(
        return_value=httpx.Response(
            200, json={"Number Deleted": 2, "Response Status": "200 OK"}
        )
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/delete",
        json={"names": names},
        headers=csrf_headers(logged_in),
    )
    assert response.json() == {"deleted": 2, "failed": []}
    assert bulk.calls.last.request.content.decode().split("\n") == [
        "/docs/My%20Thesis.pdf",
        "/docs/notes/r%C3%A9sum%C3%A9.pdf",
    ]


async def test_download_url_restores_the_extension(logged_in, upstream):
    mock_store(upstream, temp_key="k" * 64)
    head = upstream.head(f"{SWIFT}/docs/notes/report").mock(
        return_value=httpx.Response(
            200, headers={"X-Object-Meta-Orig-Filename": "report.pdf"}
        )
    )
    response = await logged_in.get(
        "/api/object-store/containers/docs/objects/notes/report/download"
    )
    assert response.status_code == 302 and head.called
    assert "filename=report.pdf" in response.headers["location"]


async def test_bulk_delete_errors_and_chunks(logged_in, upstream, app):
    mock_store(upstream)
    info = {**INFO, "bulk_delete": {"max_deletes_per_request": 2}}
    upstream.get("https://swift.test/swift/info").mock(
        return_value=httpx.Response(200, json=info)
    )
    for name in ("a", "b", "c"):
        upstream.head(f"{SWIFT}/docs/{name}").mock(
            return_value=httpx.Response(200)
        )
    bulk = upstream.post(SWIFT).mock(
        side_effect=[
            httpx.Response(
                200,
                json={
                    "Number Deleted": 1,
                    "Number Not Found": 0,
                    "Response Status": "400 Bad Request",
                    "Errors": [["/docs/b", "409 Conflict"]],
                },
            ),
            httpx.Response(
                200,
                json={
                    "Number Deleted": 0,
                    "Response Status": "502 Bad Gateway",
                    "Errors": [],
                },
            ),
        ]
    )
    response = await logged_in.post(
        "/api/object-store/containers/docs/delete",
        json={"names": ["a", "b", "c"]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"deleted": 1, "failed": ["b", "c"]}
    assert bulk.call_count == 2
    assert bulk.calls[0].request.content.decode().split("\n") == [
        "/docs/a",
        "/docs/b",
    ]


async def test_truncated_folder_listing_deletes_nothing(
    logged_in, upstream, monkeypatch
):
    from hive.clients import swift

    monkeypatch.setattr(swift, "LISTING_LIMIT", 2)
    monkeypatch.setattr(swift, "MAX_PAGES", 2)
    mock_store(upstream)
    upstream.get(f"{SWIFT}/docs").mock(
        side_effect=[
            httpx.Response(200, json=[{"name": "big/1"}, {"name": "big/2"}]),
            httpx.Response(200, json=[{"name": "big/3"}, {"name": "big/4"}]),
        ]
    )
    bulk = upstream.post(SWIFT)
    response = await logged_in.post(
        "/api/object-store/containers/docs/delete",
        json={"names": ["big/"]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    assert response.json()["error"] == "listing_truncated"
    assert not bulk.called


async def test_list_objects_pages_with_a_marker(logged_in, upstream):
    from hive.services import objectstore

    mock_store(upstream)
    listing = upstream.get(f"{SWIFT}/docs").mock(
        return_value=httpx.Response(
            200,
            json=[{"name": f"f{i}", "bytes": 1} for i in range(4)],
        )
    )
    original = objectstore.PAGE
    objectstore.PAGE = 3
    try:
        body = (
            await logged_in.get(
                "/api/object-store/containers/docs/objects",
                params={"marker": "e9"},
            )
        ).json()
    finally:
        objectstore.PAGE = original
    assert body["has_more"] is True and body["next_marker"] == "f2"
    assert len(body["items"]) == 3
    params = listing.calls.last.request.url.params
    assert params["marker"] == "e9" and params["limit"] == "4"


async def test_names_and_metadata_are_checked(logged_in, upstream):
    mock_store(upstream)
    for url in (
        "/api/object-store/containers/docs/objects?path=notes/../x",
        "/api/object-store/containers/docs/objects/a/%2E%2E/b/metadata",
    ):
        response = await logged_in.get(url)
        assert response.status_code == 400, url
    response = await logged_in.post(
        "/api/object-store/containers/docs/objects/a.txt/copy",
        json={"dest_container": "docs", "dest_name": "../other/a.txt"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    response = await logged_in.post(
        "/api/object-store/containers/docs/delete",
        json={"names": ["notes/./a.txt"]},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    for metadata in (
        {"has space": "x"},
        {"ok": "calf\u00e9"},
        {"ok": "a\r\nX-Evil: 1"},
    ):
        response = await logged_in.patch(
            "/api/object-store/containers/docs",
            json={"metadata": metadata},
            headers=csrf_headers(logged_in),
        )
        assert response.status_code == 422, metadata


async def test_container_ids_are_quoted(logged_in, upstream):
    mock_store(upstream)
    head = upstream.head(f"{SWIFT}/a%3Fb").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.get("/api/object-store/containers/a%3Fb")
    assert response.status_code == 200, response.text
    assert head.calls.last.request.url.raw_path == b"/swift/v1/a%3Fb"
