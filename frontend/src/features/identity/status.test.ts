import { describe, expect, it } from "vitest";
import type { MemberRow } from "../../lib/api/types/identity";
import { availableMemberActions } from "./status";

const ROW: MemberRow = {
  id: "u-1:r-1",
  user_id: "u-1",
  name: "ann@example.edu",
  role_id: "r-1",
  role_name: "Member",
  is_self: false,
  can_remove: true,
};

/** Why remove is disabled, or null when it can run. */
function removeReason(row: MemberRow) {
  const [offer] = availableMemberActions(row);
  return offer?.disabledReason ?? null;
}

describe("member actions", () => {
  it("removes a role the backend allows", () => {
    expect(availableMemberActions(ROW)).toEqual([
      { id: "remove", label: "Remove", tone: "danger", isDisabled: false },
    ]);
  });

  it("never removes your own role", () => {
    expect(removeReason({ ...ROW, is_self: true, can_remove: false })).toBe(
      "You cannot remove yourself",
    );
  });

  it("keeps roles the backend refuses or cannot name", () => {
    expect(removeReason({ ...ROW, can_remove: false })).toBe(
      "This role cannot be removed here",
    );
    expect(removeReason({ ...ROW, role_id: null })).toBe(
      "This role cannot be removed here",
    );
  });
});
