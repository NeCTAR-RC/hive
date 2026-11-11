import { describe, expect, it } from "vitest";
import { routers } from "../../../../mocks/network/handlers";
import {
  addInterfaceBody,
  routerCreateBody,
  routerUpdateBody,
} from "../../../../mocks/network/schemas";
import {
  addInterfaceRequest,
  createRouterRequest,
  updateRouterRequest,
} from "./request";
import type { CreateRouterValues } from "./schema";

const [router] = routers;
if (!router) throw new Error("The mock router list is empty");

const createForm: CreateRouterValues = {
  name: "",
  admin_state_up: true,
  external_network_id: "",
  availability_zone_hints: [],
};

describe("createRouterRequest", () => {
  it.each([
    {
      name: "sends only the admin state for a bare router",
      values: createForm,
      body: { admin_state_up: true },
    },
    {
      name: "sends the name, gateway network and zone hints when chosen",
      values: {
        name: "edge",
        admin_state_up: false,
        external_network_id: "net-ext",
        availability_zone_hints: ["nova"],
      },
      body: {
        admin_state_up: false,
        name: "edge",
        external_network_id: "net-ext",
        availability_zone_hints: ["nova"],
      },
    },
  ])("$name", ({ values, body }) => {
    expect(createRouterRequest(values)).toEqual(body);
    expect(routerCreateBody.parse(body)).toEqual(body);
  });
});

describe("updateRouterRequest", () => {
  it("sends nothing when nothing changed", () => {
    expect(
      updateRouterRequest(router, {
        name: router.name,
        admin_state_up: router.admin_state_up ?? true,
      }),
    ).toBeNull();
  });

  it("sends only the changed fields with the router id", () => {
    expect(
      updateRouterRequest(router, { name: router.name, admin_state_up: false }),
    ).toEqual({ routerId: router.id, admin_state_up: false });
    expect(routerUpdateBody.parse({ admin_state_up: false })).toEqual({
      admin_state_up: false,
    });
  });
});

describe("addInterfaceRequest", () => {
  it.each([
    {
      name: "leaves the address out so the gateway address is used",
      values: { subnet_id: "subnet-1", ip_address: "" },
      body: { subnet_id: "subnet-1" },
    },
    {
      name: "sends a chosen address",
      values: { subnet_id: "subnet-1", ip_address: "10.0.0.254" },
      body: { subnet_id: "subnet-1", ip_address: "10.0.0.254" },
    },
  ])("$name", ({ values, body }) => {
    expect(addInterfaceRequest("r-1", values)).toEqual({
      routerId: "r-1",
      ...body,
    });
    expect(addInterfaceBody.parse(body)).toEqual(body);
  });
});
