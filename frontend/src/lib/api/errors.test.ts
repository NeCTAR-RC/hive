import { describe, expect, it } from "vitest";
import {
  ApiError,
  networkError,
  parseErrorEnvelope,
  parseJson,
} from "./errors";

describe("parseJson", () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ["[1,2]", [1, 2]],
    ["", null],
    ["<html>Bad gateway</html>", null],
  ])("reads %j", (text, expected) => {
    expect(parseJson(text)).toEqual(expected);
  });
});

describe("parseErrorEnvelope", () => {
  it.each([
    [
      "the backend envelope",
      403,
      JSON.stringify({
        error: "forbidden",
        message: "not allowed here",
        service: "nova",
        request_id: "req-9",
      }),
      {
        code: "forbidden",
        message: "not allowed here",
        service: "nova",
        requestId: "req-9",
      },
    ],
    [
      "an HTML error page",
      502,
      "<html><body>Bad gateway</body></html>",
      {
        code: "unknown",
        message: "<html><body>Bad gateway</body></html>",
        service: null,
        requestId: null,
      },
    ],
    [
      "an empty body",
      500,
      "",
      {
        code: "unknown",
        message: "request failed with status 500",
        service: null,
        requestId: null,
      },
    ],
  ])("reads %s", (_, status, text, expected) => {
    const error = parseErrorEnvelope(status, text);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(status);
    expect({
      code: error.code,
      message: error.message,
      service: error.service,
      requestId: error.requestId,
    }).toEqual(expected);
  });

  it("keeps the envelope's other keys as extra", () => {
    const error = parseErrorEnvelope(
      409,
      JSON.stringify({
        error: "load_balancer_busy",
        message: "the load balancer is busy",
        request_id: "req-1",
        upstream_request_id: "req-up",
        provisioning_status: "PENDING_UPDATE",
      }),
    );
    expect(error.extra).toEqual({ provisioning_status: "PENDING_UPDATE" });
    expect(parseErrorEnvelope(502, "<html></html>").extra).toEqual({});
  });

  it("keeps only the start of a long plain body", () => {
    expect(parseErrorEnvelope(500, "x".repeat(500)).message).toHaveLength(200);
  });

  it("marks a 401 as an authentication failure", () => {
    expect(parseErrorEnvelope(401, "").isAuth).toBe(true);
    expect(parseErrorEnvelope(403, "").isAuth).toBe(false);
  });
});

describe("networkError", () => {
  it("has status 0 and the network code", () => {
    const error = networkError("offline");
    expect([error.status, error.code, error.message]).toEqual([
      0,
      "network",
      "offline",
    ]);
  });
});
