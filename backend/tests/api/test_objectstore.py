"""Object Store: containers, folders, objects, upload plans and downloads."""

import json
from urllib.parse import parse_qs, urlsplit

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
        params={"filename": "up.txt"},
        content=b"hello",
        headers={**csrf_headers(logged_in), "Content-Type": "text/plain"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["etag"] == "abc"
    assert put.calls.last.request.content == b"hello"
    assert put.calls.last.request.headers["content-type"] == "text/plain"
    assert (
        meta.calls.last.request.headers["x-object-meta-orig-filename"]
        == "up.txt"
    )
    plan = await logged_in.post(
        "/api/object-store/containers/docs/upload-plan",
        json={"objects": [{"name": "x", "size": 1}]},
        headers=csrf_headers(logged_in),
    )
    assert plan.json()["mode"] == "proxy"
    assert json.dumps(plan.json()["objects"]) == "[]"
