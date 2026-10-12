#!/usr/bin/env bash
# The local dev loop as background services, all from one script:
#
#   scripts/dev-stack.sh start     redis (docker compose), the API on :8000
#                                  with reload and Vite on :5173
#   scripts/dev-stack.sh restart   restart the API and Vite (redis and your
#                                  session stay); use after backend edits,
#                                  uvicorn's reload misses them on machines
#                                  at the inotify watch limit
#   scripts/dev-stack.sh stop      stop everything, redis included
#   scripts/dev-stack.sh status    what is up, with log paths
#   scripts/dev-stack.sh login [next]
#                                  serve a one-shot manuka-style login page
#                                  for the account in test-cred and print
#                                  its URL; open it once in a browser and
#                                  you land logged in (at `next`, default /)
#   scripts/dev-stack.sh logs      follow the API and Vite logs
#
# Needs .env (make env) and, for login, test-cred. Logs and pids live in
# .dev/ (git-ignored). `make dev` is the foreground alternative.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
RUN=.dev
API_PORT=8000
VITE_PORT=5173
LOGIN_PORT=8765
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
mkdir -p "$RUN"

# The API entry point: an existing tox or venv install if there is one,
# else a .tox/dev virtualenv is created.
HIVE_WEB=""
venv() {
  local candidate
  for candidate in .tox/dev .tox/py314 .tox/py312 .venv; do
    if [ -x "$candidate/bin/hive-web" ]; then
      HIVE_WEB="$candidate/bin/hive-web"
      return
    fi
  done
  echo "creating .tox/dev virtualenv"
  python3 -m venv .tox/dev
  .tox/dev/bin/pip install -q -e '.[test]'
  HIVE_WEB=.tox/dev/bin/hive-web
}

alive() {
  [ -f "$RUN/$1.pid" ] && kill -0 "$(cat "$RUN/$1.pid")" 2>/dev/null
}

# spawn <name> <command...>: run detached in its own process group so the
# whole tree (pnpm, node, uvicorn workers) can be stopped together.
spawn() {
  local name=$1
  shift
  setsid nohup "$@" > "$RUN/$name.log" 2>&1 &
  echo $! > "$RUN/$name.pid"
}

stop_one() {
  local name=$1 pid
  if [ -f "$RUN/$name.pid" ]; then
    pid=$(cat "$RUN/$name.pid")
    kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
    # wait for the tree to exit so the port is free for a restart
    for _ in $(seq 1 40); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL -- "-$pid" 2>/dev/null || true
    rm -f "$RUN/$name.pid"
  fi
}

# Processes left by an older session or `make dev` (bracketed first letter
# keeps pkill from matching this script's own command line).
stop_strays() {
  pkill -f "[h]ive-web --host 127.0.0.1 --port $API_PORT" 2>/dev/null || true
  pkill -f "node $ROOT/frontend/node_modules/.*[v]ite" 2>/dev/null || true
  pkill -f "[d]ev-login.py" 2>/dev/null || true
}

wait_http() {
  local url=$1 tries=$(( ${2:-60} * 2 ))
  for _ in $(seq 1 "$tries"); do
    if curl -sf -o /dev/null "$url"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

start_services() {
  if [ ! -f .env ]; then
    echo "no .env; run 'make env' first (or copy .env.example)" >&2
    exit 1
  fi
  venv
  docker compose up -d redis
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  if alive api; then
    echo "API already running (pid $(cat "$RUN/api.pid"))"
  else
    spawn api "$HIVE_WEB" --host 127.0.0.1 --port "$API_PORT" --reload
  fi
  if alive vite; then
    echo "Vite already running (pid $(cat "$RUN/vite.pid"))"
  else
    spawn vite bash -c "cd frontend && exec corepack pnpm dev"
  fi
  if ! wait_http "http://127.0.0.1:$API_PORT/healthz" 60; then
    echo "the API did not come up; see $RUN/api.log" >&2
    exit 1
  fi
  if ! wait_http "http://localhost:$VITE_PORT/" 90; then
    echo "Vite did not come up; see $RUN/vite.log" >&2
    exit 1
  fi
}

stop_services() {
  stop_one login
  stop_one vite
  stop_one api
  stop_strays
}

status() {
  local name
  for name in api vite login; do
    if alive "$name"; then
      echo "$name: running (pid $(cat "$RUN/$name.pid"), log $RUN/$name.log)"
    else
      echo "$name: stopped"
    fi
  done
  echo "redis: $(docker compose ps -a --format '{{.State}}' redis 2>/dev/null || echo unknown)"
  echo "API    http://127.0.0.1:$API_PORT  $(curl -s "http://127.0.0.1:$API_PORT/readyz" || echo "(not answering)")"
  echo "Vite   http://localhost:$VITE_PORT  HTTP $(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$VITE_PORT/" || true)"
  if alive login; then
    echo "login: one-shot page waiting at $(grep -m 1 "^http://127.0.0.1:$LOGIN_PORT" "$RUN/login.log" || echo '(starting)')"
  fi
}

login() {
  local next=${1:-/}
  if [ ! -f test-cred ]; then
    echo "no test-cred file (export OS_* lines for the test account)" >&2
    exit 1
  fi
  if ! wait_http "http://localhost:$VITE_PORT/" 1; then
    echo "the stack is not running; run '$0 start' first" >&2
    exit 1
  fi
  stop_one login
  pkill -f "[d]ev-login.py" 2>/dev/null || true
  spawn login python3 scripts/dev-login.py --cred-file test-cred --no-browser \
    --wait 3600 --port "$LOGIN_PORT" \
    --target "http://localhost:$VITE_PORT/auth/websso/" --next "$next"
  for _ in $(seq 1 60); do
    if grep -q "^http://127.0.0.1:$LOGIN_PORT" "$RUN/login.log" 2>/dev/null; then
      break
    fi
    sleep 0.5
  done
  if ! grep -q "^http://127.0.0.1:$LOGIN_PORT" "$RUN/login.log" 2>/dev/null; then
    cat "$RUN/login.log" >&2
    echo "no login page; see above" >&2
    exit 1
  fi
  echo "Open this once in a browser (valid for an hour, consumed on first use):"
  grep -m 1 "^http://127.0.0.1:$LOGIN_PORT" "$RUN/login.log"
}

case "${1:-}" in
  start)
    start_services
    status
    ;;
  restart)
    stop_services
    start_services
    status
    ;;
  stop)
    stop_services
    docker compose stop redis >/dev/null 2>&1 || true
    echo "stopped"
    ;;
  status)
    status
    ;;
  login)
    login "${2:-/}"
    ;;
  logs)
    tail -n 50 -F "$RUN/api.log" "$RUN/vite.log"
    ;;
  *)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
