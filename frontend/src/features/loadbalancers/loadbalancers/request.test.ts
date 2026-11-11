import { describe, expect, it } from "vitest";
import type { LoadBalancerCreateRequest } from "../../../lib/api/types/loadbalancers";
import { loadBalancerCreateBody } from "../../../mocks/loadbalancers/schemas";
import { CREATE_DEFAULTS, type CreateForm } from "./createForm";
import { createRequest } from "./request";

/** The wizard's opening values on subnet-1, with `changes` applied. */
function form(changes: Partial<CreateForm> = {}): CreateForm {
  return { ...CREATE_DEFAULTS, vip_subnet_id: "subnet-1", ...changes };
}

/** The opening listener with `changes` applied. */
function listener(changes: Partial<CreateForm["listener"]>) {
  return { ...CREATE_DEFAULTS.listener, ...changes };
}

/** The opening pool with `changes` applied. */
function pool(changes: Partial<CreateForm["pool"]>) {
  return { ...CREATE_DEFAULTS.pool, ...changes };
}

/** Only the load balancer, as the details step leaves it. */
const lbOnly = { create_listener: false, create_pool: false };

const noHeaders = {
  "X-Forwarded-For": false,
  "X-Forwarded-Port": false,
  "X-Forwarded-Proto": false,
};

const defaultTimeouts = {
  timeout_client_data: 50000,
  timeout_member_connect: 5000,
  timeout_member_data: 50000,
  timeout_tcp_inspect: 0,
};

const httpListener = {
  protocol: "HTTP",
  protocol_port: 80,
  connection_limit: -1,
  admin_state_up: true,
  insert_headers: noHeaders,
  ...defaultTimeouts,
};

const roundRobinPool = {
  lb_algorithm: "ROUND_ROBIN",
  admin_state_up: true,
  session_persistence: null,
};

/** Checks the body against the mocked API, which strips unknown fields. */
function expectAccepted(body: LoadBalancerCreateRequest) {
  expect(loadBalancerCreateBody.parse(body)).toEqual(body);
}

describe("createRequest", () => {
  it.each<[string, CreateForm, LoadBalancerCreateRequest]>([
    [
      "sends only the subnet and admin state of a bare load balancer",
      form(lbOnly),
      { vip_subnet_id: "subnet-1", admin_state_up: true },
    ],
    [
      "sends the load balancer's optional fields when set",
      form({
        ...lbOnly,
        name: "web-lb",
        description: "Public web",
        vip_address: "10.0.0.10",
        flavor_id: "flavor-small",
        availability_zone: "melbourne-qh2",
        admin_state_up: false,
      }),
      {
        vip_subnet_id: "subnet-1",
        admin_state_up: false,
        name: "web-lb",
        description: "Public web",
        vip_address: "10.0.0.10",
        flavor_id: "flavor-small",
        availability_zone: "melbourne-qh2",
      },
    ],
    [
      "sends nothing past the load balancer when the listener is off",
      form({ create_listener: false, create_pool: true, create_monitor: true }),
      { vip_subnet_id: "subnet-1", admin_state_up: true },
    ],
  ])("%s", (_, input, expected) => {
    const body = createRequest(input);
    expect(body).toEqual(expected);
    expectAccepted(body);
  });

  it.each<[string, CreateForm["listener"], Record<string, unknown>]>([
    [
      "HTTP: the forwarded headers and the timeouts",
      listener({}),
      httpListener,
    ],
    [
      "terminated HTTPS: the headers, the certificate and the timeouts",
      listener({
        protocol: "TERMINATED_HTTPS",
        protocol_port: 443,
        xff: true,
        xfproto: true,
        tls_ref: "barbican://certificate",
      }),
      {
        protocol: "TERMINATED_HTTPS",
        protocol_port: 443,
        connection_limit: -1,
        admin_state_up: true,
        insert_headers: {
          "X-Forwarded-For": true,
          "X-Forwarded-Port": false,
          "X-Forwarded-Proto": true,
        },
        default_tls_container_ref: "barbican://certificate",
        ...defaultTimeouts,
      },
    ],
    [
      "terminated HTTPS without a certificate: no certificate reference",
      listener({ protocol: "TERMINATED_HTTPS", protocol_port: 443 }),
      {
        protocol: "TERMINATED_HTTPS",
        protocol_port: 443,
        connection_limit: -1,
        admin_state_up: true,
        insert_headers: noHeaders,
        ...defaultTimeouts,
      },
    ],
    [
      "TCP: the timeouts, the name and sources set, no headers",
      listener({
        name: "ssh",
        protocol: "TCP",
        protocol_port: 22,
        connection_limit: 100,
        allowed_cidrs: "10.0.0.0/8 192.168.0.0/16",
        timeout_client_data: 1000,
      }),
      {
        protocol: "TCP",
        protocol_port: 22,
        connection_limit: 100,
        admin_state_up: true,
        name: "ssh",
        allowed_cidrs: ["10.0.0.0/8", "192.168.0.0/16"],
        ...defaultTimeouts,
        timeout_client_data: 1000,
      },
    ],
    [
      "UDP: no headers and no timeouts",
      listener({ protocol: "UDP", protocol_port: 53 }),
      {
        protocol: "UDP",
        protocol_port: 53,
        connection_limit: -1,
        admin_state_up: true,
      },
    ],
    [
      "SCTP: no headers and no timeouts",
      listener({ protocol: "SCTP", protocol_port: 9000 }),
      {
        protocol: "SCTP",
        protocol_port: 9000,
        connection_limit: -1,
        admin_state_up: true,
      },
    ],
  ])("sends a listener alone, for %s", (_, input, expected) => {
    const body = createRequest(form({ listener: input, create_pool: false }));
    expect(body).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
      listener: expected,
    });
    expectAccepted(body);
  });

  it.each<[string, CreateForm["pool"], Record<string, unknown>]>([
    ["no session persistence", pool({}), roundRobinPool],
    [
      "source IP persistence and a name",
      pool({
        name: "web",
        lb_algorithm: "LEAST_CONNECTIONS",
        persistence: "SOURCE_IP",
        cookie_name: "ignored",
      }),
      {
        lb_algorithm: "LEAST_CONNECTIONS",
        admin_state_up: true,
        name: "web",
        session_persistence: { type: "SOURCE_IP" },
      },
    ],
    [
      "application cookie persistence with its cookie",
      pool({ persistence: "APP_COOKIE", cookie_name: "session" }),
      {
        lb_algorithm: "ROUND_ROBIN",
        admin_state_up: true,
        session_persistence: { type: "APP_COOKIE", cookie_name: "session" },
      },
    ],
  ])("sends a pool with %s and no members", (_, input, expected) => {
    const body = createRequest(form({ pool: input }));
    expect(body).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
      listener: httpListener,
      pool: expected,
      members: [],
    });
    expectAccepted(body);
  });

  it("sends each member, with its name and subnet only when set", () => {
    const body = createRequest(
      form({
        members: [
          {
            name: "web-1",
            address: "192.168.1.20",
            subnet_id: "subnet-1",
            protocol_port: 80,
            weight: 1,
            backup: false,
          },
          {
            name: "",
            address: "203.0.113.5",
            subnet_id: "",
            protocol_port: 8080,
            weight: 10,
            backup: true,
          },
        ],
      }),
    );
    expect(body).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
      listener: httpListener,
      pool: roundRobinPool,
      members: [
        {
          address: "192.168.1.20",
          protocol_port: 80,
          weight: 1,
          backup: false,
          admin_state_up: true,
          subnet_id: "subnet-1",
          name: "web-1",
        },
        {
          address: "203.0.113.5",
          protocol_port: 8080,
          weight: 10,
          backup: true,
          admin_state_up: true,
        },
      ],
    });
    expectAccepted(body);
  });

  it.each<[string, CreateForm["monitor"], Record<string, unknown>]>([
    [
      "an HTTP check, a blank path and codes as / and 200",
      { ...CREATE_DEFAULTS.monitor, url_path: "", expected_codes: "" },
      {
        type: "HTTP",
        delay: 5,
        timeout: 5,
        max_retries: 3,
        max_retries_down: 3,
        admin_state_up: true,
        http_method: "GET",
        url_path: "/",
        expected_codes: "200",
      },
    ],
    [
      "no HTTP check for a TCP monitor",
      { ...CREATE_DEFAULTS.monitor, type: "TCP", delay: 10 },
      {
        type: "TCP",
        delay: 10,
        timeout: 5,
        max_retries: 3,
        max_retries_down: 3,
        admin_state_up: true,
      },
    ],
  ])("sends a monitor with %s", (_, input, expected) => {
    const body = createRequest(form({ create_monitor: true, monitor: input }));
    expect(body).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
      listener: httpListener,
      pool: roundRobinPool,
      members: [],
      monitor: expected,
    });
    expectAccepted(body);
  });

  it("sends no monitor without a pool", () => {
    const body = createRequest(
      form({ create_pool: false, create_monitor: true }),
    );
    expect(body).toEqual({
      vip_subnet_id: "subnet-1",
      admin_state_up: true,
      listener: httpListener,
    });
    expectAccepted(body);
  });
});
