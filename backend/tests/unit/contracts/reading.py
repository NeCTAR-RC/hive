"""Which fields of an upstream reply a shaping function reads."""

from typing import Any


class Reading(dict):
    """A reply that logs every key read from it, at any depth, as a
    dotted path (``flavor.original_name``; ``[]`` marks a list item)."""

    def __init__(self, data: dict, log: set[str], prefix: str = ""):
        super().__init__(data)
        self._log = log
        self._prefix = prefix

    def _wrap(self, key: Any, value: Any) -> Any:
        path = f"{self._prefix}{key}"
        if isinstance(value, dict):
            return Reading(value, self._log, path + ".")
        if isinstance(value, list):
            return [
                Reading(item, self._log, path + "[].")
                if isinstance(item, dict)
                else item
                for item in value
            ]
        return value

    def __getitem__(self, key: Any) -> Any:
        self._log.add(f"{self._prefix}{key}")
        return self._wrap(key, super().__getitem__(key))

    def get(self, key: Any, default: Any = None) -> Any:
        self._log.add(f"{self._prefix}{key}")
        if key not in self:
            return default
        return self._wrap(key, super().__getitem__(key))


def fields_read(shape, reply: dict) -> set[str]:
    """The paths ``shape(reply)`` reads."""
    log: set[str] = set()
    shape(Reading(reply, log))
    return log


def present(reply: Any, path: str) -> bool:
    """Whether ``path`` exists in ``reply`` (in any item of a list)."""
    head, _, rest = path.partition(".")
    if head.endswith("[]"):
        items = reply.get(head[:-2]) if isinstance(reply, dict) else None
        return isinstance(items, list) and any(
            present(item, rest) for item in items
        )
    if not isinstance(reply, dict) or head not in reply:
        return False
    return not rest or present(reply[head], rest)
