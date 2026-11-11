import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiError, notFound, readBody } from "./http";

const schema = z.object({ name: z.string().min(1), size: z.number() });

function post(body: string) {
  return new Request("http://localhost/api/volumes", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}

/** What readBody threw: the mocked 422 response. */
async function rejection(request: Request): Promise<Response> {
  const thrown: unknown = await readBody(request, schema).catch(
    (error: unknown) => error,
  );
  if (!(thrown instanceof Response)) throw new Error("expected a response");
  return thrown;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("readBody", () => {
  it("returns a body that matches the schema", async () => {
    await expect(
      readBody(post('{"name":"data","size":10,"extra":true}'), schema),
    ).resolves.toEqual({ name: "data", size: 10 });
  });

  it.each([
    ["a missing field", '{"name":"data"}', "size"],
    ["a wrong type", '{"name":"data","size":"10"}', "size"],
    ["an empty required text", '{"name":"","size":1}', "name"],
    ["a body that is not JSON", "name=data", "expected object"],
  ])("answers %s with a 422 in the envelope", async (_, body, mentions) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await rejection(post(body));
    expect(response.status).toBe(422);
    const envelope: unknown = await response.json();
    expect(envelope).toMatchObject({ error: "validation_error" });
    expect(JSON.stringify(envelope)).toContain(mentions);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("[mock] POST /api/volumes"),
    );
  });
});

describe("apiError", () => {
  it("answers in the backend envelope", async () => {
    const response = apiError(409, "conflict", "already exists", "nova");
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "conflict",
      message: "already exists",
      service: "nova",
    });
  });

  it("says not found by default", async () => {
    const response = notFound();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: "not_found",
      message: "not found",
    });
  });
});
