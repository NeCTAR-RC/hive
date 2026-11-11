"""Kubernetes clusters, node groups, upgrades and cluster config."""

import json

import httpx

from tests.conftest import csrf_headers, MAGNUM, NOVA
from tests.fixtures.loader import fixture


TEMPLATE = fixture("magnum", "template")
TARGET = {
    **TEMPLATE,
    "uuid": "t-134",
    "name": "kubernetes-v1.34.0-ardctest-artm-calico-v1",
    "labels": {"availability_zone": "ardctest-artm"},
}
SINGLE = {
    **TEMPLATE,
    "uuid": "t-single",
    "name": "kubernetes-v1.33.4-aucklandtest-calico-v2",
    "master_lb_enabled": False,
    "labels": {"availability_zone": "aucklandtest"},
}
CLUSTER = fixture("magnum", "cluster")
NODEGROUPS = fixture("magnum", "nodegroups")


def mock_magnum(upstream, cluster=None):
    cluster = cluster or CLUSTER
    upstream.get(f"{MAGNUM}/clustertemplates/detail").mock(
        return_value=httpx.Response(
            200, json={"clustertemplates": [TEMPLATE, TARGET, SINGLE]}
        )
    )
    for template in (TEMPLATE, TARGET, SINGLE):
        upstream.get(f"{MAGNUM}/clustertemplates/{template['uuid']}").mock(
            return_value=httpx.Response(200, json=template)
        )
    upstream.get(f"{MAGNUM}/clusters/detail").mock(
        return_value=httpx.Response(200, json={"clusters": [cluster]})
    )
    upstream.get(f"{MAGNUM}/clusters/c-1").mock(
        return_value=httpx.Response(200, json=cluster)
    )
    upstream.get(f"{MAGNUM}/quotas/p1/Cluster").mock(
        return_value=httpx.Response(200, json={"hard_limit": 10})
    )
    upstream.get(f"{MAGNUM}/stats").mock(
        return_value=httpx.Response(200, json={"clusters": 1, "nodes": 3})
    )
    upstream.get(f"{NOVA}/flavors/detail").mock(
        return_value=httpx.Response(
            200,
            json={
                "flavors": [
                    {
                        "id": "f1",
                        "name": "m3.small",
                        "vcpus": 2,
                        "ram": 4096,
                        "disk": 30,
                    },
                    {
                        "id": "f2",
                        "name": "m3.medium",
                        "vcpus": 4,
                        "ram": 8192,
                        "disk": 30,
                    },
                ]
            },
        )
    )
    upstream.get(f"{MAGNUM}/clusters/c-1/nodegroups").mock(
        return_value=httpx.Response(200, json={"nodegroups": NODEGROUPS})
    )
    for group in NODEGROUPS:
        upstream.get(f"{MAGNUM}/clusters/c-1/nodegroups/{group['uuid']}").mock(
            return_value=httpx.Response(
                200,
                json={
                    **group,
                    "node_count": 1,
                    "flavor_id": "m3.small",
                    "labels": {},
                    "node_labels": {"tier": "gpu"}
                    if group["uuid"] == "ng-gpu"
                    else {},
                },
            )
        )


async def test_list_clusters_and_options(logged_in, upstream):
    mock_magnum(upstream)
    body = (await logged_in.get("/api/kubernetes/clusters")).json()
    assert body["quota"] == {"clusters": 1, "nodes": 3, "hard_limit": 10}
    item = body["items"][0]
    assert item["template_name"] == TEMPLATE["name"]
    assert item["network_driver"] == "calico"
    assert 'upgrade' in item['actions']
    assert 'nodegroups' in item['actions']
    sent = upstream.calls.last.request.headers.get("openstack-api-version")
    assert sent == "container-infra 1.14"

    options = (await logged_in.get("/api/kubernetes/clusters/options")).json()
    assert options["versions"] == ["1.34.0", "1.33.4"]
    assert options["availability_zones"] == ["ardctest-artm", "aucklandtest"]
    assert options["control_plane_sizes"] == [1, 3, 5, 7]
    assert [f["name"] for f in options["flavors"]] == ["m3.small", "m3.medium"]
    assert len(options["combinations"]) == 3

    templates = (
        await logged_in.get("/api/kubernetes/cluster-templates")
    ).json()
    assert len(templates["items"]) == 3
    detail = (
        await logged_in.get("/api/kubernetes/cluster-templates/t-133")
    ).json()
    assert detail["upgrade_targets"] == ["t-134"]


async def test_create_cluster(logged_in, upstream):
    mock_magnum(upstream)
    created = upstream.post(f"{MAGNUM}/clusters").mock(
        return_value=httpx.Response(202, json={"uuid": "c-new"})
    )
    response = await logged_in.post(
        "/api/kubernetes/clusters",
        json={
            "name": "demo",
            "cluster_template_id": "t-133",
            "master_count": 3,
            "master_flavor_id": "m3.small",
            "node_count": 2,
            "flavor_id": "m3.medium",
            "etcd_volume_size": 20,
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert response.json() == {"id": "c-new", "name": "demo"}
    sent = json.loads(created.calls.last.request.content)
    assert sent["cluster_template_id"] == "t-133"
    assert sent['master_count'] == 3
    assert sent['labels'] == {'etcd_volume_size': '20'}
    assert sent["merge_labels"] is True

    bad = await logged_in.post(
        "/api/kubernetes/clusters",
        json={
            "name": "demo",
            "cluster_template_id": "t-133",
            "master_count": 2,
            "master_flavor_id": "a",
            "flavor_id": "b",
        },
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400
    assert '1, 3, 5 or 7' in bad.json()['message']
    single = await logged_in.post(
        "/api/kubernetes/clusters",
        json={
            "name": "demo",
            "cluster_template_id": "t-single",
            "master_count": 3,
            "master_flavor_id": "a",
            "flavor_id": "b",
        },
        headers=csrf_headers(logged_in),
    )
    assert single.status_code == 400
    assert 'single' in single.json()['message']
    named = await logged_in.post(
        "/api/kubernetes/clusters",
        json={
            "name": "1bad",
            "cluster_template_id": "t-133",
            "master_flavor_id": "a",
            "flavor_id": "b",
        },
        headers=csrf_headers(logged_in),
    )
    assert named.status_code == 422
    assert named.json()["message"].startswith("Cluster names start with")


async def test_create_cluster_with_key_pair_and_autoscaling(
    logged_in, upstream
):
    mock_magnum(upstream)
    created = upstream.post(f"{MAGNUM}/clusters").mock(
        return_value=httpx.Response(202, json={"uuid": "c-new"})
    )
    cluster = {
        "name": "demo",
        "cluster_template_id": "t-133",
        "master_flavor_id": "m3.small",
        "node_count": 2,
        "flavor_id": "m3.medium",
        "keypair": "laptop",
        "autoscaling": True,
        "min_node_count": 1,
        "max_node_count": 5,
    }
    response = await logged_in.post(
        "/api/kubernetes/clusters",
        json=cluster,
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(created.calls.last.request.content)
    assert sent["keypair"] == "laptop"
    assert sent["labels"] == {
        "auto_scaling_enabled": "true",
        "min_node_count": "1",
        "max_node_count": "5",
    }
    assert sent["merge_labels"] is True

    outside = await logged_in.post(
        "/api/kubernetes/clusters",
        json={**cluster, "node_count": 6},
        headers=csrf_headers(logged_in),
    )
    assert outside.status_code == 400
    assert "between the minimum and the maximum" in outside.json()["message"]


async def test_cluster_detail_upgrade_and_delete(logged_in, upstream):
    mock_magnum(upstream)
    detail = (await logged_in.get("/api/kubernetes/clusters/c-1")).json()
    assert detail["kubernetes_version"] == "v1.33.4"
    assert detail["availability_zone"] == "ardctest-artm"

    options = (
        await logged_in.get("/api/kubernetes/clusters/c-1/upgrade-options")
    ).json()
    assert options["can_upgrade"] is True
    assert options["targets"] == [
        {
            "template_id": "t-134",
            "name": TARGET["name"],
            "kubernetes_version": "1.34.0",
        }
    ]
    upgraded = upstream.post(f"{MAGNUM}/clusters/c-1/actions/upgrade").mock(
        return_value=httpx.Response(202, json={})
    )
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/upgrade",
        json={"cluster_template_id": "t-134"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert json.loads(upgraded.calls.last.request.content) == {
        "cluster_template": "t-134",
        "max_batch_size": 1,
    }
    deleted = upstream.delete(f"{MAGNUM}/clusters/c-1").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/kubernetes/clusters/c-1", headers=csrf_headers(logged_in)
    )
    assert response.status_code == 204
    assert deleted.called


async def test_upgrade_refused_while_in_progress(logged_in, upstream):
    mock_magnum(upstream, {**CLUSTER, "status": "UPDATE_IN_PROGRESS"})
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/upgrade",
        json={"cluster_template_id": "t-134"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    groups = (
        await logged_in.get("/api/kubernetes/clusters/c-1/nodegroups")
    ).json()
    assert groups["can_change"] is False
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/nodegroups",
        json={"name": "gpu2", "flavor_id": "m3.small"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409


async def test_nodegroups(logged_in, upstream):
    mock_magnum(upstream)
    groups = (
        await logged_in.get("/api/kubernetes/clusters/c-1/nodegroups")
    ).json()
    assert [g["name"] for g in groups["items"]] == [
        "default-master",
        "default-worker",
        "gpu",
    ]
    assert groups["items"][2]["node_labels"] == {"tier": "gpu"}

    created = upstream.post(f"{MAGNUM}/clusters/c-1/nodegroups").mock(
        return_value=httpx.Response(
            202, json={"uuid": "ng-new", "name": "gpu2", "role": "worker"}
        )
    )
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/nodegroups",
        json={
            "name": "gpu2",
            "flavor_id": "m3.small",
            "node_count": 2,
            "autoscaling": True,
            "min_node_count": 1,
            "max_node_count": 3,
            "node_labels": "tier=gpu",
            "node_taints": "gpu:NoSchedule",
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    sent = json.loads(created.calls.last.request.content)
    assert sent["node_taints"] == [
        {"key": "gpu", "value": "", "effect": "NoSchedule"}
    ]
    assert sent["labels"]["auto_scaling_enabled"] == "true"
    bad = await logged_in.post(
        "/api/kubernetes/clusters/c-1/nodegroups",
        json={
            "name": "gpu3",
            "flavor_id": "m3.small",
            "node_taints": "gpu:Never",
        },
        headers=csrf_headers(logged_in),
    )
    assert bad.status_code == 400

    resized = upstream.post(f"{MAGNUM}/clusters/c-1/actions/resize").mock(
        return_value=httpx.Response(202, json={})
    )
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-gpu/resize",
        json={"node_count": 3},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202
    assert json.loads(resized.calls.last.request.content) == {
        "node_count": 3,
        "nodegroup": "gpu",
    }
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-m/resize",
        json={"node_count": 2},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    patched = upstream.patch(f"{MAGNUM}/clusters/c-1/nodegroups/ng-gpu").mock(
        return_value=httpx.Response(
            200,
            json={**NODEGROUPS[2], "min_node_count": 1, "max_node_count": 5},
        )
    )
    response = await logged_in.put(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-gpu/autoscaling",
        json={"min_node_count": 1, "max_node_count": 5},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200
    assert (
        json.loads(patched.calls.last.request.content)[0]["path"]
        == "/min_node_count"
    )
    response = await logged_in.put(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-gpu/labels",
        json={"node_labels": "tier=gpu,pool=a", "node_taints": ""},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 200
    patch = json.loads(patched.calls.last.request.content)
    assert patch == [
        {
            "op": "replace",
            "path": "/node_labels",
            "value": {"tier": "gpu", "pool": "a"},
        }
    ]
    response = await logged_in.put(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-m/labels",
        json={"node_labels": "a=b"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400

    response = await logged_in.delete(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-w",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 409
    upstream.delete(f"{MAGNUM}/clusters/c-1/nodegroups/ng-gpu").mock(
        return_value=httpx.Response(204)
    )
    response = await logged_in.delete(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-gpu",
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 204


async def test_cluster_config_and_certificates(logged_in, upstream):
    mock_magnum(upstream)
    upstream.get(f"{MAGNUM}/certificates/c-1").mock(
        return_value=httpx.Response(200, json={"pem": "-----CA-----"})
    )
    signed = upstream.post(f"{MAGNUM}/certificates").mock(
        return_value=httpx.Response(201, json={"pem": "-----CERT-----"})
    )
    body = (await logged_in.get("/api/kubernetes/clusters/c-1/config")).json()
    assert body['ca'] == '-----CA-----'
    assert body['cert'] == '-----CERT-----'
    assert body["key"].startswith("-----BEGIN RSA PRIVATE KEY-----")
    assert "client-certificate-data" in body["kubeconfig"]
    assert "server: https://10.0.0.5:6443" in body["kubeconfig"]
    sent = json.loads(signed.calls.last.request.content)
    assert sent['cluster_uuid'] == 'c-1'
    assert 'CERTIFICATE REQUEST' in sent['csr']

    ca = await logged_in.get("/api/kubernetes/clusters/c-1/ca.pem")
    assert ca.status_code == 200
    assert (
        ca.headers["content-disposition"]
        == "attachment; filename=\"samtest1_ca.pem\";"
        " filename*=UTF-8''samtest1_ca.pem"
    )
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/sign",
        json={"csr": "-----BEGIN CERTIFICATE REQUEST-----x"},
        headers=csrf_headers(logged_in),
    )
    assert response.json() == {"pem": "-----CERT-----"}


async def test_upgrade_refuses_a_template_outside_the_targets(
    logged_in, upstream
):
    mock_magnum(upstream)
    upgraded = upstream.post(f"{MAGNUM}/clusters/c-1/actions/upgrade")
    response = await logged_in.post(
        "/api/kubernetes/clusters/c-1/upgrade",
        json={"cluster_template_id": "t-single"},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 400
    assert "upgrade target" in response.json()["message"]
    assert not upgraded.called


async def test_unchanged_labels_and_taints_do_not_roll_nodes(
    logged_in, upstream
):
    mock_magnum(upstream)
    # Magnum may store a value-less taint as null rather than "".
    upstream.get(f"{MAGNUM}/clusters/c-1/nodegroups/ng-gpu").mock(
        return_value=httpx.Response(
            200,
            json={
                **NODEGROUPS[2],
                "node_labels": {"tier": "gpu", "pool": "a"},
                "node_taints": [
                    {"key": "gpu", "value": None, "effect": "NoSchedule"},
                    {"key": "x", "value": "1", "effect": "NoExecute"},
                ],
            },
        )
    )
    patched = upstream.patch(f"{MAGNUM}/clusters/c-1/nodegroups/ng-gpu")
    same = await logged_in.put(
        "/api/kubernetes/clusters/c-1/nodegroups/ng-gpu/labels",
        json={
            "node_labels": "pool=a,tier=gpu",
            "node_taints": "x=1:NoExecute,gpu:NoSchedule",
        },
        headers=csrf_headers(logged_in),
    )
    assert same.status_code == 200, same.text
    assert not patched.called
