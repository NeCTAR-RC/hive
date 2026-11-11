import pytest

from hive.nectar import magnum
from hive.nectar.violation import RuleViolation

TEMPLATES = [
    {
        "uuid": "t-133-art-calico-5",
        "name": "kubernetes-v1.33.4-ardctest-artm-calico-v5",
        "master_lb_enabled": True,
        "labels": {"upgrade_targets": "t-134-art-calico-1"},
    },
    {
        "uuid": "t-133-art-calico-4",
        "name": "kubernetes-v1.33.4-ardctest-artm-calico-v4",
        "master_lb_enabled": True,
        "labels": {},
    },
    {
        "uuid": "t-134-art-calico-1",
        "name": "kubernetes-v1.34.0-ardctest-artm-calico-v1",
        "master_lb_enabled": True,
        "labels": {},
    },
    {
        "uuid": "t-133-auck-cilium-2",
        "name": "kubernetes-v1.33.4-aucklandtest-cilium-v2",
        "master_lb_enabled": False,
        "labels": {},
    },
    {"uuid": "t-odd", "name": "fedora-coreos-old", "labels": {}},
]


def test_template_name_parsing_and_pickers():
    parsed = magnum.parse_template_name(
        "kubernetes-v1.33.4-ardctest-artm-calico-v5"
    )
    assert parsed == {
        "kubernetes_version": "1.33.4",
        "availability_zone": "ardctest-artm",
        "network_driver": "calico",
        "template_version": "5",
    }
    assert magnum.parse_template_name("fedora-coreos-old") is None
    summaries = [magnum.template_summary(t) for t in TEMPLATES]
    assert summaries[0]["upgrade_targets"] == ["t-134-art-calico-1"]
    options = magnum.picker_options(summaries)
    assert options["versions"] == ["1.34.0", "1.33.4"]
    assert options["availability_zones"] == ["ardctest-artm", "aucklandtest"]
    assert options["network_drivers"] == ["calico", "cilium"]
    combos = {
        (
            c["kubernetes_version"],
            c["availability_zone"],
            c["network_driver"],
        ): c["template_id"]
        for c in options["combinations"]
    }
    # The newest template version wins for the same version/zone/driver.
    assert (
        combos[("1.33.4", "ardctest-artm", "calico")] == "t-133-art-calico-5"
    )
    assert len(combos) == 3


def test_a_valid_cluster_name_passes():
    magnum.validate_cluster_name("my-cluster.1")


@pytest.mark.parametrize("name", ["1bad", "", "a b"])
def test_cluster_names_start_with_a_letter(name):
    with pytest.raises(RuleViolation, match="start with a letter"):
        magnum.validate_cluster_name(name)


def test_three_control_plane_nodes_with_a_load_balancer_pass():
    magnum.validate_master_count(3, True)


@pytest.mark.parametrize(
    ("count", "load_balanced", "says"),
    [(2, True, "1, 3, 5 or 7"), (3, False, "single")],
)
def test_control_plane_sizes(count, load_balanced, says):
    with pytest.raises(RuleViolation, match=says):
        magnum.validate_master_count(count, load_balanced)


def test_create_body_carries_the_etcd_volume_as_labels():
    body = magnum.create_body(
        name="c1",
        template=magnum.template_summary(TEMPLATES[0]),
        master_count=3,
        master_flavor="m3.small",
        node_count=2,
        node_flavor="m3.medium",
        etcd_volume_size=20,
        etcd_volume_type="standard",
    )
    assert body["cluster_template_id"] == "t-133-art-calico-5"
    assert body["labels"] == {
        "etcd_volume_size": "20",
        "etcd_blockdevice_volume_type": "standard",
    }
    assert body["merge_labels"] is True
    assert body["create_timeout"] == 60


def test_create_body_without_an_etcd_volume_has_no_labels():
    plain = magnum.create_body(
        name="c2",
        template=magnum.template_summary(TEMPLATES[0]),
        master_count=1,
        master_flavor="m3.small",
        node_count=0,
        node_flavor="m3.small",
        etcd_volume_size=None,
        etcd_volume_type=None,
    )
    assert "labels" not in plain


def test_create_body_carries_the_key_pair_and_autoscaling():
    body = magnum.create_body(
        name="c3",
        template=magnum.template_summary(TEMPLATES[0]),
        master_count=1,
        master_flavor="m3.small",
        node_count=3,
        node_flavor="m3.small",
        etcd_volume_size=None,
        etcd_volume_type=None,
        keypair="laptop",
        autoscaling=True,
        min_node_count=None,
        max_node_count=None,
    )
    assert body["keypair"] == "laptop"
    # Bounds left out default as a node group's do: 1 to the node count.
    assert body["labels"] == {
        "auto_scaling_enabled": "true",
        "min_node_count": "1",
        "max_node_count": "3",
    }
    assert body["merge_labels"] is True


@pytest.mark.parametrize(
    ("count", "minimum", "maximum", "says"),
    [
        (2, 3, 1, "at least the minimum"),
        (6, 1, 5, "between the minimum and the maximum"),
        (0, 1, 5, "between the minimum and the maximum"),
    ],
)
def test_autoscaling_bounds_that_break_the_rules(
    count, minimum, maximum, says
):
    with pytest.raises(RuleViolation, match=says):
        magnum.validate_autoscaling(count, minimum, maximum)


def test_autoscaling_bounds_inside_or_left_to_default_pass():
    magnum.validate_autoscaling(3, 1, 5)
    magnum.validate_autoscaling(3, None, None)


def test_cluster_summary_and_actions():
    cluster = {
        "uuid": "c-1",
        "name": "samtest1",
        "status": "UPDATE_IN_PROGRESS",
        "labels": {
            "availability_zone": "ardctest-artm",
            "upgrade_targets": "t-1,t-2",
        },
    }
    summary = magnum.cluster_summary(
        cluster, magnum.template_summary(TEMPLATES[0])
    )
    assert summary["availability_zone"] == "ardctest-artm"
    assert summary["network_driver"] == "calico"
    assert summary["upgrade_targets"] == ["t-1", "t-2"]
    assert summary["actions"] == ["config", "certificate", "sign"]
    assert magnum.cluster_actions("CREATE_COMPLETE") == [
        "config",
        "certificate",
        "sign",
        "upgrade",
        "nodegroups",
        "delete",
    ]
    assert magnum.cluster_actions("CREATE_FAILED") == [
        "config",
        "certificate",
        "sign",
        "delete",
    ]
    # A cluster being created can be deleted; one being updated waits.
    assert "delete" in magnum.cluster_actions("CREATE_IN_PROGRESS")
    assert "delete" not in magnum.cluster_actions("DELETE_IN_PROGRESS")


def test_node_labels_parse_and_format():
    assert magnum.parse_node_labels("a=1, b=two") == {"a": "1", "b": "two"}
    assert magnum.format_node_labels({"a": "1"}) == "a=1"


def test_node_taints_parse_and_format():
    text = "gpu=true:NoSchedule,spot:PreferNoSchedule"
    taints = magnum.parse_node_taints(text)
    assert taints == [
        {"key": "gpu", "value": "true", "effect": "NoSchedule"},
        {"key": "spot", "value": "", "effect": "PreferNoSchedule"},
    ]
    assert magnum.format_node_taints(taints) == text


@pytest.mark.parametrize(
    ("parse", "text"),
    [
        (magnum.parse_node_labels, "bad label"),
        (magnum.parse_node_taints, "gpu=true:Nope"),
    ],
)
def test_malformed_labels_and_taints_are_rule_violations(parse, text):
    with pytest.raises(RuleViolation):
        parse(text)


def test_nodegroup_body():
    body = magnum.nodegroup_body(
        name="gpu",
        flavor="g3.xl",
        node_count=2,
        autoscaling=True,
        min_node_count=1,
        max_node_count=4,
        boot_volume_size=50,
        boot_volume_type=None,
        node_labels="tier=gpu",
        node_taints="gpu:NoSchedule",
    )
    assert body["labels"] == {
        "auto_scaling_enabled": "true",
        "boot_volume_size": "50",
    }
    assert (body["min_node_count"], body["max_node_count"]) == (1, 4)
    assert body["node_labels"] == {"tier": "gpu"}


def test_workers_may_scale_to_zero():
    magnum.validate_resize("worker", 0)


@pytest.mark.parametrize(
    ("role", "count", "says"),
    [("master", 2, "1, 3, 5 or 7"), ("worker", -1, "negative")],
)
def test_resizes_that_break_the_rules(role, count, says):
    with pytest.raises(RuleViolation, match=says):
        magnum.validate_resize(role, count)


def test_kubeconfig_and_csr():
    key, csr = magnum.generate_key_and_csr()
    assert key.startswith("-----BEGIN RSA PRIVATE KEY-----")
    assert csr.startswith("-----BEGIN CERTIFICATE REQUEST-----")
    config = magnum.kubeconfig(
        "c1", "https://10.0.0.1:6443", "CA", "CERT", key
    )
    assert "certificate-authority-data: Q0E=" in config
    assert "client-certificate-data: Q0VSVA==" in config
    assert "current-context: default" in config
    bare = magnum.kubeconfig("c1", "https://10.0.0.1:6443", None, None, None)
    assert 'current-context: c1' in bare
    assert 'client-key-data' not in bare


def test_same_node_labels_and_taints_ignore_order_and_null_values():
    assert magnum.same_node_labels({"a": "1", "b": None}, {"b": "", "a": 1})
    assert not magnum.same_node_labels({"a": "1"}, {"a": "2"})
    gpu = {"key": "gpu", "value": None, "effect": "NoSchedule"}
    x = {"key": "x", "value": "1", "effect": "NoExecute"}
    assert magnum.same_node_taints([x, {**gpu, "value": ""}], [gpu, x])
    assert not magnum.same_node_taints([x], [gpu, x])
