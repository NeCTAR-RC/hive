"""Volume rules.

* Creating a volume needs an availability zone: the Horizon fork labels
  the empty choice "Choose an availability zone" and rejects a blank one
  (commit 58f918ed9), and the launch wizard hides "create new volume"
  until a zone is chosen (commit 216995ea1).
* Volume types may carry ``RESKEY:availability_zones`` extra specs. When
  any type does, the picker offers only the types naming the chosen zone
  plus the types that name no zone (commits b28a7b682, e64679calf).
* A volume created from a snapshot or another volume inherits the
  source's type and zone, so neither is sent (commit 877a274a0 and the
  upstream ``volumes/forms.py`` CreateForm.handle, which clears them).
* Restoring a backup without a target volume creates a new volume of the
  backup's size in the chosen zone and type, with ``backup_id`` (commit
  aed3e927b, ``api/cinder.py`` volume_backup_restore).
* Size floors follow upstream CreateForm.handle: not below the snapshot,
  the source volume, the image rounded up to whole gigabytes, or the
  image's min_disk.
* Changing a volume's type needs a type other than the current one
  (upstream ``volumes/forms.py`` RetypeForm.clean_volume_type). Hive also
  applies the zone rule above, which RetypeForm does not: a type limited
  to other zones cannot hold the volume, so Cinder's scheduler would fail
  the retype after accepting it.
* A volume transfer needs a name that is not blank (upstream
  ``volumes/forms.py`` CreateTransferForm.clean_name).
* Launching onto a new volume made from an image needs a specific zone:
  the fork's launch wizard offers "Create New Volume" only once a zone is
  chosen (commit 216995ea1), and the volume is never smaller than the
  image or its min_disk (upstream ``source.controller.js``
  checkVolumeForImage).
"""

import math

from hive.nectar.violation import RuleViolation

AZ_SPEC = "RESKEY:availability_zones"

# Horizon ``volumes/tables.py`` DELETABLE_STATES and ``backups/tables.py``.
VOLUME_DELETABLE_STATES = (
    "available",
    "error",
    "error_extending",
    "error_deleting",
    "error_managing",
)
BACKUP_DELETABLE_STATES = ("available", "error")
# Horizon ``instances/tables.py`` VOLUME_ATTACH_READY_STATES.
ATTACH_READY_STATES = ("ACTIVE", "SHUTOFF")

GIB = 1024**3


def validate_transfer_name(name: str) -> str:
    """A transfer name must hold more than spaces (Horizon
    ``volumes/forms.py`` CreateTransferForm.clean_name)."""
    if not name.strip():
        raise RuleViolation("Enter a transfer name")
    return name


class VolumeRules:
    def __init__(self, az_spec: str = AZ_SPEC):
        self.az_spec = az_spec

    def type_zones(self, vtype: dict) -> list[str] | None:
        """The zones a type is restricted to, or None for every zone."""
        specs = vtype.get("extra_specs") or {}
        raw = specs.get(self.az_spec)
        if not raw:
            return None
        zones = [z.strip() for z in str(raw).split(",") if z.strip()]
        return zones or None

    def has_zoned_types(self, types: list[dict]) -> bool:
        return any(self.type_zones(t) for t in types)

    def types_for_zone(self, types: list[dict], zone: str) -> list[dict]:
        if not self.has_zoned_types(types):
            return list(types)
        return [
            t
            for t in types
            if (zones := self.type_zones(t)) is None or zone in zones
        ]

    def type_summary(self, vtype: dict) -> dict:
        is_public = vtype.get("is_public")
        if is_public is None:
            is_public = vtype.get("os-volume-type-access:is_public", True)
        return {
            "id": vtype.get("id"),
            "name": vtype.get("name"),
            "description": vtype.get("description"),
            "is_public": bool(is_public),
            "zones": self.type_zones(vtype),
        }

    def create_body(self, req, source: dict | None) -> dict:
        """The Cinder ``volume`` body for a create request.

        ``source`` is the snapshot, volume or image the request names,
        already fetched by the caller.
        """
        body: dict = {
            "size": req.size,
            "name": req.name or None,
            "description": req.description or None,
        }
        kind = req.source.type if req.source else None
        source = source or {}
        if kind == "snapshot":
            floor = int(source.get("size") or 0)
            if req.size < floor:
                raise RuleViolation(
                    "The volume size cannot be less than the snapshot "
                    f"size ({floor} GB)"
                )
            body["snapshot_id"] = req.source.id
            return body
        if kind == "volume":
            floor = int(source.get("size") or 0)
            if req.size < floor:
                raise RuleViolation(
                    "The volume size cannot be less than the source "
                    f"volume size ({floor} GB)"
                )
            body["source_volid"] = req.source.id
            return body
        if not req.availability_zone:
            raise RuleViolation("Choose an availability zone")
        body["availability_zone"] = req.availability_zone
        if req.volume_type:
            body["volume_type"] = req.volume_type
        if kind == "image":
            image_gb = math.ceil(float(source.get("size") or 0) / GIB)
            min_disk = int(source.get("min_disk") or 0)
            if req.size < image_gb:
                raise RuleViolation(
                    "The volume size cannot be less than the image size "
                    f"({image_gb} GB)"
                )
            if min_disk > 0 and req.size < min_disk:
                raise RuleViolation(
                    "The volume size cannot be less than the image's "
                    f"minimum disk size ({min_disk} GB)"
                )
            body["imageRef"] = req.source.id
        return body

    def retype_body(self, volume: dict, types: list[dict], req) -> dict:
        """The Cinder ``os-retype`` action for a retype request.

        ``types`` are the volume types the project sees; a type missing
        from them is left for Cinder to refuse.
        """
        new_type = req.volume_type
        if new_type == volume.get("volume_type"):
            raise RuleViolation(
                "The new type must be different from the current volume type"
            )
        zone = volume.get("availability_zone")
        chosen = next((t for t in types if t.get("name") == new_type), None)
        if zone and chosen is not None:
            zones = self.type_zones(chosen)
            if zones is not None and zone not in zones:
                raise RuleViolation(
                    f"The {new_type} volume type is not available in "
                    f"{zone}, the volume's availability zone"
                )
        return {
            "os-retype": {
                "new_type": new_type,
                "migration_policy": req.migration_policy,
            }
        }

    def boot_volume_floor(self, image: dict) -> int:
        """The smallest new volume an image boots from, in GB: its size
        rounded up, or its min_disk when larger (``source.controller.js``
        checkVolumeForImage)."""
        image_gb = math.ceil(float(image.get("size") or 0) / GIB)
        return max(image_gb, int(image.get("min_disk") or 0), 1)

    def check_boot_volume(
        self, availability_zone: str | None, size_gb: int, image: dict
    ) -> None:
        """Refuse a launch onto a new volume without a zone (commit
        216995ea1) or smaller than the image needs."""
        if not availability_zone:
            raise RuleViolation(
                "Choose an availability zone to boot from a new volume"
            )
        floor = self.boot_volume_floor(image)
        if size_gb < floor:
            raise RuleViolation(
                f"The volume must be at least {floor} GB for this image"
            )

    def restore_body(self, backup: dict, req) -> dict:
        """The Cinder ``volume`` body that restores a backup to a new
        volume."""
        if not req.availability_zone:
            raise RuleViolation("Choose an availability zone")
        body = {
            "size": backup.get("size"),
            "name": req.name or f"restore_backup_{backup.get('id')}",
            "availability_zone": req.availability_zone,
            "backup_id": backup.get("id"),
        }
        if req.volume_type:
            body["volume_type"] = req.volume_type
        return body
