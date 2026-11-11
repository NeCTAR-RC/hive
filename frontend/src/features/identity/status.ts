// The row action rules of the Identity panels: which project member roles
// can be removed here (nectar_dashboard project_members).
import { offerActions, type ActionTable } from "../../lib/actions";
import type { MemberRow } from "../../lib/api/types/identity";

export type MemberActionId = "remove";

const NOT_HERE = "This role cannot be removed here";

/**
 * The member menu. The backend's `can_remove` says whether the role can go
 * (never your own); a role the backend could not name has nothing to send.
 */
const MEMBER_ACTIONS: ActionTable<MemberActionId, MemberRow> = {
  rules: [
    {
      id: "remove",
      label: "Remove",
      tone: "danger",
      checks: [
        (row) =>
          !row.can_remove &&
          (row.is_self ? "You cannot remove yourself" : NOT_HERE),
        (row) => row.role_id === null && NOT_HERE,
      ],
    },
  ],
};

/** The member row's menu, with whether its role can be removed. */
export function availableMemberActions(row: MemberRow) {
  return offerActions(MEMBER_ACTIONS, row);
}
