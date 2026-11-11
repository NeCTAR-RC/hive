"""The ``test-cred`` credentials file: lines of ``export OS_*=value``."""

from pathlib import Path
import shlex


def read_cred(path: str | Path) -> dict[str, str]:
    """Parse ``export KEY=VALUE`` (or ``KEY=VALUE``) lines; values may be
    shell-quoted. Comments, blank lines and other lines are skipped."""
    values: dict[str, str] = {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        line = line.removeprefix("export ")
        key, sep, value = line.partition("=")
        if not sep:
            continue
        parts = shlex.split(value) if value else [""]
        values[key.strip()] = parts[0] if parts else ""
    return values
