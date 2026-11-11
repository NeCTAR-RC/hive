import { describe, expect, it } from "vitest";
import type { MemberRow } from "../../../lib/api/types/identity";
import { existingAssignment } from "./membership";

function row(name: string, roleId: string): MemberRow {
  return {
    id: `${name}-${roleId}`,
    user_id: name,
    name,
    role_id: roleId,
    role_name: roleId,
    is_self: false,
    can_remove: true,
  };
}

const members = [row("ann@example.edu", "member"), row("bo@x.edu", "tm")];

describe("existingAssignment", () => {
  it("finds the user holding the role, whatever the case and spaces", () => {
    expect(existingAssignment(members, " Ann@Example.edu ", "member")).toBe(
      members[0],
    );
  });

  it("finds nothing for another role or another user", () => {
    expect(
      existingAssignment(members, "ann@example.edu", "tm"),
    ).toBeUndefined();
    expect(existingAssignment(members, "cy@x.edu", "member")).toBeUndefined();
  });
});
