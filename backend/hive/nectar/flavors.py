"""Flavour rules.

* SU per hour from the ``nectar:rate`` extra spec (Horizon fork commit
  51114b790, launch wizard flavour step).
* Preemptible flavours carry ``flavor_class:name == preemptible`` and
  instances on them live at most 24 hours (commit a9163d63e).
* Resize hides flavour families that cannot be resized to, by flavour
  class where configured, else by name prefix (commits 406f34822,
  60ac617ac: ``p1.*`` and ``p3.*``).
"""

from decimal import Decimal, InvalidOperation

PREEMPTIBLE_NOTICE = (
    "Preemptible instances have a maximum lifetime of 24 hours and may be "
    "stopped at any time."
)


class FlavorRules:
    def __init__(
        self,
        su_rate_spec: str = "nectar:rate",
        preemptible_class: str = "preemptible",
        hidden_resize_classes: list[str] | None = None,
        hidden_resize_prefixes: list[str] | None = None,
    ):
        self.su_rate_spec = su_rate_spec
        self.preemptible_class = preemptible_class
        self.hidden_resize_classes = set(hidden_resize_classes or [])
        self.hidden_resize_prefixes = tuple(hidden_resize_prefixes or [])

    def su_rate(self, flavor: dict) -> float | None:
        specs = flavor.get("extra_specs") or {}
        raw = specs.get(self.su_rate_spec)
        if raw in (None, ""):
            return None
        try:
            return float(Decimal(str(raw)))
        except (InvalidOperation, ValueError):
            return None

    def flavor_class(self, flavor: dict) -> str | None:
        specs = flavor.get("extra_specs") or {}
        return specs.get("flavor_class:name")

    def is_preemptible(self, flavor: dict) -> bool:
        return self.flavor_class(flavor) == self.preemptible_class

    def hidden_from_resize(self, flavor: dict) -> bool:
        if self.hidden_resize_classes:
            return self.flavor_class(flavor) in self.hidden_resize_classes
        name = flavor.get("name") or ""
        return name.startswith(self.hidden_resize_prefixes)

    def resize_candidates(
        self, current_id: str | None, flavors: list[dict]
    ) -> list[dict]:
        return [
            f
            for f in flavors
            if f.get("id") != current_id and not self.hidden_from_resize(f)
        ]

    def summary(self, flavor: dict) -> dict:
        """The flavour fields the SPA shows, from a nova flavour or the
        flavour embedded in a server (2.47+)."""
        return {
            "id": flavor.get("id"),
            "name": flavor.get("name") or flavor.get("original_name"),
            "vcpus": flavor.get("vcpus"),
            "ram_mb": flavor.get("ram"),
            "disk_gb": flavor.get("disk"),
            "ephemeral_gb": flavor.get("OS-FLV-EXT-DATA:ephemeral")
            if "OS-FLV-EXT-DATA:ephemeral" in flavor
            else flavor.get("ephemeral"),
            "swap_mb": flavor.get("swap") or 0,
            "is_public": flavor.get("os-flavor-access:is_public", True),
            "flavor_class": self.flavor_class(flavor),
            "su_rate": self.su_rate(flavor),
            "is_preemptible": self.is_preemptible(flavor),
            "extra_specs": flavor.get("extra_specs") or {},
        }
