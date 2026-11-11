import pytest

from hive.nectar.violation import RuleViolation
from hive.nectar.volumes import validate_transfer_name, VolumeRules
from hive.schemas.volumes import RestoreRequest, RetypeRequest, VolumeCreate

TYPES = [
    {"id": "t-any", "name": "standard", "extra_specs": {}},
    {
        "id": "t-qh2",
        "name": "qh2-ssd",
        "extra_specs": {"RESKEY:availability_zones": "melbourne-qh2"},
    },
    {
        "id": "t-both",
        "name": "shared",
        "extra_specs": {
            "RESKEY:availability_zones": "melbourne-qh2, monash-02"
        },
    },
]


class TestVolumeTypes:
    def test_zones_parsed_from_extra_specs(self):
        rules = VolumeRules()
        assert rules.type_zones(TYPES[0]) is None
        assert rules.type_zones(TYPES[1]) == ["melbourne-qh2"]
        assert rules.type_zones(TYPES[2]) == ["melbourne-qh2", "monash-02"]
        assert rules.has_zoned_types(TYPES)
        assert not rules.has_zoned_types([TYPES[0]])

    def test_types_for_zone_keeps_unzoned_types(self):
        rules = VolumeRules()
        names = [t["name"] for t in rules.types_for_zone(TYPES, "monash-02")]
        assert names == ["standard", "shared"]
        # Without the extra spec visible every type is offered everywhere.
        assert rules.types_for_zone([TYPES[0]], "anything") == [TYPES[0]]

    def test_summary(self):
        summary = VolumeRules().type_summary(
            {**TYPES[1], "os-volume-type-access:is_public": False}
        )
        assert summary == {
            "id": "t-qh2",
            "name": "qh2-ssd",
            "description": None,
            "is_public": False,
            "zones": ["melbourne-qh2"],
        }


class TestCreateBody:
    def test_zone_required_for_an_empty_volume(self):
        rules = VolumeRules()
        with pytest.raises(RuleViolation, match="availability zone"):
            rules.create_body(VolumeCreate(size=10), None)
        body = rules.create_body(
            VolumeCreate(
                name="data", size=10, availability_zone="melbourne-qh2"
            ),
            None,
        )
        assert body == {
            "size": 10,
            "name": "data",
            "description": None,
            "availability_zone": "melbourne-qh2",
        }

    def test_type_sent_only_when_chosen(self):
        body = VolumeRules().create_body(
            VolumeCreate(
                size=5, availability_zone="monash-02", volume_type="shared"
            ),
            None,
        )
        assert body["volume_type"] == "shared"

    def test_snapshot_and_volume_sources_inherit_type_and_zone(self):
        rules = VolumeRules()
        req = VolumeCreate(
            size=20,
            availability_zone="melbourne-qh2",
            volume_type="qh2-ssd",
            source={"type": "snapshot", "id": "snap-1"},
        )
        body = rules.create_body(req, {"id": "snap-1", "size": 20})
        assert body == {
            "size": 20,
            "name": None,
            "description": None,
            "snapshot_id": "snap-1",
        }
        req = VolumeCreate(
            size=20,
            source={"type": "volume", "id": "vol-1"},
        )
        body = rules.create_body(req, {"id": "vol-1", "size": 15})
        assert body["source_volid"] == "vol-1"
        assert "availability_zone" not in body

    def test_size_floors(self):
        rules = VolumeRules()
        with pytest.raises(RuleViolation, match="snapshot size \\(20 GB\\)"):
            rules.create_body(
                VolumeCreate(size=10, source={"type": "snapshot", "id": "s"}),
                {"size": 20},
            )
        with pytest.raises(RuleViolation, match="source volume size"):
            rules.create_body(
                VolumeCreate(size=10, source={"type": "volume", "id": "v"}),
                {"size": 11},
            )
        image = {"id": "img", "size": 2 * 1024**3 + 1, "min_disk": 5}
        req = VolumeCreate(
            size=3,
            availability_zone="melbourne-qh2",
            source={"type": "image", "id": "img"},
        )
        with pytest.raises(
            RuleViolation, match="minimum disk size \\(5 GB\\)"
        ):
            rules.create_body(req, image)
        with pytest.raises(RuleViolation, match="image size \\(3 GB\\)"):
            rules.create_body(
                VolumeCreate(
                    size=2,
                    availability_zone="melbourne-qh2",
                    source={"type": "image", "id": "img"},
                ),
                {**image, "min_disk": 0},
            )
        ok = rules.create_body(
            VolumeCreate(
                size=5,
                availability_zone="melbourne-qh2",
                source={"type": "image", "id": "img"},
            ),
            image,
        )
        assert ok["imageRef"] == "img"
        assert ok["availability_zone"] == "melbourne-qh2"


class TestRestoreBody:
    def test_new_volume_takes_backup_size_zone_and_type(self):
        rules = VolumeRules()
        backup = {"id": "b-1", "size": 40}
        with pytest.raises(RuleViolation, match="availability zone"):
            rules.restore_body(backup, RestoreRequest())
        body = rules.restore_body(
            backup,
            RestoreRequest(availability_zone="monash-02", volume_type="std"),
        )
        assert body == {
            "size": 40,
            "name": "restore_backup_b-1",
            "availability_zone": "monash-02",
            "backup_id": "b-1",
            "volume_type": "std",
        }
        named = rules.restore_body(
            backup, RestoreRequest(name="data", availability_zone="monash-02")
        )
        assert named["name"] == "data"
        assert "volume_type" not in named


class TestRetype:
    def test_needs_a_new_type_that_serves_the_zone(self):
        rules = VolumeRules()
        volume = {"volume_type": "qh2-ssd", "availability_zone": "monash-02"}
        with pytest.raises(RuleViolation, match="different"):
            rules.retype_body(
                volume, TYPES, RetypeRequest(volume_type="qh2-ssd")
            )
        with pytest.raises(RuleViolation, match="monash-02"):
            rules.retype_body(
                {**volume, "volume_type": "standard"},
                TYPES,
                RetypeRequest(volume_type="qh2-ssd"),
            )
        assert rules.retype_body(
            volume, TYPES, RetypeRequest(volume_type="shared")
        ) == {"os-retype": {"new_type": "shared", "migration_policy": "never"}}
        # A type the project cannot see is Cinder's to refuse.
        assert (
            rules.retype_body(
                volume, TYPES, RetypeRequest(volume_type="hidden")
            )["os-retype"]["new_type"]
            == "hidden"
        )


def test_transfer_name_is_not_blank():
    assert validate_transfer_name("to-lab") == "to-lab"
    with pytest.raises(RuleViolation, match="transfer name"):
        validate_transfer_name("  ")


def test_boot_volume_floor_is_the_image_size_or_min_disk():
    rules = VolumeRules()
    assert rules.boot_volume_floor({"size": 3 * 1024**3 + 1}) == 4
    assert rules.boot_volume_floor({"size": 1024**3, "min_disk": 10}) == 10
    assert rules.boot_volume_floor({}) == 1


def test_boot_volume_needs_a_zone_and_room_for_the_image():
    rules = VolumeRules()
    image = {"size": 2 * 1024**3, "min_disk": 10}
    rules.check_boot_volume("melbourne-qh2", 10, image)
    with pytest.raises(RuleViolation, match="availability zone"):
        rules.check_boot_volume(None, 10, image)
    with pytest.raises(RuleViolation, match="at least 10 GB"):
        rules.check_boot_volume("melbourne-qh2", 9, image)
