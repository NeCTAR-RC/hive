from hive.api import api_access


async def test_endpoints_flatten_the_public_catalog(logged_in):
    response = await logged_in.get("/api/api-access/endpoints")
    assert response.status_code == 200
    items = response.json()["items"]
    names = [item["name"] for item in items]
    assert names == sorted(names, key=str.lower)
    nova = next(item for item in items if item["type"] == "compute")
    assert nova == {
        "type": "compute",
        "name": "nova",
        "url": "https://nova.test/v2.1",
        "region": "Melbourne",
    }


def test_public_endpoints_filters_interface_and_region():
    catalog = [
        {
            "type": "compute",
            "name": "nova",
            "endpoints": [
                {"interface": "internal", "region": "Melbourne", "url": "i"},
                {"interface": "public", "region": "Sydney", "url": "s"},
                {"interface": "public", "region_id": "Melbourne", "url": "m"},
            ],
        }
    ]
    items = api_access.public_endpoints(catalog, "Melbourne")
    assert [item["url"] for item in items] == ["m"]
    everywhere = api_access.public_endpoints(catalog, None)
    assert [item["url"] for item in everywhere] == ["s", "m"]


async def test_credentials_describe_the_session(logged_in):
    response = await logged_in.get("/api/api-access/credentials")
    assert response.status_code == 200
    creds = response.json()
    assert creds["username"] == "sam@example.edu"
    assert creds["project_name"] == "pt-50"
    assert creds["project_id"] == "p1"
    assert creds["auth_url"] == "https://keystone.test/v3"
    assert creds["region"] == "Melbourne"


async def test_openrc_download(logged_in):
    response = await logged_in.get("/api/api-access/openrc")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/x-shellscript")
    assert (
        response.headers["content-disposition"]
        == 'attachment; filename="pt-50-openrc.sh"'
    )
    body = response.text
    assert "export OS_AUTH_URL=https://keystone.test/v3" in body
    assert "export OS_PROJECT_NAME=pt-50" in body
    assert "export OS_USERNAME=sam@example.edu" in body
    assert "read -sr OS_PASSWORD_INPUT" in body
    assert "OS_PASSWORD=" not in body.replace("OS_PASSWORD=$OS_PASSWORD_INPUT", "")


async def test_clouds_yaml_download(logged_in):
    response = await logged_in.get("/api/api-access/clouds.yaml")
    assert response.status_code == 200
    assert response.headers["content-disposition"] == (
        'attachment; filename="clouds.yaml"'
    )
    body = response.text
    assert 'auth_url: "https://keystone.test/v3"' in body
    assert 'project_name: "pt-50"' in body
    assert "identity_api_version: 3" in body


def test_openrc_quotes_awkward_names():
    text = api_access.openrc_text(
        {
            "auth_url": "https://k/v3",
            "project_id": "p1",
            "project_name": "it's a project",
            "user_domain_id": "default",
            "project_domain_id": "default",
            "username": "a b",
            "region": "Melbourne",
        }
    )
    assert "export OS_PROJECT_NAME='it'\"'\"'s a project'" in text
    assert "export OS_USERNAME='a b'" in text


async def test_requires_login(client):
    response = await client.get("/api/api-access/openrc")
    assert response.status_code == 401
