"""Flavour rules.

* SU per hour from the ``nectar:rate`` extra spec (Horizon fork commit
  51114b790, launch wizard flavour step).
* Preemptible flavours carry ``flavor_class:name == preemptible`` and
  instances on them live at most 24 hours (commit a9163d63e).
* Resize hides flavour families that cannot be resized to, by flavour
  class where configured, else by name prefix (commits 406f34822,
  60ac617ac: ``p1.*`` and ``p3.*``).
* Reservation flavours are the private flavours Blazar's flavour plugin
  creates for a reservation (Nectar fork
  ``blazar/plugins/flavor/flavor_plugin.py`` ``_create_flavor``): the
  flavour id is the reservation id, the name is ``reservation:<id>``, the
  source flavour's extra specs are copied (so ``flavor_class:name`` may be
  present) and ``aggregate_instance_extra_specs:reservation`` names the
  reservation. Warre's ``compute_flavor`` is that same id.
* Flavour classes: the launch wizard groups flavours by
  ``flavor_class:name`` and describes each class with a sentence from the
  Nectar support article "Nectar Flavors"
  (https://support.ehelp.edu.au/support/solutions/articles/6000205341-nectar-flavors).
  Horizon's flavour step has no grouping; this is a Hive addition.
"""

from decimal import Decimal, InvalidOperation

PREEMPTIBLE_NOTICE = (
    "Preemptible instances have a maximum lifetime of 24 hours and may be "
    "stopped at any time."
)

RESERVATION_SPEC = "aggregate_instance_extra_specs:reservation"
RESERVATION_NAME_PREFIX = "reservation:"

# Keyed by the ``flavor_class:name`` extra spec value, in the order the
# wizard offers them. A class missing here (``trove``, ``uom-general``,
# anything new) is offered under its raw name with no description.
FLAVOR_CLASSES: dict[str, dict[str, str]] = {
    "standard-v3": {
        "title": "Balanced (m3)",
        "description": (
            "Suited to most workloads, with 2 GB of RAM per vCPU and a "
            "30 GB root disk."
        ),
    },
    "tiny-v3": {
        "title": "Tiny (t3)",
        "description": (
            "A great choice for testing, prototyping and simple workloads, "
            "with 1 GB of RAM per vCPU and a 10 GB root disk."
        ),
    },
    "preemptible": {
        "title": "Preemptible (p3)",
        "description": (
            "Extra compute for a short period at a quarter of the SU cost "
            "of the matching m3 flavour; instances are stopped within 24 "
            "hours and may be stopped at any time."
        ),
    },
    "hugeram-v3": {
        "title": "Huge RAM (h3)",
        "description": (
            "For applications and workloads that need a very large amount "
            "of RAM, a very limited resource; access is requested through "
            "an allocation with a strong technical justification."
        ),
    },
}


class FlavorRules:
    def __init__(
        self,
        su_rate_spec: str = "nectar:rate",
        preemptible_class: str = "preemptible",
        hidden_resize_classes: list[str] | None = None,
        hidden_resize_prefixes: list[str] | None = None,
        reservation_spec: str = RESERVATION_SPEC,
    ):
        self.su_rate_spec = su_rate_spec
        self.preemptible_class = preemptible_class
        self.hidden_resize_classes = set(hidden_resize_classes or [])
        self.hidden_resize_prefixes = tuple(hidden_resize_prefixes or [])
        self.reservation_spec = reservation_spec

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

    def reservation_id(self, flavor: dict) -> str | None:
        """The Blazar reservation a flavour belongs to: the extra spec,
        else the ``reservation:`` name prefix; None for an ordinary
        flavour."""
        specs = flavor.get("extra_specs") or {}
        value = specs.get(self.reservation_spec)
        if value:
            return str(value)
        name = flavor.get("name") or ""
        if name.startswith(RESERVATION_NAME_PREFIX):
            return name[len(RESERVATION_NAME_PREFIX) :] or None
        return None

    def is_reservation(self, flavor: dict) -> bool:
        return self.reservation_id(flavor) is not None

    def class_info(self, class_id: str) -> dict:
        """A class as the wizard describes it: the table entry, else the
        raw class name with no description."""
        known = FLAVOR_CLASSES.get(class_id)
        return {
            "id": class_id,
            "title": known["title"] if known else class_id,
            "description": known["description"] if known else None,
        }

    def flavor_classes(self, summaries: list[dict]) -> list[dict]:
        """The classes present among the flavour summaries, each with its
        flavour count: the described classes in table order, then the
        rest by name. Reservation flavours and classless flavours are
        grouped by the SPA ("Reserved", "Other") and are not counted."""
        counts: dict[str, int] = {}
        for summary in summaries:
            if summary.get("is_reservation"):
                continue
            class_id = summary.get("flavor_class")
            if not class_id:
                continue
            counts[class_id] = counts.get(class_id, 0) + 1
        known = [c for c in FLAVOR_CLASSES if c in counts]
        unknown = sorted(c for c in counts if c not in FLAVOR_CLASSES)
        return [
            {**self.class_info(c), "count": counts[c]} for c in known + unknown
        ]

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
            "is_reservation": self.is_reservation(flavor),
            "reservation_id": self.reservation_id(flavor),
            "extra_specs": flavor.get("extra_specs") or {},
        }
