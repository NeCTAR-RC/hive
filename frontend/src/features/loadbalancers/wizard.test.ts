import { describe, expect, it } from "vitest";
import { DEFAULTS, newMember, toRequest, wizardSchema } from "./wizard";

const base = { ...DEFAULTS, vip_subnet_id: "subnet-1" };

describe("toRequest", () => {
  it("sends only the load balancer without a listener", () => {
    const request = toRequest({ ...base, create_listener: false });
    expect(request).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
    });
  });

  it("builds the listener, pool, members and monitor chain", () => {
    const request = toRequest({
      ...base,
      name: "web",
      l_xff: true,
      p_persistence: "APP_COOKIE",
      p_cookie_name: "sid",
      members: [newMember(80, { address: "10.0.0.5", subnet_id: "subnet-1" })],
      create_monitor: true,
    });
    expect(request.name).toBe("web");
    expect(request.listener).toMatchObject({
      protocol: "HTTP",
      protocol_port: 80,
      insert_headers: { "X-Forwarded-For": true },
      timeout_client_data: 50000,
    });
    expect(request.pool).toMatchObject({
      lb_algorithm: "ROUND_ROBIN",
      session_persistence: { type: "APP_COOKIE", cookie_name: "sid" },
    });
    expect(request.members).toEqual([
      {
        address: "10.0.0.5",
        protocol_port: 80,
        weight: 1,
        backup: false,
        admin_state_up: true,
        subnet_id: "subnet-1",
      },
    ]);
    expect(request.monitor).toMatchObject({
      type: "HTTP",
      url_path: "/",
      expected_codes: "200",
    });
  });

  it("omits headers and timeouts the protocol cannot take", () => {
    const request = toRequest({
      ...base,
      l_protocol: "UDP",
      l_protocol_port: 53,
      create_pool: false,
    });
    expect(request.listener).not.toHaveProperty("insert_headers");
    expect(request.listener).not.toHaveProperty("timeout_client_data");
    expect(request).not.toHaveProperty("pool");
    expect(request).not.toHaveProperty("members");
  });

  it("sends no persistence as null and the TLS reference for TLS", () => {
    const request = toRequest({
      ...base,
      l_protocol: "TERMINATED_HTTPS",
      l_protocol_port: 443,
      l_tls_ref: "https://barbican/v1/containers/abc",
    });
    expect(request.listener?.default_tls_container_ref).toBe(
      "https://barbican/v1/containers/abc",
    );
    expect(request.pool?.session_persistence).toBeNull();
  });
});

describe("wizardSchema", () => {
  it("asks for a port the protocol has no default for", () => {
    const result = wizardSchema.safeParse({
      ...base,
      l_protocol: "TCP",
      l_protocol_port: undefined,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Enter a port");
  });

  it("rejects a malformed allowed CIDR", () => {
    const result = wizardSchema.safeParse({
      ...base,
      l_allowed_cidrs: "10.0.0.0/8\n::/999",
    });
    expect(result.success).toBe(false);
  });
});
