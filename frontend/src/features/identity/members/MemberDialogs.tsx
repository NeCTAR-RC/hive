// The "Add User to Project" form (project_members/forms.py:32-45 and the
// help text of _add.html).
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "../../../components/FormDialog/FormDialog";
import { SelectInput, TextInput } from "../../../components/Form/fields";
import type { RoleChoice } from "../../../lib/api/types";
import { notify } from "../../../lib/notify";
import { useAddMember } from "../api";

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(3, "Enter the user's Nectar username")
    .regex(/^[^@\s]+@[^@\s]+$/, "The username is an email address"),
  role_id: z.string().min(1, "Choose a role"),
});

type FormValues = z.infer<typeof schema>;

export function AddMemberDialog({
  projectId,
  roles,
  isOpen,
  onOpenChange,
}: {
  projectId: string;
  roles: RoleChoice[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddMember(projectId);
  const member = roles.find((r) => r.name === "member")?.id ?? "";
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: { email: "", role_id: member },
    resetOptions: { keepDirtyValues: true },
  });
  const submit = form.handleSubmit((values) => {
    add.mutate(values, {
      onSuccess: (row) => {
        notify.success(`Added ${row.name} as ${row.role_name}.`);
        form.reset({ email: "", role_id: member });
        onOpenChange(false);
      },
    });
  });
  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) form.reset({ email: "", role_id: member });
        onOpenChange(open);
      }}
      title="Add member"
      submitLabel="Add member"
      onSubmit={submit}
      isPending={add.isPending}
      error={add.error}
    >
      <p>
        Enter the user&apos;s Nectar username: the email address shown at the
        top right of their dashboard. The user must have logged in to the
        dashboard before and accepted the terms of use.
      </p>
      <TextInput
        control={form.control}
        name="email"
        label="Username"
        type="email"
        autoComplete="off"
        isRequired
      />
      <SelectInput
        control={form.control}
        name="role_id"
        label="Role"
        description="Members use the project's resources. Tenant managers can also manage members and the allocation."
        options={roles.map((r) => ({ id: r.id, label: r.name }))}
        isRequired
      />
    </FormDialog>
  );
}
