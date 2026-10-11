"""Volume rules.

* Creating a volume needs an availability zone: the Horizon fork labels
  the empty choice "Choose an availability zone" and rejects a blank one
  (commit 58f918ed9), and the launch wizard hides "create new volume"
  until a zone is chosen (commit 216995ea1).
* Volume types may carry ``RESKEY:availability_zones`` extra specs. When
  any type does, the picker offers only the types naming the chosen zone
  plus the types that name no zone (commits b28a7b682, e64679caf).
* A volume created from a snapshot or another volume inherits the
  source's type and zone, so neither is sent (commit 877a274a0 and the
  upstream ``volumes/forms.py`` CreateForm.handle, which clears them).
* Restoring a backup without a target volume creates a new volume of the
  backup's size in the chosen zone and type, with ``backup_id`` (commit
  aed3e927b, ``api/cinder.py`` volume_backup_restore).
* Size floors follow upstream CreateForm.handle: not below the snapshot,
  the source volume, the image rounded up to whole gigabytes, or the
  image's min_disk.
"""

import math

from hive.errors import BadRequest

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
                raise BadRequest(
                    "The volume size cannot be less than the snapshot "
                    f"size ({floor} GB)"
                )
            body["snapshot_id"] = req.source.id
            return body
        if kind == "volume":
            floor = int(source.get("size") or 0)
            if req.size < floor:
                raise BadRequest(
                    "The volume size cannot be less than the source "
                    f"volume size ({floor} GB)"
                )
            body["source_volid"] = req.source.id
            return body
        if not req.availability_zone:
            raise BadRequest("Choose an availability zone")
        body["availability_zone"] = req.availability_zone
        if req.volume_type:
            body["volume_type"] = req.volume_type
        if kind == "image":
            image_gb = math.ceil(float(source.get("size") or 0) / GIB)
            min_disk = int(source.get("min_disk") or 0)
            if req.size < image_gb:
                raise BadRequest(
                    "The volume size cannot be less than the image size "
                    f"({image_gb} GB)"
                )
            if 0 < min_disk and req.size < min_disk:
                raise BadRequest(
                    "The volume size cannot be less than the image's "
                    f"minimum disk size ({min_disk} GB)"
                )
            body["imageRef"] = req.source.id
        return body

    def restore_body(self, backup: dict, req) -> dict:
        """The Cinder ``volume`` body that restores a backup to a new
        volume."""
        if not req.availability_zone:
            raise BadRequest("Choose an availability zone")
        body = {
            "size": backup.get("size"),
            "name": req.name or f"restore_backup_{backup.get('id')}",
            "availability_zone": req.availability_zone,
            "backup_id": backup.get("id"),
        }
        if req.volume_type:
            body["volume_type"] = req.volume_type
        return body
