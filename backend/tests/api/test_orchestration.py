"""Heat stacks, resources, events, templates, resource types and
template versions."""

import json

import httpx

from tests.conftest import csrf_headers, HEAT

STACK = {
    "id": "s-1",
    "stack_name": "web",
    "stack_status": "CREATE_COMPLETE",
    "stack_status_reason": "Stack CREATE completed successfully",
    "creation_time": "2026-10-10T00:00:00Z",
    "tags": None,
    "timeout_mins": 60,
    "disable_rollback": True,
    "parameters": {"OS::stack_id": "s-1", "count": "1"},
    "outputs": [{"output_key": "ip", "output_value": "10.0.0.5", "description": "address"}],
}
BUSY = {**STACK, "id": "s-2", "stack_name": "busy", "stack_status": "CREATE_IN_PROGRESS"}
TEMPLATE_TEXT = """heat_template_version: 2021-04-16
parameters:
  count:
    type: number
    default: 1
  name:
    type: string
resources: {}
"""
VALIDATED = {
    "Description": "demo",
    "Parameters": {
        "count": {"Type": "Number", "Default": 1, "Label": "Count"},
        "name": {"Type": "String", "Label": "Name", "NoEcho": "false"},
    },
}


def mock_heat(upstream, stack=None):
    stack = stack or STACK
    upstream.get(f"{HEAT}/stacks").mock(
        return_value=httpx.Response(200, json={"stacks": [stack, BUSY]})
    )
    for item in (stack, BUSY):
        upstream.get(f"{HEAT}/stacks/{item['id']}").mock(
            return_value=httpx.Response(
                302, headers={"Location": f"{HEAT}/stacks/{item['stack_name']}/{item['id']}"}
            )
        )
        upstream.get(f"{HEAT}/stacks/{item['stack_name']}/{item['id']}").mock(
            return_value=httpx.Response(200, json={"stack": item})
        )
    upstream.get(f"{HEAT}/stacks/web/s-1/resources").mock(
        return_value=httpx.Response(
            200,
            json={
                "resources": [
                    {
                        "resource_name": "server",
                        "logical_resource_id": "server",
                        "physical_resource_id": "i-1",
                        "resource_type": "OS::Nova::Server",
                        "resource_status": "CREATE_COMPLETE",
                    }
                ]
            },
        )
    )
    upstream.get(f"{HEAT}/stacks/web/s-1/resources/server").mock(
        return_value=httpx.Response(
            200,
            json={"resource": {"resource_name": "server", "resource_status": "CREATE_COMPLETE", "attributes": {"a": 1}}},
        )
    )
    upstream.get(f"{HEAT}/stacks/web/s-1/events").mock(
        return_value=httpx.Response(
            200,
            json={"events": [{"id": "e-1", "resource_name": "server", "resource_status": "CREATE_COMPLETE"}]},
        )
    )
    upstream.get(f"{HEAT}/stacks/web/s-1/template").mock(
        return_value=httpx.Response(200, json={"heat_template_version": "2021-04-16", "resources": {}})
    )
    upstream.get(f"{HEAT}/stacks/web/s-1/environment").mock(
        return_value=httpx.Response(200, json={"parameters": {"count": "1"}})
    )
    upstream.post(f"{HEAT}/validate").mock(return_value=httpx.Response(200, json=VALIDATED))


async def test_list_show_resources_events_template(logged_in, upstream):
    mock_heat(upstream)
    body = (await logged_in.get("/api/orchestration/stacks")).json()
    assert [s["name"] for s in body["items"]] == ["web", "busy"]
    assert body["items"][0]["actions"] == ["suspend", "check", "update", "delete"]
    assert body["items"][1]["is_transitional"]

    detail = (await logged_in.get("/api/orchestration/stacks/s-1")).json()
    assert detail["name"] == "web" and detail["outputs"][0]["key"] == "ip"
    assert detail["parameters"]["count"] == "1"

    resources = (await logged_in.get("/api/orchestration/stacks/s-1/resources")).json()
    assert resources["items"][0]["physical_id"] == "i-1"
    resource = (await logged_in.get("/api/orchestration/stacks/s-1/resources/server")).json()
    assert resource["attributes"] == {"a": 1}
    events = (await logged_in.get("/api/orchestration/stacks/s-1/events")).json()
    assert events["items"][0]["id"] == "e-1"
    template = (await logged_in.get("/api/orchestration/stacks/s-1/template")).json()
    assert "heat_template_version" in template["template_yaml"]
    assert template["environment"] == {"parameters": {"count": "1"}}


async def test_validate_and_create(logged_in, upstream):
    mock_heat(upstream)
    upstream.post(f"{HEAT}/stacks").mock(
        return_value=httpx.Response(201, json={"stack": {"id": "s-9", "links": []}})
    )
    validated = (
        await logged_in.post(
            "/api/orchestration/validate",
            json={"template": TEMPLATE_TEXT},
            headers=csrf_headers(logged_in),
        )
    ).json()
    assert validated["description"] == "demo"
    assert [p["name"] for p in validated["parameters"]] == ["count", "name"]
    assert validated["parameters"][1]["required"]

    bad_yaml = await logged_in.post(
        "/api/orchestration/validate", json={"template": "a: [b"}, headers=csrf_headers(logged_in)
    )
    assert bad_yaml.status_code == 400
    nothing = await logged_in.post("/api/orchestration/validate", json={}, headers=csrf_headers(logged_in))
    assert nothing.status_code == 400
    scalar = await logged_in.post(
        "/api/orchestration/validate", json={"template": "just text"}, headers=csrf_headers(logged_in)
    )
    assert scalar.status_code == 400

    response = await logged_in.post(
        "/api/orchestration/stacks",
        json={
            "name": "new",
            "template": TEMPLATE_TEXT,
            "environment": "parameters:\n  count: 2\n",
            "parameters": {"count": "3", "name": "x"},
            "timeout_mins": 30,
            "rollback": True,
            "tags": ["demo"],
        },
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert response.json() == {"id": "s-9", "name": "new"}
    sent = json.loads(upstream.calls.last.request.content)
    assert sent["stack_name"] == "new" and sent["parameters"] == {"count": 3, "name": "x"}
    assert sent["disable_rollback"] is False and sent["timeout_mins"] == 30
    assert sent["environment"] == "parameters:\n  count: 2\n" and sent["tags"] == "demo"
    assert sent["template"] == TEMPLATE_TEXT

    bad_name = await logged_in.post(
        "/api/orchestration/stacks",
        json={"name": "9bad", "template": TEMPLATE_TEXT},
        headers=csrf_headers(logged_in),
    )
    assert bad_name.status_code == 400
    missing = await logged_in.post(
        "/api/orchestration/stacks",
        json={"name": "ok", "template": TEMPLATE_TEXT, "parameters": {"name": ""}},
        headers=csrf_headers(logged_in),
    )
    assert missing.status_code == 400 and "required" in missing.json()["message"]
    by_url = await logged_in.post(
        "/api/orchestration/stacks",
        json={"name": "ok", "template_url": "https://x/t.yaml", "parameters": {"name": "n"}},
        headers=csrf_headers(logged_in),
    )
    assert by_url.status_code == 202
    assert json.loads(upstream.calls.last.request.content)["template_url"] == "https://x/t.yaml"


async def test_update_actions_delete(logged_in, upstream):
    mock_heat(upstream)
    put = upstream.put(f"{HEAT}/stacks/web/s-1").mock(return_value=httpx.Response(202))
    patch = upstream.patch(f"{HEAT}/stacks/web/s-1").mock(return_value=httpx.Response(202))
    actions = upstream.post(f"{HEAT}/stacks/web/s-1/actions").mock(return_value=httpx.Response(200))
    delete = upstream.delete(f"{HEAT}/stacks/web/s-1").mock(return_value=httpx.Response(204))

    response = await logged_in.patch(
        "/api/orchestration/stacks/s-1",
        json={"template": TEMPLATE_TEXT, "parameters": {"count": "2", "name": "y"}, "timeout_mins": 10, "rollback": False},
        headers=csrf_headers(logged_in),
    )
    assert response.status_code == 202, response.text
    assert put.called
    sent = json.loads(put.calls.last.request.content)
    assert sent["parameters"] == {"count": 2, "name": "y"} and sent["disable_rollback"] is True

    existing = await logged_in.patch(
        "/api/orchestration/stacks/s-1",
        json={"existing": True, "parameters": {"count": "5"}},
        headers=csrf_headers(logged_in),
    )
    assert existing.status_code == 202 and patch.called
    assert json.loads(patch.calls.last.request.content)["parameters"] == {"count": "5"}
    nothing = await logged_in.patch(
        "/api/orchestration/stacks/s-1", json={"parameters": {}}, headers=csrf_headers(logged_in)
    )
    assert nothing.status_code == 400

    suspend = await logged_in.post("/api/orchestration/stacks/s-1/actions/suspend", headers=csrf_headers(logged_in))
    assert suspend.status_code == 202 and json.loads(actions.calls.last.request.content) == {"suspend": None}
    resume = await logged_in.post("/api/orchestration/stacks/s-1/actions/resume", headers=csrf_headers(logged_in))
    assert resume.status_code == 409
    unknown = await logged_in.post("/api/orchestration/stacks/s-1/actions/explode", headers=csrf_headers(logged_in))
    assert unknown.status_code == 404
    busy = await logged_in.post("/api/orchestration/stacks/s-2/actions/check", headers=csrf_headers(logged_in))
    assert busy.status_code == 409

    response = await logged_in.delete("/api/orchestration/stacks/s-1", headers=csrf_headers(logged_in))
    assert response.status_code == 204 and delete.called


async def test_resource_types_and_template_versions(logged_in, upstream):
    upstream.get(f"{HEAT}/resource_types").mock(
        return_value=httpx.Response(
            200,
            json={
                "resource_types": [
                    {"resource_type": "OS::Nova::Server", "description": "A server"},
                    {"resource_type": "OS::Cinder::Volume", "description": "A volume"},
                ]
            },
        )
    )
    upstream.get(f"{HEAT}/resource_types/OS::Nova::Server").mock(
        return_value=httpx.Response(
            200,
            json={"attributes": {"first_address": {}}, "properties": {"flavor": {"type": "string"}}, "support_status": {"status": "SUPPORTED"}},
        )
    )
    upstream.get(f"{HEAT}/resource_types/OS::Nova::Server/template").mock(
        return_value=httpx.Response(200, json={"heat_template_version": "2016-10-14", "resources": {}})
    )
    upstream.get(f"{HEAT}/template_versions").mock(
        return_value=httpx.Response(
            200,
            json={
                "template_versions": [
                    {"version": "heat_template_version.2021-04-16", "type": "hot", "aliases": ["wallaby"]},
                    {"version": "AWSTemplateFormatVersion.2010-09-09", "type": "cfn"},
                ]
            },
        )
    )
    upstream.get(f"{HEAT}/template_versions/heat_template_version.2021-04-16/functions").mock(
        return_value=httpx.Response(
            200,
            json={"template_functions": [{"functions": "str_replace", "description": "replace"}, {"functions": "get_attr", "description": "attr"}]},
        )
    )
    types = (await logged_in.get("/api/orchestration/resource-types")).json()
    assert [t["name"] for t in types["items"]] == ["OS::Cinder::Volume", "OS::Nova::Server"]
    listed = upstream.get(f"{HEAT}/resource_types")
    assert listed.call_count == 1
    await logged_in.get("/api/orchestration/resource-types")
    assert listed.call_count == 1
    detail = (await logged_in.get("/api/orchestration/resource-types/OS::Nova::Server")).json()
    assert detail["properties"]["flavor"]["type"] == "string" and "2016-10-14" in detail["template_yaml"]
    versions = (await logged_in.get("/api/orchestration/template-versions")).json()
    assert versions["items"][0]["version"].startswith("AWS")
    functions = (
        await logged_in.get("/api/orchestration/template-versions/heat_template_version.2021-04-16/functions")
    ).json()
    assert [f["functions"] for f in functions["items"]] == ["get_attr", "str_replace"]


async def test_plain_resource_type_names(logged_in, upstream):
    upstream.get(f"{HEAT}/resource_types").mock(
        return_value=httpx.Response(200, json={"resource_types": ["OS::Nova::Server"]})
    )
    types = (await logged_in.get("/api/orchestration/resource-types")).json()
    assert types["items"] == [{"name": "OS::Nova::Server", "description": None}]
