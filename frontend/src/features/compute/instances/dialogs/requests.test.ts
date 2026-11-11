import { describe, expect, it } from "vitest";
import { instanceActionBody } from "../../../../mocks/compute/schemas";
import {
  attachInterfaceBody,
  rebuildBody,
  securityGroupChanges,
} from "./requests";

describe("rebuildBody", () => {
  it.each([
    {
      name: "the image alone when nothing else is given",
      values: { image_id: "img-rocky", name: "", password: "" },
      expected: { action: "rebuild", image_id: "img-rocky" },
    },
    {
      name: "a new name",
      values: { image_id: "img-rocky", name: "web-2", password: "" },
      expected: { action: "rebuild", image_id: "img-rocky", name: "web-2" },
    },
    {
      name: "an admin password",
      values: { image_id: "img-rocky", name: "", password: "s3cret" },
      expected: {
        action: "rebuild",
        image_id: "img-rocky",
        password: "s3cret",
      },
    },
    {
      name: "a new name and an admin password",
      values: { image_id: "snap-1", name: "web-2", password: "s3cret" },
      expected: {
        action: "rebuild",
        image_id: "snap-1",
        name: "web-2",
        password: "s3cret",
      },
    },
  ])("sends $name", ({ values, expected }) => {
    const body = rebuildBody(values);
    expect(body).toEqual(expected);
    expect(instanceActionBody.safeParse(body).success).toBe(true);
  });
});

describe("securityGroupChanges", () => {
  it.each([
    {
      name: "adds the newly chosen groups",
      current: ["default"],
      chosen: ["default", "web"],
      expected: { added: ["web"], removed: [] },
    },
    {
      name: "removes the groups no longer chosen",
      current: ["default", "web"],
      chosen: ["web"],
      expected: { added: [], removed: ["default"] },
    },
    {
      name: "adds and removes in one save",
      current: ["default"],
      chosen: ["web", "ssh"],
      expected: { added: ["web", "ssh"], removed: ["default"] },
    },
    {
      name: "sends nothing when the choice is unchanged",
      current: ["default", "web"],
      chosen: ["web", "default"],
      expected: null,
    },
  ])("$name", ({ current, chosen, expected }) => {
    expect(securityGroupChanges(current, chosen)).toEqual(expected);
  });
});

describe("attachInterfaceBody", () => {
  it.each([
    {
      name: "the network when attaching by network",
      values: { mode: "network", network_id: "net-private", port_id: "" },
      expected: { action: "attach-interface", network_id: "net-private" },
    },
    {
      name: "the port when attaching by port",
      values: { mode: "port", network_id: "net-private", port_id: "port-1" },
      expected: { action: "attach-interface", port_id: "port-1" },
    },
  ] as const)("sends $name", ({ values, expected }) => {
    const body = attachInterfaceBody(values);
    expect(body).toEqual(expected);
    expect(instanceActionBody.safeParse(body).success).toBe(true);
  });
});
