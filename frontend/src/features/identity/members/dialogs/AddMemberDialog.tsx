// The "Add User to Project" form (project_members/forms.py:32-45 and the
// help text of _add.html).
import { useMemo } from "react";
import { z } from "zod";
import { fieldsFor } from "../../../../components/Form/fields";
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import type { MemberRow, RoleChoice } from "../../../../lib/api/types/identity";
import { useAddMember } from "../../api";
import { existingAssignment } from "../membership";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Enter the user's Nectar username")
    .regex(/^[^@\s]+@[^@\s]+$/, "The username is an email address"),
  role_id: z.string().min(1, "Choose a role"),
});

type FormValues = z.infer<typeof schema>;

/** The form's rules, plus: the user does not hold the chosen role yet. */
function schemaFor(members: MemberRow[]) {
  return schema.superRefine((values, ctx) => {
    const held = existingAssignment(members, values.email, values.role_id);
    if (held) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: `${held.name} already has the ${held.role_name} role in this project`,
      });
    }
  });
}

/**
 * Adds a user to the project by their Nectar username with one role, the
 * member role preselected. A user who already holds the chosen role is
 * caught in the dialog.
 */
export function AddMemberDialog({
  roles,
  members,
  onClose,
}: {
  roles: RoleChoice[];
  members: MemberRow[];
  onClose: () => void;
}) {
  const member = roles.find((r) => r.name === "member")?.id ?? "";
  // The member role is preselected once the roles load.
  const preselected = useMemo(() => ({ email: "", role_id: member }), [member]);
  const { SelectInput, TextInput } = fieldsFor<FormValues>();
  const { dialog } = useMutationForm({
    schema: useMemo(() => schemaFor(members), [members]),
    values: preselected,
    mutation: useAddMember(),
    toVariables: (values) => values,
    successMessage: (row) => `Added ${row.name} as ${row.role_name}.`,
    onDone: onClose,
  });
  return (
    <FormDialog {...dialog} title="Add member" submitLabel="Add member">
      <p>
        Enter the user&apos;s Nectar username: the email address shown at the
        top right of their dashboard. The user must have logged in to the
        dashboard before and accepted the terms of use.
      </p>
      <TextInput
        name="email"
        label="Username"
        type="email"
        autoComplete="off"
        isRequired
      />
      <SelectInput
        name="role_id"
        label="Role"
        description="Members use the project's resources. Tenant managers can also manage members and the allocation."
        options={roles.map((r) => ({ id: r.id, label: r.name }))}
        isRequired
      />
    </FormDialog>
  );
}
