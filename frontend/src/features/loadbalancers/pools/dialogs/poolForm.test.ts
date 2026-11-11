import { describe, expect, it } from "vitest";
import {
  poolCreateBody,
  poolUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import {
  createPoolBody,
  editPoolBody,
  newPoolProtocol,
  type CreatePoolValues,
  type EditPoolValues,
} from "./poolForm";

/** A round robin pool for listener l-1, with every optional field empty. */
const created: CreatePoolValues = {
  name: "",
  description: "",
  listener_id: "l-1",
  protocol: "TCP",
  lb_algorithm: "ROUND_ROBIN",
  persistence: "",
  cookie_name: "session",
  admin_state_up: true,
};

describe("createPoolBody", () => {
  it.each<[string, CreatePoolValues, Record<string, unknown>]>([
    [
      "joins the listener and sends no persistence",
      created,
      {
        loadbalancer_id: "lb-1",
        listener_id: "l-1",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        session_persistence: null,
      },
    ],
    [
      "sends the protocol without a listener, and the optional fields set",
      {
        ...created,
        name: "web",
        description: "Web servers",
        listener_id: "",
        lb_algorithm: "LEAST_CONNECTIONS",
        persistence: "SOURCE_IP",
        admin_state_up: false,
      },
      {
        loadbalancer_id: "lb-1",
        protocol: "TCP",
        lb_algorithm: "LEAST_CONNECTIONS",
        admin_state_up: false,
        name: "web",
        description: "Web servers",
        session_persistence: { type: "SOURCE_IP" },
      },
    ],
    [
      "names the cookie of application cookie persistence",
      { ...created, persistence: "APP_COOKIE" },
      {
        loadbalancer_id: "lb-1",
        listener_id: "l-1",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        session_persistence: { type: "APP_COOKIE", cookie_name: "session" },
      },
    ],
  ])("%s", (_, input, expected) => {
    const body = createPoolBody("lb-1", input);
    expect(body).toEqual(expected);
    expect(poolCreateBody.parse(body)).toEqual(body);
  });
});

/** A pool's editable fields as the edit dialog opens them. */
const edited: EditPoolValues = {
  name: "web",
  description: "",
  lb_algorithm: "ROUND_ROBIN",
  persistence: "",
  cookie_name: "session",
  tls_enabled: false,
  admin_state_up: true,
};

describe("editPoolBody", () => {
  it.each<[string, EditPoolValues, Record<string, unknown>]>([
    [
      "clears the persistence set to None",
      edited,
      {
        name: "web",
        description: "",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        tls_enabled: false,
        session_persistence: null,
      },
    ],
    [
      "sends HTTP cookie persistence without a cookie name",
      { ...edited, persistence: "HTTP_COOKIE" },
      {
        name: "web",
        description: "",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        tls_enabled: false,
        session_persistence: { type: "HTTP_COOKIE" },
      },
    ],
    [
      "names the cookie of application cookie persistence",
      { ...edited, persistence: "APP_COOKIE" },
      {
        name: "web",
        description: "",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        tls_enabled: false,
        session_persistence: { type: "APP_COOKIE", cookie_name: "session" },
      },
    ],
    [
      "switches TLS to the members on",
      { ...edited, tls_enabled: true },
      {
        name: "web",
        description: "",
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        tls_enabled: true,
        session_persistence: null,
      },
    ],
  ])("%s", (_, input, expected) => {
    const body = editPoolBody(input);
    expect(body).toEqual(expected);
    expect(poolUpdateBody.parse(body)).toEqual(body);
  });
});

describe("newPoolProtocol", () => {
  const listeners = [
    { id: "l-1", protocol: "TERMINATED_HTTPS" },
    { id: "l-2", protocol: "UDP" },
  ];

  it("follows the chosen listener", () => {
    expect(newPoolProtocol(listeners, "l-1", "TCP")).toBe("HTTP");
    expect(newPoolProtocol(listeners, "l-2", "")).toBe("UDP");
  });

  it("takes the chosen protocol without a listener", () => {
    expect(newPoolProtocol(listeners, "", "SCTP")).toBe("SCTP");
  });
});
