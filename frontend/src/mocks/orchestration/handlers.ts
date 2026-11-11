// Mocked API for the orchestration panels: stacks, templates and resource
// types.
// The in-memory state is the backend for one page load; handlers change
// it in place, so a create or delete shows up in the following list.
import { http, HttpResponse } from "msw";
import type {
  ParameterSpec,
  Stack,
  StackDetail,
  StackResource,
} from "../../lib/api/types/orchestration";
import { nextId } from "../ids";
import { apiError, notFound, readBody, type Reply } from "../http";
import {
  stackActionBody,
  stackCreateBody,
  validateTemplateBody,
} from "./schemas";

const stackBase = (
  overrides: Partial<Stack> & { id: string; name: string },
): Stack => ({
  description: null,
  status: "CREATE_COMPLETE",
  status_reason: "Stack CREATE completed successfully",
  creation_time: "2026-10-01T01:00:00Z",
  updated_time: null,
  deletion_time: null,
  timeout_mins: 60,
  disable_rollback: true,
  tags: [],
  parent: null,
  stack_owner: "sam",
  is_transitional: false,
  actions: ["suspend", "check", "update", "delete"],
  ...overrides,
});

/** A stack as the list shows it, without its detail fields. */
function listed(stack: StackDetail): Stack {
  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    status: stack.status,
    status_reason: stack.status_reason,
    creation_time: stack.creation_time,
    updated_time: stack.updated_time,
    deletion_time: stack.deletion_time,
    timeout_mins: stack.timeout_mins,
    disable_rollback: stack.disable_rollback,
    tags: stack.tags,
    parent: stack.parent,
    stack_owner: stack.stack_owner,
    is_transitional: stack.is_transitional,
    actions: stack.actions,
  };
}

let stacks: StackDetail[] = [
  {
    ...stackBase({
      id: "stack-1",
      name: "web-tier",
      description: "Two web servers",
    }),
    parameters: { "OS::stack_id": "stack-1", count: "2", flavor: "m3.small" },
    outputs: [
      {
        key: "ip",
        value: "203.0.113.10",
        description: "Public address",
        error: null,
      },
    ],
    capabilities: [],
    notification_topics: [],
    template_description: "Two web servers",
  },
  {
    ...stackBase({
      id: "stack-2",
      name: "building",
      status: "CREATE_IN_PROGRESS",
      status_reason: "Stack CREATE started",
      is_transitional: true,
      actions: ["delete"],
    }),
    parameters: {},
    outputs: [],
    capabilities: [],
    notification_topics: [],
    template_description: null,
  },
  {
    ...stackBase({
      id: "stack-3",
      name: "rolling-out",
      status: "UPDATE_IN_PROGRESS",
      status_reason: "Stack UPDATE started",
      is_transitional: true,
      actions: ["cancel_update", "delete"],
    }),
    parameters: {},
    outputs: [],
    capabilities: [],
    notification_topics: [],
    template_description: null,
  },
];

const PARAMETERS: ParameterSpec[] = [
  {
    name: "flavor",
    type: "string",
    label: "Flavour",
    description: "Server size",
    group: "Sizing",
    default: "m3.small",
    no_echo: false,
    required: false,
    allowed_values: ["m3.small", "m3.medium"],
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    custom_constraint: "nova.flavor",
    constraint_description: null,
  },
  {
    name: "count",
    type: "number",
    label: "Server count",
    description: "",
    group: "Sizing",
    default: 1,
    no_echo: false,
    required: false,
    allowed_values: null,
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: 1,
    max_value: 5,
    custom_constraint: null,
    constraint_description: null,
  },
  {
    name: "key_name",
    type: "string",
    label: "Key pair",
    description: "SSH key pair name",
    group: null,
    default: null,
    no_echo: false,
    required: true,
    allowed_values: null,
    allowed_pattern: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    custom_constraint: "nova.keypair",
    constraint_description: null,
  },
];

/** Every stack's resources: the mocks seed one server per stack. */
const STACK_RESOURCES: StackResource[] = [
  {
    name: "server",
    logical_id: "server",
    physical_id: "i-1",
    type: "OS::Nova::Server",
    status: "CREATE_COMPLETE",
    status_reason: "state changed",
    updated_time: "2026-10-01T01:02:00Z",
    creation_time: "2026-10-01T01:00:00Z",
    required_by: [],
    is_transitional: false,
    attributes: null,
    description: null,
  },
];

export const orchestrationHandlers = [
  http.get("/api/orchestration/stacks", () =>
    HttpResponse.json<Reply<"/api/orchestration/stacks", "get">>({
      items: stacks.map(listed),
    }),
  ),
  http.post("/api/orchestration/validate", async ({ request }) => {
    const body = await readBody(request, validateTemplateBody);
    if (!body.template && !body.template_url) {
      return apiError(
        400,
        "bad_request",
        "Provide a template or a template URL.",
      );
    }
    if (body.template?.includes("broken")) {
      return apiError(
        400,
        "bad_request",
        "The template is not valid YAML or JSON.",
      );
    }
    return HttpResponse.json<Reply<"/api/orchestration/validate", "post">>({
      description: "Two web servers",
      parameters: PARAMETERS,
    });
  }),
  http.post("/api/orchestration/stacks", async ({ request }) => {
    const body = await readBody(request, stackCreateBody);
    const id = nextId("stack");
    stacks.push({
      ...stackBase({
        id,
        name: body.name,
        status: "CREATE_IN_PROGRESS",
        status_reason: "Stack CREATE started",
        is_transitional: true,
        actions: ["delete"],
      }),
      parameters: body.parameters,
      outputs: [],
      capabilities: [],
      notification_topics: [],
      template_description: null,
    });
    return HttpResponse.json<Reply<"/api/orchestration/stacks", "post">>(
      { id, name: body.name },
      { status: 202 },
    );
  }),
  http.get("/api/orchestration/stacks/:id", ({ params }) => {
    const stack = stacks.find((s) => s.id === params["id"]);
    return stack
      ? HttpResponse.json<Reply<"/api/orchestration/stacks/{identity}", "get">>(
          stack,
        )
      : notFound("no such stack");
  }),
  http.patch("/api/orchestration/stacks/:id", ({ params }) => {
    const stack = stacks.find((s) => s.id === params["id"]);
    if (stack) {
      stack.status = "UPDATE_IN_PROGRESS";
      stack.is_transitional = true;
      stack.actions = ["cancel_update", "delete"];
    }
    if (!stack) return notFound("no such stack");
    return HttpResponse.json<
      Reply<"/api/orchestration/stacks/{identity}", "patch">
    >({ id: stack.id, name: stack.name }, { status: 202 });
  }),
  http.post(
    "/api/orchestration/stacks/:id/actions",
    async ({ params, request }) => {
      const { action } = await readBody(request, stackActionBody);
      const stack = stacks.find((s) => s.id === params["id"]);
      if (stack && action === "suspend") {
        stack.status = "SUSPEND_COMPLETE";
        stack.actions = ["resume", "update", "delete"];
      }
      if (stack && action === "resume") {
        stack.status = "RESUME_COMPLETE";
        stack.actions = ["suspend", "check", "update", "delete"];
      }
      if (stack && action === "cancel_update") {
        stack.status = "ROLLBACK_COMPLETE";
        stack.is_transitional = false;
        stack.actions = ["suspend", "check", "update", "delete"];
      }
      return HttpResponse.json<
        Reply<"/api/orchestration/stacks/{identity}/actions", "post">
      >({ id: String(params["id"]), action }, { status: 202 });
    },
  ),
  http.delete("/api/orchestration/stacks/:id", ({ params }) => {
    stacks = stacks.filter((s) => s.id !== params["id"]);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/orchestration/stacks/:id/resources", () =>
    HttpResponse.json<
      Reply<"/api/orchestration/stacks/{identity}/resources", "get">
    >({ items: STACK_RESOURCES }),
  ),
  http.get(
    "/api/orchestration/stacks/:id/resources/:resource",
    ({ params }) => {
      const found = STACK_RESOURCES.find(
        (resource) => resource.name === params["resource"],
      );
      return found
        ? HttpResponse.json<
            Reply<
              "/api/orchestration/stacks/{identity}/resources/{resource}",
              "get"
            >
          >({
            // Heat sends a resource's attributes only when it is read alone.
            ...found,
            attributes: { name: "server", networks: { classic: ["10.0.0.5"] } },
            description: "The stack's one server",
          })
        : notFound("resource not found", "heat");
    },
  ),
  http.get("/api/orchestration/stacks/:id/events", () =>
    HttpResponse.json<
      Reply<"/api/orchestration/stacks/{identity}/events", "get">
    >({
      items: [
        {
          id: "ev-1",
          resource_name: "server",
          logical_id: "server",
          physical_id: "i-1",
          status: "CREATE_COMPLETE",
          status_reason: "state changed",
          event_time: "2026-10-01T01:02:00Z",
        },
      ],
    }),
  ),
  http.get("/api/orchestration/stacks/:id/template", () =>
    HttpResponse.json<
      Reply<"/api/orchestration/stacks/{identity}/template", "get">
    >({
      template: { heat_template_version: "2021-04-16", resources: {} },
      template_yaml: "heat_template_version: 2021-04-16\nresources: {}\n",
      environment: {
        parameters: { count: "2" },
        parameter_defaults: { flavor: "m3.small" },
      },
      environment_yaml:
        "parameters:\n  count: '2'\nparameter_defaults:\n  flavor: m3.small\n",
      editable_environment_yaml: "parameter_defaults:\n  flavor: m3.small\n",
    }),
  ),
  http.get("/api/orchestration/resource-types", () =>
    HttpResponse.json<Reply<"/api/orchestration/resource-types", "get">>({
      items: [
        { name: "OS::Cinder::Volume", description: "A volume." },
        { name: "OS::Nova::Server", description: "A server.\n\nMore detail." },
      ],
    }),
  ),
  http.get("/api/orchestration/resource-types/*", ({ request }) => {
    const name = decodeURIComponent(
      new URL(request.url).pathname.split("/resource-types/")[1] ?? "",
    );
    return HttpResponse.json<
      Reply<"/api/orchestration/resource-types/{name}", "get">
    >({
      name,
      attributes: { first_address: { description: "The first address" } },
      properties: {
        flavor: { type: "string", required: true, description: "The flavour" },
      },
      support_status: { status: "SUPPORTED" },
      template: { heat_template_version: "2016-10-14" },
      template_yaml: "heat_template_version: 2016-10-14\n",
    });
  }),
  http.get("/api/orchestration/template-versions", () =>
    HttpResponse.json<Reply<"/api/orchestration/template-versions", "get">>({
      items: [
        { version: "AWSTemplateFormatVersion.2010-09-09", type: "cfn" },
        {
          version: "heat_template_version.2021-04-16",
          type: "hot",
          aliases: ["wallaby"],
        },
      ],
    }),
  ),
  http.get(
    "/api/orchestration/template-versions/:version/functions",
    ({ params }) =>
      HttpResponse.json<
        Reply<"/api/orchestration/template-versions/{version}/functions", "get">
      >({
        version: String(params["version"]),
        items: [
          { functions: "get_attr", description: "Get an attribute." },
          { functions: "str_replace", description: "Replace text." },
        ],
      }),
  ),
];
