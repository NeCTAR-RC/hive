import { describe, expect, it } from "vitest";
import { trunks } from "../../../../mocks/network/handlers";
import {
  subportsAddBody,
  trunkCreateBody,
  trunkUpdateBody,
} from "../../../../mocks/network/schemas";
import {
  createTrunkRequest,
  subportsBody,
  updateTrunkRequest,
} from "./request";
import type { CreateTrunkValues } from "./schema";

const [trunk] = trunks;
if (!trunk) throw new Error("The mock trunk list is empty");

const vlan = {
  port_id: "port-trunk-child",
  segmentation_type: "vlan" as const,
  segmentation_id: 100,
};
const inherit = {
  port_id: "port-spare",
  segmentation_type: "inherit" as const,
  segmentation_id: 200,
};

describe("subportsBody", () => {
  it("sends the VLAN id for a VLAN and never for an inherited one", () => {
    const sub_ports = subportsBody([vlan, inherit]);
    expect(sub_ports).toEqual([
      {
        port_id: "port-trunk-child",
        segmentation_type: "vlan",
        segmentation_id: 100,
      },
      { port_id: "port-spare", segmentation_type: "inherit" },
    ]);
    expect(subportsAddBody.parse({ sub_ports })).toEqual({ sub_ports });
  });

  it("leaves out a VLAN id not given yet", () => {
    expect(subportsBody([{ ...vlan, segmentation_id: null }])).toEqual([
      { port_id: "port-trunk-child", segmentation_type: "vlan" },
    ]);
  });
});

describe("createTrunkRequest", () => {
  const form: CreateTrunkValues = {
    name: "",
    description: "",
    admin_state_up: true,
    port_id: "port-trunk-parent",
    sub_ports: [],
  };

  it.each([
    {
      name: "sends the parent port and no subports for a bare trunk",
      values: form,
      body: {
        admin_state_up: true,
        port_id: "port-trunk-parent",
        sub_ports: [],
      },
    },
    {
      name: "sends the name, description and subports when given",
      values: { ...form, name: "t1", description: "lab", sub_ports: [vlan] },
      body: {
        admin_state_up: true,
        port_id: "port-trunk-parent",
        sub_ports: [
          {
            port_id: "port-trunk-child",
            segmentation_type: "vlan",
            segmentation_id: 100,
          },
        ],
        name: "t1",
        description: "lab",
      },
    },
  ])("$name", ({ values, body }) => {
    expect(createTrunkRequest(values)).toEqual(body);
    expect(trunkCreateBody.parse(body)).toEqual(body);
  });
});

describe("updateTrunkRequest", () => {
  const unchanged = {
    name: trunk.name,
    description: trunk.description,
    admin_state_up: trunk.admin_state_up ?? true,
  };

  it("sends nothing when nothing changed", () => {
    expect(updateTrunkRequest(trunk, unchanged)).toBeNull();
  });

  it("sends only the changed fields with the trunk id", () => {
    expect(
      updateTrunkRequest(trunk, { ...unchanged, description: "lab" }),
    ).toEqual({ trunkId: trunk.id, description: "lab" });
    expect(trunkUpdateBody.parse({ description: "lab" })).toEqual({
      description: "lab",
    });
  });
});
