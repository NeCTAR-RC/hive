from hive.redirects import RedirectMap


def test_redirect_map_matches_horizon_paths():
    redirects = RedirectMap.load()
    assert redirects.match("/project/instances/") == (
        301,
        "/compute/instances",
    )
    assert redirects.match("/project/instances/abc-123/") == (
        301,
        "/compute/instances/abc-123",
    )
    assert redirects.match("/project/instances/abc-123", "") == (
        301,
        "/compute/instances/abc-123",
    )
    assert redirects.match("/settings/my-details/", "orcid=1") == (
        301,
        "/account/my-details?orcid=1",
    )
    assert redirects.match("/app-catalog/") == (410, "")
    assert redirects.match("/compute/instances") is None


def test_angular_detail_pages_map_to_hive_detail_pages():
    redirects = RedirectMap.load()
    assert redirects.match("/ngdetails/OS::Octavia::LoadBalancer/lb-1") == (
        301,
        "/load-balancers/lb-1",
    )
    assert redirects.match("/ngdetails/OS::Nova::Keypair/my key/") == (
        301,
        "/compute/key-pairs/my%20key",
    )
    assert redirects.match("/ngdetails/OS::Glance::Image/img-1", "nav=x") == (
        301,
        "/compute/images/img-1",
    )
    assert redirects.match("/ngdetails/OS::Unknown::Thing/x") is None


def test_allocation_pages_go_to_horizon():
    redirects = RedirectMap.load(horizon_url="https://horizon.test/")
    assert redirects.match("/allocation/") == (
        301,
        "https://horizon.test/allocation/",
    )
    assert redirects.match("/allocation") == (
        301,
        "https://horizon.test/allocation/",
    )
    assert redirects.match("/allocation/user_requests/12/edit/", "a=1") == (
        301,
        "https://horizon.test/allocation/user_requests/12/edit/?a=1",
    )
    assert redirects.match("/allocationx/") is None


def test_redirect_map_never_redirects_to_itself():
    redirects = RedirectMap.load()
    assert redirects.match("/auth/login/", "next=%2F") == (
        301,
        "/auth/login?next=%2F",
    )
    assert redirects.match("/auth/login", "next=%2F") is None
    assert redirects.match("/terms") is None
    assert redirects.match("/identity/credentials") is None
    assert redirects.match("/auth/switch/abc") is None
    assert redirects.match("/auth/switch/abc/") == (301, "/auth/switch/abc")


def test_redirect_tokens_that_prefix_others(tmp_path):
    data = tmp_path / "map.json"
    data.write_text(
        '[{"from": "/a/:id/:idx/", "to": "/b/:idx/:id/:other"},'
        ' {"from": "/c/:id/", "to": "/d/:id"}]'
    )
    redirects = RedirectMap.load(data)
    # ":id" must not rewrite the front of ":idx"; unknown tokens stay.
    assert redirects.match("/a/one/two/") == (301, "/b/two/one/:other")
    # A value that looks like a token is not substituted again.
    assert redirects.match("/c/:id/") == (301, "/d/%3Aid")
