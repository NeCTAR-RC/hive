import { describe, expect, it } from "vitest";
import { faultResponse, parseFault } from "./faults";

describe("parseFault", () => {
  it.each([
    [
      "a status",
      "GET /api/volumes 403",
      { method: "GET", path: "/api/volumes", outcome: 403 },
    ],
    [
      "a network failure",
      "POST /api/volumes network",
      { method: "POST", path: "/api/volumes", outcome: "network" },
    ],
    [
      "no outcome, as a 409",
      "DELETE /api/volumes/vol-1",
      { method: "DELETE", path: "/api/volumes/vol-1", outcome: 409 },
    ],
    [
      "an encoded cookie value",
      encodeURIComponent("GET /api/me 401"),
      { method: "GET", path: "/api/me", outcome: 401 },
    ],
  ])("reads %s", (_, rule, expected) => {
    expect(parseFault(rule)).toEqual(expected);
  });

  it.each([undefined, "", "GET"])("ignores %j", (rule) => {
    expect(parseFault(rule)).toBeNull();
  });
});

describe("faultResponse", () => {
  it("answers a status in the backend's error envelope", async () => {
    const response = faultResponse(401);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "session_expired",
      message: "the mock API refused this request",
    });
  });

  it("answers a network failure with no response at all", () => {
    expect(faultResponse("network").type).toBe("error");
  });
});
