from tests.unit.contracts.reading import fields_read, present

REPLY = {
    "id": "s1",
    "flavor": {"name": "m3.small"},
    "addresses": [{"addr": "10.0.0.1"}, {"addr": "10.0.0.2", "mac": "aa"}],
}


def test_reads_are_logged_at_every_depth():
    def shape(reply):
        return (
            reply.get("id"),
            reply["flavor"].get("name"),
            [a.get("mac") for a in reply.get("addresses")],
            reply.get("missing", "fallback"),
        )

    assert fields_read(shape, REPLY) == {
        "id",
        "flavor",
        "flavor.name",
        "addresses",
        "addresses[].mac",
        "missing",
    }


def test_present_looks_inside_lists():
    assert present(REPLY, "flavor.name")
    assert present(REPLY, "addresses[].mac")
    assert not present(REPLY, "addresses[].type")
    assert not present(REPLY, "missing")
