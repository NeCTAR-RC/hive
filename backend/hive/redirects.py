"""Horizon URL redirect map.

The map in ``data/horizon-redirects.json`` is shared with the SPA. The
backend serves it as 301s before the SPA fallback so bookmarks, support
articles and manuka's ORCID return work before any JavaScript runs; the SPA
applies the same rows to in-app stale links.
"""

from dataclasses import dataclass
import json
from pathlib import Path
import re
from urllib.parse import quote

DATA_FILE = Path(__file__).parent / "data" / "horizon-redirects.json"
TOKEN = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")


@dataclass(frozen=True)
class Rule:
    pattern: re.Pattern
    to: str
    preserve_query: bool
    kind: str


def _compile(row: dict) -> Rule | None:
    source = row["from"]
    if source in ("", "/"):
        return None
    source = source.rstrip("/")
    parts = []
    last = 0
    for match in TOKEN.finditer(source):
        parts.append(re.escape(source[last : match.start()]))
        parts.append(f"(?P<{match.group(1)}>[^/]+)")
        last = match.end()
    parts.append(re.escape(source[last:]))
    pattern = re.compile("".join(parts) + "/?")
    return Rule(
        pattern=pattern,
        to=row.get("to", ""),
        preserve_query=bool(row.get("preserveQuery", False)),
        kind=row.get("kind", "page"),
    )


class RedirectMap:
    def __init__(self, rules: list[Rule]):
        self.rules = rules

    @classmethod
    def load(cls, path: Path = DATA_FILE) -> "RedirectMap":
        rows = json.loads(path.read_text(encoding="utf-8"))
        rules = []
        for row in rows:
            if row.get("kind") == "linkout":
                continue
            rule = _compile(row)
            if rule is not None:
                rules.append(rule)
        return cls(rules)

    def match(self, path: str, query: str = "") -> tuple[int, str] | None:
        """Return ``(status, location)`` for a Horizon path, else None."""
        for rule in self.rules:
            found = rule.pattern.fullmatch(path)
            if not found:
                continue
            if rule.kind == "gone":
                return 410, ""
            target = rule.to
            for name, value in found.groupdict().items():
                target = target.replace(f":{name}", quote(value, safe=""))
            if rule.preserve_query and query:
                target += ("&" if "?" in target else "?") + query
            return 301, target
        return None
