// Response helpers every mocked handler shares, so mocked failures look
// exactly like the backend's, replies are typed by the backend's contract
// and request bodies are checked the way the backend checks them.
import { HttpResponse } from "msw";
import type { z } from "zod";
import type { ErrorEnvelope } from "../lib/api/client";
import type { paths } from "../lib/api/generated/openapi";

type Method = "get" | "post" | "put" | "patch" | "delete";
type SuccessStatus = 200 | 201 | 202;

/** The JSON bodies an operation's success replies carry, by the contract. */
type SuccessBody<Operation> = Operation extends { responses: infer Replies }
  ? {
      [Status in keyof Replies & SuccessStatus]: Replies[Status] extends {
        content: { "application/json": infer Body };
      }
        ? Body
        : never;
    }[keyof Replies & SuccessStatus]
  : never;

/**
 * The body a mocked handler answers `method path` with, from the generated
 * contract, so `tsc` rejects a reply field the backend does not send:
 * `HttpResponse.json<Reply<"/api/dns/zones", "get">>({ ... })`.
 */
export type Reply<Path extends keyof paths, M extends Method> = SuccessBody<
  paths[Path][M]
>;

/** A failure in the backend's error envelope (backend/hive/errors.py). */
export function apiError(
  status: number,
  code: string,
  message: string,
  service?: string,
) {
  const envelope: ErrorEnvelope = { error: code, message, service };
  return HttpResponse.json(envelope, { status });
}

/** A 404 for a resource the mocked backend does not have. */
export function notFound(message = "not found", service?: string) {
  return apiError(404, "not_found", message, service);
}

/**
 * The request's JSON body, checked against `schema`. A body that does not
 * match is answered with a 422 in the backend's envelope (MSW sends a thrown
 * Response as the reply) and logged as a "[mock]" error, which the e2e
 * fixture turns into a test failure: a form that sends a wrong or missing
 * field fails its spec instead of passing against a lenient mock.
 */
export async function readBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
): Promise<z.output<Schema>> {
  const result = schema.safeParse(await request.json().catch(() => null));
  if (result.success) return result.data;
  const path = new URL(request.url).pathname;
  const problems = result.error.issues
    .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
    .join("; ");
  console.error(
    `[mock] ${request.method} ${path} sent an invalid body: ${problems}`,
  );
  throw apiError(422, "validation_error", `invalid request body: ${problems}`);
}
