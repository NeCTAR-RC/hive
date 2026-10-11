#!/usr/bin/env bash
# Local dev loop: redis in docker, the API with reload on :8000 and the Vite
# dev server on :5173 (which proxies /api and /auth to the API).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "no .env; run 'make env' first (or copy .env.example)" >&2
  exit 1
fi

docker compose up -d redis

if [ ! -x .tox/dev/bin/hive-web ]; then
  echo "creating .tox/dev virtualenv"
  python3 -m venv .tox/dev
  .tox/dev/bin/pip install -q -e '.[test]'
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

.tox/dev/bin/hive-web --host 127.0.0.1 --port 8000 --reload &
if [ -f frontend/package.json ]; then
  (cd frontend && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm dev) &
fi
wait
