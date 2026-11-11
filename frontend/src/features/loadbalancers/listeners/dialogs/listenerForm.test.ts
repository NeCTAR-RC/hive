import { describe, expect, it } from "vitest";
import type { LoadBalancerTree } from "../../../../lib/api/types/loadbalancers";
import { loadBalancerTree } from "../../../../mocks/loadbalancers/handlers";
import { LISTENER_TIMEOUT_DEFAULTS } from "../../status";
import {
  listenerCreateBody,
  listenerUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import {
  createListenerBody,
  editListenerBody,
  poolsFor,
  type CreateListenerValues,
  type EditListenerValues,
} from "./listenerForm";

/** The mock load balancer lb-1 with a pool of each protocol. */
function treeWithPools(): LoadBalancerTree {
  const tree = loadBalancerTree("lb-1");
  const pool = tree?.pools[0];
  if (!tree || !pool) throw new Error("The mock load balancer lb-1 is missing");
  return {
    ...tree,
    pools: [
      { ...pool, id: "http", protocol: "HTTP" },
      { ...pool, id: "tcp", protocol: "TCP" },
      { ...pool, id: "https", protocol: "HTTPS" },
    ],
  };
}

describe("poolsFor", () => {
  it.each([
    ["HTTP", ["http"]],
    ["TERMINATED_HTTPS", ["http"]],
    ["HTTPS", ["https"]],
    ["TCP", ["tcp"]],
    ["UDP", []],
  ])("offers a %s listener the pools %j", (protocol, ids) => {
    expect(poolsFor(treeWithPools(), protocol).map((p) => p.id)).toEqual(ids);
  });
});

/** An HTTP listener on port 80 with every optional field empty. */
const created: CreateListenerValues = {
  name: "",
  description: "",
  protocol: "HTTP",
  protocol_port: 80,
  connection_limit: -1,
  allowed_cidrs: "",
  xff: true,
  xfp: false,
  xfproto: true,
  tls_ref: "barbican://certificate",
  ...LISTENER_TIMEOUT_DEFAULTS,
  default_pool_id: "",
  admin_state_up: true,
};

describe("createListenerBody", () => {
  it.each<[string, CreateListenerValues, Record<string, unknown>]>([
    [
      "sends the forwarded headers of an HTTP listener",
      created,
      {
        loadbalancer_id: "lb-1",
        protocol: "HTTP",
        protocol_port: 80,
        connection_limit: -1,
        admin_state_up: true,
        insert_headers: {
          "X-Forwarded-For": true,
          "X-Forwarded-Port": false,
          "X-Forwarded-Proto": true,
        },
        ...LISTENER_TIMEOUT_DEFAULTS,
      },
    ],
    [
      "sends the headers and the certificate of a terminated HTTPS listener",
      { ...created, protocol: "TERMINATED_HTTPS", protocol_port: 443 },
      {
        loadbalancer_id: "lb-1",
        protocol: "TERMINATED_HTTPS",
        protocol_port: 443,
        connection_limit: -1,
        admin_state_up: true,
        insert_headers: {
          "X-Forwarded-For": true,
          "X-Forwarded-Port": false,
          "X-Forwarded-Proto": true,
        },
        ...LISTENER_TIMEOUT_DEFAULTS,
        default_tls_container_ref: "barbican://certificate",
      },
    ],
    [
      "sends no headers or certificate for TCP, and the optional fields set",
      {
        ...created,
        name: "ssh",
        description: "Shell access",
        protocol: "TCP",
        protocol_port: 22,
        connection_limit: 100,
        allowed_cidrs: "10.0.0.0/8\n192.168.0.0/16",
        default_pool_id: "p-2",
        admin_state_up: false,
      },
      {
        loadbalancer_id: "lb-1",
        protocol: "TCP",
        protocol_port: 22,
        connection_limit: 100,
        admin_state_up: false,
        name: "ssh",
        description: "Shell access",
        allowed_cidrs: ["10.0.0.0/8", "192.168.0.0/16"],
        ...LISTENER_TIMEOUT_DEFAULTS,
        default_pool_id: "p-2",
      },
    ],
    [
      "sends no timeouts for UDP",
      { ...created, protocol: "UDP", protocol_port: 53 },
      {
        loadbalancer_id: "lb-1",
        protocol: "UDP",
        protocol_port: 53,
        connection_limit: -1,
        admin_state_up: true,
      },
    ],
  ])("%s", (_, input, expected) => {
    const body = createListenerBody("lb-1", input);
    expect(body).toEqual(expected);
    expect(listenerCreateBody.parse(body)).toEqual(body);
  });
});

/** A listener's editable fields as the edit dialog opens them. */
const edited: EditListenerValues = {
  name: "web",
  description: "",
  connection_limit: -1,
  allowed_cidrs: "",
  xff: true,
  xfp: true,
  xfproto: false,
  ...LISTENER_TIMEOUT_DEFAULTS,
  timeout_client_data: 90000,
  tls_ref: "",
  sni_refs: "",
  tls_ciphers: "",
  default_pool_id: "p-1",
  admin_state_up: true,
};

describe("editListenerBody", () => {
  it("sends every field, the headers and timeouts of an HTTP listener", () => {
    const body = editListenerBody("HTTP", edited);
    expect(body).toEqual({
      name: "web",
      description: "",
      connection_limit: -1,
      allowed_cidrs: [],
      admin_state_up: true,
      insert_headers: {
        "X-Forwarded-For": true,
        "X-Forwarded-Port": true,
        "X-Forwarded-Proto": false,
      },
      ...LISTENER_TIMEOUT_DEFAULTS,
      timeout_client_data: 90000,
      default_pool_id: "p-1",
    });
    expect(listenerUpdateBody.parse(body)).toEqual(body);
  });

  it("sends no headers for TCP and clears the default pool set to None", () => {
    const body = editListenerBody("TCP", {
      ...edited,
      allowed_cidrs: "10.0.0.0/8",
      default_pool_id: "",
    });
    expect(body).toEqual({
      name: "web",
      description: "",
      connection_limit: -1,
      allowed_cidrs: ["10.0.0.0/8"],
      admin_state_up: true,
      ...LISTENER_TIMEOUT_DEFAULTS,
      timeout_client_data: 90000,
      default_pool_id: null,
    });
    expect(listenerUpdateBody.parse(body)).toEqual(body);
  });

  it("changes the certificates and ciphers of a terminated HTTPS listener", () => {
    const body = editListenerBody("TERMINATED_HTTPS", {
      ...edited,
      tls_ref: "https://barbican/containers/2",
      sni_refs: "https://barbican/containers/3\nhttps://barbican/containers/4",
      tls_ciphers: "ECDHE-RSA-AES256-GCM-SHA384",
    });
    expect(body).toMatchObject({
      default_tls_container_ref: "https://barbican/containers/2",
      sni_container_refs: [
        "https://barbican/containers/3",
        "https://barbican/containers/4",
      ],
      tls_ciphers: "ECDHE-RSA-AES256-GCM-SHA384",
    });
    expect(listenerUpdateBody.parse(body)).toEqual(body);
  });

  it("keeps a blank certificate and clears blank ciphers", () => {
    const body = editListenerBody("TERMINATED_HTTPS", edited);
    expect(body).not.toHaveProperty("default_tls_container_ref");
    expect(body).toMatchObject({ sni_container_refs: [], tls_ciphers: null });
  });

  it("sends no TLS settings for other protocols", () => {
    const body = editListenerBody("HTTP", {
      ...edited,
      tls_ref: "https://barbican/containers/2",
      tls_ciphers: "ECDHE",
    });
    expect(body).not.toHaveProperty("default_tls_container_ref");
    expect(body).not.toHaveProperty("sni_container_refs");
    expect(body).not.toHaveProperty("tls_ciphers");
  });
});
