"""Every ``/api`` route declares the model of what it answers, and the
OpenAPI document built from those models renders.

The document is the contract the SPA's types are generated from, so a
route without a model is a hole in it. The only routes allowed to go
without one answer no JSON: a 204, or a file the browser saves.
"""

from fastapi import FastAPI
from fastapi.routing import APIRoute, iter_route_contexts, RouteContext
import pytest

from hive.config import Settings
from hive.web.app import create_app

# Routes that answer a file (``api.replies.attachment``), not JSON.
FILE_DOWNLOADS = {
    ("GET", "/api/api-access/openrc"),
    ("GET", "/api/api-access/clouds.yaml"),
    ("GET", "/api/databases/instances/{instance_id}/logs/{name}/download"),
    ("GET", "/api/kubernetes/clusters/{cluster_id}/ca.pem"),
    ("GET", "/api/reservations/{reservation_id}/calendar.ics"),
    (
        "GET",
        "/api/object-store/containers/{container}/objects/{name}/download",
    ),
}


@pytest.fixture(scope="module")
def app() -> FastAPI:
    return create_app(
        Settings(
            _env_file=None,  # pyright: ignore[reportCallIssue]
            secret_key="x" * 32,
            log_format="console",
        )
    )


def api_routes(app: FastAPI) -> list[tuple[str, str, RouteContext]]:
    """Every ``/api`` operation as (method, path, route), the path as the
    OpenAPI document spells it. Included routers are resolved lazily, so
    ``app.routes`` alone would not list them."""
    return [
        (method, route.path_format, route)
        for route in iter_route_contexts(app.routes)
        if isinstance(route.original_route, APIRoute)
        and route.path.startswith("/api/")
        for method in sorted(route.methods)
    ]


def answers_json(method: str, path: str, route: RouteContext) -> bool:
    return route.status_code != 204 and (method, path) not in FILE_DOWNLOADS


def test_every_api_route_declares_a_response_model(app):
    missing = [
        f"{method} {path}"
        for method, path, route in api_routes(app)
        if answers_json(method, path, route) and route.response_model is None
    ]
    assert missing == []


def test_routes_without_a_body_declare_no_model(app):
    declared = [
        f"{method} {path}"
        for method, path, route in api_routes(app)
        if not answers_json(method, path, route)
        and route.response_model is not None
    ]
    assert declared == []


def test_file_downloads_name_existing_routes(app):
    routes = {(method, path) for method, path, _ in api_routes(app)}
    assert FILE_DOWNLOADS - routes == set()


def test_openapi_describes_every_json_reply(app):
    document = app.openapi()
    undescribed = []
    for method, path, route in api_routes(app):
        if not answers_json(method, path, route):
            continue
        operation = document["paths"][path][method.lower()]
        reply = operation["responses"][str(route.status_code or 200)]
        if "schema" not in reply.get("content", {}).get(
            "application/json", {}
        ):
            undescribed.append(f"{method} {path}")
    assert undescribed == []


def test_openapi_names_models_by_class(app):
    """Two models sharing a class name would be published under their
    module paths (``hive__schemas__...``), which the generated SPA types
    cannot use; class names stay unique instead."""
    schemas = app.openapi()["components"]["schemas"]
    assert [name for name in schemas if "__" in name] == []
