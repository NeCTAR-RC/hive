// The mocked API against the backend's contract (TP-23): every route the
// mocks serve is a documented operation, and every documented read the
// mocks serve answers what the OpenAPI document promises. The e2e suite
// checks every other reply as the pages send their requests (browser.ts).
import { HttpHandler } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contractOperations, replyBody, replyProblems } from "./contract";
import { handlers } from "./handlers";

/**
 * A concrete path for each documented read with path parameters (or a
 * query worth sending), naming a record the mocks seed.
 */
const SAMPLES: Record<string, string> = {
  "/api/identity/users/search": "/api/identity/users/search?q=example",
  "/api/identity/users/{user_id}": "/api/identity/users/u2",
  "/api/compute/instances/{server_id}": "/api/compute/instances/i-web-1",
  "/api/compute/instances/{server_id}/volumes":
    "/api/compute/instances/i-web-1/volumes",
  "/api/compute/instances/{server_id}/ports":
    "/api/compute/instances/i-web-1/ports",
  "/api/compute/instances/{server_id}/action-log":
    "/api/compute/instances/i-web-1/action-log",
  "/api/compute/instances/{server_id}/console-output":
    "/api/compute/instances/i-web-1/console-output",
  "/api/compute/instances/{server_id}/password":
    "/api/compute/instances/i-web-1/password",
  "/api/compute/instances/{server_id}/resize-flavors":
    "/api/compute/instances/i-web-1/resize-flavors",
  "/api/compute/images/{image_id}": "/api/compute/images/img-ubuntu",
  "/api/compute/keypairs/{name}": "/api/compute/keypairs/ada-laptop",
  "/api/network/networks/{network_id}":
    "/api/network/networks/00000000-0000-0000-0000-000000000000",
  "/api/network/subnets/{subnet_id}": "/api/network/subnets/subnet-1",
  "/api/network/ports/{port_id}": "/api/network/ports/port-spare",
  "/api/network/routers/{router_id}": "/api/network/routers/r-1",
  "/api/network/routers/{router_id}/interface-candidates":
    "/api/network/routers/r-1/interface-candidates",
  "/api/network/floating-ips/{fip_id}": "/api/network/floating-ips/fip-1",
  "/api/network/trunks/{trunk_id}": "/api/network/trunks/trunk-1",
  "/api/network/security-groups/{group_id}":
    "/api/network/security-groups/secgroup-default",
  "/api/volumes/snapshots/{snapshot_id}": "/api/volumes/snapshots/snap-1",
  "/api/volumes/backups/{backup_id}": "/api/volumes/backups/bak-1",
  "/api/volumes/{volume_id}": "/api/volumes/vol-1",
  "/api/identity/application-credentials/{credential_id}":
    "/api/identity/application-credentials/ac-1",
  "/api/reservations/{reservation_id}": "/api/reservations/res-1",
  "/api/reservations/{reservation_id}/extend-options":
    "/api/reservations/res-1/extend-options",
  "/api/reservations/{reservation_id}/calendar.ics":
    "/api/reservations/res-1/calendar.ics",
  "/api/object-store/containers/{container}":
    "/api/object-store/containers/docs",
  "/api/object-store/containers/{container}/objects":
    "/api/object-store/containers/docs/objects",
  "/api/object-store/containers/{container}/objects/{name}/metadata":
    "/api/object-store/containers/docs/objects/readme.txt/metadata",
  "/api/object-store/containers/{container}/objects/{name}/download":
    "/api/object-store/containers/docs/objects/readme.txt/download",
  "/api/kubernetes/clusters/{cluster_id}": "/api/kubernetes/clusters/c-1",
  "/api/kubernetes/clusters/{cluster_id}/upgrade-options":
    "/api/kubernetes/clusters/c-1/upgrade-options",
  "/api/kubernetes/clusters/{cluster_id}/config":
    "/api/kubernetes/clusters/c-1/config",
  "/api/kubernetes/clusters/{cluster_id}/ca.pem":
    "/api/kubernetes/clusters/c-1/ca.pem",
  "/api/kubernetes/clusters/{cluster_id}/nodegroups":
    "/api/kubernetes/clusters/c-1/nodegroups",
  "/api/kubernetes/clusters/{cluster_id}/nodegroups/{nodegroup_id}":
    "/api/kubernetes/clusters/c-1/nodegroups/ng-m",
  "/api/kubernetes/cluster-templates/{template_id}":
    "/api/kubernetes/cluster-templates/t-134",
  "/api/load-balancers/{lb_id}": "/api/load-balancers/lb-1",
  "/api/load-balancers/{lb_id}/tree": "/api/load-balancers/lb-1/tree",
  "/api/load-balancers/l7policies/{policy_id}":
    "/api/load-balancers/l7policies/pol-1",
  "/api/orchestration/resource-types/{name}":
    "/api/orchestration/resource-types/OS::Cinder::Volume",
  "/api/orchestration/template-versions/{version}/functions":
    "/api/orchestration/template-versions/heat_template_version.2018-08-31/functions",
  "/api/orchestration/stacks/{identity}": "/api/orchestration/stacks/stack-1",
  "/api/orchestration/stacks/{identity}/resources":
    "/api/orchestration/stacks/stack-1/resources",
  "/api/orchestration/stacks/{identity}/resources/{resource}":
    "/api/orchestration/stacks/stack-1/resources/server",
  "/api/orchestration/stacks/{identity}/events":
    "/api/orchestration/stacks/stack-1/events",
  "/api/orchestration/stacks/{identity}/template":
    "/api/orchestration/stacks/stack-1/template",
  "/api/dns/zones/{zone_id}": "/api/dns/zones/zone-1",
  "/api/dns/zones/{zone_id}/recordsets": "/api/dns/zones/zone-1/recordsets",
  "/api/shares/shares/{share_id}": "/api/shares/shares/share-1",
  "/api/shares/shares/{share_id}/access": "/api/shares/shares/share-1/access",
  "/api/shares/snapshots/{snapshot_id}": "/api/shares/snapshots/ssnap-1",
  "/api/shares/security-services/{service_id}":
    "/api/shares/security-services/ss-1",
  "/api/shares/groups/{group_id}": "/api/shares/groups/sg-1",
  "/api/databases/instances/{instance_id}": "/api/databases/instances/db-1",
  "/api/databases/instances/{instance_id}/resize-flavors":
    "/api/databases/instances/db-1/resize-flavors",
  "/api/databases/instances/{instance_id}/configuration-defaults":
    "/api/databases/instances/db-1/configuration-defaults",
  "/api/databases/instances/{instance_id}/logs":
    "/api/databases/instances/db-1/logs",
  "/api/databases/instances/{instance_id}/logs/{name}/contents":
    "/api/databases/instances/db-1/logs/general/contents",
  "/api/databases/instances/{instance_id}/logs/{name}/download":
    "/api/databases/instances/db-1/logs/general/download",
  "/api/databases/instances/{instance_id}/upgrade-targets":
    "/api/databases/instances/db-1/upgrade-targets",
  "/api/databases/instances/{instance_id}/root":
    "/api/databases/instances/db-1/root",
  "/api/databases/instances/{instance_id}/backups":
    "/api/databases/instances/db-1/backups",
  "/api/databases/instances/{instance_id}/users":
    "/api/databases/instances/db-1/users",
  "/api/databases/instances/{instance_id}/users/{name}/access":
    "/api/databases/instances/db-1/users/app/access",
  "/api/databases/instances/{instance_id}/databases":
    "/api/databases/instances/db-1/databases",
  "/api/databases/backups/{backup_id}": "/api/databases/backups/bk-1",
  "/api/databases/configurations/{configuration_id}":
    "/api/databases/configurations/cfg-1",
};

/** Documented reads this test does not call, each with the reason. */
const UNCHECKED_READS: Record<string, string> = {
  "/api/shares/group-snapshots/{snapshot_id}":
    "mocked, but the mocks seed no share group snapshot to read",
};

/**
 * A route's shape: its path with every parameter as `{}`, so an MSW path
 * (`/api/dns/zones/:id`) and a contract template (`/api/dns/zones/{zone_id}`)
 * compare equal. A `*` inside an MSW path stands for one parameter (an
 * object name); a trailing `*` stays, as a prefix (see MOCKED).
 */
function shape(path: string): string {
  return path.replace(/:[^/]+|\{[^}]+\}|\*(?=\/)/g, "{}");
}

/** A mocked route, from its MSW handler: a shape, or a wildcard prefix. */
interface MockedRoute {
  method: string;
  path: string;
  /** Whether a contract template's shape is served by this route. */
  serves: (templateShape: string) => boolean;
}

/**
 * The mocks' /api routes, except the fault handler that answers every path.
 * A trailing `*` (object names, resource type names) serves every shape
 * under its prefix.
 */
const MOCKED: MockedRoute[] = handlers.flatMap((handler) => {
  if (!(handler instanceof HttpHandler)) return [];
  const { method, path } = handler.info;
  if (typeof method !== "string" || typeof path !== "string") return [];
  if (!path.startsWith("/api/") || path === "/api/*") return [];
  const own = shape(path);
  const serves = own.endsWith("/*")
    ? (templateShape: string) => templateShape.startsWith(own.slice(0, -1))
    : (templateShape: string) => templateShape === own;
  return [{ method, path, serves }];
});

/** Whether a mock serves the documented operation. */
function isMocked(method: string, template: string): boolean {
  return MOCKED.some(
    (route) => route.method === method && route.serves(shape(template)),
  );
}

const OPERATIONS = contractOperations().map((operation) => {
  const [method = "", template = ""] = operation.split(" ");
  return { method, template };
});

const READS = OPERATIONS.filter(
  ({ method, template }) => method === "GET" && !(template in UNCHECKED_READS),
).map(({ template }) => template);

const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

describe("the mocked API", () => {
  it.each(MOCKED.map((route) => [`${route.method} ${route.path}`, route]))(
    "serves %s, a documented operation",
    (_, route) => {
      const documented = OPERATIONS.some(
        ({ method, template }) =>
          method === route.method && route.serves(shape(template)),
      );
      expect(documented).toBe(true);
    },
  );

  it.each(READS)(
    "answers GET %s as the contract promises",
    async (template) => {
      expect(isMocked("GET", template), "no mock serves it").toBe(true);
      const path = SAMPLES[template] ?? template;
      expect(path.includes("{"), "add its sample path to SAMPLES").toBe(false);
      const response = await fetch(new URL(path, location.origin));
      const body = replyBody(
        await response.text(),
        response.headers.get("content-type"),
      );
      const pathname = new URL(path, location.origin).pathname;
      expect(replyProblems("GET", pathname, response.status, body)).toEqual([]);
      expect(response.ok, `answered ${response.status}`).toBe(true);
    },
  );

  it("mocks every documented operation", () => {
    const unmocked = OPERATIONS.filter(
      ({ method, template }) => !isMocked(method, template),
    ).map(({ method, template }) => `${method} ${template}`);
    expect(unmocked).toEqual([]);
  });

  it("names only documented reads as unchecked", () => {
    const reads = OPERATIONS.filter(({ method }) => method === "GET").map(
      ({ template }) => template,
    );
    expect(
      Object.keys(UNCHECKED_READS).filter((t) => !reads.includes(t)),
    ).toEqual([]);
  });

  it("flags a reply that breaks its schema, status or route", () => {
    expect(
      replyProblems("GET", "/api/dns/zones/zone-1", 200, { id: "zone-1" }),
    ).not.toEqual([]);
    expect(replyProblems("DELETE", "/api/dns/zones/zone-1", 200, {})).toEqual([
      "DELETE /api/dns/zones/zone-1 answers 200; the contract documents 204",
    ]);
    expect(replyProblems("GET", "/api/nowhere", 200, {})).toEqual([
      "GET /api/nowhere is not in the contract",
    ]);
  });

  it("reads an object name across slashes, as the backend does", () => {
    const path = "/api/object-store/containers/docs/objects/notes/a.txt";
    expect(
      replyProblems("PUT", path, 201, { name: "notes/a.txt", etag: null }),
    ).toEqual([]);
  });
});
