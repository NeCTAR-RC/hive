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
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
import httpx
from redis import asyncio as aioredis

from hive import __version__
from hive.api.health import router as health_router
from hive.api.router import api_router
from hive.auth.keystone import KeystoneClient
from hive.auth.login import AuthService
from hive.auth.router import router as auth_router
from hive.cache.redis import Cache
from hive.config import ENV_PREFIX, Settings
from hive.errors import install_error_handlers, NotFound
from hive.logs import configure_logging
from hive.observability.sentry import init_sentry
from hive.redirects import RedirectMap
from hive.session.store import SessionStore
from hive.web.middleware import RequestContextMiddleware

IMMUTABLE = "public, max-age=31536000, immutable"
NO_CACHE = "no-cache"


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
        app.state.keystone = KeystoneClient(
            app.state.http,
            settings.keystone_url,
            settings.upstream_connect_timeout,
            settings.upstream_read_timeout,
        )
        app.state.auth = AuthService(
            app.state.keystone, app.state.session_store
        )
        app.state.cache = Cache(app.state.redis)
        try:
            yield
        finally:
            await app.state.cache.close()
            if http is None:
                await app.state.http.aclose()
            if redis is None:
                await app.state.redis.aclose()

    docs = settings.docs_enabled
    app = FastAPI(
        title="hive",
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if docs else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if docs else None,
    )
    app.state.settings = settings
    app.state.redirects = RedirectMap.load()
    install_error_handlers(app)
    app.add_middleware(RequestContextMiddleware, settings=settings)
    app.include_router(auth_router)
    app.include_router(api_router, prefix="/api")
    app.include_router(health_router)
    _mount_spa(app, settings)
    return app


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
                return JSONResponse(
                    {
                        "error": "gone",
                        "message": "this feature has been retired",
                    },
                    status_code=410,
                )
            return RedirectResponse(location, status_code=301)
        # The API router is registered first and wins; anything reaching
        # here that still looks like an API path is a genuine miss.
        if full_path == "api" or full_path.startswith("api/"):
            raise NotFound("no such API route")
        if static_dir is None or index is None:
            raise NotFound("no SPA bundle configured")
        candidate = (static_dir / full_path).resolve()
        if static_dir in candidate.parents and candidate.is_file():
            cache = IMMUTABLE if full_path.startswith("assets/") else NO_CACHE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if index.is_file():
            # Client-side route: serve the SPA shell.
            return FileResponse(index, headers={"Cache-Control": NO_CACHE})
        raise NotFound("not found")


def main(argv: list[str] | None = None) -> int:
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(
        prog="hive-web", description="Serve the Hive dashboard."
    )
    parser.add_argument("--host", default="0.0.0.0")
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

    uvicorn.run(
        "hive.web.app:create_app",
        factory=True,
        host=args.host,
        port=args.port,
        reload=args.reload,
        proxy_headers=True,
        forwarded_allow_ips="*",
        access_log=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
