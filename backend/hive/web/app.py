"""FastAPI app factory and the ``hive-web`` console entry point.

Serves the JSON API under ``/api``, the manuka token receiver under
``/auth``, ``/healthz``, ``/readyz``, prometheus ``/metrics`` and, when a
built SPA bundle is present (HIVE_WEB_STATIC), the SPA for every other path
with the Horizon redirect map applied first.
"""

from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse
import httpx
from redis import asyncio as aioredis
from starlette.concurrency import run_in_threadpool

from hive import __version__
from hive.api.health import router as health_router
from hive.api.router import api_router
from hive.auth.keystone import KeystoneClient
from hive.auth.login import AuthService
from hive.auth.router import router as auth_router
from hive.cache.redis import Cache
from hive.config import ENV_PREFIX, Settings
from hive.errors import Gone, install_error_handlers, NotFound
from hive.logs import configure_logging
from hive.observability.sentry import init_sentry
from hive.redirects import RedirectMap
from hive.services.background import BackgroundWork
from hive.session.store import SessionStore
from hive.web.middleware import (
    JsonBodyLimitMiddleware,
    RequestContextMiddleware,
)

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"
# The package itself: the only tree the development reloader watches, so
# it never walks frontend/node_modules and runs out of inotify watches.
PACKAGE_DIR = Path(__file__).resolve().parents[1]


def create_app(
    settings: Settings | None = None,
    *,
    redis=None,
    http: httpx.AsyncClient | None = None,
) -> FastAPI:
    """Build the application.

    ``redis`` and ``http`` can be injected (tests pass fakeredis and a
    respx-mocked client); otherwise real clients are created in the
    lifespan and closed on shutdown.
    """
    # pydantic-settings fills the required fields from the environment.
    settings = settings or Settings()  # pyright: ignore[reportCallIssue]
    configure_logging(settings.log_format, settings.log_level)
    init_sentry(settings, __version__)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.http = http or httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=200, max_keepalive_connections=50
            ),
            follow_redirects=False,
        )
        app.state.redis = redis or aioredis.from_url(
            settings.redis_url, decode_responses=True
        )
        app.state.session_store = SessionStore(
            app.state.redis,
            settings.secret_key.get_secret_value(),
            settings.session_timeout,
        )
        app.state.keystone = KeystoneClient(app.state.http, settings)
        app.state.auth = AuthService(
            app.state.keystone,
            app.state.session_store,
            interface=settings.endpoint_interface,
            region=settings.region,
        )
        app.state.cache = Cache(app.state.redis)
        app.state.background = BackgroundWork()
        try:
            yield
        finally:
            # Unfinished work records its failure while Redis is still open.
            await app.state.background.shutdown()
            await app.state.cache.close()
            if http is None:
                await app.state.http.aclose()
            if redis is None:
                await app.state.redis.aclose()

    # The OpenAPI document is the API contract the SPA's types are built
    # from; it holds no data, so it is served to anyone. The interactive
    # docs page stays a development aid.
    app = FastAPI(
        title="hive",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )
    app.state.settings = settings
    app.state.redirects = RedirectMap.load(horizon_url=settings.horizon_url)
    install_error_handlers(app)
    # The last middleware added runs first: the request context wraps the
    # body limit so a 413 still carries the request id and headers.
    app.add_middleware(JsonBodyLimitMiddleware, settings=settings)
    app.add_middleware(RequestContextMiddleware, settings=settings)
    app.include_router(auth_router)
    app.include_router(api_router, prefix="/api")
    app.include_router(health_router)
    _mount_spa(app, settings)
    return app


def _static_file(static_dir: Path, full_path: str) -> Path | None:
    """The bundle file for ``full_path``, refusing anything that resolves
    outside the bundle (path traversal). Blocking: run it in a thread."""
    candidate = (static_dir / full_path).resolve()
    if static_dir in candidate.parents and candidate.is_file():
        return candidate
    return None


def _mount_spa(app: FastAPI, settings: Settings) -> None:
    static_dir = settings.web_static.resolve() if settings.web_static else None
    index = static_dir / "index.html" if static_dir else None

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str, request: Request):
        redirects: RedirectMap = request.app.state.redirects
        target = redirects.match("/" + full_path, request.url.query)
        if target is not None:
            status, location = target
            if status == 410:
                # The SPA shell renders its own "retired" page for the path.
                if index is not None and await run_in_threadpool(
                    index.is_file
                ):
                    return FileResponse(
                        index,
                        status_code=410,
                        headers={"Cache-Control": NO_CACHE},
                    )
                raise Gone("this feature has been retired")
            return RedirectResponse(location, status_code=301)
        # The API router is registered first and wins; anything reaching
        # here that still looks like an API path is a genuine miss.
        if full_path == "api" or full_path.startswith("api/"):
            raise NotFound("no such API route")
        if static_dir is None or index is None:
            raise NotFound("no SPA bundle configured")
        found = await run_in_threadpool(_static_file, static_dir, full_path)
        if found is not None:
            cache = IMMUTABLE if full_path.startswith("assets/") else NO_CACHE
            return FileResponse(found, headers={"Cache-Control": cache})
        if await run_in_threadpool(index.is_file):
            # Client-side route: serve the SPA shell.
            return FileResponse(index, headers={"Cache-Control": NO_CACHE})
        raise NotFound("not found")


def main(argv: list[str] | None = None) -> int:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(
        prog="hive-web", description="Serve the Hive dashboard."
    )
    # In the container the app listens on every interface; forwarded
    # headers are trusted only from HIVE_FORWARDED_ALLOW_IPS.
    parser.add_argument("--host", default="0.0.0.0")  # noqa: S104
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--static-dir", help="SPA bundle to serve")
    parser.add_argument(
        "--reload", action="store_true", help="auto-reload (development)"
    )
    args = parser.parse_args(argv)

    # The factory (possibly in a reloader subprocess) reads settings from
    # the environment.
    if args.static_dir:
        os.environ[ENV_PREFIX + "WEB_STATIC"] = str(Path(args.static_dir))
    settings = Settings()  # pyright: ignore[reportCallIssue]

    uvicorn.run(
        "hive.web.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        reload_dirs=[str(PACKAGE_DIR)],
        reload_includes=["*.py", "*.json"],
        proxy_headers=True,
        forwarded_allow_ips=settings.forwarded_allow_ips,
        access_log=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
