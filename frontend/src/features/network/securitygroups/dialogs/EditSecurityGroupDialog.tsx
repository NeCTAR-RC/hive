// Edit a security group's name and description.
import { FormDialog } from "../../../../components/FormDialog/FormDialog";
import { useMutationForm } from "../../../../components/FormDialog/useMutationForm";
import { fieldsFor } from "../../../../components/Form/fields";
import type { SecurityGroup } from "../../../../lib/api/types/network";
import { useUpdateSecurityGroup } from "../../api";
import { groupSchema, type GroupValues } from "./schema";

/** The edit security group dialog: its name and description. */
export function EditSecurityGroupDialog({
  group,
  onClose,
}: {
  group: SecurityGroup;
  onClose: () => void;
}) {
  const { TextInput } = fieldsFor<GroupValues>();
  const { dialog } = useMutationForm({
    schema: groupSchema,
    defaultValues: { name: group.name, description: group.description },
    mutation: useUpdateSecurityGroup(),
    toVariables: (values) => ({ groupId: group.id, ...values }),
    successMessage: (_updated, values) =>
      `Security group ${values.name} updated.`,
    onDone: onClose,
  });
  return (
    <FormDialog
      {...dialog}
      title={`Edit security group ${group.name}`}
      submitLabel="Save"
    >
      <TextInput name="name" label="Name" isRequired />
      <TextInput name="description" label="Description" />
    </FormDialog>
  );
}
