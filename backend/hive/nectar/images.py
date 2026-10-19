"""Image rules.

* Community images of other projects are hidden from pickers until the
  user searches (Horizon fork commit 283331da2); they still resolve for
  names (commit 38132b784 keeps a cached name map).
* Reserved custom properties are never shown or edited
  (``IMAGE_RESERVED_CUSTOM_PROPERTIES``), and neither are glance's base
  attributes (Horizon ``openstack_dashboard/api/glance.py``
  ``Image.property_visible`` excludes ``_attrs`` and ``_ext_attrs``).
* New images default to private visibility (``CREATE_IMAGE_DEFAULTS``).
"""

# Glance attributes that are not user metadata.
BASE_ATTRIBUTES = {
    "id",
    "name",
    "status",
    "visibility",
    "owner",
    "size",
    "virtual_size",
    "disk_format",
    "container_format",
    "min_disk",
    "min_ram",
    "created_at",
    "updated_at",
    "protected",
    "checksum",
    "os_hash_algo",
    "os_hash_value",
    "os_hidden",
    "tags",
    "self",
    "file",
    "schema",
    "direct_url",
    "locations",
}


class ImageRules:
    def __init__(
        self,
        reserved_properties: list[str],
        default_visibility: str = "private",
    ):
        self.reserved = set(reserved_properties)
        self.default_visibility = default_visibility

    def is_snapshot(self, image: dict) -> bool:
        return image.get("image_type") == "snapshot"

    def visible_in_picker(
        self, image: dict, project_id: str, searching: bool
    ) -> bool:
        if image.get("visibility") != "community":
            return True
        return searching or image.get("owner") == project_id

    def is_custom_property(self, key: str) -> bool:
        """A key the user may see and edit as a custom property."""
        return key not in BASE_ATTRIBUTES and key not in self.reserved

    def properties(self, image: dict) -> dict:
        return {
            key: value
            for key, value in image.items()
            if self.is_custom_property(key)
        }

    def summary(self, image: dict, project_id: str | None = None) -> dict:
        owner = image.get("owner")
        return {
            "id": image.get("id"),
            "name": image.get("name"),
            "status": image.get("status"),
            "visibility": image.get("visibility"),
            "owner": owner,
            "is_owner": bool(project_id) and owner == project_id,
            "is_snapshot": self.is_snapshot(image),
            "size": image.get("size"),
            "disk_format": image.get("disk_format"),
            "container_format": image.get("container_format"),
            "min_disk": image.get("min_disk"),
            "min_ram": image.get("min_ram"),
            "created_at": image.get("created_at"),
            "updated_at": image.get("updated_at"),
            "protected": image.get("protected", False),
            "os_distro": image.get("os_distro"),
            "os_version": image.get("os_version"),
            "tags": image.get("tags") or [],
            "properties": self.properties(image),
        }

    def create_defaults(self) -> dict:
        return {"visibility": self.default_visibility}

    def name_map(self, *groups: list[dict]) -> dict[str, str]:
        """Image id to name; earlier groups win (project and public before
        community, as the fork does)."""
        names: dict[str, str] = {}
        for group in groups:
            for image in group:
                names.setdefault(image["id"], image.get("name") or image["id"])
        return names
