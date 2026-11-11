from pydantic import ValidationError
import pytest

from hive.schemas.compute import KeypairCreate, LaunchRequest, ServerListQuery


def test_request_models_refuse_unknown_fields():
    with pytest.raises(ValidationError):
        KeypairCreate.model_validate({"name": "k", "publicKey": "ssh-rsa"})


def test_server_list_query_to_nova_params():
    query = ServerListQuery.model_validate(
        {"limit": "20", "changes-since": "2026-10-01", "status": ""}
    )
    # sort_dir only travels with a sort key; empty filters are dropped.
    assert query.nova_params() == {"limit": 20, "changes-since": "2026-10-01"}
    sorted_query = ServerListQuery(sort_key="created_at", sort_dir="asc")
    assert sorted_query.nova_params() == {
        "limit": 50,
        "sort_key": "created_at",
        "sort_dir": "asc",
    }


@pytest.mark.parametrize(
    "bad", [{"limit": 0}, {"limit": 1001}, {"sort_key": "password"}]
)
def test_server_list_query_bounds(bad):
    with pytest.raises(ValidationError):
        ServerListQuery.model_validate(bad)


LAUNCH = {
    "name": "vm",
    "source": {"type": "image", "id": "img"},
    "flavor_id": "f",
    "networks": ["net"],
}


def test_launch_request_without_a_zone_leaves_it_to_nova():
    assert LaunchRequest.model_validate(LAUNCH).availability_zone is None


@pytest.mark.parametrize(
    "bad",
    [
        # A new volume needs its size.
        {"create_volume": True},
        # Only an image or an instance snapshot is copied to a new volume.
        {
            "create_volume": True,
            "volume_size_gb": 20,
            "source": {"type": "volume", "id": "v"},
        },
        # A size without a new volume says nothing.
        {"volume_size_gb": 20},
    ],
)
def test_launch_request_boot_volume_fields(bad):
    with pytest.raises(ValidationError):
        LaunchRequest.model_validate({**LAUNCH, **bad})
