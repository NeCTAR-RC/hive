import pytest

from hive.nectar import dns
from hive.nectar.violation import RuleViolation


def test_a_complete_zone_passes():
    dns.validate_zone("example.com.", "a@b.co", 3600, "PRIMARY", None)


@pytest.mark.parametrize(
    ("name", "email", "ttl", "ztype", "masters", "says"),
    [
        ("example.com", "a@b.co", None, "PRIMARY", None, "dot"),
        ("example.com.", "nope", None, "PRIMARY", None, "email"),
        ("example.com.", "a@b.co", -1, "PRIMARY", None, "negative"),
        ("example.com.", "a@b.co", None, "SECONDARY", [], "master"),
        ("example.com.", "a@b.co", None, "WEIRD", None, "PRIMARY"),
    ],
)
def test_zones_that_break_the_rules(name, email, ttl, ztype, masters, says):
    with pytest.raises(RuleViolation, match=says):
        dns.validate_zone(name, email, ttl, ztype, masters)


def test_a_label_cannot_start_with_a_dash():
    with pytest.raises(RuleViolation, match="not a valid domain name"):
        dns.validate_fqdn("-bad.com.")


def test_a_secondary_zone_body_carries_its_masters():
    body = dns.zone_body(
        "example.com.", "a@b.co", 300, "d", "SECONDARY", ["1.2.3.4"]
    )
    assert body == {
        "name": "example.com.",
        "email": "a@b.co",
        "type": "SECONDARY",
        "ttl": 300,
        "description": "d",
        "masters": ["1.2.3.4"],
    }


def test_a_primary_zone_body_has_no_masters():
    body = dns.zone_body("example.com.", "a@b.co", None, None, "PRIMARY", None)
    assert "masters" not in body


@pytest.mark.parametrize(
    "rtype, record, ok",
    [
        ("A", "10.0.0.1", True),
        ("A", "::1", False),
        ("AAAA", "2001:db8::1", True),
        ("AAAA", "10.0.0.1", False),
        ("CNAME", "www.example.com.", True),
        ("CNAME", "www.example.com", False),
        ("MX", "10 mail.example.com.", True),
        ("MX", "mail.example.com.", False),
        ("SRV", "10 5 5060 sip.example.com.", True),
        ("SRV", "10 5 sip.example.com.", False),
        ("TXT", "anything goes", True),
        ("SSHFP", "1 1 abcdef", True),
        ("SSHFP", "x 1 abcdef", False),
        ("CAA", '0 issue "letsencrypt.org"', True),
        ("CAA", "issue", False),
        ("PTR", "host.example.com.", True),
        ("NS", "", False),
    ],
)
def test_record_validation(rtype, record, ok):
    if ok:
        dns.validate_record(rtype, record)
        return
    with pytest.raises(RuleViolation):
        dns.validate_record(rtype, record)


ZONE = "example.com."


def test_a_complete_recordset_passes():
    dns.validate_recordset(ZONE, "www.example.com.", "A", ["10.0.0.1"], 300)


@pytest.mark.parametrize(
    ("name", "rtype", "records", "ttl", "says"),
    [
        ("www.other.com.", "A", ["10.0.0.1"], None, "zone name"),
        ("a.example.com.", "CNAME", ["x.", "y."], None, "one record"),
        ("a.example.com.", "SOA", ["x"], None, "supported"),
        ("a.example.com.", "A", [], None, "at least one"),
        ("a.example.com.", "A", ["10.0.0.1"], -5, "negative"),
        ("a.example.com.", "A", ["::1"], None, "IPv4"),
    ],
)
def test_recordsets_that_break_the_rules(name, rtype, records, ttl, says):
    with pytest.raises(RuleViolation, match=says):
        dns.validate_recordset(ZONE, name, rtype, records, ttl)


def test_recordset_names_bodies_and_summaries():
    zone = "example.com."
    assert dns.recordset_name(zone, "www") == "www.example.com."
    assert dns.recordset_name(zone, "www.example.com.") == "www.example.com."
    assert dns.recordset_name(zone, '') == zone
    assert dns.recordset_name(zone, '@') == zone
    assert dns.quote_txt(['v=spf1 -all', '"already"', 'say "hi"']) == [
        '"v=spf1 -all"',
        '"already"',
        '"say \\"hi\\""',
    ]
    assert not dns.can_edit_recordset({"type": "SOA", "name": zone}, zone)
    assert not dns.can_edit_recordset({"type": "NS", "name": zone}, zone)
    assert dns.can_edit_recordset(
        {"type": "NS", "name": "sub.example.com."}, zone
    )
    assert dns.can_edit_recordset(
        {"type": "A", "name": "www.example.com."}, zone
    )
    summary = dns.recordset_summary(
        {
            "id": "r",
            "type": "A",
            "name": "www.example.com.",
            "status": "PENDING",
        },
        zone,
    )
    assert summary['is_transitional']
    assert summary['can_edit']
    body = dns.recordset_body(
        "www.example.com.", "A", [" 10.0.0.1 ", ""], 60, "d"
    )
    assert body == {
        "name": "www.example.com.",
        "type": "A",
        "records": ["10.0.0.1"],
        "ttl": 60,
        "description": "d",
    }
    zone_summary = dns.zone_summary(
        {"id": "z", "name": zone, "status": "ACTIVE", "action": "NONE"}
    )
    assert not zone_summary['is_transitional']
    assert zone_summary['masters'] == []


def test_in_zone_is_the_apex_or_below_it():
    assert dns.in_zone("example.com.", "example.com.")
    assert dns.in_zone("www.example.com.", "example.com.")
    assert not dns.in_zone("notexample.com.", "example.com.")
