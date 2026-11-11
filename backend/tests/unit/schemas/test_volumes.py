from hive.schemas.volumes import VolumeListQuery


def test_volume_list_query_to_cinder_params():
    query = VolumeListQuery(status="in-use", name="")
    assert query.cinder_params() == {"status": "in-use"}
