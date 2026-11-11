from hive.nectar import members


def test_member_rows_keep_only_member_and_tenantmanager():
    assignments = [
        {
            "user": {"id": "u1", "name": "me"},
            "role": {"id": "r1", "name": "Member"},
        },
        {
            "user": {"id": "u2", "name": "ann"},
            "role": {"id": "r2", "name": "tenantmanager"},
        },
        {
            "user": {"id": "u3", "name": "bot"},
            "role": {"id": "r9", "name": "reservation_bot"},
        },
        {"group": {"id": "g1"}, "role": {"id": "r1", "name": "member"}},
    ]
    rows = members.member_rows(assignments, "u1")
    assert [r["id"] for r in rows] == ["u2-r2", "u1-r1"]
    assert rows[1]['is_self'] is True
    assert rows[1]['can_remove'] is False
    assert rows[0]["can_remove"] is True
    assert rows[0]["role_name"] == "tenantmanager"


def test_role_choices_skip_unconfigured_roles():
    assert members.role_choices(None, "tm") == [
        {"id": "tm", "name": "tenantmanager"}
    ]
    choices = members.role_choices("m", "tm")
    assert members.removable_role("m", choices)
    assert not members.removable_role("other", choices)
