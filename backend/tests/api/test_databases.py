"""Trove instances, users, databases, backups and configuration groups."""

import json

import httpx
import pytest

from tests.conftest import csrf_headers, SWIFT, TROVE

NOVA = "https://nova.test/v2.1"
NEUTRON = "https://neutron.test"

INSTANCE = {
    "id": "db-1",
    "name": "appdb",
    "status": "HEALTHY",
    "datastore": {"type": "mysql", "version": "8.0"},
    "flavor": {"id": "db3.small"},
    "volume": {"size": 5, "used": 1.5},
    "addresses": [{"type": "private", "address": "10.0.0.7"}],
    "access": {"allowed_cidrs": ["0.0.0.0/0"]},
    "created": "2026-10-01T00:00:00",
}
BUILDING = {
    **INSTANCE,
    "id": "db-2",
    "name": "building",
    "status": "BUILD",
    "configuration": {"id": "cfg-1"},
}
BACKUP = {
    "id": "bk-1",
    "name": "nightly",
    "status": "COMPLETED",
    "instance_id": "db-1",
    "datastore": {"type": "mysql", "version": "8.0"},
    "created": "2026-10-02T00:00:00",
    "locationRef": "swift://backups/bk-1",
}
CONFIG = {
    "id": "cfg-1",
    "name": "tuned",
    "datastore_name": "mysql",
    "datastore_version_name": "8.0",
    "datastore_version_id": "v-80",
    "values": {"max_connections": 200},
}
DATASTORES = [
    {
        "id": "ds-mysql",
        "name": "mysql",
        "versions": [
            {"id": "v-80", "name": "8.0", "active": True},
            {"id": "v-84", "name": "8.4", "active": True},
        ],
    },
    {"id": "ds-pg", "name": "postgresql", "versions": []},
]
FLAVORS = [
    {
        "id": None,
        "str_id": "db3.small",
        "name": "db3.small",
        "ram": 2048,
        "vcpus": 1,
    },
    {
        "id": None,
        "str_id": "db3.medium",
        "name": "db3.medium",
        "ram": 4096,
        "vcpus": 2,
    },
]


def catalog_entry(stype, name, url):
    return {
        "type": stype,
        "name": name,
        "endpoints": [
            {"interface": "public", "region": "Melbourne", "url": url}
        ],
    }


@pytest.fixture
def db_catalog(upstream):
    from tests import conftest

    original = conftest.catalog

    def richer():
        return original() + [catalog_entry("network", "neutron", NEUTRON)]

    conftest.catalog = richer
    conftest.mock_keystone(upstream)
    yield
    conftest.catalog = original


def mock_trove(upstream):
    upstream.get(f"{TROVE}/instances").mock(
        return_value=httpx.Response(
            200, json={"instances": [INSTANCE, BUILDING]}
        )
    )
    for instance in (INSTANCE, BUILDING):
        upstream.get(f"{TROVE}/instances/{instance['id']}").mock(
            return_value=httpx.Response(200, json={"instance": instance})
        )
    upstream.get(f"{TROVE}/flavors").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS})
    )
    upstream.get(f"{TROVE}/datastores/ds-mysql/versions/v-80/flavors").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS})
    )
    upstream.get(f"{TROVE}/datastores").mock(
        return_value=httpx.Response(200, json={"datastores": DATASTORES})
    )
    upstream.get(f"{TROVE}/datastores/ds-pg/versions").mock(
        return_value=httpx.Response(
            200,
            json={"versions": [{"id": "v-16", "name": "16", "active": True}]},
        )
    )
    upstream.get(f"{TROVE}/limits").mock(
        return_value=httpx.Response(
            200,
            json={
                "limits": [
                    {
                        "verb": "ABSOLUTE",
                        "max_instances": 10,
                        "max_backups": 20,
                        "max_volumes": 10,
                        "max_ram": 40960,
                    }
                ]
            },
        )
    )
    upstream.get(f"{TROVE}/backups").mock(
        return_value=httpx.Response(200, json={"backups": [BACKUP]})
    )
    upstream.get(f"{TROVE}/instances/db-1/backups").mock(
        return_value=httpx.Response(200, json={"backups": []})
    )
    upstream.get(f"{TROVE}/backups/bk-1").mock(
        return_value=httpx.Response(200, json={"backup": BACKUP})
    )
    upstream.get(f"{TROVE}/configurations").mock(
        return_value=httpx.Response(200, json={"configurations": [CONFIG]})
    )
    upstream.get(f"{TROVE}/configurations/cfg-1").mock(
        return_value=httpx.Response(200, json={"configuration": CONFIG})
    )
    upstream.get(f"{TROVE}/configurations/cfg-1/instances").mock(
        return_value=httpx.Response(
            200, json={"instances": [{"id": "db-2", "name": "building"}]}
        )
    )
    upstream.get(f"{TROVE}/datastores/mysql/versions/v-80/parameters").mock(
        return_value=httpx.Response(
            200,
            json={
                "configuration-parameters": [
                    {
                        "name": "max_connections",
                        "type": "integer",
                        "min": 1,
                        "max": 100000,
                        "restart_required": False,
                    },
                    {
                        "name": "autocommit",
                        "type": "boolean",
                        "restart_required": False,
                    },
                ]
            },
        )
    )


def mock_pickers(upstream):
    upstream.get(f"{NOVA}/os-availability-zone").mock(
        return_value=httpx.Response(
            200,
            json={
                "availabilityZoneInfo": [
                    {
                        "zoneName": "ardctest-artm",
                        "zoneState": {"available": True},
                    },
                    {"zoneName": "down", "zoneState": {"available": False}},
                ]
            },
        )
    )

    def networks(request):
        params = request.url.params
        if (
            params.get("shared") == "true"
            or params.get("router:external") == "true"
        ):
            return httpx.Response(200, json={"networks": []})
        return httpx.Response(
            200,
            json={
                "networks": [
                    {"id": "net-1", "name": "private", "subnets": ["sub-1"]}
                ]
            },
        )

    upstream.get(f"{NEUTRON}/v2.0/networks").mock(side_effect=networks)
    upstream.get(
        f"{NEUTRON}/v2.0/networks/00000000-0000-0000-0000-000000000000"
    ).mock(
        return_value=httpx.Response(
            404, json={"NeutronError": {"message": "no"}}
        )
    )
    upstream.get(f"{NEUTRON}/v2.0/subnets").mock(
        return_value=httpx.Response(
            200,
            json={
                "subnets": [
                    {
                        "id": "sub-1",
                        "network_id": "net-1",
                        "cidr": "192.168.0.0/24",
                        "ip_version": 4,
                    }
                ]
            },
        )
    )
    # the association list is asked for by ids (by names Trove answers
    # with every Nova flavour)
    upstream.get(f"{TROVE}/datastores/ds-mysql/versions/v-80/flavors").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS[:1]})
    )
    upstream.get(f"{TROVE}/datastores/ds-mysql/versions/v-84/flavors").mock(
        return_value=httpx.Response(
            404, json={"itemNotFound": {"message": "no"}}
        )
    )
    upstream.get(f"{TROVE}/datastores/ds-pg/versions/v-16/flavors").mock(
        return_value=httpx.Response(200, json={"flavors": FLAVORS})
    )


async def test_list_and_detail(logged_in, upstream):
    mock_trove(upstream)
    body = (await logged_in.get("/api/databases/instances")).json()
    assert [i["name"] for i in body["items"]] == ["appdb", "building"]
    appdb = body["items"][0]
    assert (
        appdb["flavor_name"] == "db3.small"
        and appdb["ram"] == 2048
        and appdb["addresses"] == ["10.0.0.7"]
    )
    assert (
        "upgrade" in appdb["actions"] and body["items"][1]["is_transitional"]
    )
    assert body["quota"] == {
        "max_instances": 10,
        "max_backups": 20,
        "max_volumes": 10,
        "max_ram": 40960,
    }

    detail = (await logged_in.get("/api/databases/instances/db-1")).json()
    assert (
        detail["port"] == 3306
        and detail["cidr_warning"]
        and detail["volume_used"] == 1.5
    )
    with_config = (await logged_in.get("/api/databases/instances/db-2")).json()
    assert with_config["configuration"]["name"] == "tuned"

    targets = (
        await logged_in.get("/api/databases/instances/db-1/upgrade-targets")
    ).json()
    assert targets["current"] == "8.0" and [
        t["version"] for t in targets["items"]
    ] == ["8.4"]
    backups = (
        await logged_in.get("/api/databases/instances/db-1/backups")
    ).json()
    assert backups["items"] == []


async def test_options(db_catalog, logged_in, upstream):
    mock_trove(upstream)
    mock_pickers(upstream)
    body = (await logged_in.get("/api/databases/options")).json()
    assert [d["label"] for d in body["datastores"]] == [
        "mysql - 8.0",
        "mysql - 8.4",
        "postgresql - 16",
    ]
    assert [f["id"] for f in body["flavors"]] == ["db3.small", "db3.medium"]
    assert [f["id"] for f in body["flavors_by_version"]["mysql/8.0"]] == [
        "db3.small"
    ]
    assert len(body["flavors_by_version"]["mysql/8.4"]) == 2
    assert body["availability_zones"] == ["ardctest-artm"]
    assert body["networks"] == [
        {"id": "net-1", "name": "private", "classic": False}
    ]
    assert (
        body["configurations"][0]["id"] == "cfg-1"
        and body["backups"][0]["id"] == "bk-1"
    )
    assert body["default_cidr"] == "0.0.0.0/0"


async def test_options_tolerates_configuration_400(
    db_catalog, logged_in, upstream
):
    mock_trove(upstream)
    mock_pickers(upstream)
    upstream.get(f"{TROVE}/configurations").mock(
        return_value=httpx.Response(
            400,
            json={
                "badRequest": {
                    "message": "Datastore version x cannot be found."
                }
            },
        )
    )
    body = (await logged_in.get("/api/databases/options")).json()
    assert body["configurations"] == []
    listing = (await logged_in.get("/api/databases/configurations")).json()
    assert (
        listing["items"] == []
        and listing["datastores"][0]["datastore"] == "mysql"
    )


async def test_launch(logged_in, upstream):
    mock_trove(upstream)
    create = upstream.post(f"{TROVE}/instances").mock(
        return_value=httpx.Response(
            200,
            json={"instance": {**INSTANCE, "id": "db-9", "status": "BUILD"}},
        )
    )
    response = await logged_in.post(
        "/api/databases/instances",
        json={
            "name": "newdb",
            "flavor": "db3.small",
            "volume": 10,
            "datastore": "mysql",
            "version": "8.0",
            "network_id": "net-1",
            "availability_zone": "ardctest-artm",
            "allowed_cidrs": ["10.0.0.0/8"],
            "databases": "app, reports",
            "user": "app",
            "password": "secret",
            "configuration": "cfg-1",
            "backup_id": "bk-1",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert response.json()["id"] == "db-9"
    sent = json.loads(create.calls.last.request.content)["instance"]
    assert sent["nics"] == [{"net-id": "net-1"}] and sent["volume"] == {
        "size": 10
    }
    assert sent["databases"] == [{"name": "app"}, {"name": "reports"}]
    assert sent["users"][0]["name"] == "app" and sent["restorePoint"] == {
        "backupRef": "bk-1"
    }
    assert (
        sent["access"] == {"allowed_cidrs": ["10.0.0.0/8"]}
        and sent["configuration"] == "cfg-1"
    )

    base = {
        "name": "x",
        "flavor": "f",
        "volume": 1,
        "datastore": "mysql",
        "version": "8.0",
        "network_id": "n",
    }
    bad_cidr = await logged_in.post(
        "/api/databases/instances",
        json={**base, "allowed_cidrs": ["nope"]},
        headers=csrf_headers(logged_in),
    )
    assert bad_cidr.status_code == 400
    no_password = await logged_in.post(
        "/api/databases/instances",
        json={
            **base,
            "allowed_cidrs": ["0.0.0.0/0"],
            "user": "u",
            "databases": "d",
        },
        headers=csrf_headers(logged_in),
    )
    assert (
        no_password.status_code == 400
        and "password" in no_password.json()["message"]
    )
    wrong_config = await logged_in.post(
        "/api/databases/instances",
        json={
            **base,
            "version": "8.4",
            "allowed_cidrs": ["0.0.0.0/0"],
            "configuration": "cfg-1",
        },
        headers=csrf_headers(logged_in),
    )
    assert (
        wrong_config.status_code == 400
        and "datastore version" in wrong_config.json()["message"]
    )
    upstream.get(f"{TROVE}/backups/bk-1").mock(
        return_value=httpx.Response(
            200, json={"backup": {**BACKUP, "status": "FAILED"}}
        )
    )
    bad_backup = await logged_in.post(
        "/api/databases/instances",
        json={**base, "allowed_cidrs": ["0.0.0.0/0"], "backup_id": "bk-1"},
        headers=csrf_headers(logged_in),
    )
    assert bad_backup.status_code == 400


async def test_instance_actions(logged_in, upstream):
    mock_trove(upstream)
    update = upstream.put(f"{TROVE}/instances/db-1").mock(
        return_value=httpx.Response(202)
    )
    patch = upstream.patch(f"{TROVE}/instances/db-1").mock(
        return_value=httpx.Response(202)
    )
    action = upstream.post(f"{TROVE}/instances/db-1/action").mock(
        return_value=httpx.Response(202)
    )
    delete = upstream.delete(f"{TROVE}/instances/db-1").mock(
        return_value=httpx.Response(202)
    )
    headers = csrf_headers(logged_in)

    response = await logged_in.patch(
        "/api/databases/instances/db-1",
        json={"name": "renamed", "allowed_cidrs": ["10.0.0.0/8"]},
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(update.calls.last.request.content) == {
        "instance": {
            "name": "renamed",
            "access": {"allowed_cidrs": ["10.0.0.0/8"]},
        }
    }
    bad = await logged_in.patch(
        "/api/databases/instances/db-1",
        json={"allowed_cidrs": ["x"]},
        headers=headers,
    )
    assert bad.status_code == 400
    busy = await logged_in.patch(
        "/api/databases/instances/db-2", json={"name": "x"}, headers=headers
    )
    assert busy.status_code == 409

    grow = await logged_in.post(
        "/api/databases/instances/db-1/resize-volume",
        json={"size": 8},
        headers=headers,
    )
    assert grow.status_code == 202
    assert json.loads(action.calls.last.request.content) == {
        "resize": {"volume": {"size": 8}}
    }
    small = await logged_in.post(
        "/api/databases/instances/db-1/resize-volume",
        json={"size": 5},
        headers=headers,
    )
    assert small.status_code == 400
    busy = await logged_in.post(
        "/api/databases/instances/db-2/resize-volume",
        json={"size": 9},
        headers=headers,
    )
    assert busy.status_code == 409

    resize = await logged_in.post(
        "/api/databases/instances/db-1/resize",
        json={"flavor": "db3.medium"},
        headers=headers,
    )
    assert resize.status_code == 202
    assert json.loads(action.calls.last.request.content) == {
        "resize": {"flavorRef": "db3.medium"}
    }
    same = await logged_in.post(
        "/api/databases/instances/db-1/resize",
        json={"flavor": "db3.small"},
        headers=headers,
    )
    assert same.status_code == 400
    busy = await logged_in.post(
        "/api/databases/instances/db-2/resize",
        json={"flavor": "db3.medium"},
        headers=headers,
    )
    assert busy.status_code == 409

    upgrade = await logged_in.post(
        "/api/databases/instances/db-1/upgrade",
        json={"version_id": "v-84"},
        headers=headers,
    )
    assert upgrade.status_code == 202
    assert json.loads(patch.calls.last.request.content) == {
        "instance": {"datastore_version": "v-84"}
    }
    busy = await logged_in.post(
        "/api/databases/instances/db-2/upgrade",
        json={"version_id": "v-84"},
        headers=headers,
    )
    assert busy.status_code == 409

    restart = await logged_in.post(
        "/api/databases/instances/db-1/restart", headers=headers
    )
    assert restart.status_code == 202 and json.loads(
        action.calls.last.request.content
    ) == {"restart": {}}
    busy = await logged_in.post(
        "/api/databases/instances/db-2/restart", headers=headers
    )
    assert busy.status_code == 409

    attach = await logged_in.post(
        "/api/databases/instances/db-1/configuration",
        json={"configuration_id": "cfg-1"},
        headers=headers,
    )
    assert attach.status_code == 202
    assert json.loads(update.calls.last.request.content) == {
        "instance": {"configuration": "cfg-1"}
    }
    detach_none = await logged_in.delete(
        "/api/databases/instances/db-1/configuration", headers=headers
    )
    assert detach_none.status_code == 409
    upstream.get(f"{TROVE}/instances/db-2").mock(
        return_value=httpx.Response(
            200, json={"instance": {**BUILDING, "status": "ACTIVE"}}
        )
    )
    update2 = upstream.put(f"{TROVE}/instances/db-2").mock(
        return_value=httpx.Response(202)
    )
    attach_again = await logged_in.post(
        "/api/databases/instances/db-2/configuration",
        json={"configuration_id": "cfg-1"},
        headers=headers,
    )
    assert attach_again.status_code == 409
    detach = await logged_in.delete(
        "/api/databases/instances/db-2/configuration", headers=headers
    )
    assert detach.status_code == 202
    assert json.loads(update2.calls.last.request.content) == {
        "instance": {"configuration": None}
    }

    response = await logged_in.delete(
        "/api/databases/instances/db-1", headers=headers
    )
    assert response.status_code == 204 and delete.called


async def test_root_users_databases(logged_in, upstream):
    mock_trove(upstream)
    headers = csrf_headers(logged_in)
    upstream.get(f"{TROVE}/instances/db-1/root").mock(
        return_value=httpx.Response(200, json={"rootEnabled": False})
    )
    status = (await logged_in.get("/api/databases/instances/db-1/root")).json()
    assert status == {"id": "db-1", "root_enabled": False}
    upstream.post(f"{TROVE}/instances/db-1/root").mock(
        return_value=httpx.Response(
            200, json={"user": {"name": "root", "password": "generated"}}
        )
    )
    enabled = (
        await logged_in.post(
            "/api/databases/instances/db-1/root", headers=headers
        )
    ).json()
    assert enabled["password"] == "generated"
    busy = await logged_in.post(
        "/api/databases/instances/db-2/root", headers=headers
    )
    assert busy.status_code == 409

    upstream.get(f"{TROVE}/instances/db-1/users").mock(
        return_value=httpx.Response(
            200,
            json={
                "users": [
                    {
                        "name": "app",
                        "host": "%",
                        "databases": [{"name": "app"}],
                    }
                ]
            },
        )
    )
    users = (await logged_in.get("/api/databases/instances/db-1/users")).json()
    assert users["items"] == [
        {"name": "app", "host": "%", "databases": ["app"]}
    ]
    create_user = upstream.post(f"{TROVE}/instances/db-1/users").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.post(
        "/api/databases/instances/db-1/users",
        json={
            "name": "bob",
            "password": "pw",
            "host": "10.0.0.5",
            "databases": ["app"],
        },
        headers=headers,
    )
    assert response.status_code == 202
    assert json.loads(create_user.calls.last.request.content) == {
        "users": [
            {
                "name": "bob",
                "password": "pw",
                "host": "10.0.0.5",
                "databases": [{"name": "app"}],
            }
        ]
    }
    delete_user = upstream.delete(
        f"{TROVE}/instances/db-1/users/bob@10%2e0%2e0%2e5"
    ).mock(return_value=httpx.Response(202))
    response = await logged_in.delete(
        "/api/databases/instances/db-1/users/bob?host=10.0.0.5",
        headers=headers,
    )
    assert response.status_code == 204 and delete_user.called

    upstream.get(f"{TROVE}/instances/db-1/users/app/databases").mock(
        return_value=httpx.Response(200, json={"databases": [{"name": "app"}]})
    )
    upstream.get(f"{TROVE}/instances/db-1/databases").mock(
        return_value=httpx.Response(
            200, json={"databases": [{"name": "app"}, {"name": "reports"}]}
        )
    )
    access = (
        await logged_in.get("/api/databases/instances/db-1/users/app/access")
    ).json()
    assert access["items"] == [
        {"name": "app", "granted": True},
        {"name": "reports", "granted": False},
    ]
    grant = upstream.put(f"{TROVE}/instances/db-1/users/app/databases").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.put(
        "/api/databases/instances/db-1/users/app/access",
        json={"databases": ["reports"]},
        headers=headers,
    )
    assert response.status_code == 202
    assert json.loads(grant.calls.last.request.content) == {
        "databases": [{"name": "reports"}]
    }
    revoke = upstream.delete(
        f"{TROVE}/instances/db-1/users/app/databases/reports"
    ).mock(return_value=httpx.Response(202))
    response = await logged_in.delete(
        "/api/databases/instances/db-1/users/app/access/reports",
        headers=headers,
    )
    assert response.status_code == 204 and revoke.called

    databases = (
        await logged_in.get("/api/databases/instances/db-1/databases")
    ).json()
    assert databases["items"] == [{"name": "app"}, {"name": "reports"}]
    create_db = upstream.post(f"{TROVE}/instances/db-1/databases").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.post(
        "/api/databases/instances/db-1/databases",
        json={
            "name": "new",
            "character_set": "utf8mb4",
            "collate": "utf8mb4_general_ci",
        },
        headers=headers,
    )
    assert response.status_code == 202
    assert json.loads(create_db.calls.last.request.content) == {
        "databases": [
            {
                "name": "new",
                "character_set": "utf8mb4",
                "collate": "utf8mb4_general_ci",
            }
        ]
    }
    delete_db = upstream.delete(f"{TROVE}/instances/db-1/databases/new").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/databases/instances/db-1/databases/new", headers=headers
    )
    assert response.status_code == 204 and delete_db.called


async def test_backups(logged_in, upstream):
    mock_trove(upstream)
    headers = csrf_headers(logged_in)
    body = (await logged_in.get("/api/databases/backups")).json()
    assert (
        body["items"][0]["instance_name"] == "appdb"
        and body["items"][0]["can_restore"]
    )
    assert body["instances"] == [{"id": "db-1", "name": "appdb"}]
    detail = (await logged_in.get("/api/databases/backups/bk-1")).json()
    assert (
        detail["instance_name"] == "appdb"
        and detail["instance_status"] == "HEALTHY"
    )

    create = upstream.post(f"{TROVE}/backups").mock(
        return_value=httpx.Response(
            202,
            json={
                "backup": {
                    **BACKUP,
                    "id": "bk-2",
                    "status": "NEW",
                    "parent_id": "bk-1",
                }
            },
        )
    )
    response = await logged_in.post(
        "/api/databases/backups",
        json={
            "name": "incr",
            "instance_id": "db-1",
            "description": "d",
            "parent_id": "bk-1",
        },
        headers=headers,
    )
    assert response.status_code == 202 and response.json()["incremental"]
    assert json.loads(create.calls.last.request.content) == {
        "backup": {
            "name": "incr",
            "instance": "db-1",
            "incremental": 1,
            "description": "d",
            "parent_id": "bk-1",
        }
    }
    busy = await logged_in.post(
        "/api/databases/backups",
        json={"name": "x", "instance_id": "db-2"},
        headers=headers,
    )
    assert busy.status_code == 409
    upstream.get(f"{TROVE}/backups/bk-1").mock(
        return_value=httpx.Response(
            200, json={"backup": {**BACKUP, "status": "SAVING"}}
        )
    )
    bad_parent = await logged_in.post(
        "/api/databases/backups",
        json={"name": "x", "instance_id": "db-1", "parent_id": "bk-1"},
        headers=headers,
    )
    assert bad_parent.status_code == 400
    delete = upstream.delete(f"{TROVE}/backups/bk-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/databases/backups/bk-1", headers=headers
    )
    assert response.status_code == 204 and delete.called


async def test_backup_detail_tolerates_missing_links(logged_in, upstream):
    mock_trove(upstream)
    upstream.get(f"{TROVE}/backups/bk-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "backup": {
                    **BACKUP,
                    "instance_id": "gone",
                    "parent_id": "bk-0",
                }
            },
        )
    )
    upstream.get(f"{TROVE}/instances/gone").mock(
        return_value=httpx.Response(404, json={"itemNotFound": {}})
    )
    upstream.get(f"{TROVE}/backups/bk-0").mock(
        return_value=httpx.Response(404, json={"itemNotFound": {}})
    )
    detail = (await logged_in.get("/api/databases/backups/bk-1")).json()
    assert detail["instance_name"] is None and "parent_name" not in detail


async def test_configurations(logged_in, upstream):
    mock_trove(upstream)
    headers = csrf_headers(logged_in)
    body = (await logged_in.get("/api/databases/configurations")).json()
    assert body["items"][0]["name"] == "tuned" and len(body["datastores"]) == 3
    detail = (
        await logged_in.get("/api/databases/configurations/cfg-1")
    ).json()
    assert detail["instances"] == [{"id": "db-2", "name": "building"}]
    assert [p["name"] for p in detail["parameters"]] == [
        "autocommit",
        "max_connections",
    ]

    create = upstream.post(f"{TROVE}/configurations").mock(
        return_value=httpx.Response(
            200,
            json={"configuration": {**CONFIG, "id": "cfg-2", "name": "new"}},
        )
    )
    response = await logged_in.post(
        "/api/databases/configurations",
        json={
            "name": "new",
            "datastore": "mysql",
            "version": "8.0",
            "description": "d",
        },
        headers=headers,
    )
    assert response.status_code == 201 and response.json()["id"] == "cfg-2"
    assert json.loads(create.calls.last.request.content) == {
        "configuration": {
            "name": "new",
            "values": {},
            "datastore": {"type": "mysql", "version": "8.0"},
            "description": "d",
        }
    }

    update = upstream.put(f"{TROVE}/configurations/cfg-1").mock(
        return_value=httpx.Response(200)
    )
    response = await logged_in.put(
        "/api/databases/configurations/cfg-1/values",
        json={"values": {"max_connections": "500", "autocommit": "true"}},
        headers=headers,
    )
    assert response.status_code == 200 and response.json()["values"] == {
        "max_connections": 500,
        "autocommit": True,
    }
    assert json.loads(update.calls.last.request.content) == {
        "configuration": {
            "values": {"max_connections": 500, "autocommit": True}
        }
    }
    unknown = await logged_in.put(
        "/api/databases/configurations/cfg-1/values",
        json={"values": {"nope": "1"}},
        headers=headers,
    )
    assert unknown.status_code == 400
    out_of_range = await logged_in.put(
        "/api/databases/configurations/cfg-1/values",
        json={"values": {"max_connections": "0"}},
        headers=headers,
    )
    assert out_of_range.status_code == 400

    upstream.get(f"{TROVE}/datastores/mysql/versions/v-80/parameters").mock(
        return_value=httpx.Response(500, json={})
    )
    no_specs = (
        await logged_in.get("/api/databases/configurations/cfg-1")
    ).json()
    assert no_specs["parameters"] == []
    rejected = await logged_in.put(
        "/api/databases/configurations/cfg-1/values",
        json={"values": {"max_connections": "1"}},
        headers=headers,
    )
    assert rejected.status_code == 400

    delete = upstream.delete(f"{TROVE}/configurations/cfg-1").mock(
        return_value=httpx.Response(202)
    )
    response = await logged_in.delete(
        "/api/databases/configurations/cfg-1", headers=headers
    )
    assert response.status_code == 204 and delete.called


async def test_resize_flavors_follow_the_datastore_version(
    logged_in, upstream
):
    mock_trove(upstream)
    headers = csrf_headers(logged_in)
    upstream.get(f"{TROVE}/datastores/ds-mysql/versions/v-80/flavors").mock(
        return_value=httpx.Response(
            200,
            json={
                "flavors": FLAVORS
                + [
                    {
                        "id": None,
                        "str_id": "db3.large",
                        "name": "db3.large",
                        "ram": 8192,
                        "vcpus": 4,
                    }
                ]
            },
        )
    )
    body = (
        await logged_in.get("/api/databases/instances/db-1/resize-flavors")
    ).json()
    assert (
        body["current"] == "db3.small" and body["datastore_version"] == "8.0"
    )
    assert [f["id"] for f in body["items"]] == ["db3.medium", "db3.large"]

    action = upstream.post(f"{TROVE}/instances/db-1/action").mock(
        return_value=httpx.Response(202)
    )
    rejected = await logged_in.post(
        "/api/databases/instances/db-1/resize",
        json={"flavor": "m3.huge"},
        headers=headers,
    )
    assert (
        rejected.status_code == 400
        and "not available for mysql 8.0" in rejected.json()["message"]
    )
    assert not action.called
    accepted = await logged_in.post(
        "/api/databases/instances/db-1/resize",
        json={"flavor": "db3.large"},
        headers=headers,
    )
    assert accepted.status_code == 202
    assert json.loads(action.calls.last.request.content) == {
        "resize": {"flavorRef": "db3.large"}
    }

    # an instance on a version Trove no longer lists falls back to the plain list
    upstream.get(f"{TROVE}/instances/db-1").mock(
        return_value=httpx.Response(
            200,
            json={
                "instance": {
                    **INSTANCE,
                    "datastore": {"type": "mysql", "version": "5.7"},
                }
            },
        )
    )
    body = (
        await logged_in.get("/api/databases/instances/db-1/resize-flavors")
    ).json()
    assert [f["id"] for f in body["items"]] == ["db3.medium"]


async def test_configuration_defaults(logged_in, upstream):
    mock_trove(upstream)
    upstream.get(f"{TROVE}/instances/db-1/configuration").mock(
        return_value=httpx.Response(
            200,
            json={
                "instance": {
                    "configuration": {
                        "port": 3306,
                        "basedir": "/usr",
                        "autocommit": 1,
                    }
                }
            },
        )
    )
    body = (
        await logged_in.get(
            "/api/databases/instances/db-1/configuration-defaults"
        )
    ).json()
    assert body["items"] == [
        {"name": "autocommit", "value": 1},
        {"name": "basedir", "value": "/usr"},
        {"name": "port", "value": 3306},
    ]


LOG = {
    "name": "general",
    "type": "USER",
    "status": "Published",
    "published": 120,
    "pending": 0,
    "container": "database_logs",
    "prefix": "db-1/mysql-general",
    "metafile": "db-1/mysql-general_metafile",
}
SYS_LOG = {
    "name": "error",
    "type": "SYS",
    "status": "Disabled",
    "published": 0,
    "pending": 0,
    "container": "None",
    "prefix": "None",
    "metafile": "db-1/mysql-error_metafile",
}


async def test_logs(logged_in, upstream):
    mock_trove(upstream)
    headers = csrf_headers(logged_in)
    upstream.get(f"{TROVE}/instances/db-1/log").mock(
        return_value=httpx.Response(200, json={"logs": [SYS_LOG, LOG]})
    )
    body = (await logged_in.get("/api/databases/instances/db-1/logs")).json()
    assert [log["name"] for log in body["items"]] == ["error", "general"]
    general, error = body["items"][1], body["items"][0]
    assert general["actions"] == [
        "view",
        "publish",
        "enable",
        "disable",
        "discard",
    ]
    assert (
        general["status_kind"] == "ok"
        and general["container"] == "database_logs"
    )
    assert error["actions"] == ["publish", "enable", "discard"]
    assert (
        error["container"] is None
        and error["prefix"] is None
        and error["status_kind"] == "unknown"
    )

    action = upstream.post(f"{TROVE}/instances/db-1/log").mock(
        return_value=httpx.Response(200, json={"log": LOG})
    )
    response = await logged_in.post(
        "/api/databases/instances/db-1/logs/general/actions/publish",
        headers=headers,
    )
    assert response.status_code == 200 and response.json()["name"] == "general"
    assert json.loads(action.calls.last.request.content) == {
        "name": "general",
        "publish": 1,
    }
    bad = await logged_in.post(
        "/api/databases/instances/db-1/logs/general/actions/explode",
        headers=headers,
    )
    assert bad.status_code == 400

    # contents: two published parts plus the metafile, newest part last
    upstream.get(f"{SWIFT}/database_logs").mock(
        return_value=httpx.Response(
            200,
            json=[
                {
                    "name": "db-1/mysql-general-2",
                    "last_modified": "2026-10-02T00:00:00",
                },
                {
                    "name": "db-1/mysql-general_metafile",
                    "last_modified": "2026-10-02T00:00:01",
                },
                {
                    "name": "db-1/mysql-general-1",
                    "last_modified": "2026-10-01T00:00:00",
                },
            ],
        )
    )
    upstream.head(f"{SWIFT}/database_logs/db-1/mysql-general-1").mock(
        return_value=httpx.Response(200, headers={"x-object-meta-lines": "3"})
    )
    upstream.head(f"{SWIFT}/database_logs/db-1/mysql-general-2").mock(
        return_value=httpx.Response(200, headers={"x-object-meta-lines": "2"})
    )
    upstream.get(f"{SWIFT}/database_logs/db-1/mysql-general-1").mock(
        return_value=httpx.Response(200, content=b"a\nb\nc\n")
    )
    upstream.get(f"{SWIFT}/database_logs/db-1/mysql-general-2").mock(
        return_value=httpx.Response(200, content=b"d\ne\n")
    )
    tail = (
        await logged_in.get(
            "/api/databases/instances/db-1/logs/general/contents?lines=3"
        )
    ).json()
    assert (
        tail["text"] == "c\nd\ne\n"
        and tail["partial"] is True
        and tail["parts"] == 2
    )
    newest = (
        await logged_in.get(
            "/api/databases/instances/db-1/logs/general/contents?lines=2"
        )
    ).json()
    assert newest["text"] == "d\ne\n" and newest["partial"] is True
    everything = (
        await logged_in.get(
            "/api/databases/instances/db-1/logs/general/contents?lines=0"
        )
    ).json()
    assert (
        everything["text"] == "a\nb\nc\nd\ne\n"
        and everything["partial"] is False
    )
    plenty = (
        await logged_in.get(
            "/api/databases/instances/db-1/logs/general/contents?lines=50"
        )
    ).json()
    assert plenty["text"] == "a\nb\nc\nd\ne\n" and plenty["partial"] is False

    download = await logged_in.get(
        "/api/databases/instances/db-1/logs/general/download"
    )
    assert download.status_code == 200 and download.text == "a\nb\nc\nd\ne\n"
    assert (
        download.headers["content-disposition"]
        == 'attachment; filename="db-1-general.log"'
    )

    upstream.get(f"{SWIFT}/database_logs/db-1/mysql-general-2").mock(
        return_value=httpx.Response(404)
    )
    missing = await logged_in.get(
        "/api/databases/instances/db-1/logs/general/contents?lines=0"
    )
    assert missing.status_code == 404

    upstream.post(f"{TROVE}/instances/db-1/log").mock(
        return_value=httpx.Response(200, json={"log": SYS_LOG})
    )
    unpublished = await logged_in.get(
        "/api/databases/instances/db-1/logs/error/contents"
    )
    assert unpublished.status_code == 409
