"""Horizon URL redirect map.

The map in ``data/horizon-redirects.json`` is shared with the SPA. The
backend serves it as 301s before the SPA fallback so bookmarks, support
articles and manuka's ORCID return work before any JavaScript runs; the SPA
applies the same rows to in-app stale links
(``frontend/src/shell/navigation/redirects.ts``).

A row's ``from`` names a parameter as a whole path segment (``/:id/``); a
segment such as ``OS::Glance::Image`` (Horizon's Angular detail pages,
``horizon/openstack_dashboard/static/app/core/core.module.js``) is literal.
A ``from`` ending in ``/*`` also matches every path below it, and a ``*``
in ``to`` takes that rest. A ``horizon`` row's ``to`` is a path on Horizon
itself (``HIVE_HORIZON_URL``): the pages Hive still links out to.
"""

from dataclasses import dataclass
import json
from pathlib import Path
import re
from urllib.parse import quote

DATA_FILE = Path(__file__).parent / "data" / "horizon-redirects.json"
TOKEN = re.compile(r"(?<=/):([A-Za-z_][A-Za-z0-9_]*)")
SPLAT = "/*"


@dataclass(frozen=True)
class Rule:
    pattern: re.Pattern
    to: str
    preserve_query: bool
    kind: str
    splat: bool


def _compile(row: dict) -> Rule | None:
    source = row["from"]
    if source in ("", "/"):
        return None
    splat = source.endswith(SPLAT)
    source = source.removesuffix(SPLAT).rstrip("/")
    parts = []
    last = 0
    for match in TOKEN.finditer(source):
        parts.append(re.escape(source[last : match.start()]))
        parts.append(f"(?P<{match.group(1)}>[^/]+)")
        last = match.end()
    parts.append(re.escape(source[last:]))
    tail = "(?:/(?P<_rest>.*))?" if splat else "/?"
    pattern = re.compile("".join(parts) + tail)
    return Rule(
        pattern=pattern,
        to=row.get("to", ""),
        preserve_query=bool(row.get("preserveQuery", False)),
        kind=row.get("kind", "page"),
        splat=splat,
    )


def _fill(target: str, groups: dict[str, str]) -> str:
    """Substitute each ``:name`` token in ``target`` with its quoted value.

    One pass over whole-word tokens: ``:id`` never rewrites the front of
    ``:idx``, and a substituted value is never scanned again.
    """

    def value(token: re.Match) -> str:
        found = groups.get(token.group(1))
        return token.group(0) if found is None else quote(found, safe="")

    return TOKEN.sub(value, target)


class RedirectMap:
    def __init__(self, rules: list[Rule], horizon_url: str = ""):
        self.rules = rules
        self.horizon_url = horizon_url.rstrip("/")

    @classmethod
    def load(
        cls, path: Path = DATA_FILE, horizon_url: str = ""
    ) -> "RedirectMap":
        rows = json.loads(path.read_text(encoding="utf-8"))
        rules = []
        for row in rows:
            rule = _compile(row)
            if rule is not None:
                rules.append(rule)
        return cls(rules, horizon_url)

    def match(self, path: str, query: str = "") -> tuple[int, str] | None:
        """Return ``(status, location)`` for a Horizon path, else None.

        A row whose filled target is the requested path itself does not
        match: the optional trailing slash lets ``/terms/ -> /terms`` also
        match ``/terms``, and redirecting that would loop.
        """
        for rule in self.rules:
            found = rule.pattern.fullmatch(path)
            if not found:
                continue
            if rule.kind == "gone":
                return 410, ""
            groups = found.groupdict()
            rest = groups.pop("_rest", None) or ""
            target = _fill(rule.to, groups)
            if rule.splat:
                target = target.replace("*", quote(rest, safe="/"))
            if rule.kind == "horizon":
                target = self.horizon_url + target
            if target == path:
                return None
            if rule.preserve_query and query:
                target += ("&" if "?" in target else "?") + query
            return 301, target
        return None
