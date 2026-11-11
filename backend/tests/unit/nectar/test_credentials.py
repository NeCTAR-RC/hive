from datetime import date, datetime, UTC

import pytest

from hive.nectar import credentials


def test_default_expiry_adds_three_months_and_clamps_the_day():
    assert (
        credentials.default_expiry(datetime(2026, 11, 30, tzinfo=UTC))
        == "2027-02-28"
    )
    assert (
        credentials.default_expiry(datetime(2026, 1, 31, tzinfo=UTC), 1)
        == "2026-02-28"
    )
    assert (
        credentials.default_expiry(datetime(2026, 10, 10, tzinfo=UTC))
        == "2027-01-10"
    )


def test_expires_at_follows_horizon_rules():
    today = date(2026, 10, 10)
    assert credentials.expires_at(None, None, today) is None
    assert (
        credentials.expires_at("2027-01-10", None, today)
        == "2027-01-10T00:00:00.000000Z"
    )
    assert (
        credentials.expires_at("2027-01-10", "14:30", today)
        == "2027-01-10T14:30:00.000000Z"
    )
    assert (
        credentials.expires_at(None, "09:00", today)
        == "2026-10-10T09:00:00.000000Z"
    )


def test_application_credential_body():
    body = credentials.application_credential_body(
        name="deploy",
        description="",
        secret=None,
        expiration_date="2027-01-10",
        expiration_time=None,
        roles=["member", ""],
        access_rules='[{"service": "compute", "method": "GET", "path": "/v2.1/servers"}]',
        unrestricted=False,
    )
    assert body == {
        "name": "deploy",
        "unrestricted": False,
        "expires_at": "2027-01-10T00:00:00.000000Z",
        "roles": [{"name": "member"}],
        "access_rules": [
            {"service": "compute", "method": "GET", "path": "/v2.1/servers"}
        ],
    }
    with pytest.raises(ValueError):
        credentials.parse_access_rules("not json")
    with pytest.raises(ValueError):
        credentials.parse_access_rules('{"service": "compute"}')
    assert credentials.parse_access_rules("  ") is None


def test_ec2_for_project():
    creds = [
        {"tenant_id": "p1", "access": "a"},
        {"tenant_id": "p2", "access": "b"},
    ]
    assert credentials.ec2_for_project(creds, "p2")["access"] == "b"
    assert credentials.ec2_for_project(creds, "p3") is None
