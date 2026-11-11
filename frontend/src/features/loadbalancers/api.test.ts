import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api/client";
import { BUSY_MESSAGE, lbWrite } from "./api";

/** A JSON error reply in the backend's envelope. */
function refusal(status: number, error: string, message: string) {
  return new Response(JSON.stringify({ error, message, request_id: "r-1" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("lbWrite", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    // A write sends the CSRF cookie back as a header; this runs in Node.
    vi.stubGlobal("document", { cookie: "" });
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("says a busy refusal in the panel's own words", async () => {
    fetchMock.mockResolvedValue(
      refusal(
        409,
        "load_balancer_busy",
        "The load balancer is PENDING_UPDATE; try again once it is ACTIVE.",
      ),
    );
    const failure = lbWrite("/api/load-balancers/listeners", {
      method: "POST",
      json: {},
    });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({
      status: 409,
      code: "load_balancer_busy",
      message: BUSY_MESSAGE,
      requestId: "r-1",
    });
  });

  it("passes every other failure on as it came", async () => {
    fetchMock.mockResolvedValue(
      refusal(409, "quota_exceeded", "Listener quota exceeded."),
    );
    await expect(
      lbWrite("/api/load-balancers/listeners", { method: "POST", json: {} }),
    ).rejects.toMatchObject({
      code: "quota_exceeded",
      message: "Listener quota exceeded.",
    });
  });
});
