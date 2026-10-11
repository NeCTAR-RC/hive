"""The fields Hive depends on from Horizon's /rest_api/ allocation API.

Until the nectar-dashboard change that lets a project-scoped token read its
own project's allocations lands on rctest, the "visible to a member" test
is expected to fail for users who are not the allocation contact.
"""

import pytest

from hive.clients.nectar import AllocationsClient
from hive.nectar import allocation as rules

pytestmark = pytest.mark.contract

REQUIRED = {
    "id",
    "project_id",
    "project_name",
    "status",
    "start_date",
    "end_date",
    "quotas",
}


async def test_allocation_fields(live_app, live_client, unscoped_token):
    response = await live_client.post(
        "/auth/websso/",
        data={"token": unscoped_token},
        follow_redirects=False,
    )
    assert response.status_code == 303
    store = live_app.state.session_store
    sid = store.unsign(live_client.cookies["hive_session"])
    data, _ = await store.load(sid)
    scoped = data.current
    client = AllocationsClient(
        live_app.state.http, live_app.state.settings, scoped
    )
    rows = await client.allocations(
        project_id=scoped.project.id, status=rules.APPROVED
    )
    if not rows:
        pytest.xfail(
            "no allocation visible to this token: either the project has "
            "none or the project-scoped read change is not deployed"
        )
    allocation = rows[0]
    missing = REQUIRED - set(allocation)
    assert not missing, f"allocation payload lacks {missing}"
    for quota in allocation["quotas"]:
        assert {"zone", "resource", "quota"} <= set(quota)
    assert allocation["project_id"] == scoped.project.id
