import { describe, expect, it } from "vitest";
import {
  memberCreateBody,
  memberUpdateBody,
} from "../../../../mocks/loadbalancers/schemas";
import {
  addMemberBody,
  editMemberBody,
  type AddMemberValues,
  type EditMemberValues,
} from "./memberForm";

/** An external member with every optional field empty. */
const added: AddMemberValues = {
  name: "",
  address: "192.168.1.20",
  subnet_id: "",
  protocol_port: 80,
  weight: 1,
  monitor_address: "",
  backup: false,
  admin_state_up: true,
};

describe("addMemberBody", () => {
  it("leaves out the optional fields left empty", () => {
    const body = addMemberBody(added);
    expect(body).toEqual({
      address: "192.168.1.20",
      protocol_port: 80,
      weight: 1,
      backup: false,
      admin_state_up: true,
    });
    expect(memberCreateBody.parse(body)).toEqual(body);
  });

  it("sends the name, subnet and monitor address and port when set", () => {
    const body = addMemberBody({
      ...added,
      name: "web-1",
      subnet_id: "subnet-1",
      weight: 5,
      monitor_address: "192.168.1.21",
      monitor_port: 8080,
      backup: true,
    });
    expect(body).toEqual({
      address: "192.168.1.20",
      protocol_port: 80,
      weight: 5,
      backup: true,
      admin_state_up: true,
      name: "web-1",
      subnet_id: "subnet-1",
      monitor_address: "192.168.1.21",
      monitor_port: 8080,
    });
    expect(memberCreateBody.parse(body)).toEqual(body);
  });
});

describe("editMemberBody", () => {
  const edited: EditMemberValues = {
    name: "web-1",
    weight: 2,
    monitor_address: "192.168.1.21",
    monitor_port: 8080,
    backup: false,
    admin_state_up: true,
  };

  it("sends the monitor address and port when set", () => {
    const body = editMemberBody(edited);
    expect(body).toEqual({
      name: "web-1",
      weight: 2,
      backup: false,
      admin_state_up: true,
      monitor_address: "192.168.1.21",
      monitor_port: 8080,
    });
    expect(memberUpdateBody.parse(body)).toEqual(body);
  });

  it("clears an emptied monitor address and port", () => {
    const body = editMemberBody({
      ...edited,
      monitor_address: "",
      monitor_port: undefined,
    });
    expect(body).toEqual({
      name: "web-1",
      weight: 2,
      backup: false,
      admin_state_up: true,
      monitor_address: null,
      monitor_port: null,
    });
    expect(memberUpdateBody.parse(body)).toEqual(body);
  });
});
