"""Double-submit CSRF bound to the session.

The token lives in the session and in a readable cookie; the SPA echoes it
in ``X-CSRF-Token`` on every unsafe request. ``Sec-Fetch-Site`` is checked
as a second, browser-enforced layer.
"""

import hmac
import secrets

from fastapi import Request

from hive.errors import CSRFError

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
HEADER = "x-csrf-token"


def new_token() -> str:
    return secrets.token_urlsafe(32)


def check_request(request: Request, expected: str) -> None:
    if request.method in SAFE_METHODS:
        return
    site = request.headers.get("sec-fetch-site")
    if site and site not in ("same-origin", "none"):
        raise CSRFError("cross-site request rejected")
    supplied = request.headers.get(HEADER)
    if not supplied or not hmac.compare_digest(supplied, expected):
        raise CSRFError("missing or invalid CSRF token")
