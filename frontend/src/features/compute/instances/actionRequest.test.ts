import { describe, expect, it } from "vitest";
import type { InstanceActionRequest } from "../../../lib/api/types/compute";
import { instanceActionBody } from "../../../mocks/compute/schemas";
import { actionRequest, type RequestActionId } from "./actionRequest";

describe("actionRequest", () => {
  it.each<{ id: RequestActionId; body: InstanceActionRequest }>([
    { id: "start", body: { action: "start" } },
    { id: "stop", body: { action: "stop" } },
    { id: "soft-reboot", body: { action: "reboot", type: "SOFT" } },
    { id: "hard-reboot", body: { action: "reboot", type: "HARD" } },
    { id: "pause", body: { action: "pause" } },
    { id: "unpause", body: { action: "unpause" } },
    { id: "suspend", body: { action: "suspend" } },
    { id: "resume", body: { action: "resume" } },
    { id: "shelve", body: { action: "shelve" } },
    { id: "unshelve", body: { action: "unshelve" } },
    { id: "lock", body: { action: "lock" } },
    { id: "unlock", body: { action: "unlock" } },
    { id: "unrescue", body: { action: "unrescue" } },
    { id: "confirm-resize", body: { action: "confirm-resize" } },
    { id: "revert-resize", body: { action: "revert-resize" } },
  ])("sends $id as $body", ({ id, body }) => {
    const request = actionRequest(id, "i-web-1");
    expect(request).toEqual({ instanceId: "i-web-1", body });
    expect(instanceActionBody.safeParse(request.body).success).toBe(true);
  });
});
