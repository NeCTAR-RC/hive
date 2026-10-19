# syntax=docker/dockerfile:1
# Single image: uvicorn serves the JSON API, the auth receiver and the built
# SPA from one origin.

# Base images are tag-pinned. Renovate (renovate.json) proposes tag updates
# for both FROM lines; operators who need reproducible rebuilds should pin by
# digest (`FROM node:24-alpine@sha256:...`), which Renovate then keeps
# current through its `pinDigests` support.

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:24-alpine AS frontend
ARG ARDC_NPM_REGISTRY=https://verdaccio.artm.rc.nectar.org.au/
ENV ARDC_NPM_REGISTRY=$ARDC_NPM_REGISTRY \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
WORKDIR /build
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
# pnpm will not expand variables in a committed .npmrc, so the registry is
# written here from the build argument. The npm secret is optional: absent
# for in-network builds (anonymous reads), present for off-network builds
# (`make build NPMRC=~/.npmrc`).
RUN echo "@ardc-ui:registry=$ARDC_NPM_REGISTRY" > .npmrc
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=false \
    corepack pnpm install --frozen-lockfile
COPY frontend/ ./
# The SPA imports the Horizon redirect map from the backend package.
COPY backend/hive/data/horizon-redirects.json /backend/hive/data/horizon-redirects.json
# The SPA reads its version from /api/config at run time, so nothing about
# the release is baked into the bundle.
RUN corepack pnpm build

# --- Stage 2: python runtime ------------------------------------------------
FROM python:3.14-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HIVE_WEB_STATIC=/app/web-static

WORKDIR /app

# setuptools-scm derives the version from git, but .git is not in the build
# context, so the Makefile passes the git-derived version in. ARG (not ENV)
# keeps it out of the final image's environment.
ARG VERSION
COPY pyproject.toml README.md ./
COPY backend/hive/ ./backend/hive/
RUN SETUPTOOLS_SCM_PRETEND_VERSION_FOR_HIVE="$VERSION" pip install .

# Drop in the built SPA; the web app picks it up via HIVE_WEB_STATIC.
COPY --from=frontend /build/dist/ /app/web-static/

RUN useradd --system --uid 42420 app
USER app

EXPOSE 8080
CMD ["hive-web", "--host", "0.0.0.0", "--port", "8080"]
