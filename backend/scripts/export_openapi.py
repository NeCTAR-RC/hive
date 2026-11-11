"""Write the API's OpenAPI document as JSON without running a server.

The SPA builds its API types from this document (``pnpm generate:api`` in
``frontend/``), and its mock contract test validates the mocked replies
against it. The app is built with throwaway settings: the document depends
on the routes and models only, never on a setting's value. ``info.version``
is pinned so the output depends on the code alone, not on the git tag the
package was installed from.

Usage: ``python backend/scripts/export_openapi.py [OUTPUT]`` (stdout when
no output path is given).
"""

import argparse
import json
from pathlib import Path
import secrets
import sys

from hive.config import Settings
from hive.web.app import create_app

CONTRACT_VERSION = "contract"


def export() -> dict:
    """Build the app with throwaway settings and return its document."""
    settings = Settings(
        _env_file=None,  # pyright: ignore[reportCallIssue]
        env="test",
        # Never used: the export signs no session.
        secret_key=secrets.token_urlsafe(32),
        web_static=None,
    )
    document = create_app(settings).openapi()
    document["info"]["version"] = CONTRACT_VERSION
    return document


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Write the OpenAPI document as JSON."
    )
    parser.add_argument("output", nargs="?", type=Path)
    args = parser.parse_args(argv)
    text = json.dumps(export(), indent=2, ensure_ascii=True) + "\n"
    if args.output is None:
        sys.stdout.write(text)
    else:
        args.output.write_text(text, encoding="ascii")
    return 0


if __name__ == "__main__":
    sys.exit(main())
