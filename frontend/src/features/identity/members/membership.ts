// Pure rules of the project members panel.
import type { MemberRow } from "../../../lib/api/types/identity";

/**
 * The member row that already gives `email` the role `roleId`, if any.
 * Usernames are email addresses, compared without regard to case or
 * surrounding spaces. Keystone would accept the same assignment again
 * without a change (project_members/forms.py posts it unchecked), so the
 * dialog says so instead of reporting an addition.
 */
export function existingAssignment(
  members: MemberRow[],
  email: string,
  roleId: string,
): MemberRow | undefined {
  const username = email.trim().toLowerCase();
  return members.find(
    (row) => row.name.toLowerCase() === username && row.role_id === roleId,
  );
}
