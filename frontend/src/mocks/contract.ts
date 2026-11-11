// The mocked API held to the backend's contract: a mocked reply is checked
// against what the OpenAPI document (src/lib/api/generated/openapi.json,
// `pnpm generate:api`) promises for its route, status and body, so a mock
// that drifts from the backend fails instead of passing the e2e suite.
import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import documentText from "../lib/api/generated/openapi.json?raw";

/** The parts of an OpenAPI operation the check reads. */
interface Operation {
  responses: Record<string, { content?: Record<string, unknown> }>;
}

interface OpenApiDocument {
  paths: Record<string, Record<string, Operation>>;
}

/** One documented operation and the pattern its concrete paths match. */
interface Route {
  method: string;
  template: string;
  pattern: RegExp;
  responses: Operation["responses"];
}

const DOCUMENT_ID = "openapi";
const JSON_TYPE = "application/json";

const document = JSON.parse(documentText) as OpenApiDocument;

// FastAPI writes OpenAPI 3.1, whose schemas are JSON Schema 2020-12. Not
// strict, so the OpenAPI keywords beside them (discriminator) are skipped;
// formats are not checked (no format plugin), only types and shapes.
const ajv = new Ajv2020({ strict: false, validateFormats: false });
ajv.addSchema(document, DOCUMENT_ID);

/**
 * The path parameters the backend declares with Starlette's `:path`
 * converter, so they span slashes: object names and Heat resource type
 * names. The OpenAPI document drops the converter, so the check names them
 * (backend/hive/api/objectstore.py, orchestration.py).
 */
const MULTI_SEGMENT_PARAMS = [
  "/api/object-store/containers/{container}/objects/{name}",
  "/api/orchestration/resource-types/{name}",
];

/**
 * A path template as a pattern: each `{param}` matches one segment, but a
 * multi-segment parameter matches the rest of its path.
 */
function templatePattern(template: string): RegExp {
  const spans = MULTI_SEGMENT_PARAMS.find((prefix) =>
    template.startsWith(prefix),
  );
  const source = template
    .split(/(\{[^}]+\})/)
    .map((part, index, parts) => {
      if (!part.startsWith("{")) {
        return part.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
      }
      const upTo = parts.slice(0, index + 1).join("");
      return spans === upTo ? ".+" : "[^/]+";
    })
    .join("");
  return new RegExp(`^${source}$`);
}

/**
 * Every documented `/api` operation, the fixed paths first, so
 * `/api/reservations/options` wins over `/api/reservations/{id}`.
 */
const ROUTES: Route[] = Object.entries(document.paths)
  .filter(([template]) => template.startsWith("/api/"))
  .flatMap(([template, item]) =>
    Object.entries(item).map(([method, operation]) => ({
      method: method.toUpperCase(),
      template,
      pattern: templatePattern(template),
      responses: operation.responses,
    })),
  )
  .sort(
    (a, b) =>
      (a.template.match(/\{/g)?.length ?? 0) -
      (b.template.match(/\{/g)?.length ?? 0),
  );

/** The documented operation a request reaches, or undefined. */
function contractRoute(method: string, pathname: string): Route | undefined {
  return ROUTES.find(
    (route) => route.method === method && route.pattern.test(pathname),
  );
}

/** Every documented operation, as "METHOD /template". */
export function contractOperations(): string[] {
  return ROUTES.map((route) => `${route.method} ${route.template}`);
}

/** A JSON pointer segment, escaped for use in a URI fragment. */
function pointerSegment(segment: string): string {
  return encodeURIComponent(segment.replace(/~/g, "~0").replace(/\//g, "~1"));
}

const validators = new Map<string, ValidateFunction>();

/** The compiled check of one documented JSON reply, compiled once. */
function replyValidator(route: Route, status: string): ValidateFunction {
  const pointer = [
    "paths",
    route.template,
    route.method.toLowerCase(),
    "responses",
    status,
    "content",
    JSON_TYPE,
    "schema",
  ]
    .map(pointerSegment)
    .join("/");
  const ref = `${DOCUMENT_ID}#/${pointer}`;
  let validate = validators.get(ref);
  if (!validate) {
    validate = ajv.compile({ $ref: ref });
    validators.set(ref, validate);
  }
  return validate;
}

/**
 * What is wrong with one mocked success reply, by the contract: an
 * undocumented route or status, a body on a reply documented without one,
 * or a JSON body that breaks its schema. Empty when the reply matches.
 * Failures (4xx, 5xx) are the error envelope, which the document leaves
 * out, so only success replies are checked. `body` is the parsed JSON, or
 * undefined for an empty reply.
 */
export function replyProblems(
  method: string,
  pathname: string,
  status: number,
  body: unknown,
): string[] {
  const where = `${method} ${pathname}`;
  const route = contractRoute(method, pathname);
  if (!route) return [`${where} is not in the contract`];
  if (status < 200 || status >= 300) return [];
  const documented = route.responses[String(status)];
  if (!documented) {
    const statuses = Object.keys(route.responses)
      .filter((code) => code.startsWith("2"))
      .join(", ");
    return [`${where} answers ${status}; the contract documents ${statuses}`];
  }
  const content = documented.content ?? {};
  if (!(JSON_TYPE in content)) {
    // An empty reply (204), or a download whose body is not JSON.
    return Object.keys(content).length === 0 && body !== undefined
      ? [`${where} answers ${status} with a body; the contract has none`]
      : [];
  }
  const validate = replyValidator(route, String(status));
  if (validate(body)) return [];
  return (validate.errors ?? []).map(
    (error) =>
      `${where} ${status}: body${error.instancePath} ${error.message ?? "is invalid"} ${JSON.stringify(error.params)}`,
  );
}

/** A reply's JSON body from its text, or undefined when empty or not JSON. */
export function replyBody(text: string, contentType: string | null): unknown {
  if (!text || !(contentType ?? "").includes("json")) return undefined;
  return JSON.parse(text);
}
