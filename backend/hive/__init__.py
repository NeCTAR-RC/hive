"""Hive: the Nectar Research Cloud dashboard backend-for-frontend."""

from importlib import metadata

try:
    __version__ = metadata.version("hive")
except metadata.PackageNotFoundError:  # pragma: no cover
    __version__ = "0.0.0"
