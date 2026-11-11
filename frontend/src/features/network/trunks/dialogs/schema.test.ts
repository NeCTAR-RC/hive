import { describe, expect, it } from "vitest";
import { addSubportsSchema, createTrunkSchema } from "./schema";

/** The messages a schema gives, by field path. */
function issues(
  schema: typeof addSubportsSchema | typeof createTrunkSchema,
  values: unknown,
) {
  const result = schema.safeParse(values);
  return result.success
    ? {}
    : Object.fromEntries(
        result.error.issues.map((i) => [i.path.join("."), i.message]),
      );
}

const row = { port_id: "port-1", segmentation_type: "vlan" };

describe("subport rows", () => {
  it.each([
    ["not typed yet", null],
    ["cleared in the number field", undefined],
  ])("asks for a VLAN id %s", (_, segmentation_id) => {
    expect(
      issues(addSubportsSchema, { sub_ports: [{ ...row, segmentation_id }] }),
    ).toEqual({
      "sub_ports.0.segmentation_id": "Enter a VLAN id from 1 to 4094",
    });
  });

  it("says the VLAN range in words", () => {
    expect(
      issues(addSubportsSchema, {
        sub_ports: [{ ...row, segmentation_id: 5000 }],
      }),
    ).toEqual({
      "sub_ports.0.segmentation_id": "Enter a VLAN id from 1 to 4094",
    });
  });

  it("needs no id for an inherited segmentation", () => {
    expect(
      issues(addSubportsSchema, {
        sub_ports: [{ ...row, segmentation_type: "inherit" }],
      }),
    ).toEqual({});
  });

  it("refuses the parent port as a subport", () => {
    expect(
      issues(createTrunkSchema, {
        name: "",
        description: "",
        admin_state_up: true,
        port_id: "port-1",
        sub_ports: [{ ...row, segmentation_id: 100 }],
      }),
    ).toEqual({
      "sub_ports.0.port_id": "The parent port cannot also be a subport",
    });
  });
});
