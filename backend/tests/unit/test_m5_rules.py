"""Rules behind the object store, Kubernetes and load balancer panels."""

import base64
import hashlib
import hmac
from urllib.parse import parse_qs, unquote, urlsplit

import pytest

from hive.nectar import dns, loadbalancer, magnum, objectstore, orchestration

# --- object store ----------------------------------------------------------------


def test_container_and_object_name_rules():
    assert objectstore.validate_container_name("docs") is None
    assert "slash" in objectstore.validate_container_name("a/b")
    assert "256" in objectstore.validate_container_name("x" * 300)
    assert objectstore.validate_object_name("a/b.txt") is None
    assert objectstore.validate_object_name("/a") is not None
    assert objectstore.validate_object_name("a//b") is not None
    for bad in ("../other/x", "a/./b", "a/..", ".", ".."):
        assert "folders" in objectstore.validate_object_name(bad), bad
    assert objectstore.validate_object_name("a/..b/.c") is None
    assert objectstore.validate_prefix(None) is None
    assert objectstore.validate_prefix("/notes/") is None
    assert objectstore.validate_prefix("notes/../x") is not None
    assert objectstore.folder_name("docs/", "notes") == "docs/notes/"
    assert objectstore.folder_name("", "/x/") == "x/"


def test_object_summaries_and_folders():
    entry = objectstore.object_summary({"subdir": "docs/notes/"}, "docs/")
    assert entry["is_folder"] and entry["basename"] == "notes"
    marker = objectstore.object_summary(
        {"name": "docs/old/", "bytes": 0}, "docs/"
    )
    assert marker["is_folder"] and marker["basename"] == "old"
    plain = objectstore.object_summary(
        {
            "name": "docs/a.txt",
            "bytes": 12,
            "content_type": "text/plain",
            "hash": "h",
        },
        "docs/",
    )
    assert not plain["is_folder"] and plain["basename"] == "a.txt"
    assert objectstore.is_public(
        ".r:*,.rlistings"
    ) and not objectstore.is_public("")
    meta = objectstore.container_metadata(
        {
            "x-container-object-count": "3",
            "x-container-bytes-used": "99",
            "x-container-read": ".r:*,.rlistings",
            "x-container-meta-access-control-allow-origin": "https://hive.test",
            "x-container-meta-owner": "me",
            "x-storage-policy": "default-placement",
        }
    )
    assert meta["is_public"] and meta["object_count"] == 3
    assert meta["cors_origin"] == "https://hive.test" and meta["metadata"] == {
        "owner": "me"
    }
    obj = objectstore.object_metadata(
        {
            "content-length": "5",
            "etag": "e",
            "x-static-large-object": "True",
            "x-object-meta-k": "v",
        }
    )
    assert (
        obj["is_slo"] and obj["metadata"] == {"k": "v"} and obj["bytes"] == 5
    )


def _signed(url: str, key: str, method: str, account_path: str) -> bool:
    """Check a TempURL the way Swift's tempurl middleware does: HMAC over
    the decoded request path."""
    parts = urlsplit(url)
    query = parse_qs(parts.query)
    expires = query["temp_url_expires"][0]
    body = f"{method}\n{expires}\n{unquote(parts.path)}".encode()
    assert unquote(parts.path).startswith(account_path)
    digest = hmac.new(key.encode(), body, hashlib.sha256).digest()
    expected = "sha256:" + base64.urlsafe_b64encode(digest).decode()
    return query["temp_url_sig"][0] == expected


def test_temp_url_signature_and_url():
    sig = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o", "sha1"
    )
    assert len(sig) == 40
    sig256 = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o"
    )
    # Swift wants a prefixed signature base64 encoded, not hex
    assert sig256.startswith("sha256:")
    assert len(base64.urlsafe_b64decode(sig256[7:])) == 32
    sig512 = objectstore.temp_url_signature(
        "key", "GET", 1000, "/v1/AUTH_p/c/o", "sha512"
    )
    assert (
        sig512.startswith("sha512:")
        and len(base64.urlsafe_b64decode(sig512[7:])) == 64
    )
    url = objectstore.temp_url(
        "https://store.test/swift/v1",
        "my container",
        "docs/a b.txt",
        key="key",
        method="PUT",
        ttl=60,
        now=1000,
        query={"multipart-manifest": "put"},
    )
    assert url.startswith(
        "https://store.test/swift/v1/my%20container/docs/a%20b.txt?"
    )
    assert "temp_url_expires=1060" in url and "multipart-manifest=put" in url
    assert "temp_url_sig=sha256:" in url
    # The HMAC body is the decoded path, as Swift's tempurl middleware
    # rebuilds it from PATH_INFO; the URL alone is percent-encoded.
    unquoted = objectstore.temp_url_signature(
        "key", "PUT", 1060, "/swift/v1/my container/docs/a b.txt"
    )
    assert parse_qs(urlsplit(url).query)["temp_url_sig"][0] == unquoted
    assert _signed(url, "key", "PUT", "/swift/v1")
    classic = objectstore.temp_url(
        "https://swift.test/v1/AUTH_p",
        "c",
        "o",
        key="k",
        method="GET",
        ttl=1,
        now=0,
    )
    assert classic.startswith("https://swift.test/v1/AUTH_p/c/o?")


@pytest.mark.parametrize(
    "name",
    ["My Thesis.pdf", "r\u00e9sum\u00e9.pdf", "\u8ad6\u6587/a+b#c%d&e.txt"],
)
def test_temp_url_signs_names_that_need_encoding(name):
    url = objectstore.temp_url(
        "https://swift.test/v1/AUTH_p",
        "docs",
        name,
        key="k",
        method="GET",
        ttl=60,
        now=0,
        query={"filename": name.rsplit("/", 1)[-1]},
    )
    parts = urlsplit(url)
    assert parts.path.isascii() and " " not in parts.path
    assert unquote(parts.path) == f"/v1/AUTH_p/docs/{name}"
    assert _signed(url, "k", "GET", "/v1/AUTH_p")


def test_file_names_and_keys():
    assert (
        objectstore.temp_url_key({objectstore.TEMP_URL_KEY_2_HEADER: "two"})
        == "two"
    )
    assert (
        objectstore.temp_url_key(
            {
                objectstore.TEMP_URL_KEY_HEADER: "one",
                objectstore.TEMP_URL_KEY_2_HEADER: "two",
            }
        )
        == "one"
    )
    assert objectstore.temp_url_key({}) is None
    encoded = objectstore.encode_orig_filename("r\u00e9sum\u00e9\r\n.pdf")
    assert encoded.isascii() and "\n" not in encoded
    assert objectstore.decode_orig_filename(encoded) == (
        "r\u00e9sum\u00e9\r\n.pdf"
    )
    # Horizon stored the raw ASCII name; it decodes unchanged.
    assert objectstore.decode_orig_filename("a b.txt") == "a b.txt"
    assert objectstore.decode_orig_filename(None) is None
    assert objectstore.download_filename("notes/report", "report.pdf") == (
        "report.pdf"
    )
    assert objectstore.download_filename("notes/a.txt", "x.pdf") == "a.txt"
    assert objectstore.download_filename("notes/report", None) == "report"
    disposition = objectstore.content_disposition(
        '\u8ad6\u6587 "a";b\\c\r\n.pdf'
    )
    assert disposition.isascii() and "\r" not in disposition
    assert disposition.startswith('attachment; filename="__ _a__b_c__.pdf";')
    assert disposition.endswith(
        "filename*=UTF-8''%E8%AB%96%E6%96%87%20%22a%22%3Bb%5Cc%0D%0A.pdf"
    )
    assert 'filename="download"' in objectstore.content_disposition("")


def test_segment_plan_and_manifest():
    assert objectstore.segment_plan(10, 100) == [(0, 10)]
    assert objectstore.segment_plan(250, 100) == [
        (0, 100),
        (100, 100),
        (200, 50),
    ]
    names = objectstore.segment_names("big.iso", "123", 2)
    assert names == ["big.iso/123/00000000", "big.iso/123/00000001"]
    manifest = objectstore.manifest_entries("c_segments", names, [100, 50])
    assert manifest[1] == {
        "path": "/c_segments/big.iso/123/00000001",
        "size_bytes": 50,
    }


# --- orchestration and DNS ----------------------------------------------------------


def test_stack_actions_and_parameter_lists():
    assert orchestration.stack_actions("UPDATE_IN_PROGRESS") == [
        "cancel_update",
        "delete",
    ]
    assert "cancel_update" not in orchestration.stack_actions(
        "CREATE_COMPLETE"
    )
    assert set(orchestration.ACTION_REFUSALS) == {
        "suspend",
        "resume",
        "check",
        "cancel_update",
    }
    specs = [{"name": "ports", "type": "comma_delimited_list"}]
    assert orchestration.coerce_parameters({"ports": [80, 443]}, specs) == {
        "ports": "80,443"
    }


def test_record_set_must_be_inside_the_zone():
    assert dns.in_zone("example.com.", "example.com.")
    assert dns.in_zone("www.example.com.", "example.com.")
    assert not dns.in_zone("notexample.com.", "example.com.")
    problem = dns.validate_recordset(
        "example.com.", "notexample.com.", "A", ["10.0.0.1"], None
    )
    assert problem is not None and "zone name" in problem


# --- magnum ------------------------------------------------------------------------


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


def test_cluster_validation_and_create_body():
    assert magnum.validate_cluster_name("my-cluster.1") is None
    assert magnum.validate_cluster_name("1bad") is not None
    assert magnum.validate_master_count(3, True) is None
    assert "1, 3, 5 or 7" in magnum.validate_master_count(2, True)
    assert "single" in magnum.validate_master_count(3, False)
    template = magnum.template_summary(TEMPLATES[0])
    body = magnum.create_body(
        name="c1",
        template=template,
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
    assert body["merge_labels"] is True and body["create_timeout"] == 60
    plain = magnum.create_body(
        name="c2",
        template=template,
        master_count=1,
        master_flavor="m3.small",
        node_count=0,
        node_flavor="m3.small",
        etcd_volume_size=None,
        etcd_volume_type=None,
    )
    assert "labels" not in plain


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


def test_node_labels_and_taints():
    assert magnum.parse_node_labels("a=1, b=two") == {"a": "1", "b": "two"}
    with pytest.raises(ValueError):
        magnum.parse_node_labels("bad label")
    taints = magnum.parse_node_taints(
        "gpu=true:NoSchedule,spot:PreferNoSchedule"
    )
    assert taints == [
        {"key": "gpu", "value": "true", "effect": "NoSchedule"},
        {"key": "spot", "value": "", "effect": "PreferNoSchedule"},
    ]
    with pytest.raises(ValueError):
        magnum.parse_node_taints("gpu=true:Nope")
    assert (
        magnum.format_node_taints(taints)
        == "gpu=true:NoSchedule,spot:PreferNoSchedule"
    )
    assert magnum.format_node_labels({"a": "1"}) == "a=1"
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
    assert body["min_node_count"] == 1 and body["max_node_count"] == 4
    assert body["node_labels"] == {"tier": "gpu"}
    assert magnum.validate_resize("master", 2) is not None
    assert magnum.validate_resize("worker", 0) is None


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
    assert "current-context: c1" in bare and "client-key-data" not in bare


# --- load balancers ----------------------------------------------------------------


def test_listener_pool_member_monitor_fields():
    listener = loadbalancer.listener_fields(
        {
            "protocol": "HTTP",
            "protocol_port": 80,
            "name": "web",
            "insert_headers": {
                "X-Forwarded-For": True,
                "X-Forwarded-Port": False,
            },
            "allowed_cidrs": ["10.0.0.0/8"],
            "timeout_client_data": 1000,
        },
        "lb-1",
    )
    assert listener["loadbalancer_id"] == "lb-1"
    assert listener["insert_headers"] == {"X-Forwarded-For": "true"}
    assert (
        listener["timeout_client_data"] == 1000
        and listener["connection_limit"] == -1
    )
    udp = loadbalancer.listener_fields(
        {"protocol": "UDP", "protocol_port": 53, "timeout_client_data": 5},
        None,
    )
    assert "timeout_client_data" not in udp and "insert_headers" not in udp
    pool = loadbalancer.pool_fields(
        {
            "lb_algorithm": "ROUND_ROBIN",
            "session_persistence": {
                "type": "APP_COOKIE",
                "cookie_name": "sid",
            },
        },
        listener_id="l-1",
        listener_protocol="TERMINATED_HTTPS",
    )
    assert pool["protocol"] == "HTTP" and pool["listener_id"] == "l-1"
    assert pool["session_persistence"] == {
        "type": "APP_COOKIE",
        "cookie_name": "sid",
    }
    bare = loadbalancer.pool_fields(
        {"lb_algorithm": "SOURCE_IP", "protocol": "TCP"}, lb_id="lb-1"
    )
    assert (
        bare["loadbalancer_id"] == "lb-1"
        and bare["session_persistence"] is None
    )
    member = loadbalancer.member_fields(
        {"address": "10.0.0.5", "protocol_port": 8080, "subnet_id": "s-1"}
    )
    assert member == {
        "address": "10.0.0.5",
        "protocol_port": 8080,
        "weight": 1,
        "admin_state_up": True,
        "backup": False,
        "subnet_id": "s-1",
    }
    monitor = loadbalancer.monitor_fields(
        {"type": "HTTP", "url_path": "/healthz"}, "p-1"
    )
    assert monitor["pool_id"] == "p-1" and monitor["expected_codes"] == "200"
    assert (
        monitor["http_method"] == "GET" and monitor["url_path"] == "/healthz"
    )
    ping = loadbalancer.monitor_fields({"type": "PING"})
    assert "http_method" not in ping


def test_monitor_and_cidr_validation_and_defaults():
    assert (
        loadbalancer.validate_monitor(
            {"type": "HTTP", "delay": 5, "timeout": 10}
        )
        is not None
    )
    assert (
        loadbalancer.validate_monitor(
            {"type": "HTTP", "expected_codes": "200-204"}
        )
        is None
    )
    assert (
        loadbalancer.validate_monitor(
            {"type": "HTTP", "expected_codes": "abc"}
        )
        is not None
    )
    assert (
        loadbalancer.validate_monitor({"type": "HTTP", "url_path": "nope"})
        is not None
    )
    assert loadbalancer.valid_cidrs(["10.0.0.0/8", "fd00::/64"]) is None
    assert loadbalancer.valid_cidrs(["10.0.0.0/33"]) is not None
    assert loadbalancer.valid_ip("10.0.0.1") and not loadbalancer.valid_ip("x")
    assert loadbalancer.default_port("HTTP", set()) == 80
    assert loadbalancer.default_port("TERMINATED_HTTPS", {443, 444}) == 445
    assert loadbalancer.pool_protocol_for("TERMINATED_HTTPS") == "HTTP"


def test_l7_fields_and_member_candidates():
    policy = loadbalancer.l7_policy_fields(
        {
            "action": "REDIRECT_TO_URL",
            "redirect_url": "https://x",
            "position": 1,
        },
        "l-1",
    )
    assert policy == {
        "action": "REDIRECT_TO_URL",
        "admin_state_up": True,
        "listener_id": "l-1",
        "position": 1,
        "redirect_url": "https://x",
    }
    rule = loadbalancer.l7_rule_fields(
        {
            "type": "HEADER",
            "compare_type": "EQUAL_TO",
            "key": "Host",
            "value": "a",
        }
    )
    assert rule["key"] == "Host"
    servers = [
        {"id": "i-1", "name": "web", "status": "ACTIVE"},
        {"id": "i-2", "name": "nope"},
    ]
    ports = [
        {
            "device_id": "i-1",
            "fixed_ips": [
                {"subnet_id": "s-1", "ip_address": "10.0.0.5"},
                {"subnet_id": "s-x", "ip_address": "1.1.1.1"},
            ],
        },
        {
            "device_id": "i-2",
            "fixed_ips": [{"subnet_id": "s-x", "ip_address": "2.2.2.2"}],
        },
    ]
    candidates = loadbalancer.member_candidates(servers, ports, {"s-1"})
    assert candidates == [
        {
            "id": "i-1",
            "name": "web",
            "status": "ACTIVE",
            "addresses": [{"address": "10.0.0.5", "subnet_id": "s-1"}],
        }
    ]
    pools = [
        {"id": "p-1", "loadbalancers": [{"id": "lb-1"}]},
        {"id": "p-2", "loadbalancers": [{"id": "lb-2"}]},
        {"id": "p-3", "loadbalancers": []},
    ]
    assert [p["id"] for p in loadbalancer.pools_of(pools, "lb-1")] == ["p-1"]
    lb = {"provisioning_status": "PENDING_UPDATE"}
    assert loadbalancer.is_transitional(lb) and not loadbalancer.can_delete(lb)
