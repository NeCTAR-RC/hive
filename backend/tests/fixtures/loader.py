"""Upstream replies, one directory per service and one JSON body per file
(``tests/fixtures/<service>/<name>.json``), loaded by the api tests' respx
mocks and checked by ``tests/unit/contracts/``.

Only ``keystone/catalog.json`` is shaped after a real catalog; the rest
were moved here from hand-written test dicts. Each should be replaced by
a scrubbed rctest recording (ids, names, addresses and tokens replaced),
so the contract tests check Hive against what the services really send.
"""

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).parent


def fixture(service: str, name: str) -> Any:
    """The JSON body in ``<service>/<name>.json``."""
    return json.loads((ROOT / service / f"{name}.json").read_text())
