"""Id-to-name maps shared by the service modules."""


def names(items: list[dict], fallback_to_id: bool = False) -> dict[str, str]:
    """Map each item's id to its name.

    An unnamed item maps to its id when ``fallback_to_id`` is set (for
    labels the SPA shows as is) and to ``""`` otherwise (for fields the
    SPA renders with its own placeholder).
    """
    result: dict[str, str] = {}
    for item in items:
        if item.get("id"):
            key = str(item["id"])
            result[key] = item.get("name") or (key if fallback_to_id else "")
    return result
