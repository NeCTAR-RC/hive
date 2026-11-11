import pytest

from hive.observability.request_id import OPENSTACK_ID, request_ids


def test_a_generated_id_serves_both_purposes():
    request_id, global_id = request_ids(None)
    assert request_id == global_id
    assert OPENSTACK_ID.fullmatch(request_id)


OS_ID = "req-0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b"


def test_an_openstack_shaped_inbound_id_is_passed_on():
    assert request_ids(OS_ID) == (OS_ID, OS_ID)


def test_a_plain_inbound_id_is_kept_and_openstack_gets_its_own():
    request_id, global_id = request_ids("ingress.abc-123_4")
    assert request_id == "ingress.abc-123_4"
    assert OPENSTACK_ID.fullmatch(global_id)


@pytest.mark.parametrize(
    "inbound",
    ["a" * 65, "abc\ninjected", "abc def", "abc\n", "<script>", ""],
)
def test_unsafe_inbound_ids_are_replaced(inbound):
    request_id, global_id = request_ids(inbound)
    assert request_id != inbound
    assert OPENSTACK_ID.fullmatch(request_id)
    assert global_id == request_id
