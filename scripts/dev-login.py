#!/usr/bin/env python3
"""Log a browser into a local Hive exactly the way manuka does.

manuka's last step is an auto-submitting HTML form that POSTs ``token`` and
``tenant_id`` to the dashboard's receiver. This script gets an unscoped
token from Keystone with the password credentials in a ``test-cred`` style
file, serves that same form once on 127.0.0.1, and opens it in a browser,
so the real cross-site POST, cookie and redirect path is exercised with no
manuka whitelist entry needed.

    source test-cred && python scripts/dev-login.py
    python scripts/dev-login.py --cred-file test-cred --next /compute/instances
    python scripts/dev-login.py --print-token     # for curl-based testing

Standard library only; never prints the token unless asked.
"""

import argparse
import html
import http.server
import json
import os
import shlex
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser

FORM = """<!doctype html>
<html><head><meta charset="utf-8"><title>Hive dev login</title></head>
<body onload="document.forms['token'].submit()">
<p>Logging in to {target}...</p>
<form id="token" method="POST" action="{target}">
<input type="hidden" name="token" value="{token}"/>
<input type="hidden" name="tenant_id" value="{tenant_id}"/>
<noscript><button type="submit">Continue</button></noscript>
</form></body></html>
"""


def read_cred(path: str) -> dict:
    """Parse ``export KEY=VALUE`` (or ``KEY=VALUE``) lines."""
    values = {}
    with open(path, encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :]
            if "=" not in line:
                continue
            key, _, value = line.partition("=")
            parts = shlex.split(value) if value else [""]
            values[key.strip()] = parts[0] if parts else ""
    return values


def credentials(args) -> dict:
    creds = dict(os.environ)
    if args.cred_file and os.path.exists(args.cred_file):
        creds.update(read_cred(args.cred_file))
    missing = [
        k
        for k in ("OS_AUTH_URL", "OS_USERNAME", "OS_PASSWORD")
        if not creds.get(k)
    ]
    if missing:
        sys.exit(f"missing credentials: {', '.join(missing)}")
    return creds


def keystone_base(auth_url: str) -> str:
    auth_url = auth_url.rstrip("/")
    return auth_url if auth_url.endswith("/v3") else auth_url + "/v3"


def unscoped_token(creds: dict) -> str:
    body = {
        "auth": {
            "identity": {
                "methods": ["password"],
                "password": {
                    "user": {
                        "name": creds["OS_USERNAME"],
                        "password": creds["OS_PASSWORD"],
                        "domain": {
                            "name": creds.get("OS_USER_DOMAIN_NAME", "Default")
                        },
                    }
                },
            }
        }
    }
    request = urllib.request.Request(
        keystone_base(creds["OS_AUTH_URL"]) + "/auth/tokens",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.headers["X-Subject-Token"]
    except urllib.error.HTTPError as exc:
        sys.exit(f"keystone refused the password login: {exc.code}")


def find_project(creds: dict, token: str, wanted: str | None) -> str:
    request = urllib.request.Request(
        keystone_base(creds["OS_AUTH_URL"]) + "/auth/projects",
        headers={"X-Auth-Token": token},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        projects = json.load(response).get("projects", [])
    wanted = wanted or creds.get("OS_PROJECT_NAME") or ""
    for project in projects:
        if wanted in (project.get("id"), project.get("name")):
            return project["id"]
    return projects[0]["id"] if projects else ""


class OneShotHandler(http.server.BaseHTTPRequestHandler):
    page = b""
    served = False

    def do_GET(self):  # noqa: N802 - http.server API
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(self.page)
        OneShotHandler.served = True
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, format: str, *args) -> None:
        return


def serve_once(page: bytes, port: int) -> str:
    OneShotHandler.page = page
    server = http.server.HTTPServer(("127.0.0.1", port), OneShotHandler)
    url = f"http://127.0.0.1:{server.server_port}/"
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return url


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description=(__doc__ or "").split("\n")[0]
    )
    parser.add_argument(
        "--cred-file",
        default="test-cred",
        help="file of `export OS_*=` lines (default: test-cred)",
    )
    parser.add_argument(
        "--target",
        default="http://localhost:5173/auth/websso/",
        help="Hive receiver URL",
    )
    parser.add_argument("--next", default="", help="path to land on")
    parser.add_argument("--project", help="project name or id to hint")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument(
        "--print-token",
        action="store_true",
        help="print the unscoped token and exit",
    )
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="print the one-shot URL instead of opening a browser",
    )
    parser.add_argument(
        "--wait",
        type=int,
        default=300,
        help="seconds to keep the one-shot page available (default 300)",
    )
    args = parser.parse_args(argv)

    creds = credentials(args)
    token = unscoped_token(creds)
    if args.print_token:
        print(token)
        return 0
    tenant_id = find_project(creds, token, args.project)
    target = args.target
    if args.next:
        target += ("&" if "?" in target else "?") + "next=" + args.next
    page = FORM.format(
        target=html.escape(target, quote=True),
        token=html.escape(token, quote=True),
        tenant_id=html.escape(tenant_id, quote=True),
    ).encode()
    url = serve_once(page, args.port)
    print(f"Login page served once at {url} (posts to {args.target})")
    print(url, flush=True)
    # Without a display, webbrowser may fall back to a text browser that
    # would consume the one-shot page; leave the URL for a real browser.
    has_display = sys.platform == "darwin" or bool(
        os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY")
    )
    if args.no_browser or not has_display or not webbrowser.open(url):
        print("Open the URL above in a browser.", flush=True)
    # Keep the process alive until the single request has been served
    # (or give up after --wait seconds).
    try:
        for _ in range(args.wait * 2):
            time.sleep(0.5)
            if OneShotHandler.served:
                break
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
