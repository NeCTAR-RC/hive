import { describe, expect, it } from "vitest";
import {
  defaultPort,
  operatingTone,
  poolProtocolFor,
  provisioningLabel,
  provisioningTone,
} from "./status";

describe("load balancer status helpers", () => {
  it("labels and tones provisioning and operating statuses", () => {
    expect(provisioningLabel("PENDING_CREATE")).toBe("Creating");
    expect(provisioningTone("PENDING_UPDATE")).toBe("progress");
    expect(provisioningTone("ERROR")).toBe("danger");
    expect(operatingTone("DEGRADED")).toBe("warning");
    expect(operatingTone("ONLINE")).toBe("success");
  });

  it("picks default ports and pool protocols like the Angular wizard", () => {
    expect(defaultPort("HTTP", [])).toBe(80);
    expect(defaultPort("TERMINATED_HTTPS", [443, 444])).toBe(445);
    expect(poolProtocolFor("TERMINATED_HTTPS")).toBe("HTTP");
    expect(poolProtocolFor("TCP")).toBe("TCP");
  });
});
